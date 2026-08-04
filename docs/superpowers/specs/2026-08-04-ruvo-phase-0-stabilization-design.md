# Ruvo Phase 0 — Stabilization Design

**Date:** 2026-08-04
**Status:** Approved
**Revision:** 2 — incorporates review findings F1–F6 (see Review log)
**Scope:** Close the live privilege-escalation hole, gate the dev-auth backdoor, fix broken
view tracking, put the pending work under version control, and establish CI.

---

## Context

The repository has one commit and 84 uncommitted files. There is no CI, no test runner, and
no test. `npm run typecheck` passes clean; `npx eslint .` exits with 21 errors.

Three defects justify treating this as a hotfix rather than ordinary work:

1. **Privilege escalation.** `deriveRequestedRoles` (`src/server/services/user-sync-service.ts:44`)
   whitelists `"admin"`, and `POST /api/me/bootstrap` forwards `body.roles` verbatim to
   `ensureUserRoles`. Any authenticated user can grant themselves `admin` with one request.
   The onboarding UI only ever offers student/agent, so this is purely an API-level hole.
2. **Dev-auth backdoor.** `isDevAuthEnabled()` (`src/lib/auth/dev-auth.ts:32`) is satisfied by
   the client-exposed `NEXT_PUBLIC_ENABLE_DEV_AUTH` and has no `NODE_ENV` guard. If shipped
   enabled, `POST /api/dev-auth/login {clerkUserId:"seed_clerk_admin_001"}` yields an admin
   session, and `src/middleware.ts:22` skips `auth.protect()` whenever the cookie is present.
3. **View tracking always 500s.** `src/app/api/listings/[slugOrPublicId]/views/route.ts:34`
   passes the slug where `listing_views.listing_id` requires a `listings.id` UUID.

### Canonical references

The Engineering Bible at `~/Desktop/Real-estate-project/Docs` is authoritative. Rules invoked
by this design: BR-ADM-003, BR-ANA-003, ADR-005, ADR-011, ADR-017, ADR-022, ADR-023,
`engineering-workflow.md` (git and testing standards), `engineering-quality.md` (technical
debt), `security-checklist.md` (fail securely). `AGENT_RULES.md` in this repository also
applies.

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Self-service signup grants `student` only. `agent` requires admin approval; `admin` is never self-service and is granted by direct database write. | BR-ADM-003 — verification cannot be self-approved. ADR-022 — users never receive implicit administrative access. |
| D2 | The agent request reuses the existing verification machinery. No new table, no new admin screen. Approving a verification submission grants the `agent` role. | Keeps a security hotfix from becoming product work. The `/admin/verification` queue already exists. |
| D3 | CI gates on typecheck + lint + unit tests. No `next build`, no database. | Every `appEnv` accessor is lazy, so no secrets are needed. Integration and RLS tests arrive in Phase 1 where they belong. |
| D4 | Vitest as the test runner. | ESM-native, first-class TypeScript, conventional for Next 16. |
| D5 | One branch, logically-split commits, one PR. | `engineering-workflow.md` prohibits direct commits to `main` and requires small atomic commits. Separate branches would all conflict on the same untracked baseline. |

### Accepted consequence of D2

"Requested agent access" and "submitted verification evidence" become the same event. If the
two ever need to diverge, a dedicated `role_requests` table is the migration path. Recorded so
the collapse is a decision rather than an accident.

### Admin bootstrap (consequence of D1)

Removing `admin` from self-service means no code path creates the first administrator. Without
one, no verification can ever be approved and no agent can ever exist.

- **Development and test:** already covered. `supabase/seed.sql:66` grants `admin` to
  `seed_clerk_admin_001`, and the dev-auth harness exposes that account. Unaffected by this
  change, since dev-auth remains enabled outside production.
- **Production:** requires a one-time manual grant —
  `insert into public.user_roles (user_id, role) values ('<uuid>', 'admin')` — run against the
  production database after the operator has signed up through Clerk. This is intentional: a
  deliberate out-of-band action is the correct way to establish the trust root, and it leaves
  an obvious audit trail.

This procedure must be captured in the Phase 3 operations documentation. It is currently
undocumented anywhere in the Engineering Bible.

---

## Section 1 — Branch and commit sequence

Branch `chore/phase-0-stabilization` off `main`, merged via one self-reviewed PR.

| # | Commit | Contents |
|---|---|---|
| 1 | `chore(git): ignore supabase local cli state` | `supabase/.temp/`, `supabase/.branches/` |
| 2 | `chore(agent): remove duplicated cdp bridge` | Delete `docs/agent/`; move `express` and `ws` to devDependencies |
| 3 | `feat(api): add shared error mapping and route protection` | `src/lib/api/errors.ts`, `src/middleware.ts` |
| 4 | `feat(auth): add dev auth harness` | `src/lib/auth/dev-auth.ts`, `src/lib/auth/use-effective-auth.ts`, `src/app/api/dev-auth/`, `src/app/dev-login/` |
| 5 | `feat(chats): add chat threads and messaging slice` | `src/app/api/chats/`, `src/app/chats/`, chat repository/service, chat components |
| 6 | `feat(inspections): add inspection request slice` | `src/app/api/inspection-requests/`, inspection repository/service, request form |
| 7 | `feat(listings): add reports and saved listings` | `src/app/api/reports/`, `src/app/api/saved-listings/`, `src/app/api/listings/[slugOrPublicId]/views/`, related repositories/services |
| 8 | `feat(admin): add verification review and moderation actions` | `src/app/admin/verification/`, `src/app/api/admin/verification-submissions/`, flag/dispute routes, migrations 0004–0007 |
| 9 | `fix(lint): resolve remaining eslint errors` | 2 unescaped entities in `src/app/page.tsx:149-150`; `react-hooks/set-state-in-effect` at `src/lib/auth/use-effective-auth.ts:15` |
| 10 | `test(setup): add vitest runner and config` | Vitest, `vitest.config.ts` (see 3B), `"test": "vitest run"` |
| 11 | `fix(auth): restrict self-service roles to student` | Section 2A, with tests |
| 12 | `fix(auth): hard-gate dev auth to non-production` | Section 2D, with tests |
| 13 | `feat(agents): grant agent role on verification approval` | Sections 2B and 2C, with tests |
| 14 | `fix(listings): resolve public id before recording view` | Section 3A, with tests |
| 15 | `ci: add typecheck, lint and test workflow` | `.github/workflows/ci.yml` |

**Ordering rationale.** Cleanup lands first, then shared infrastructure, then the slices that
depend on it, so that *every commit typechecks in isolation* and `git bisect` stays meaningful.
Lint is fixed once the baseline is tracked, so CI *can* be green. The test runner precedes the
fixes so each ships with its regression test. CI lands last because that is the first point at
which it can pass; from commit 15 onward it gates everything.

Commits 3–8 are pre-existing work being brought under version control, not new development.

**Two dependency constraints drive this ordering; neither is optional.**

1. `src/app/api/reports/route.ts` and both `saved-listings` routes import `@/lib/api/errors`.
   If `errors.ts` shipped after them, those commits would not typecheck — an unbuildable commit
   in history defeats the purpose of atomic commits.
2. `src/middleware.ts:13-17` is what protects `/api/chats`, `/api/inspection-requests`,
   `/api/reports` and `/api/saved-listings`. It must land *before* the routes it guards, so no
   commit ever contains a protected route without its middleware-layer protection. (The service
   layer checks authentication independently, so the interim state was never exploitable — but
   it should not be committed to history.)

---

## Section 2 — Authorization

### 2A. Self-service roles restricted to student

`src/server/services/user-sync-service.ts:44`

The supported-role set collapses to `["student"]`. Non-grantable roles are **filtered
silently**; the caller receives a normal 200 with `roles: ["student"]`. Rejecting with 422 and
a message naming `admin` would confirm to an attacker that the role exists.

**`deriveRequestedRoles` must be exported.** It is currently a module-private function
(`user-sync-service.ts:44`, bare `function`), so it cannot be imported by a test. It is the
single most security-critical unit in Phase 0 and its behaviour is a pure input/output mapping;
exporting it to assert that mapping directly is preferable to reaching it only through
`syncCurrentUserToDatabase` behind mocked Clerk and Supabase clients.

To retain the security signal that silent filtering discards, a request containing any
non-grantable role writes an audit entry:

- `action: "user.role_request_denied"`
- `entityType: "user"`, `entityId`: the user's id
- `actorUserId`: the user's id
- `metadata: { requestedRoles, grantedRoles }`

ADR-011 requires audit entries for role and permission changes and for manual overrides.

**This audit write must be non-blocking** — wrapped so a failure is logged and swallowed rather
than propagated. The codebase already has a latent flaw where audit writes occur after the
mutation and can throw, converting a succeeded operation into a 500. Adding an audit write to
the signup path without isolating it would extend that flaw to account creation. A missing
audit line is a degraded security signal; a failed signup is a broken product. The general fix
for audit-write failure handling belongs to Phase 1; this one call site is hardened now because
Phase 0 introduces it.

The onboarding UI needs no change — `role-selection-form.tsx` only ever offered student and
agent. `POST /api/me/bootstrap` needs no change; it delegates.

### 2B. Split the agent gate

`getCurrentAgentContext()` currently requires the `agent` role and is called from five places.
It is split by responsibility:

- **`getAgentOnboardingContext()`** — authenticated, no role requirement. Returns
  `{ user, roles, agentProfile | null }`. Used by `saveCurrentAgentProfile`,
  `submitCurrentAgentVerification`, `/agent/profile`, `/agent/verification`, and
  `/api/agent/profile`.
- **`getCurrentAgentContext()`** — unchanged, still requires `agent`. Continues to guard draft
  create/update, image upload and registration, submit-for-review, and entitlement checks.

The governing rule: **onboarding is open to any authenticated user; anything that produces
marketplace inventory remains agent-gated.** `/agent/listings/new` stays locked.

No middleware change is required. `/api/agent/*` and `/agent/*` are already in
`isProtectedRoute`, which enforces authentication but not role; role enforcement stays in the
service layer.

### 2C. Grant the agent role on verification approval

`src/server/services/admin-service.ts:77`, in `approveAgentVerificationAsAdmin`.

After `updateAgentVerificationStatus(..., "verified", ...)` and
`markVerificationSubmissionReviewed(...)`, call:

```
ensureUserRoles(adminClient, submission.agent_profiles.user_id, ["agent"])
```

`getVerificationSubmissionById` already selects `agent_profiles.user_id`, so no query change is
needed.

**The role grant executes last, deliberately.** These are three unbatched writes with no
transaction (transactions are Phase 1). If the grant fails after the status write, the user is
verified but not yet an agent — locked out, and recoverable by re-running the approval. The
reverse ordering would leave a user holding the `agent` role without an approved verification.
`security-checklist.md` requires failing closed; this ordering is that rule applied.

The existing audit entry for `agent_verification.approved` gains `roleGranted: "agent"` in its
metadata.

### 2D. Hard-gate dev auth

`src/lib/auth/dev-auth.ts:32`

```
isDevAuthEnabled()  →  process.env.NODE_ENV !== "production"
                       && process.env.ENABLE_DEV_AUTH === "true"
```

`NEXT_PUBLIC_ENABLE_DEV_AUTH` is removed from the server gate entirely. A client-exposed
variable must never be able to enable a server-side authentication bypass.

`NEXT_PUBLIC_ENABLE_DEV_AUTH` survives only in `src/lib/auth/use-effective-auth.ts`, where it
controls whether the dev login panel is displayed and grants nothing. The two flags are
independent: the public one affects UI visibility only; the server-only one is the sole thing
that can produce a session.

`src/middleware.ts:22` requires no change — it calls `isDevAuthEnabled()` and middleware
executes server-side.

**Local migration step.** Any developer whose `.env.local` enables the harness through
`NEXT_PUBLIC_ENABLE_DEV_AUTH` alone will lose dev login when this lands, because that variable
no longer satisfies the server gate. `.env.local` must gain `ENABLE_DEV_AUTH=true`, keeping
`NEXT_PUBLIC_ENABLE_DEV_AUTH=true` if the login panel should remain visible. This belongs in
the pull request description and in `README.md`.

### Accepted technical debt

The dev-auth cookie is unsigned. In any non-production environment, setting
`ruvo_dev_user=seed_clerk_admin_001` yields an admin session. The `NODE_ENV` guard makes this
unreachable in production, which is Phase 0's objective.

- **Accepted by:** this design
- **Bounded to:** Phase 1, alongside the RLS retrofit
- **Remediation:** sign the cookie with a server-only secret, or delete the harness once RLS
  and seeded Clerk test users make it redundant

`engineering-quality.md` permits technical debt only when explicitly documented, intentionally
accepted, time-bounded and tracked. This entry satisfies that requirement.

---

## Section 3 — Correctness, tests, CI

### 3A. View tracking

Root cause is a type collision: the route holds a `slugOrPublicId: string`, `trackListingView`
expects `listingId: string`, and both are `string`, so a slug silently became a UUID foreign
key.

1. **Rename the parameter.** `trackListingView` takes `slugOrPublicId`, and resolution moves
   inside the service: `parseListingIdentifier()` then `getPublicListingIdByUuid()` — the
   pattern `saved-listings-service.ts:19` already uses. The rename is the substantive fix; it
   turns a recurrence of this bug into a compile error.
2. **Guard the UUID shape before querying.** `parseListingIdentifier` (`parsers.ts:72`) never
   fails: given input containing no `--`, it returns `{ publicId: <input>, slug: null }` with no
   validation. Passing that straight to `getPublicListingIdByUuid` produces
   `.eq("public_uuid", "<garbage>")`, which Postgres rejects with `22P02 invalid input syntax
   for type uuid`. The fail-soft handler in step 3 would absorb it, but every crawler or scanner
   hitting `/listings/anything/views` would still cost a database round-trip and an error. A
   UUID-shape check before the query returns `{ tracked: false }` without touching the database,
   and gives the "malformed input" test case a defined behaviour to assert.
3. **Stop returning 500.** An unresolvable listing returns `200 {tracked: false}` — a no-op,
   not an error. Genuine infrastructure failures are logged server-side and still return
   success to the caller. BR-ANA-003 ("analytics collection must not block user actions") is
   Critical, and the caller is a fire-and-forget beacon from `listings-view-tracker.tsx`.

Note that `getPublicListingIdByUuid` filters on `status = 'approved'`, so a view of a listing
that has since been flagged or archived records nothing and returns `{ tracked: false }`. That
is consistent with BR-SEARCH-001 and is intended.

### 3B. Tests

Vitest, colocated `*.test.ts` beside their subjects. All unit-level; the repository layer is
mocked; no database.

#### Required Vitest configuration — the suite cannot run without it

**`server-only` must be aliased to an empty module.** The `server-only` package resolves `main`
to an `index.js` whose entire body is a `throw`; it is inert only under Next's `react-server`
export condition, which Vitest does not supply. All ten files in `src/server/services/` import
it, including four of the seven subjects below. Without the alias every one of those test files
fails at import time, before any assertion runs.

**Path aliases must be registered.** The codebase imports via `@/`. Vitest needs either
`vite-tsconfig-paths` or an equivalent manual `resolve.alias` entry, or every import fails to
resolve.

Both belong in `vitest.config.ts` in commit 10. Verify the config by running the suite before
writing any production change in commits 11–14.

#### Subjects

| Subject | Assertions |
|---|---|
| `deriveRequestedRoles` | `["admin"]→[]`; `["student","admin"]→["student"]`; `["agent"]→[]`; `undefined→[]`; `[]→[]`. Requires the export added in 2A |
| `syncCurrentUserToDatabase` | `ensureUserRoles` is never called with `admin`; an audit entry is written when a role is denied; **a throwing audit write does not fail the sync** |
| `isDevAuthEnabled` | production + `ENABLE_DEV_AUTH=true` → false; development + `ENABLE_DEV_AUTH=true` → true; development + unset → false; `NEXT_PUBLIC_ENABLE_DEV_AUTH=true` alone → false |
| `trackListingView` | inserts `listings.id`, never the slug; unknown listing does not throw; **malformed identifier never reaches the repository** |
| `parseListingIdentifier` | `slug--uuid`; bare uuid; input with no `--` returns the input as `publicId` and `slug: null` (documents existing behaviour — the UUID guard lives in `trackListingView`, not here) |
| `approveAgentVerificationAsAdmin` | grants `["agent"]`; grant occurs after the status write |
| `resolveRouteError` | pins current status-code mapping before Phase 1 replaces string matching with thrown `AppError`s |

Colocation follows ADR-005's principle that a slice owns its tests. Four of these subjects live
in `src/server/`, which is not a feature slice — colocation is still correct there, but it is a
Vitest convention rather than ADR-005 compliance. This is another instance of the unresolved
`AGENT_RULES.md` / ADR-005 structural conflict recorded below.

### 3C. CI

`.github/workflows/ci.yml`, triggered on push to `main` and on all pull requests:

```
Node 24  →  npm ci  →  npm run typecheck  →  npm run lint  →  npm test
```

Node 24 matches the local toolchain (v24.11.1). No secrets are required. `package.json` gains
`"test": "vitest run"`.

---

## Out of scope

Deferred deliberately, with the phase that owns each:

- RLS policies, the service-role retrofit, transactions — **Phase 1**
- Signing the dev-auth cookie — **Phase 1**
- Vertical-slice refactor, pnpm migration, shadcn/ui, `deleted_by` / `deletion_reason` — **Phase 2**
- Doc defects: UUID v4 vs v7 contradiction, `api-specification.md` duplicating the Event
  Catalog, ADR-000 register statuses — **Phase 3**

The pnpm migration is deliberately excluded from a stabilization branch: changing package
managers can shift dependency resolution, which is the opposite of establishing a known-good
baseline. It costs one line of CI to change later.

### Unresolved conflict

`AGENT_RULES.md` prescribes `src/server/{services,repositories,policies,workflows}`, while
ADR-005 rejects layered organisation in favour of vertical slices. Both are authoritative in
their own scope and they disagree. Phase 0 changes neither. This needs an explicit decision and
an ADR before the Phase 2 refactor.

---

## Definition of done

- Branch merged to `main` through a pull request; no direct commits to `main`.
- `npm run typecheck`, `npm run lint`, `npm test` green locally and in GitHub Actions.
- **Every commit typechecks in isolation**, verified by checking out each and running
  `npm run typecheck`. This is what makes the atomic-commit split worth doing.
- The Vitest suite runs — proving the `server-only` alias and path aliases are correctly
  configured — before any production change in commits 11–14 is written.
- `POST /api/me/bootstrap {"roles":["admin"]}` grants only `student` and writes a
  `user.role_request_denied` audit entry.
- `isDevAuthEnabled()` returns false under `NODE_ENV=production` regardless of either flag.
- A `student` can create an agent profile and submit verification; admin approval grants the
  `agent` role.
- The seeded admin (`seed_clerk_admin_001`) can still reach `/admin/verification` and approve a
  submission end to end after the role changes.
- `POST /api/listings/{slugOrPublicId}/views` inserts a `listing_views` row referencing
  `listings.id`, and returns 200 rather than 500 for an unknown listing.
- The accepted-debt entry for the unsigned dev-auth cookie is recorded here and carried into
  the Phase 1 plan.

---

## Review log

Revision 2 incorporates six findings from an adversarial review of revision 1. Three were
blocking: the design was internally sound but not executable as written.

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| F1 | Blocking | `server-only` resolves to a module whose body is a bare `throw` outside Next's `react-server` condition. Four of seven test subjects import it, so the suite failed at import time. Path aliases (`@/`) were also unconfigured. | Section 3B now mandates a `server-only` alias and path-alias registration in `vitest.config.ts`, verified before any production change |
| F2 | Blocking | `deriveRequestedRoles` is module-private and cannot be imported by a test, yet had its own test row | Section 2A now requires exporting it, with rationale |
| F3 | Blocking | Commit 5 imported `@/lib/api/errors` from commit 7 — an unbuildable commit in history, defeating the atomic-commit split | Shared infrastructure moved to commit 3; sequence renumbered to 15 commits |
| F4 | Moderate | Commits 3–5 added routes that `middleware.ts` protects, before `middleware.ts` itself | Middleware moved to commit 3, ahead of the routes it guards |
| F5 | Moderate | `parseListingIdentifier` performs no validation, so malformed input reached Postgres as an invalid uuid (`22P02`) on every crawler hit | Section 3A step 2 adds a UUID-shape guard before the query |
| F6 | Moderate | The new denial audit write could throw and convert signup into a 500, extending a known latent flaw to account creation | Section 2A requires the write to be non-blocking; a test asserts it |

Findings were verified against the code rather than reasoned about abstractly:
`node_modules/server-only/package.json`, `user-sync-service.ts:44`, the import graph of
`src/app/api/reports/` and `src/app/api/saved-listings/`, `middleware.ts:13-17`, and
`parsers.ts:72`.
