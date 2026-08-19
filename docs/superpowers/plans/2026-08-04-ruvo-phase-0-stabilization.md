# Ruvo Phase 0 Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a live privilege-escalation hole, hard-gate the dev-auth backdoor, fix always-failing view tracking, bring 84 untracked files under version control, and establish CI.

**Architecture:** One branch (`chore/phase-0-stabilization`, already created) producing 15 atomic commits, merged via a single pull request. Cleanup lands first, then shared infrastructure, then the feature slices that depend on it, so every commit typechecks in isolation. The Vitest harness precedes every behavioural fix so each fix ships with its regression test. CI lands last, because that is the first point at which it can pass.

**Tech Stack:** Next.js 16.2.1 (App Router), React 19.2.4, TypeScript (strict), Supabase Postgres, Clerk, Tailwind v4, Vitest, GitHub Actions.

**Source spec:** `docs/superpowers/specs/2026-08-04-ruvo-phase-0-stabilization-design.md` (revision 2, commit `f56e20b`).

## Global Constraints

- Repository root: `/home/kenechukwu-okafor/Ruvo real estate app`. All paths are relative to it.
- Work on branch `chore/phase-0-stabilization`. **Never commit to `main`.**
- Package manager is **npm**. Do not migrate to pnpm — that is Phase 2.
- Node 24 (local: v24.11.1). CI pins Node 24.
- **Every commit must typecheck in isolation**, verified with the worktree method below. Running
  `npm run typecheck` in the working tree does **not** prove this and must never be claimed as
  proof: `tsc` resolves modules from disk regardless of git state, so with uncommitted files
  present it passes even when the commit itself is broken. Revision 1 of this plan made that
  mistake and shipped a dependency inversion past two "verified" checks.

  ```bash
  git worktree add /tmp/ruvo-iso <COMMIT_SHA>
  ln -s "/home/kenechukwu-okafor/Ruvo real estate app/node_modules" /tmp/ruvo-iso/node_modules
  cd /tmp/ruvo-iso && npm run typecheck ; cd -
  git worktree remove --force /tmp/ruvo-iso
  ```

  Use a worktree, never `git stash -u`: the working tree holds dozens of uncommitted files of
  real work, and a failed `stash pop` could destroy them. A worktree cannot touch them.

  **Symlinking a shared `node_modules` into the worktree is a speed shortcut with a real cost.**
  It proves the commit's *source* typechecks, but not that the commit's *`package.json`* declares
  everything its source imports — a commit missing a dependency still resolves it through the
  shared directory, which is exactly the class of bug this check exists to catch. For a final,
  branch-wide sign-off, run a genuine `npm ci` inside each worktree, or otherwise demonstrate that
  no commit imports a package its own manifest omits. Symlinking is fine for per-task checks
  during development; on its own it is not sufficient Definition-of-Done evidence.
- Tests use **no database and no secrets**. The repository layer is always mocked.
- Test files are colocated: `foo.ts` → `foo.test.ts` in the same directory.
- Do not add RLS policies, transactions, or a service-role retrofit — all Phase 1.
- Do not touch `AGENT_RULES.md` vs ADR-005 structural conflict — unresolved, out of scope.
- Commit messages follow `type(scope): subject` per `engineering-workflow.md`.
- Every commit message ends with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `vitest.config.ts` | Vitest config: `server-only` alias, path aliases, node environment |
| `test/stubs/server-only.ts` | Empty module standing in for the `server-only` marker package |
| `.github/workflows/ci.yml` | typecheck → lint → test on push to `main` and all PRs |
| `src/server/services/audit-service.test.ts` | Harness smoke test proving both aliases resolve |
| `src/server/services/user-sync-service.test.ts` | Role-derivation and denial-audit regression tests |
| `src/lib/auth/dev-auth.test.ts` | Dev-auth gate regression tests |
| `src/server/services/admin-service.test.ts` | Verification-approval role-grant tests |
| `src/server/services/public-listings-service.test.ts` | View-tracking identifier-resolution tests |
| `src/features/listings/parsers.test.ts` | Identifier parsing behaviour |
| `src/lib/api/errors.test.ts` | Pins status-code mapping before Phase 1 replaces it |

**Modified:**

| Path | Change |
|---|---|
| `.gitignore` | Ignore Supabase local CLI state |
| `eslint.config.mjs` | Ignore `agent/**` (CommonJS dev tooling) |
| `package.json` | `express`/`ws` → devDependencies; add `test` script; add Vitest deps |
| `src/app/page.tsx:149-150` | Escape two literal quotation marks |
| `src/lib/auth/use-effective-auth.ts` | Remove synchronous `setState` inside effect |
| `src/server/services/user-sync-service.ts:44` | Export + restrict `deriveRequestedRoles`; add non-blocking denial audit |
| `src/lib/auth/dev-auth.ts:32` | `NODE_ENV` guard; drop `NEXT_PUBLIC_` from the server gate |
| `src/server/services/agent-service.ts` | Add `getAgentOnboardingContext`; repoint onboarding callers |
| `src/app/agent/profile/page.tsx:4,9` | Use onboarding context |
| `src/app/agent/verification/page.tsx:4,9` | Use onboarding context |
| `src/app/api/agent/profile/route.ts:6,14` | Use onboarding context |
| `src/server/services/admin-service.ts:77` | Grant `agent` role after verification approval |
| `src/server/services/public-listings-service.ts:29` | Resolve identifier before insert; UUID guard |
| `src/app/api/listings/[slugOrPublicId]/views/route.ts:30-63` | Pass identifier; never return 500 |

**Deleted:** `docs/agent/` (near-duplicate of `agent/`).

---

## Task 1: Repository hygiene

Covers spec commits 1–2. Removes noise from the working tree and eliminates 9 of the 21 lint errors by deletion and 9 more by ignoring non-application code, leaving exactly the 3 real errors in `src/` for Task 4.

**Files:**
- Modify: `.gitignore`
- Modify: `eslint.config.mjs`
- Modify: `package.json`
- Delete: `docs/agent/`

**Interfaces:**
- Consumes: nothing.
- Produces: a lint baseline where the only remaining errors are 2 in `src/app/page.tsx` and 1 in `src/lib/auth/use-effective-auth.ts`.

- [ ] **Step 1: Confirm the starting state**

```bash
git branch --show-current
git status --porcelain | wc -l
```

Expected: `chore/phase-0-stabilization` and `84`.

- [ ] **Step 2: Ignore Supabase local CLI state**

Append to `.gitignore`:

```gitignore

# supabase local cli state
/supabase/.branches
/supabase/.temp
```

- [ ] **Step 3: Verify the ignore took effect**

```bash
git status --porcelain | grep supabase/
```

Expected: only `supabase/migrations/0004…0007` and `supabase/seed.sql`. No `.temp` or `.branches`.

- [ ] **Step 4: Commit the gitignore change**

```bash
git add .gitignore
git commit -m "$(cat <<'EOF'
chore(git): ignore supabase local cli state

The Supabase CLI writes .temp/cli-latest and .branches/_current_branch
into the repository. These are machine-local and must not be tracked.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Delete the duplicated CDP bridge**

```bash
rm -rf docs/agent
```

`docs/agent/` duplicates `agent/` (same four files; `controller.js` differs; no README). Both are a local Chrome DevTools Protocol bridge used for manual QA, not application code.

- [ ] **Step 6: Move `express` and `ws` to devDependencies**

In `package.json`, delete `"express": "^5.2.1",` and `"ws": "^8.20.0"` from `dependencies`, and add them to `devDependencies`:

```json
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.1",
    "express": "^5.2.1",
    "tailwindcss": "^4",
    "typescript": "^5",
    "ws": "^8.20.0"
  }
```

They are used only by `agent/` (`npm run agent`), never by the application. Shipping them as production dependencies inflates the deployment bundle.

- [ ] **Step 7: Exclude the CDP bridge from linting**

In `eslint.config.mjs`, add `"agent/**"` to the `globalIgnores` array:

```javascript
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local Chrome DevTools Protocol bridge: CommonJS Node tooling, not
    // application code, and not subject to the TypeScript lint rules.
    "agent/**",
  ]),
```

`agent/` produces 9 `@typescript-eslint/no-require-imports` errors because it is CommonJS being linted by the TypeScript config. Ignoring is correct: it is dev tooling, not shipped code.

- [ ] **Step 8: Verify only the three real errors remain**

```bash
npx eslint . 2>&1 | tail -20
```

Expected: exactly 3 errors — 2 × `react/no-unescaped-entities` in `src/app/page.tsx`, 1 × `react-hooks/set-state-in-effect` in `src/lib/auth/use-effective-auth.ts`. Task 4 fixes these.

- [ ] **Step 9: Verify dependencies still install and typecheck passes**

```bash
npm install
npm run typecheck
```

Expected: install succeeds; typecheck exits 0.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json eslint.config.mjs
git add -A docs/agent
git commit -m "$(cat <<'EOF'
chore(agent): remove duplicated cdp bridge

docs/agent/ duplicated agent/ (four identical files apart from
controller.js). Deleted the copy.

express and ws are used only by the local CDP bridge, never by the
application, so they move to devDependencies. agent/ is CommonJS dev
tooling and is now excluded from linting, which removes 18 of the 21
existing eslint errors.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Shared infrastructure and dev-auth harness

Covers spec commits 3–4. **Ordering here is load-bearing**, and revision 1 of this plan got it wrong. Three constraints apply simultaneously:

1. `src/middleware.ts:3` imports `@/lib/auth/dev-auth`, so the **dev-auth harness must land first**. Revision 1 ordered these the other way around, producing a commit that did not typecheck standalone. `dev-auth.ts` has no imports of its own, so the harness commit is self-contained.
2. `src/lib/api/errors.ts` must precede the Task 3 routes that import it (`src/app/api/reports/route.ts`, both `saved-listings` routes), or those commits will not compile.
3. `src/middleware.ts` must precede the routes it protects, so no commit in history contains a protected route without middleware-layer protection.

**Files (in commit order):**
- Commit 1: `src/lib/auth/dev-auth.ts`, `src/lib/auth/use-effective-auth.ts`, `src/app/api/dev-auth/`, `src/app/dev-login/`, `src/features/auth/components/dev-login-panel.tsx`
- Commit 2: `src/lib/api/errors.ts`, `src/middleware.ts`

**Interfaces:**
- Consumes: Task 1's clean lint baseline.
- Produces: `routeErrorResponse(error: unknown, requestId: string): NextResponse` and `AppError` from `@/lib/api/errors`; `isDevAuthEnabled(): boolean`, `DEV_AUTH_COOKIE_NAME: string`, `getDevAuthUserByClerkUserId(id: string | null | undefined)` from `@/lib/auth/dev-auth`. Tasks 5–9 depend on these existing.

- [ ] **Step 1: Stage shared API infrastructure and middleware**

```bash
git add src/lib/api/errors.ts src/middleware.ts
```

- [ ] **Step 2: Verify it typechecks in isolation**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): add shared error mapping and route protection

routeErrorResponse maps thrown service errors onto HTTP status codes and
the documented { error: { code, message }, meta } response envelope.

Clerk middleware protects the agent, admin, chat, inspection, reports and
saved-listings surfaces. This lands before the routes it guards so that no
commit contains a protected route without its middleware.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Stage the dev-auth harness**

```bash
git add src/lib/auth/dev-auth.ts src/lib/auth/use-effective-auth.ts \
        src/app/api/dev-auth src/app/dev-login \
        src/features/auth/components/dev-login-panel.tsx
```

- [ ] **Step 5: Verify typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(auth): add dev auth harness

Cookie-based impersonation of the three seeded accounts for local QA
without Clerk. Task 7 of the Phase 0 plan hard-gates this to
non-production; it is committed here as-is to keep the baseline honest
about what already exists.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Foundation and application slices

Covers spec commits 5–8. All of this is pre-existing work being brought under version control,
not new development.

**Revision 2 of this plan specified a five-way vertical-slice split. It could not compile.** A
dependency analysis of the pending files showed why: `src/types/database.ts` is imported by
every repository; `audit-service.ts` and `audit-repository.ts` are imported by five services;
`agents-repository.ts` is imported by `chat-service` and `inspection-service`. None of those
were staged until the final step, so all four slice commits would have failed.

The code beneath these "slices" is horizontally layered (`src/server/services` +
`src/server/repositories`) — the `AGENT_RULES.md` versus ADR-005 conflict, showing up as a
concrete blocker. You cannot have both compilable commits and slice-shaped commits here.

**Resolution (approved):** one foundation commit for the layered core, then genuine slice
commits at the route/page/component level, where independence is real.

**Files:** see per-step staging lists below.

**Interfaces:**
- Consumes: `@/lib/api/errors` and `src/middleware.ts` from Task 2.
- Produces: `trackListingView` in `@/server/services/public-listings-service` (Task 9 rewrites
  it); `approveAgentVerificationAsAdmin` in `@/server/services/admin-service` (Task 8 modifies
  it); `deriveRequestedRoles` in `@/server/services/user-sync-service` (Task 6 modifies it).

**Verify every commit in this task with the worktree method from Global Constraints.** Running
`npm run typecheck` in the working tree proves nothing about a commit — that mistake is what
produced the broken ordering in Tasks 2 and 3.

- [ ] **Step 1: Remove the relocated root middleware**

`middleware.ts` at the repository root is a pending deletion; the file now lives at
`src/middleware.ts`, committed in Task 2.

```bash
git rm --cached middleware.ts 2>/dev/null || git add -u middleware.ts
git commit -m "$(cat <<'EOF'
chore(middleware): remove relocated root middleware

Clerk middleware now lives at src/middleware.ts, committed alongside the
shared error mapping. This removes the superseded root copy.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Commit the layered foundation**

These 21 files form a connected graph and cannot be split further without breaking compilation.

`src/app/api/admin/listings/[listingId]/approve/route.ts` is included even though it is a route,
not a service: this commit changes `approveListingAsAdmin` from `(listingId, adminUserId)` to
`(listingId)`, and the version of that route committed at `b58c6ab` is its caller. Leaving the
caller behind breaks every commit between this one and the admin slice. The first attempt at
this task did exactly that, and four commits failed isolation.

That edge was invisible to the original import-graph analysis, which traced module imports among
*pending* files only. Signature changes reach backwards into *already-committed* callers. When
splitting commits over modified code, both edge types matter.

```bash
git add src/types/database.ts \
        "src/app/api/admin/listings/[listingId]/approve/route.ts" \
        src/lib/env.ts src/lib/auth/clerk.ts \
        src/features/agents/types.ts \
        src/features/listings/format.ts \
        src/server/repositories/agents-repository.ts \
        src/server/repositories/audit-repository.ts \
        src/server/repositories/chat-repository.ts \
        src/server/repositories/inspection-repository.ts \
        src/server/repositories/listings-repository.ts \
        src/server/repositories/reports-repository.ts \
        src/server/repositories/subscriptions-repository.ts \
        src/server/services/admin-service.ts \
        src/server/services/agent-service.ts \
        src/server/services/audit-service.ts \
        src/server/services/chat-service.ts \
        src/server/services/inspection-service.ts \
        src/server/services/listing-media-service.ts \
        src/server/services/reports-service.ts \
        src/server/services/saved-listings-service.ts
```

Verify in isolation, then commit:

```bash
git commit -m "$(cat <<'EOF'
feat(server): add shared types, repositories and services

The layered core the route and page slices build on: generated database
types, Supabase repositories for agents, listings, chats, inspections,
reports, subscriptions and audit logs, and the services that compose them.

Committed as one unit because these files form a connected import graph.
database.ts is imported by every repository, audit-service by five
services, and agents-repository by both chat and inspection services, so
no smaller split compiles. The underlying structure is layered rather than
sliced; reconciling that with ADR-005 is Phase 2 work.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Commit the chats slice**

```bash
git add src/app/api/chats src/app/chats src/features/chats
git commit -m "$(cat <<'EOF'
feat(chats): add chat threads and messaging slice

Inspection-scoped conversations between a seeker and a listing agent, with
message listing and creation. Participant access is enforced in the
service layer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Commit the inspections slice**

```bash
git add src/app/api/inspection-requests \
        src/features/listings/components/request-inspection-form.tsx
git commit -m "$(cat <<'EOF'
feat(inspections): add inspection request slice

Seekers request an inspection on an approved listing; the request creates
exactly one chat scoped to that listing, and agents accept or decline.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Commit reports, saved listings and view tracking**

This step also deletes the superseded `[listingId]` view route, replaced by `[slugOrPublicId]`.

```bash
git add src/app/api/reports src/app/api/saved-listings \
        "src/app/api/listings/[slugOrPublicId]/views" \
        src/features/listings/components/copy-url-button.tsx
git add -u "src/app/api/listings/[listingId]/views/route.ts"
git commit -m "$(cat <<'EOF'
feat(listings): add reports, saved listings and view tracking

Report submission, save/unsave, and the listing view beacon. Removes the
superseded [listingId] view route in favour of [slugOrPublicId].

The view endpoint passes the URL identifier where a listings.id UUID is
required and therefore always fails. Task 9 of the Phase 0 plan fixes it
with a regression test; it is committed here as-is so the fix lands as its
own reviewable change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Commit the admin slice and migrations**

`src/app/api/admin/listings/[listingId]/approve/route.ts` already landed in Step 2; `git add src/app/api/admin` re-adding that path is a harmless no-op.

```bash
git add src/app/admin \
        src/app/api/admin \
        src/features/admin \
        supabase/migrations/0004_listing_media_bucket.sql \
        supabase/migrations/0005_inspection_requests_and_chats.sql \
        supabase/migrations/0006_subscriptions.sql \
        supabase/migrations/0007_reports.sql \
        supabase/seed.sql
git commit -m "$(cat <<'EOF'
feat(admin): add verification review and moderation actions

Admin verification queue with approve and reject, plus listing flag and
dispute transitions. Includes migrations 0004-0007 (listing media bucket,
inspection requests and chats, subscriptions, reports) and the seed data
that backs the dev-auth test accounts.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Commit the remaining agent and public surfaces**

```bash
git status --porcelain
```

Review the remainder — agent listing management and profile pages, agent API routes, the
public listing pages, dashboard, layout, shared components, and the documentation updates.
Stage and commit them:

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(app): add remaining agent and public surfaces

Agent listing management, image upload targets, the public listing browse
and detail pages, dashboard, shell header, and the accompanying schema and
architecture documentation updates.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Verify the working tree is clean and every commit compiles**

```bash
git status --porcelain | wc -l
```

Expected: `0`.

Then run the worktree isolation check from Global Constraints against every commit this task
created. All must exit 0. If any fails, the staging lists above need adjusting — report which
commit failed and what it could not resolve rather than improvising a different split.

---

## Task 4: Clear the remaining lint errors

Covers spec commit 9. Three errors remain after Task 1. CI cannot be green until they are gone.

**Files:**
- Modify: `src/app/page.tsx:149-150`
- Modify: `src/lib/auth/use-effective-auth.ts:10-45`

**Interfaces:**
- Consumes: nothing.
- Produces: `useEffectiveAuth()` returning `{ isDevAuthEnabled: boolean; isDevSignedIn: boolean; isSignedIn: boolean }` — unchanged shape, so no caller changes.

- [ ] **Step 1: Confirm the three errors**

```bash
npx eslint . 2>&1 | tail -20
```

Expected: 3 errors, as listed in Task 1 Step 8.

- [ ] **Step 2: Escape the quotation marks**

In `src/app/page.tsx`, replace lines 149–150:

```jsx
                <p className="mt-2 text-sm leading-7 text-stone-500">
                  Annual rent is shown on every card and detail page. No &ldquo;DM
                  for price&rdquo;, no call-for-quote, no post-viewing surprises.
                </p>
```

- [ ] **Step 3: Remove the synchronous setState from the effect**

In `src/lib/auth/use-effective-auth.ts`, the effect calls `setHasDevAuth(false)` synchronously on the disabled path, which triggers a cascading render. Derive the value instead. Replace the whole hook body:

```typescript
export function useEffectiveAuth() {
  const { isSignedIn } = useAuth();
  const pathname = usePathname();
  const isDevAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH === "true";
  const [hasDevAuth, setHasDevAuth] = useState(false);

  useEffect(() => {
    if (!isDevAuthEnabled || isSignedIn) {
      return;
    }

    let cancelled = false;

    async function loadDevAuthState() {
      try {
        const response = await fetch("/api/me", {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (!cancelled) {
          setHasDevAuth(response.ok);
        }
      } catch {
        if (!cancelled) {
          setHasDevAuth(false);
        }
      }
    }

    void loadDevAuthState();

    return () => {
      cancelled = true;
    };
  }, [isDevAuthEnabled, isSignedIn, pathname]);

  const isDevSignedIn = isDevAuthEnabled && !isSignedIn && hasDevAuth;

  return {
    isDevAuthEnabled,
    isDevSignedIn,
    isSignedIn: isSignedIn || isDevSignedIn,
  };
}
```

The early return no longer calls `setState`. `isDevSignedIn` is now derived, so stale `hasDevAuth` state cannot leak through when dev auth is disabled or a real Clerk session exists — which is what the removed `setState` was there to prevent.

- [ ] **Step 4: Verify lint is clean**

```bash
npx eslint .
```

Expected: no output, exit 0.

- [ ] **Step 5: Verify typecheck still passes**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/lib/auth/use-effective-auth.ts
git commit -m "$(cat <<'EOF'
fix(lint): resolve remaining eslint errors

Escape two literal quotation marks in the homepage copy.

Derive isDevSignedIn instead of calling setState synchronously inside an
effect, which triggered cascading renders. Deriving also removes the risk
of stale dev-auth state leaking through when a real Clerk session exists.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Vitest harness

Covers spec commit 10. **This task must fully pass before any of Tasks 6–9 are written.** The `server-only` package resolves `main` to a module whose entire body is a `throw`; it is inert only under Next's `react-server` export condition, which Vitest does not supply. Every file in `src/server/services/` imports it. Without the alias, four of the six test files in this plan fail at import time before a single assertion runs.

**Files:**
- Create: `vitest.config.ts`
- Create: `test/stubs/server-only.ts`
- Create: `src/server/services/audit-service.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs Vitest once and exits; `@/` path aliases resolve in tests; importing any module that imports `server-only` succeeds. Tasks 6–9 all depend on this.

- [ ] **Step 1: Install Vitest and the path-alias plugin**

```bash
npm install --save-dev vitest vite-tsconfig-paths
```

- [ ] **Step 2: Create the `server-only` stub**

Create `test/stubs/server-only.ts`:

```typescript
// The `server-only` package's real entry point is a bare `throw`, inert only
// under Next's `react-server` export condition, which Vitest does not supply.
// Vitest aliases the package to this empty module so that server modules can be
// imported under test. See vitest.config.ts.
export {};
```

- [ ] **Step 3: Create the Vitest config**

Create `vitest.config.ts`:

```typescript
import { fileURLToPath } from "node:url";

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Add the test script**

In `package.json`, add to `scripts`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 5: Write the harness smoke test**

Create `src/server/services/audit-service.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("vitest harness", () => {
  it("resolves the @/ path alias and the server-only stub", async () => {
    const auditService = await import("@/server/services/audit-service");

    expect(typeof auditService.writeAuditLog).toBe("function");
  });
});
```

This asserts both halves of the configuration at once: the `@/` specifier must resolve, and `audit-service.ts` imports `server-only` on its first line, so the import only succeeds if the alias is working.

- [ ] **Step 6: Run the smoke test**

```bash
npm test
```

Expected: 1 test passes.

If it fails with `This module cannot be imported from a Client Component module`, the `server-only` alias is not being applied — check the path in `vitest.config.ts`. If it fails with `Cannot find module '@/server/services/audit-service'`, `vite-tsconfig-paths` is not loading — check that it is listed in `plugins`.

- [ ] **Step 7: Verify typecheck still passes**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts test/stubs/server-only.ts \
        src/server/services/audit-service.test.ts \
        package.json package-lock.json
git commit -m "$(cat <<'EOF'
test(setup): add vitest runner and config

The server-only package's entry point is a bare throw, inert only under
Next's react-server export condition, which Vitest does not supply. Every
service imports it, so tests alias it to an empty stub. vite-tsconfig-paths
resolves the @/ specifiers.

A smoke test asserts both halves of the configuration by importing a module
that imports server-only through the @/ alias.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Restrict self-service roles to student

Covers spec commit 11 and spec §2A. **This closes the live privilege escalation.** Any authenticated user can currently `POST /api/me/bootstrap {"roles":["admin"]}` and become an administrator.

**Files:**
- Modify: `src/server/services/user-sync-service.ts:44-54,81-85`
- Create: `src/server/services/user-sync-service.test.ts`

**Interfaces:**
- Consumes: `writeAuditLog` from `@/server/services/audit-service` (Task 2/3); the Vitest harness (Task 5).
- Produces: `deriveRequestedRoles(input: string[] | undefined): SelfServiceRole[]` — now **exported** — where `type SelfServiceRole = "student"`.

- [ ] **Step 1: Write the failing tests**

Create `src/server/services/user-sync-service.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureUserRoles = vi.fn();
const listUserRoles = vi.fn();
const upsertUserByClerkIdentity = vi.fn();
const writeAuditLog = vi.fn();

vi.mock("@/lib/auth/clerk", () => ({
  getCurrentClerkUser: vi.fn(async () => ({
    emailAddresses: [{ emailAddress: "seeker@ruvo.local", id: "email_1" }],
    firstName: "Ada",
    imageUrl: null,
    lastName: "Obi",
    phoneNumbers: [],
    primaryEmailAddressId: "email_1",
    primaryPhoneNumberId: null,
    username: "ada",
  })),
  requireAuthenticatedUser: vi.fn(async () => ({ userId: "clerk_user_1" })),
}));

vi.mock("@/lib/db/supabase", () => ({
  getSupabaseAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/server/repositories/users-repository", () => ({
  ensureUserRoles,
  getUserByClerkUserId: vi.fn(),
  listUserRoles,
  upsertUserByClerkIdentity,
}));

vi.mock("@/server/services/audit-service", () => ({ writeAuditLog }));

const { deriveRequestedRoles, syncCurrentUserToDatabase } = await import(
  "@/server/services/user-sync-service"
);

beforeEach(() => {
  vi.clearAllMocks();
  upsertUserByClerkIdentity.mockResolvedValue({ id: "user_1" });
  listUserRoles.mockResolvedValue([{ role: "student" }]);
  ensureUserRoles.mockResolvedValue([]);
  writeAuditLog.mockResolvedValue(undefined);
});

describe("deriveRequestedRoles", () => {
  it("never grants admin", () => {
    expect(deriveRequestedRoles(["admin"])).toEqual([]);
  });

  it("never grants agent", () => {
    expect(deriveRequestedRoles(["agent"])).toEqual([]);
  });

  it("keeps student and drops everything else", () => {
    expect(deriveRequestedRoles(["student", "admin"])).toEqual(["student"]);
  });

  it("returns an empty array for undefined input", () => {
    expect(deriveRequestedRoles(undefined)).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(deriveRequestedRoles([])).toEqual([]);
  });
});

describe("syncCurrentUserToDatabase", () => {
  it("never passes admin through to ensureUserRoles", async () => {
    await syncCurrentUserToDatabase({ requestedRoles: ["student", "admin"] });

    expect(ensureUserRoles).toHaveBeenCalledWith({}, "user_1", ["student"]);
  });

  it("does not call ensureUserRoles when nothing is grantable", async () => {
    await syncCurrentUserToDatabase({ requestedRoles: ["admin"] });

    expect(ensureUserRoles).not.toHaveBeenCalled();
  });

  it("audits a denied role request", async () => {
    await syncCurrentUserToDatabase({ requestedRoles: ["admin"] });

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.role_request_denied",
        actorUserId: "user_1",
        entityId: "user_1",
        entityType: "user",
      }),
    );
  });

  it("does not audit when every requested role is grantable", async () => {
    await syncCurrentUserToDatabase({ requestedRoles: ["student"] });

    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("still succeeds when the denial audit write throws", async () => {
    writeAuditLog.mockRejectedValue(new Error("audit table unavailable"));

    await expect(
      syncCurrentUserToDatabase({ requestedRoles: ["admin"] }),
    ).resolves.toMatchObject({ roles: ["student"] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- src/server/services/user-sync-service.test.ts
```

Expected: FAIL. `deriveRequestedRoles` is not exported, so the import is `undefined`; the admin cases fail because `admin` is currently whitelisted.

- [ ] **Step 3: Restrict and export the role derivation**

In `src/server/services/user-sync-service.ts`, replace the `deriveRequestedRoles` function (lines 44–54) with:

```typescript
export type SelfServiceRole = "student";

const SELF_SERVICE_ROLES: ReadonlySet<SelfServiceRole> = new Set(["student"]);

export function deriveRequestedRoles(
  input: string[] | undefined,
): SelfServiceRole[] {
  if (!input || input.length === 0) {
    return [];
  }

  return input.filter((role): role is SelfServiceRole =>
    SELF_SERVICE_ROLES.has(role as SelfServiceRole),
  );
}
```

`agent` is granted only by admin verification approval (Task 8). `admin` is never granted by application code; it is established by a one-time database write, documented in the spec.

- [ ] **Step 4: Add the non-blocking denial audit**

Add the import at the top of the same file:

```typescript
import { writeAuditLog } from "@/server/services/audit-service";
```

Add this helper above `syncCurrentUserToDatabase`:

```typescript
async function recordDeniedRoleRequest(input: {
  grantedRoles: string[];
  requestedRoles: string[];
  userId: string;
}) {
  try {
    await writeAuditLog({
      action: "user.role_request_denied",
      actorUserId: input.userId,
      entityId: input.userId,
      entityType: "user",
      metadata: {
        grantedRoles: input.grantedRoles,
        requestedRoles: input.requestedRoles,
      },
    });
  } catch (error) {
    // Never allow an audit failure to break account creation. The codebase
    // writes audit entries after the mutation they describe, so a throw here
    // would turn a succeeded signup into a 500. Phase 1 addresses audit
    // failure handling globally.
    console.error("Failed to record denied role request", {
      error,
      userId: input.userId,
    });
  }
}
```

Then replace lines 81–85 of `syncCurrentUserToDatabase`:

```typescript
  const requestedRoles = deriveRequestedRoles(options?.requestedRoles);
  const submittedRoles = options?.requestedRoles ?? [];
  const deniedRoles = submittedRoles.filter(
    (role) => !requestedRoles.includes(role as SelfServiceRole),
  );

  if (deniedRoles.length > 0) {
    await recordDeniedRoleRequest({
      grantedRoles: requestedRoles,
      requestedRoles: submittedRoles,
      userId: appUser.id,
    });
  }

  if (requestedRoles.length > 0) {
    await ensureUserRoles(adminClient, appUser.id, requestedRoles);
  }
```

Non-grantable roles are filtered silently rather than rejected with a 422 — an error naming `admin` would confirm to an attacker that the role exists. The audit entry preserves the security signal that silence discards.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- src/server/services/user-sync-service.test.ts
```

Expected: 11 tests pass.

- [ ] **Step 6: Verify the escalation is actually closed**

```bash
npm run typecheck && npx eslint .
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/user-sync-service.ts \
        src/server/services/user-sync-service.test.ts
git commit -m "$(cat <<'EOF'
fix(auth): restrict self-service roles to student

Any authenticated user could POST /api/me/bootstrap {"roles":["admin"]}
and become an administrator. deriveRequestedRoles whitelisted all three
roles and the bootstrap route forwarded the request body verbatim.

Self-service signup now grants student only. The agent role is granted by
admin verification approval; admin is established by a one-time database
write and never by application code.

Non-grantable roles are filtered silently rather than rejected, so the
response does not confirm that admin exists. A non-blocking audit entry
preserves the security signal.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Hard-gate dev auth to non-production

Covers spec commit 12 and spec §2D. `isDevAuthEnabled()` is currently satisfied by the client-exposed `NEXT_PUBLIC_ENABLE_DEV_AUTH` and has no `NODE_ENV` guard, so shipping it enabled yields an unauthenticated path to an admin session.

**Files:**
- Modify: `src/lib/auth/dev-auth.ts:32-37`
- Create: `src/lib/auth/dev-auth.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: the Vitest harness (Task 5).
- Produces: `isDevAuthEnabled(): boolean` — same signature, stricter behaviour. `src/middleware.ts` and `src/lib/auth/clerk.ts` call it and need no change.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/auth/dev-auth.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

import { isDevAuthEnabled } from "@/lib/auth/dev-auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isDevAuthEnabled", () => {
  it("is false in production even when the server flag is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEV_AUTH", "true");

    expect(isDevAuthEnabled()).toBe(false);
  });

  it("is false in production even when the public flag is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEV_AUTH", "true");

    expect(isDevAuthEnabled()).toBe(false);
  });

  it("is true in development when the server flag is set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_AUTH", "true");

    expect(isDevAuthEnabled()).toBe(true);
  });

  it("is false in development when no flag is set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_AUTH", "");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEV_AUTH", "");

    expect(isDevAuthEnabled()).toBe(false);
  });

  it("is false when only the client-exposed flag is set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_AUTH", "");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEV_AUTH", "true");

    expect(isDevAuthEnabled()).toBe(false);
  });
});
```

The last case is the one that matters most: a client-exposed variable must never be able to enable a server-side authentication bypass.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- src/lib/auth/dev-auth.test.ts
```

Expected: FAIL on the production cases and on the client-flag-only case, because the current implementation accepts `NEXT_PUBLIC_ENABLE_DEV_AUTH` and ignores `NODE_ENV`.

- [ ] **Step 3: Apply the gate**

In `src/lib/auth/dev-auth.ts`, replace `isDevAuthEnabled` (lines 32–37):

```typescript
export function isDevAuthEnabled() {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return process.env.ENABLE_DEV_AUTH === "true";
}
```

`NEXT_PUBLIC_ENABLE_DEV_AUTH` is removed from the server gate entirely. It survives only in `src/lib/auth/use-effective-auth.ts`, where it controls whether the dev login panel is rendered and grants nothing.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- src/lib/auth/dev-auth.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Document the local migration step**

Add to `README.md`, under the local development section:

```markdown
### Dev auth

The dev-auth harness impersonates the seeded student, agent and admin
accounts without Clerk. It is disabled in production unconditionally.

To enable it locally, `.env.local` needs **both**:

```
ENABLE_DEV_AUTH=true
NEXT_PUBLIC_ENABLE_DEV_AUTH=true
```

`ENABLE_DEV_AUTH` is server-only and is the sole flag that can produce a
session. `NEXT_PUBLIC_ENABLE_DEV_AUTH` only controls whether the dev login
panel is visible and grants nothing.

If you previously set only `NEXT_PUBLIC_ENABLE_DEV_AUTH`, add
`ENABLE_DEV_AUTH=true` or dev login will stop working.
```

- [ ] **Step 6: Verify the full suite, typecheck and lint**

```bash
npm test && npm run typecheck && npx eslint .
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/dev-auth.ts src/lib/auth/dev-auth.test.ts README.md
git commit -m "$(cat <<'EOF'
fix(auth): hard-gate dev auth to non-production

isDevAuthEnabled was satisfied by NEXT_PUBLIC_ENABLE_DEV_AUTH and had no
NODE_ENV guard, so shipping it enabled exposed an unauthenticated path to
an admin session via POST /api/dev-auth/login.

The gate now requires NODE_ENV !== production and the server-only
ENABLE_DEV_AUTH flag. A client-exposed variable can no longer enable a
server-side authentication bypass.

Known remaining debt, accepted and bounded to Phase 1: the dev-auth cookie
is unsigned, so in non-production any client can assume a seeded identity.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Agent onboarding split and role grant

Covers spec commit 13 and spec §2B–2C. Task 6 removed `agent` from self-service, so without this task no user can ever become an agent. `getCurrentAgentContext()` currently requires the `agent` role, which makes agent-profile creation and verification submission unreachable for a student.

**Files:**
- Modify: `src/server/services/agent-service.ts:43-60,144-204`
- Modify: `src/server/services/admin-service.ts:77-121`
- Modify: `src/app/agent/profile/page.tsx:4,9`
- Modify: `src/app/agent/verification/page.tsx:4,9`
- Modify: `src/app/api/agent/profile/route.ts:6,14`
- Create: `src/server/services/admin-service.test.ts`

**Interfaces:**
- Consumes: `ensureUserRoles(client, userId, roles)` from `@/server/repositories/users-repository`; `getCurrentAppUser()` from `@/server/services/user-sync-service`.
- Produces: `getAgentOnboardingContext(): Promise<{ agentProfile: AgentProfileRow | null; roles: string[]; user: UserRow }>` from `@/server/services/agent-service`. `getCurrentAgentContext()` keeps its existing signature and its `agent` role requirement.

- [ ] **Step 1: Write the failing tests**

Create `src/server/services/admin-service.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const callOrder: string[] = [];

const ensureUserRoles = vi.fn(async () => {
  callOrder.push("ensureUserRoles");
  return [];
});
const updateAgentVerificationStatus = vi.fn(async () => {
  callOrder.push("updateAgentVerificationStatus");
  return {
    id: "agent_profile_1",
    rejection_reason: null,
    verification_status: "verified",
    verified_at: "2026-08-04T00:00:00.000Z",
    verified_by: "admin_user_1",
  };
});
const getVerificationSubmissionById = vi.fn();
const markVerificationSubmissionReviewed = vi.fn(async () => undefined);

vi.mock("@/lib/db/supabase", () => ({
  getSupabaseAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/server/repositories/agents-repository", () => ({
  getListingById: vi.fn(),
  getVerificationSubmissionById,
  listModerationQueue: vi.fn(),
  listVerificationQueue: vi.fn(),
  markVerificationSubmissionReviewed,
  updateAgentVerificationStatus,
  updateListingStatus: vi.fn(),
}));

vi.mock("@/server/repositories/users-repository", () => ({ ensureUserRoles }));

vi.mock("@/server/services/audit-service", () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

vi.mock("@/server/services/user-sync-service", () => ({
  getCurrentAppUser: vi.fn(async () => ({
    roles: ["admin"],
    user: { id: "admin_user_1" },
  })),
}));

const { approveAgentVerificationAsAdmin } = await import(
  "@/server/services/admin-service"
);

beforeEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
  getVerificationSubmissionById.mockResolvedValue({
    agent_profile_id: "agent_profile_1",
    agent_profiles: {
      id: "agent_profile_1",
      user_id: "agent_user_1",
      verification_status: "pending_review",
    },
    id: "submission_1",
    reviewed_at: null,
  });
});

describe("approveAgentVerificationAsAdmin", () => {
  it("grants the agent role to the submitting user", async () => {
    await approveAgentVerificationAsAdmin("submission_1");

    expect(ensureUserRoles).toHaveBeenCalledWith({}, "agent_user_1", ["agent"]);
  });

  it("grants the role only after the verification status is written", async () => {
    await approveAgentVerificationAsAdmin("submission_1");

    expect(callOrder.indexOf("ensureUserRoles")).toBeGreaterThan(
      callOrder.indexOf("updateAgentVerificationStatus"),
    );
  });

  it("does not grant a role when the submission was already reviewed", async () => {
    getVerificationSubmissionById.mockResolvedValue({
      agent_profile_id: "agent_profile_1",
      agent_profiles: {
        id: "agent_profile_1",
        user_id: "agent_user_1",
        verification_status: "pending_review",
      },
      id: "submission_1",
      reviewed_at: "2026-08-01T00:00:00.000Z",
    });

    await expect(
      approveAgentVerificationAsAdmin("submission_1"),
    ).rejects.toThrow("already been reviewed");

    expect(ensureUserRoles).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- src/server/services/admin-service.test.ts
```

Expected: FAIL — `ensureUserRoles` is never called, because approval does not currently grant a role.

- [ ] **Step 3: Add the onboarding context**

In `src/server/services/agent-service.ts`, add below `getCurrentAgentContext` (after line 60):

```typescript
/**
 * Authenticated context that does NOT require the `agent` role.
 *
 * Self-service signup grants `student` only, so a user becoming an agent has
 * no `agent` role yet. Agent-profile creation and verification submission must
 * therefore be reachable without it. Anything that produces marketplace
 * inventory continues to use getCurrentAgentContext.
 */
export async function getAgentOnboardingContext() {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  const adminClient = getSupabaseAdminClient();
  const agentProfile = await getAgentProfileByUserId(adminClient, appUser.user.id);

  return {
    agentProfile,
    roles: appUser.roles,
    user: appUser.user,
  };
}
```

- [ ] **Step 4: Repoint the two onboarding services**

In the same file, change the first line of `saveCurrentAgentProfile` (line 147) and of `submitCurrentAgentVerification` (line 174) from:

```typescript
  const context = await getCurrentAgentContext();
```

to:

```typescript
  const context = await getAgentOnboardingContext();
```

Leave every other `getCurrentAgentContext()` call untouched. Listing creation, updates, image upload, submit-for-review and entitlement checks all remain agent-gated.

- [ ] **Step 5: Repoint the three UI and route call sites**

In `src/app/agent/profile/page.tsx`, `src/app/agent/verification/page.tsx` and `src/app/api/agent/profile/route.ts`, change the import and the call from `getCurrentAgentContext` to `getAgentOnboardingContext`.

Do **not** change `src/app/agent/listings/new/page.tsx` — creating a listing must stay agent-gated.

- [ ] **Step 6: Grant the role on approval**

In `src/server/services/admin-service.ts`, add the import:

```typescript
import { ensureUserRoles } from "@/server/repositories/users-repository";
```

In `approveAgentVerificationAsAdmin`, after the `markVerificationSubmissionReviewed` call and before `writeAuditLog`:

```typescript
  // Granted last, deliberately. These are three unbatched writes with no
  // transaction (Phase 1 adds transactions). Ordering the grant last means a
  // failure here leaves the user verified but not yet an agent — never an
  // agent without an approved verification. Note that re-running the approval
  // will NOT repair it: requirePendingVerificationState rejects any submission
  // whose status has already moved off pending_review, and the status write
  // above has already done so. Recovery is an out-of-band grant of the agent
  // role for that user. Phase 1's transaction work removes this window.
  await ensureUserRoles(adminClient, submission.agent_profiles.user_id, [
    "agent",
  ]);
```

Then add `roleGranted: "agent"` to the existing `writeAuditLog` metadata object in the same function:

```typescript
    metadata: {
      roleGranted: "agent",
      submissionId: submission.id,
    },
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npm test -- src/server/services/admin-service.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 8: Verify the whole suite, typecheck and lint**

```bash
npm test && npm run typecheck && npx eslint .
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/server/services/agent-service.ts \
        src/server/services/admin-service.ts \
        src/server/services/admin-service.test.ts \
        src/app/agent/profile/page.tsx \
        src/app/agent/verification/page.tsx \
        src/app/api/agent/profile/route.ts
git commit -m "$(cat <<'EOF'
feat(agents): grant agent role on verification approval

Self-service signup now grants student only, so agent-profile creation and
verification submission must be reachable without the agent role.
getAgentOnboardingContext requires authentication but no role;
getCurrentAgentContext keeps its agent requirement and continues to guard
everything that produces marketplace inventory.

Approving a verification submission grants the agent role. The grant runs
last so that a failure leaves the user locked out rather than holding the
role without an approved verification.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Fix listing view tracking

Covers spec commit 14 and spec §3A. The route passes the URL identifier where `listing_views.listing_id` requires a `listings.id` UUID, so every view request fails. Both values are `string`, which is why the compiler allowed it.

**Files:**
- Modify: `src/server/services/public-listings-service.ts:29-40`
- Modify: `src/app/api/listings/[slugOrPublicId]/views/route.ts:30-63`
- Create: `src/server/services/public-listings-service.test.ts`
- Create: `src/features/listings/parsers.test.ts`
- Create: `src/lib/api/errors.test.ts`

**Interfaces:**
- Consumes: `parseListingIdentifier(value: string): { publicId: string; slug: string | null }` from `@/features/listings/parsers`; `getPublicListingIdByUuid(client, publicId): Promise<{ id: string } | null>` from `@/server/repositories/listings-repository`.
- Produces: `trackListingView(input: { ipHash?, referrer?, sessionId?, slugOrPublicId: string, userAgent?, viewerUserId? }): Promise<{ tracked: boolean }>` — the parameter is renamed from `listingId` to `slugOrPublicId`.

- [ ] **Step 1: Write the failing tests**

Create `src/server/services/public-listings-service.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const createListingView = vi.fn();
const getPublicListingIdByUuid = vi.fn();

vi.mock("@/lib/db/supabase", () => ({
  createSupabaseServerClient: vi.fn(async () => ({})),
}));

vi.mock("@/server/repositories/listings-repository", () => ({
  createListingView,
  getPublicListingByIdentifier: vi.fn(),
  getPublicListingIdByUuid,
  getPublicListings: vi.fn(),
}));

const { trackListingView } = await import(
  "@/server/services/public-listings-service"
);

const LISTING_UUID = "0198c1f2-3a4b-7c8d-9e0f-1a2b3c4d5e6f";

beforeEach(() => {
  vi.clearAllMocks();
  createListingView.mockResolvedValue(undefined);
  getPublicListingIdByUuid.mockResolvedValue({ id: "listing_row_1" });
});

describe("trackListingView", () => {
  it("records the resolved listings.id, never the url identifier", async () => {
    await trackListingView({ slugOrPublicId: `modern-flat--${LISTING_UUID}` });

    expect(getPublicListingIdByUuid).toHaveBeenCalledWith({}, LISTING_UUID);
    expect(createListingView).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ listingId: "listing_row_1" }),
    );
  });

  it("accepts a bare public uuid", async () => {
    await trackListingView({ slugOrPublicId: LISTING_UUID });

    expect(getPublicListingIdByUuid).toHaveBeenCalledWith({}, LISTING_UUID);
  });

  it("does not query the database for a malformed identifier", async () => {
    const result = await trackListingView({ slugOrPublicId: "not-a-listing" });

    expect(result).toEqual({ tracked: false });
    expect(getPublicListingIdByUuid).not.toHaveBeenCalled();
    expect(createListingView).not.toHaveBeenCalled();
  });

  it("reports untracked without throwing when the listing does not resolve", async () => {
    getPublicListingIdByUuid.mockResolvedValue(null);

    const result = await trackListingView({ slugOrPublicId: LISTING_UUID });

    expect(result).toEqual({ tracked: false });
    expect(createListingView).not.toHaveBeenCalled();
  });

  it("reports tracked when the view is recorded", async () => {
    const result = await trackListingView({ slugOrPublicId: LISTING_UUID });

    expect(result).toEqual({ tracked: true });
  });
});
```

Create `src/features/listings/parsers.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { parseListingIdentifier } from "@/features/listings/parsers";

const LISTING_UUID = "0198c1f2-3a4b-7c8d-9e0f-1a2b3c4d5e6f";

describe("parseListingIdentifier", () => {
  it("splits a slug and public id on the final double dash", () => {
    expect(parseListingIdentifier(`modern-flat--${LISTING_UUID}`)).toEqual({
      publicId: LISTING_UUID,
      slug: "modern-flat",
    });
  });

  it("splits on the last double dash when the slug contains one", () => {
    expect(parseListingIdentifier(`a--b--${LISTING_UUID}`)).toEqual({
      publicId: LISTING_UUID,
      slug: "a--b",
    });
  });

  it("treats a bare value as a public id", () => {
    expect(parseListingIdentifier(LISTING_UUID)).toEqual({
      publicId: LISTING_UUID,
      slug: null,
    });
  });

  it("performs no validation on unrecognised input", () => {
    // Documents existing behaviour: this function never fails. Callers that
    // reach the database must validate the uuid shape themselves.
    expect(parseListingIdentifier("garbage")).toEqual({
      publicId: "garbage",
      slug: null,
    });
  });
});
```

Create `src/lib/api/errors.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { AppError, resolveRouteError } from "@/lib/api/errors";

describe("resolveRouteError", () => {
  it("uses the status carried by an AppError", () => {
    const resolved = resolveRouteError(new AppError("TEAPOT", "Nope.", 418));

    expect(resolved).toEqual({
      code: "TEAPOT",
      httpStatus: 418,
      message: "Nope.",
    });
  });

  it("maps unauthenticated requests to 401", () => {
    expect(resolveRouteError(new Error("Unauthenticated request."))).toMatchObject({
      code: "UNAUTHENTICATED",
      httpStatus: 401,
    });
  });

  it("maps a missing role to 403", () => {
    expect(resolveRouteError(new Error("Admin role is required."))).toMatchObject({
      code: "UNAUTHORIZED",
      httpStatus: 403,
    });
  });

  it("maps not-found messages to 404", () => {
    expect(resolveRouteError(new Error("Listing not found."))).toMatchObject({
      code: "NOT_FOUND",
      httpStatus: 404,
    });
  });

  it("maps an unverified agent to 403", () => {
    expect(resolveRouteError(new Error("AGENT_NOT_VERIFIED"))).toMatchObject({
      code: "AGENT_NOT_VERIFIED",
      httpStatus: 403,
    });
  });

  it("falls back to 500 for unrecognised messages", () => {
    expect(resolveRouteError(new Error("kaboom"))).toMatchObject({
      code: "INTERNAL_ERROR",
      httpStatus: 500,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: `public-listings-service.test.ts` fails — `trackListingView` has no `slugOrPublicId` parameter and returns `undefined`. `parsers.test.ts` and `errors.test.ts` should pass immediately; they pin existing behaviour rather than driving a change.

- [ ] **Step 3: Rewrite `trackListingView`**

In `src/server/services/public-listings-service.ts`, add the import for the resolver:

```typescript
import {
  createListingView,
  getPublicListingByIdentifier,
  getPublicListingIdByUuid,
  getPublicListings,
} from "@/server/repositories/listings-repository";
```

Replace `trackListingView` (lines 29–40) with:

```typescript
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function trackListingView(input: {
  ipHash?: string | null;
  referrer?: string | null;
  sessionId?: string | null;
  slugOrPublicId: string;
  userAgent?: string | null;
  viewerUserId?: string | null;
}): Promise<{ tracked: boolean }> {
  const { publicId } = parseListingIdentifier(input.slugOrPublicId);

  // parseListingIdentifier never fails: given input with no "--" it returns the
  // input verbatim as publicId. Querying with that produces a Postgres 22P02
  // invalid-uuid error, so every crawler hitting this endpoint would cost a
  // round-trip and an exception. Reject the shape before touching the database.
  if (!UUID_PATTERN.test(publicId)) {
    return { tracked: false };
  }

  const client = await createSupabaseServerClient();
  const listing = await getPublicListingIdByUuid(client, publicId);

  if (!listing) {
    return { tracked: false };
  }

  await createListingView(client, {
    ipHash: input.ipHash ?? null,
    listingId: listing.id,
    referrer: input.referrer ?? null,
    sessionId: input.sessionId ?? null,
    userAgent: input.userAgent ?? null,
    viewerUserId: input.viewerUserId ?? null,
  });

  return { tracked: true };
}
```

The rename from `listingId` to `slugOrPublicId` is the substantive fix: it makes a recurrence of this bug a compile error rather than a runtime failure.

- [ ] **Step 4: Make the route fail soft**

In `src/app/api/listings/[slugOrPublicId]/views/route.ts`, replace the body of the `try`/`catch` from line 30 to line 63:

```typescript
    const result = await trackListingView({
      ipHash: ipAddress
        ? crypto.createHash("sha256").update(ipAddress).digest("hex")
        : null,
      referrer: body.referrer ?? null,
      sessionId: body.sessionId ?? null,
      slugOrPublicId,
      userAgent: request.headers.get("user-agent"),
      viewerUserId: appUser?.user.id ?? null,
    });

    return NextResponse.json(
      {
        data: { tracked: result.tracked },
        meta: createApiMeta(requestId),
      },
      { status: result.tracked ? 201 : 200 },
    );
  } catch (error) {
    // BR-ANA-003 (Critical): analytics collection must not block user actions.
    // This endpoint is a fire-and-forget beacon, so infrastructure failures are
    // logged and reported as untracked rather than surfaced as a 5xx.
    console.error("Failed to track listing view", { error, requestId });

    return NextResponse.json(
      {
        data: { tracked: false },
        meta: createApiMeta(requestId),
      },
      { status: 200 },
    );
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test
```

Expected: all tests pass — 5 in `public-listings-service.test.ts`, 4 in `parsers.test.ts`, 6 in `errors.test.ts`, plus the earlier suites.

- [ ] **Step 6: Verify typecheck and lint**

```bash
npm run typecheck && npx eslint .
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/public-listings-service.ts \
        src/server/services/public-listings-service.test.ts \
        "src/app/api/listings/[slugOrPublicId]/views/route.ts" \
        src/features/listings/parsers.test.ts \
        src/lib/api/errors.test.ts
git commit -m "$(cat <<'EOF'
fix(listings): resolve public id before recording view

The route passed the URL identifier where listing_views.listing_id requires
a listings.id UUID, so every view request failed. Both values are string,
which is why this typechecked.

trackListingView now takes slugOrPublicId and resolves it internally, so a
recurrence is a compile error. A uuid-shape guard rejects malformed
identifiers before any database round-trip.

The endpoint no longer returns 500: it is a fire-and-forget beacon, and
BR-ANA-003 requires that analytics never block user actions.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Continuous integration

Covers spec commit 15. CI lands last because this is the first point at which it can be green. From here on it gates every pull request.

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run typecheck`, `npm run lint`, `npm test` — all green after Tasks 1–9.
- Produces: a required status check on every pull request.

- [ ] **Step 1: Verify all three gates pass locally first**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: all three exit 0. **Do not proceed if any fails** — CI would be red on arrival, which is exactly the failure mode this ordering exists to avoid.

- [ ] **Step 2: Create the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: Typecheck, lint and test
    runs-on: ubuntu-latest

    steps:
      - name: Check out the repository
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test
```

No secrets are configured, and none are needed: every `appEnv` accessor is a lazily-called function, so no environment variable is read at import time. `next build` is deliberately excluded — adding it would require dummy Clerk and Supabase credentials as repository secrets. That belongs to Phase 1.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: add typecheck, lint and test workflow

Runs on push to main and on every pull request: npm ci, typecheck, lint,
then the Vitest suite on Node 24.

No secrets are required because every appEnv accessor is lazily called, so
nothing reads the environment at import time. next build is excluded
deliberately; it would need dummy credentials as repository secrets.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify every commit typechecks in isolation**

This is a Definition of Done requirement from the spec and the justification for the atomic-commit split. It is the first and only point at which per-commit isolation is actually proven — the `npm run typecheck` calls in Tasks 1–9 compile the working tree, not the individual commit.

Expect this to take several minutes: it reinstalls dependencies at each commit, which is necessary because Task 1 moves `express` and `ws` between dependency groups and Task 5 adds Vitest.

```bash
git rev-list --reverse main..HEAD | while read -r sha; do
  git checkout -q "$sha"
  npm ci --silent > /dev/null 2>&1
  if npm run typecheck > /dev/null 2>&1; then
    echo "PASS $(git log -1 --format='%h %s' "$sha")"
  else
    echo "FAIL $(git log -1 --format='%h %s' "$sha")"
  fi
done
git checkout -q chore/phase-0-stabilization
```

Expected: `PASS` for every commit. Any `FAIL` means the commit split has a dependency inversion that must be fixed by reordering before the pull request is opened.

- [ ] **Step 5: Push and open the pull request**

```bash
git push -u origin chore/phase-0-stabilization
```

Open a pull request against `main`. Per `engineering-workflow.md`, the description must include purpose, summary of changes, migration notes, testing evidence, and documentation updates. It must state:

- The privilege-escalation fix and its blast radius before the fix.
- The `.env.local` migration step: contributors need `ENABLE_DEV_AUTH=true`, not only `NEXT_PUBLIC_ENABLE_DEV_AUTH=true`.
- The production admin-bootstrap requirement: a one-time
  `insert into public.user_roles (user_id, role) values ('<uuid>', 'admin')`,
  since no code path now creates the first administrator.
- The accepted debt: the dev-auth cookie is unsigned, bounded to Phase 1.

- [ ] **Step 6: Confirm CI is green on the pull request**

Check the Actions tab. Expected: the `verify` job passes.

---

## Definition of Done

Verify each before considering Phase 0 complete:

- [ ] Branch merged to `main` through a pull request; no direct commits to `main`.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` green locally and in GitHub Actions.
- [ ] Every commit typechecks in isolation (Task 10 Step 4).
- [ ] `POST /api/me/bootstrap {"roles":["admin"]}` grants only `student` and writes a `user.role_request_denied` audit entry.
- [ ] `isDevAuthEnabled()` returns false under `NODE_ENV=production` regardless of either flag.
- [ ] A `student` can create an agent profile and submit verification; admin approval grants the `agent` role.
- [ ] The seeded admin (`seed_clerk_admin_001`) can still reach `/admin/verification` and approve a submission end to end.
- [ ] `POST /api/listings/{slugOrPublicId}/views` inserts a `listing_views` row referencing `listings.id`, and returns 200 rather than 500 for an unknown listing.
- [ ] The unsigned dev-auth cookie is recorded as accepted debt and carried into the Phase 1 plan.

## Manual verification

Automated tests mock the repository layer, so these paths are confirmed by hand once against a local Supabase instance:

- [ ] Sign in as the seeded student. Attempt `curl -X POST localhost:3001/api/me/bootstrap -H 'Content-Type: application/json' -d '{"roles":["admin"]}'`. Confirm the response contains only `student` and that a `user.role_request_denied` row exists in `audit_logs`.
- [ ] As that student, create an agent profile and submit verification. Confirm both succeed without the `agent` role.
- [ ] As the seeded admin, approve the submission. Confirm a `user_roles` row with `agent` now exists for the student.
- [ ] Load a public listing page. Confirm a `listing_views` row is inserted with a valid `listing_id`.
- [ ] Request `POST /api/listings/garbage/views`. Confirm a 200 with `{"tracked": false}` and no database error in the logs.
