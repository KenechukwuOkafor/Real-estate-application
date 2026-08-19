/**
 * Agent profile writes under the real grants.
 *
 * This is the first step of agent onboarding, and it was returning HTTP 500 for
 * every new agent. Nothing downstream was reachable: no profile meant no
 * verification, no quota and no listings.
 *
 * The cause was not the authorization model, which is correct. `authenticated`
 * holds UPDATE on exactly (bio, display_name, updated_at) — migration 0013
 * withholds verification_status, verified_at, verified_by, founding_agent,
 * free_listing_quota, rejection_reason and suspension_reason because each would
 * be a self-grant, and withholds user_id so a profile cannot be reassigned.
 *
 * The cause was `.upsert()`. PostgREST compiles it to
 * `INSERT ... ON CONFLICT DO UPDATE SET`, every payload column lands in the SET
 * list including user_id, and Postgres checks those column privileges when it
 * plans the statement rather than per row. So it demanded UPDATE on user_id
 * even on a first insert where no conflict was possible, and failed 42501.
 *
 * The unit tests could not see this: they mock the client, and a mock has no
 * grants. Only a real authenticated connection exercises the privilege check.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { upsertAgentProfile } from "@/server/repositories/agents-repository";

import { type CastMember, getCast } from "../../../test/helpers/cast";
import { mintFreshToken } from "../../../test/helpers/clerk-tokens";
import {
  asServiceRole,
  asUser,
  rlsIntegrationEnabled,
} from "../../../test/helpers/rls-clients";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

suite("agent profile writes as the agent themselves", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let agent: CastMember;

  beforeAll(() => {
    svc = asServiceRole();
    agent = getCast().owningAgent;
  });

  async function cleanup() {
    await svc.from("agent_profiles").delete().eq("user_id", agent.userId);
  }

  it("creates a profile on first save, and updates it on the next", async () => {
    await cleanup();

    try {
      const created = await upsertAgentProfile(
        asUser(await mintFreshToken(agent)),
        agent.userId,
        { bio: "First save.", displayName: "Funnel Agency" },
      );

      expect(created.display_name).toBe("Funnel Agency");
      expect(created.user_id).toBe(agent.userId);
      // A new profile must start unverified. If this ever came back verified,
      // an agent would have verified themselves by filling in a form.
      expect(created.verification_status).toBe("not_submitted");

      const updated = await upsertAgentProfile(
        asUser(await mintFreshToken(agent)),
        agent.userId,
        { bio: "Second save.", displayName: "Funnel Agency Renamed" },
      );

      expect(updated.id).toBe(created.id);
      expect(updated.display_name).toBe("Funnel Agency Renamed");
      expect(updated.bio).toBe("Second save.");
    } finally {
      await cleanup();
    }
  });

  it("cannot reach the columns that would be a self-grant", async () => {
    await cleanup();

    try {
      const client = asUser(await mintFreshToken(agent));
      await upsertAgentProfile(client, agent.userId, {
        bio: undefined,
        displayName: "Privilege Probe",
      });

      // The write the grant exists to stop. Verifying yourself, or minting your
      // own listing quota, must fail on privilege rather than on a policy
      // predicate that someone could later widen.
      const { error } = await client
        .from("agent_profiles")
        .update({ free_listing_quota: 99, verification_status: "verified" })
        .eq("user_id", agent.userId);

      expect(error).not.toBeNull();

      // Paired control: prove the row is there and was genuinely withheld,
      // rather than the update having matched nothing.
      const { data: control } = await svc
        .from("agent_profiles")
        .select("verification_status, free_listing_quota")
        .eq("user_id", agent.userId)
        .single();

      expect(control?.verification_status).toBe("not_submitted");
      expect(control?.free_listing_quota).toBe(0);
    } finally {
      await cleanup();
    }
  });
});
