# Ruvo Phase 0 — Stabilization Design

**Date:** 2026-08-04
**Status:** Approved
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
| 3 | `feat(chats): add chat threads and messaging slice` | `src/app/api/chats/`, `src/app/chats/`, chat repository/service, chat components |
| 4 | `feat(inspections): add inspection request slice` | `src/app/api/inspection-requests/`, inspection repository/service, request form |
| 5 | `feat(listings): add reports and saved listings` | `src/app/api/reports/`, `src/app/api/saved-listings/`, `src/app/api/listings/[slugOrPublicId]/views/`, related repositories/services |
| 6 | `feat(auth): add dev auth harness` | `src/lib/auth/dev-auth.ts`, `src/lib/auth/use-effective-auth.ts`, `src/app/api/dev-auth/`, `src/app/dev-login/`, `src/middleware.ts` |
| 7 | `feat(admin): add verification review and moderation actions` | `src/app/admin/verification/`, `src/app/api/admin/verification-submissions/`, flag/dispute routes, `src/lib/api/errors.ts`, migrations 0004–0007 |
| 8 | `fix(lint): resolve remaining eslint errors` | 2 unescaped entities in `src/app/page.tsx:149-150`; `react-hooks/set-state-in-effect` at `src/lib/auth/use-effective-auth.ts:15` |
| 9 | `test(setup): add vitest runner and config` | Vitest, config, `"test": "vitest run"` |
| 10 | `fix(auth): restrict self-service roles to student` | Section 2A, with tests |
| 11 | `fix(auth): hard-gate dev auth to non-production` | Section 2D, with tests |
| 12 | `feat(agents): grant agent role on verification approval` | Sections 2B and 2C, with tests |
| 13 | `fix(listings): resolve public id before recording view` | Section 3A, with tests |
| 14 | `ci: add typecheck, lint and test workflow` | `.github/workflows/ci.yml` |

**Ordering rationale.** Cleanup and the untracked baseline land first so lint *can* be fixed;
lint is fixed so CI *can* be green; the test runner precedes the fixes so each ships with its
regression test; CI lands last because that is the first point at which it can pass. From
commit 14 onward it gates everything.

Commits 3–7 are pre-existing work being brought under version control, not new development.

---

## Section 2 — Authorization

### 2A. Self-service roles restricted to student

`src/server/services/user-sync-service.ts:44`

The supported-role set collapses to `["student"]`. Non-grantable roles are **filtered
silently**; the caller receives a normal 200 with `roles: ["student"]`. Rejecting with 422 and
a message naming `admin` would confirm to an attacker that the role exists.

To retain the security signal that silent filtering discards, a request containing any
non-grantable role writes an audit entry:

- `action: "user.role_request_denied"`
- `entityType: "user"`, `entityId`: the user's id
- `actorUserId`: the user's id
- `metadata: { requestedRoles, grantedRoles }`

ADR-011 requires audit entries for role and permission changes and for manual overrides.

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
2. **Stop returning 500.** An unresolvable listing returns `200 {tracked: false}` — a no-op,
   not an error. Genuine infrastructure failures are logged server-side and still return
   success to the caller. BR-ANA-003 ("analytics collection must not block user actions") is
   Critical, and the caller is a fire-and-forget beacon from `listings-view-tracker.tsx`.

### 3B. Tests

Vitest, colocated `*.test.ts` beside their subjects per ADR-005 ("each feature owns its
tests"). All unit-level; the repository layer is mocked; no database.

| Subject | Assertions |
|---|---|
| `deriveRequestedRoles` | `["admin"]→[]`; `["student","admin"]→["student"]`; `["agent"]→[]`; `undefined→[]`; `[]→[]` |
| `syncCurrentUserToDatabase` | `ensureUserRoles` is never called with `admin`; an audit entry is written when a role is denied |
| `isDevAuthEnabled` | production + `ENABLE_DEV_AUTH=true` → false; development + `ENABLE_DEV_AUTH=true` → true; development + unset → false; `NEXT_PUBLIC_ENABLE_DEV_AUTH=true` alone → false |
| `trackListingView` | inserts `listings.id`, never the slug; unknown listing does not throw |
| `parseListingIdentifier` | `slug--uuid`; bare uuid; malformed input |
| `approveAgentVerificationAsAdmin` | grants `["agent"]`; grant occurs after the status write |
| `resolveRouteError` | pins current status-code mapping before Phase 1 replaces string matching with thrown `AppError`s |

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
