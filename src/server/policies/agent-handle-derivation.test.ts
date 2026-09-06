/**
 * The handle derivation exists twice, and this is what stops the two drifting.
 *
 * SQL owns assignment: `authenticated` holds no insert or update privilege on
 * agent_profiles.handle, because a handle namespace with an insert grant is
 * claimable by anyone with a session token and curl. A BEFORE INSERT trigger
 * assigns it instead (0038).
 *
 * TypeScript owns the shape rules: /a/<handle> rejects a malformed param
 * before it ever reaches a query, and it cannot call into Postgres to find out
 * what malformed means.
 *
 * So the rule is written twice on purpose. expiry.ts's header records what
 * happens when a rule like that is duplicated and left unpinned — two live
 * defects from one definition of "expired" drifting from another. Duplication
 * is not always avoidable; going unmeasured is.
 *
 * Every case below is asserted against BOTH implementations from the same
 * input, so a change to either one alone turns this red.
 */
import { describe, expect, it } from "vitest";

import { slugifyAgentHandle } from "@/features/agents/handle";

import { asServiceRole, rlsIntegrationEnabled } from "../../../test/helpers/rls-clients";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

/**
 * Names chosen for the places the two languages diverge most easily: accent
 * handling, punctuation runs, the word-boundary cut, and an input that reduces
 * to nothing.
 */
const NAMES = [
  "Prime Homes Nsukka",
  "Campus Keys Property",
  "Chidi & Sons' Properties, Ltd.",
  "Óbí Résidences",
  "Campus   Keys -- Property",
  "--Ugwuoba Lodge--",
  "Nsukka Student Accommodation Services",
  "Nsukka Student Accommodation And Property Management Services",
  "UNN Off-Campus Housing",
  "7th Avenue Lodges",
  "字字字",
  "Ac",
  "",
];

/**
 * Users with no agent profile yet.
 *
 * agent_profiles.user_id is UNIQUE, so "the first user" is not a free choice:
 * most of the cast already owns a profile from an earlier suite or the seed,
 * and inserting against one fails on the wrong constraint — which reads as a
 * broken trigger rather than a bad fixture.
 */
async function usersWithoutProfiles(count: number) {
  const svc = asServiceRole();
  const { data: taken } = await svc.from("agent_profiles").select("user_id");
  const takenIds = new Set((taken ?? []).map((row) => row.user_id));

  const { data: users } = await svc.from("users").select("id").is("deleted_at", null);
  const free = (users ?? []).map((row) => row.id).filter((id) => !takenIds.has(id));

  if (free.length < count) {
    throw new Error(
      `need ${count} users without an agent profile, found ${free.length}`,
    );
  }

  return free.slice(0, count);
}

suite("agent handle derivation, SQL against TypeScript", () => {
  it.each(NAMES)("agrees on %j", async (name) => {
    const svc = asServiceRole();
    const { data, error } = await svc.rpc("slugify_agent_handle", {
      display_name: name,
    });

    expect(error).toBeNull();
    // `?? ""` because Postgres returns null for an empty text result through
    // PostgREST, and the TypeScript side returns "". That difference is in the
    // transport, not in the rule.
    expect(data ?? "").toBe(slugifyAgentHandle(name));
  });

  it("assigns a handle to a profile that did not ask for one", async () => {
    const svc = asServiceRole();
    const [user] = await usersWithoutProfiles(1);

    const { data, error } = await svc
      .from("agent_profiles")
      .insert({ display_name: "PROBE Handle Trigger", user_id: user })
      .select("handle")
      .single();

    try {
      expect(error).toBeNull();
      expect(data?.handle).toBe("probe-handle-trigger");
    } finally {
      await svc
        .from("agent_profiles")
        .delete()
        .eq("display_name", "PROBE Handle Trigger");
    }
  });

  it("disambiguates a second profile with the same business name", async () => {
    // The collision path, which is the half a single-insert test never
    // reaches — and the half that decides whether an agent's URL reads like a
    // business or like an error.
    const svc = asServiceRole();
    const users = await usersWithoutProfiles(2);

    const created: string[] = [];

    try {
      for (const user of users) {
        const { data, error } = await svc
          .from("agent_profiles")
          .insert({ display_name: "PROBE Collision Homes", user_id: user })
          .select("handle")
          .single();

        expect(error).toBeNull();
        created.push(data!.handle);
      }

      expect(created).toEqual(["probe-collision-homes", "probe-collision-homes-2"]);
    } finally {
      await svc
        .from("agent_profiles")
        .delete()
        .eq("display_name", "PROBE Collision Homes");
    }
  });

  it("refuses a handle the router could not match", async () => {
    // The shape constraint, not the trigger. service_role can set a handle
    // directly — that is how an admin reassignment would work — and the
    // constraint is what stops it writing one that 404s forever.
    const svc = asServiceRole();
    const [user] = await usersWithoutProfiles(1);

    const { error } = await svc.from("agent_profiles").insert({
      display_name: "PROBE Bad Shape",
      handle: "Not A Handle",
      user_id: user,
    });

    expect(error?.code).toBe("23514");
  });
});
