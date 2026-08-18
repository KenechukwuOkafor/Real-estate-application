/**
 * Job queue behaviour against a real Postgres.
 *
 * These use `pg` directly rather than supabase-js, because the properties under
 * test are transactional: BEGIN, ROLLBACK, and two connections holding
 * concurrent transactions. PostgREST issues one autocommitted statement per
 * request and structurally cannot express any of that — which is also why the
 * enqueue entry point is SQL rather than an application function.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { asServiceRole, rlsIntegrationEnabled } from "../../../test/helpers/rls-clients";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

async function connect() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

suite("job queue", () => {
  const svc = asServiceRole();
  let db: Client;

  beforeAll(async () => {
    db = await connect();
  });

  afterAll(async () => {
    await db.end();
  });

  afterEach(async () => {
    await db.query("delete from public.jobs where type like 'test.%'");
  });

  describe("transactional enqueue — the outbox property", () => {
    it("a job enqueued in a rolled-back transaction does not exist", async () => {
      await db.query("begin");
      await db.query("select public.enqueue_job('test.rollback', '{}'::jsonb)");
      await db.query("rollback");

      const { rows } = await db.query(
        "select count(*)::int as n from public.jobs where type = 'test.rollback'",
      );
      expect(rows[0].n).toBe(0);
    });

    it("a job enqueued in a committed transaction does exist", async () => {
      await db.query("begin");
      await db.query("select public.enqueue_job('test.commit', '{}'::jsonb)");
      await db.query("commit");

      const { rows } = await db.query(
        "select count(*)::int as n from public.jobs where type = 'test.commit'",
      );
      expect(rows[0].n).toBe(1);
    });

    it("a domain write and its job are lost together on rollback", async () => {
      // The property that matters is not "the job vanished" but "neither
      // happened". A queue that can lose one without the other is the hazard
      // ADR-032 exists to remove.
      const { rows: before } = await db.query(
        "select id, title from public.listings where status = 'approved' order by id limit 1",
      );
      const target = before[0];

      await db.query("begin");
      await db.query("update public.listings set title = $1 where id = $2", [
        `${target.title} ROLLED BACK`,
        target.id,
      ]);
      await db.query("select public.enqueue_job('test.atomic', '{}'::jsonb)");
      await db.query("rollback");

      const { rows: jobs } = await db.query(
        "select count(*)::int as n from public.jobs where type = 'test.atomic'",
      );
      const { rows: after } = await db.query(
        "select title from public.listings where id = $1",
        [target.id],
      );

      expect(jobs[0].n).toBe(0);
      expect(after[0].title).toBe(target.title);
    });

    it("a domain write and its job land together on commit", async () => {
      await db.query("begin");
      await db.query(
        "update public.listings set updated_at = now() where status = 'approved'",
      );
      await db.query("select public.enqueue_job('test.atomic_ok', '{}'::jsonb)");
      await db.query("commit");

      const { rows } = await db.query(
        "select count(*)::int as n from public.jobs where type = 'test.atomic_ok'",
      );
      expect(rows[0].n).toBe(1);
    });
  });

  describe("claiming under concurrency", () => {
    it("two simultaneous drains claim one job exactly once", async () => {
      await db.query("select public.enqueue_job('test.race', '{}'::jsonb)");

      const [a, b] = await Promise.all([connect(), connect()]);

      try {
        await Promise.all([a.query("begin"), b.query("begin")]);

        // Whichever loses the row lock must SKIP rather than block, so it
        // claims nothing instead of waiting and then double-processing.
        const [resultA, resultB] = await Promise.all([
          a.query("select id from public.claim_jobs('default', 10)"),
          b.query("select id from public.claim_jobs('default', 10)"),
        ]);

        await Promise.all([a.query("commit"), b.query("commit")]);

        expect(resultA.rowCount! + resultB.rowCount!).toBe(1);

        const { rows } = await db.query(
          "select attempts, status from public.jobs where type = 'test.race'",
        );
        // Claimed once, therefore attempted once. Two claims would show 2.
        expect(rows[0].attempts).toBe(1);
        expect(rows[0].status).toBe("running");
      } finally {
        await Promise.all([a.end(), b.end()]);
      }
    });

    it("a claimed job is not reclaimed by a later drain", async () => {
      await db.query("select public.enqueue_job('test.once', '{}'::jsonb)");

      const first = await db.query("select id from public.claim_jobs('default', 10)");
      const second = await db.query("select id from public.claim_jobs('default', 10)");

      expect(first.rowCount).toBe(1);
      expect(second.rowCount).toBe(0);
    });

    it("does not claim a job scheduled in the future", async () => {
      await db.query(
        "select public.enqueue_job('test.future', '{}'::jsonb, 'default', now() + interval '1 hour')",
      );

      const { rowCount } = await db.query("select id from public.claim_jobs('default', 10)");
      expect(rowCount).toBe(0);
    });

    it("drains lanes independently, so media cannot starve default", async () => {
      await db.query("select public.enqueue_job('test.lane_default', '{}'::jsonb, 'default')");
      await db.query("select public.enqueue_job('test.lane_media', '{}'::jsonb, 'media')");

      const mediaClaim = await db.query("select type from public.claim_jobs('media', 10)");

      expect(mediaClaim.rowCount).toBe(1);
      expect(mediaClaim.rows[0].type).toBe("test.lane_media");
    });
  });

  describe("retry and terminal failure", () => {
    it("a failure increments attempts and reschedules with backoff", async () => {
      await db.query("select public.enqueue_job('test.retry', '{}'::jsonb)");
      const { rows: claimed } = await db.query(
        "select id from public.claim_jobs('default', 1)",
      );

      const { rows: outcome } = await db.query(
        "select public.fail_job($1, 'boom') as status",
        [claimed[0].id],
      );
      expect(outcome[0].status).toBe("retrying");

      const { rows } = await db.query(
        "select attempts, status, last_error, scheduled_at > now() as deferred from public.jobs where id = $1",
        [claimed[0].id],
      );
      expect(rows[0].attempts).toBe(1);
      expect(rows[0].status).toBe("retrying");
      expect(rows[0].last_error).toBe("boom");
      expect(rows[0].deferred).toBe(true);
    });

    it("backoff grows between attempts", async () => {
      await db.query(
        "select public.enqueue_job('test.backoff', '{}'::jsonb, 'default', now(), 5)",
      );

      const delays: number[] = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await db.query("update public.jobs set scheduled_at = now() where type = 'test.backoff'");
        const { rows: claimed } = await db.query(
          "select id from public.claim_jobs('default', 1)",
        );
        await db.query("select public.fail_job($1, 'boom')", [claimed[0].id]);
        const { rows } = await db.query(
          "select extract(epoch from (scheduled_at - now())) as delay from public.jobs where id = $1",
          [claimed[0].id],
        );
        delays.push(Number(rows[0].delay));
      }

      expect(delays[1]).toBeGreaterThan(delays[0]);
      expect(delays[2]).toBeGreaterThan(delays[1]);
    });

    it("exhausting attempts lands in failed_permanently and retains the row", async () => {
      await db.query(
        "select public.enqueue_job('test.exhaust', '{}'::jsonb, 'default', now(), 2)",
      );

      let status = "";
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await db.query("update public.jobs set scheduled_at = now() where type = 'test.exhaust'");
        const { rows: claimed } = await db.query(
          "select id from public.claim_jobs('default', 1)",
        );
        const { rows } = await db.query("select public.fail_job($1, 'always fails') as status", [
          claimed[0].id,
        ]);
        status = rows[0].status;
      }

      expect(status).toBe("failed_permanently");

      // Retained, not deleted. A permanently failed job is evidence.
      const { rows } = await db.query(
        "select status, last_error from public.jobs where type = 'test.exhaust'",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("failed_permanently");
      expect(rows[0].last_error).toBe("always fails");
    });

    it("a permanently failed job is never reclaimed", async () => {
      await db.query(
        "select public.enqueue_job('test.dead', '{}'::jsonb, 'default', now(), 1)",
      );
      const { rows: claimed } = await db.query("select id from public.claim_jobs('default', 1)");
      await db.query("select public.fail_job($1, 'dead')", [claimed[0].id]);

      const { rowCount } = await db.query("select id from public.claim_jobs('default', 10)");
      expect(rowCount).toBe(0);
    });
  });

  describe("monitoring", () => {
    it("reports oldest queued age, which is what rises when draining stops", async () => {
      await db.query(
        "select public.enqueue_job('test.age', '{}'::jsonb, 'default', now() - interval '10 minutes')",
      );

      const { rows } = await db.query(
        "select oldest_queued_age_seconds from public.job_queue_health() where queue = 'default'",
      );

      // Depth reads 1 here, and also reads 0 the moment a dead drain leaves an
      // empty queue. Age distinguishes the two; depth cannot.
      expect(Number(rows[0].oldest_queued_age_seconds)).toBeGreaterThan(500);
    });

    it("reports zero age when nothing is waiting", async () => {
      const { rows } = await db.query(
        "select oldest_queued_age_seconds from public.job_queue_health() where queue = 'media'",
      );
      expect(Number(rows[0].oldest_queued_age_seconds)).toBe(0);
    });
  });

  describe("access control", () => {
    it("an authenticated caller cannot insert, update or delete jobs", async () => {
      // Grants, per ADR-010-A1 — not merely a policy. The authenticated role
      // holds SELECT only, so these fail on privilege before RLS is consulted.
      for (const statement of [
        "insert into public.jobs (type) values ('test.forged')",
        "update public.jobs set status = 'completed'",
        "delete from public.jobs",
      ]) {
        await db.query("begin");
        await db.query("set local role authenticated");
        await expect(db.query(statement)).rejects.toThrow(/permission denied/i);
        await db.query("rollback");
      }
    });

    it("an authenticated non-admin sees no jobs", async () => {
      await db.query("select public.enqueue_job('test.hidden', '{}'::jsonb)");

      const { data } = await svc.from("jobs").select("id").eq("type", "test.hidden");
      expect(data).toHaveLength(1);

      await db.query("begin");
      await db.query("set local role authenticated");
      const { rows } = await db.query(
        "select id from public.jobs where type = 'test.hidden'",
      );
      await db.query("rollback");

      // No admin role, so the admin policy does not match and RLS yields none.
      expect(rows).toHaveLength(0);
    });

    it("anon cannot even select", async () => {
      await db.query("begin");
      await db.query("set local role anon");
      await expect(db.query("select id from public.jobs")).rejects.toThrow(
        /permission denied/i,
      );
      await db.query("rollback");
    });

    it("an authenticated caller cannot enqueue through the SQL function", async () => {
      await db.query("begin");
      await db.query("set local role authenticated");
      await expect(
        db.query("select public.enqueue_job('test.sneaky', '{}'::jsonb)"),
      ).rejects.toThrow(/permission denied/i);
      await db.query("rollback");
    });
  });
});
