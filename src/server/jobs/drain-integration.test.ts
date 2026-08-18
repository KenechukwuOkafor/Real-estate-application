/**
 * The drain executing real handlers against a real queue.
 *
 * queue-integration covers the SQL primitives; this covers the loop that uses
 * them — registry lookup, completion, failure isolation, and the guarantee that
 * one bad job does not take the batch down with it.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { rlsIntegrationEnabled } from "../../../test/helpers/rls-clients";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

suite("drainQueue", () => {
  let db: Client;
  let drainQueue: typeof import("@/server/jobs/drain").drainQueue;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    ({ drainQueue } = await import("@/server/jobs/drain"));
  });

  afterAll(async () => {
    await db.end();
  });

  afterEach(async () => {
    await db.query("delete from public.jobs");
    vi.restoreAllMocks();
  });

  it("executes a registered handler and records its result", async () => {
    await db.query(
      `select public.enqueue_job('diagnostics.echo', '{"message":"hello"}'::jsonb)`,
    );

    const outcome = await drainQueue("default");

    expect(outcome).toMatchObject({ claimed: 1, completed: 1, failed: 0 });

    const { rows } = await db.query(
      "select status, result, completed_at from public.jobs where type = 'diagnostics.echo'",
    );
    expect(rows[0].status).toBe("completed");
    expect(rows[0].result).toEqual({ echoed: "hello" });
    expect(rows[0].completed_at).not.toBeNull();
  });

  it("running the same job twice produces the same stored result", async () => {
    // At-least-once delivery in practice: the row is re-queued as if a drain
    // died after the handler ran but before completion was recorded.
    await db.query(
      `select public.enqueue_job('diagnostics.echo', '{"message":"twice"}'::jsonb)`,
    );
    await drainQueue("default");

    const { rows: first } = await db.query(
      "select result from public.jobs where type = 'diagnostics.echo'",
    );

    await db.query(
      "update public.jobs set status = 'queued', scheduled_at = now(), result = null where type = 'diagnostics.echo'",
    );
    await drainQueue("default");

    const { rows: second } = await db.query(
      "select result, attempts from public.jobs where type = 'diagnostics.echo'",
    );

    expect(second[0].result).toEqual(first[0].result);
    expect(second[0].attempts).toBe(2);
  });

  it("drains nothing when the queue is empty", async () => {
    const outcome = await drainQueue("default");
    expect(outcome).toMatchObject({ claimed: 0, completed: 0 });
  });

  it("an unregistered job type fails and retries rather than crashing the drain", async () => {
    await db.query("select public.enqueue_job('does.not.exist', '{}'::jsonb)");

    const outcome = await drainQueue("default");

    expect(outcome.unregistered).toBe(1);
    expect(outcome.failed).toBe(1);

    const { rows } = await db.query(
      "select status, last_error from public.jobs where type = 'does.not.exist'",
    );
    // Retrying, not permanently failed: a rollout in progress can enqueue a
    // type the running deploy has not learned yet, and that resolves itself.
    expect(rows[0].status).toBe("retrying");
    expect(rows[0].last_error).toMatch(/No handler registered/);
  });

  it("a bad payload fails the job without stopping the batch", async () => {
    await db.query(`select public.enqueue_job('diagnostics.echo', '{"wrong":1}'::jsonb)`);
    await db.query(`select public.enqueue_job('diagnostics.echo', '{"message":"ok"}'::jsonb)`);

    const outcome = await drainQueue("default");

    expect(outcome.claimed).toBe(2);
    expect(outcome.completed).toBe(1);
    expect(outcome.failed).toBe(1);

    const { rows } = await db.query(
      "select status, count(*)::int as n from public.jobs group by status order by status",
    );
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    expect(byStatus.completed).toBe(1);
    expect(byStatus.retrying).toBe(1);
  });

  it("handler failure does not affect the row the job was enqueued alongside", async () => {
    // ADR-032: "Handler failure never fails the request that enqueued the job."
    // The enqueue committed with its domain write long before the drain ran, so
    // a later failure cannot reach back and undo it.
    const { rows: target } = await db.query(
      "select id, title from public.listings where status = 'approved' order by id limit 1",
    );

    await db.query("begin");
    await db.query("update public.listings set updated_at = now() where id = $1", [
      target[0].id,
    ]);
    await db.query(`select public.enqueue_job('diagnostics.echo', '{"bad":true}'::jsonb)`);
    await db.query("commit");

    await drainQueue("default");

    const { rows: after } = await db.query(
      "select title from public.listings where id = $1",
      [target[0].id],
    );
    const { rows: job } = await db.query(
      "select status from public.jobs where type = 'diagnostics.echo'",
    );

    expect(after[0].title).toBe(target[0].title);
    expect(job[0].status).toBe("retrying");
  });

  it("respects the media lane's batch size of one", async () => {
    for (let index = 0; index < 3; index += 1) {
      await db.query(
        `select public.enqueue_job('does.not.exist', '{}'::jsonb, 'media')`,
      );
    }

    const outcome = await drainQueue("media");

    // Image processing is CPU-bound in a single-threaded runtime; batching it
    // buys nothing and risks overrunning the function timeout.
    expect(outcome.claimed).toBe(1);
  });

  it("leaves jobs from another lane untouched", async () => {
    await db.query(`select public.enqueue_job('diagnostics.echo', '{"message":"d"}'::jsonb, 'default')`);
    await db.query(`select public.enqueue_job('does.not.exist', '{}'::jsonb, 'media')`);

    await drainQueue("default");

    const { rows } = await db.query(
      "select status from public.jobs where queue = 'media'",
    );
    expect(rows[0].status).toBe("queued");
  });
});
