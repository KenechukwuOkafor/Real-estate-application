# CLAUDE.md

This file helps a new session get its bearings. It is not the project's memory.
The memory is `docs/engineering-bible/`. This file tells you what Ruvo is, how
work gets done here, and which document to read before you change something.
If this file and the bible disagree, the bible is right. Fix this file.

## What Ruvo is

Ruvo is a trust-first real estate marketplace for Nigeria. It launches as
student rentals in Nsukka because that market is concentrated and has a real
problem. The product is not only for students. Land and general property come
next, once verification has proven itself in a market where a failure costs
₦50,000, before it is trusted where a failure costs ₦20m. Expansion happens on
purpose and in order: Nsukka, then other university towns, then Enugu city,
then other states.

**What the product sells:** a moderator reviewed what a seeker sees, and the
agent behind it is a real, checked person.

Every decision comes back to that. If a change would let unreviewed content
reach a seeker, or let an agent claim something the platform can't stand
behind, the answer is no, however convenient the change is.
`docs/engineering-bible/Foundations/` has the vision and the requirements.

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind 4.
- Supabase Postgres. Authorization is enforced in the database (RLS policies
  plus column grants), not only in application code.
- Clerk for auth and Sentry for observability. Paystack and Vercel are planned.
- Vitest for tests.
- The job queue is a Postgres table drained on a schedule by
  `.github/workflows/scheduled-jobs.yml` (ADR-032).
- Migrations are in `supabase/migrations/` and numbered in sequence.

**Nothing is deployed.** So the job queue has never drained in a real
environment. Of the two absence alerts, the job-drain alert cannot fire,
because it depends on a deployment that doesn't exist yet. Both alerts are
built, tested and have never run for real. Don't describe them as working in
production. `docs/operations/observability-runbook.md` has the current status.

CI has three jobs, and all three must pass: typecheck and lint; replay every
migration from zero and run the full suite; replay migrations against a
populated database.

## Commands

```bash
npx supabase start      # local stack; applies every migration, then seed.sql
npx supabase db reset   # wipe and replay migrations and seed from zero
npm run dev             # app on http://localhost:3001
npm run typecheck       # next typegen && tsc --noEmit
npm run lint            # zero warnings allowed
npm run test            # the suite CI runs
npm run test:rendered   # needs the app running; never runs in CI
```

**The rendered suites are left out of CI on purpose.** They need a running
app, and building and starting one in CI adds about 90 seconds to every run.
That cost was weighed against a class of bug that hadn't escaped yet. Don't
"fix" this by adding a CI job. The bet has a written trigger and a ledger of
instances, and the decision to add the job belongs there. Until then, run
`npm run test:rendered` yourself before opening a PR that touches a rendered
page. See "The Rendered Suites Are Local-Only" in `engineering-quality.md`.

## Where the real memory lives

`docs/engineering-bible/`:

- `Adr/adr-000.md` is the ADR register. Start here to find the decision behind
  something.
- `Adr/adr-010-amendment-1.md` covers the authorization model: why privilege
  grants are part of the authorization boundary, and the measurement table.
  Read it before touching any grant, policy or SECURITY DEFINER function.
- `Architecture/` covers cross-cutting design: RLS, state machines, background
  jobs, the request lifecycle, security.
- `Domain/` has one document per domain: listings, verification, inspection,
  messaging, moderation, and so on.
- `Engineering/engineering-quality.md` has the failure patterns that have
  caused real defects here.

**The rule:** if a decision isn't in the bible, it isn't decided. If it is in
the bible, it's binding, whatever any session remembers. A decision made in
conversation isn't real until it's written into the bible.

## How we work

- **One slice per PR.** Make commits atomic, and make each one typecheck on its
  own.
- **Scan before you build.** Do a read-only pass first, report what you found,
  and wait for a go-ahead.
- **Merge when all three CI jobs pass,** unless you're told otherwise for a
  specific PR.
- **Report decisions and reasoning, not just output.** A report that only lists
  what was built is useless a month later. Say what you chose, what you
  rejected, and why.
- **Say plainly when evidence is weaker than usual.** For example: a check you
  couldn't run, a probe you didn't mutation-test, or a conclusion drawn from
  reading code rather than running it.
- **Push back before building if the brief is wrong.** Several of the best
  decisions here came from arguing against the brief.

## Failure patterns from this codebase

These have each caused real defects here. They are not general advice. Each
line below is a summary; the full write-ups explain why and are worth reading.

- **A fixture that can't fail the way production fails is worse than no
  fixture.** It turns a gap into a false pass. The empty database counts as a
  fixture. See "Test Fixture Fidelity" in `engineering-quality.md`.
- **An instrument that can't see what it's pointed at reports success, and
  could not have reported anything else.** Mutation-test a probe (break the
  thing on purpose and watch it fail) before trusting a pass. See ADR-010-A1,
  "The instrument could not see the thing it was pointed at" and "The fifth and
  sixth".
- **Correctness does not compose.** Two features that are each correct can be
  wrong together. Write the test that keeps going past the feature you built.
  See "Correctness Does Not Compose" in `engineering-quality.md`.
- **A test can encode the defect it exists to catch.** Assert on the contract
  (a code, a status, a field), not on how it's presented. A test that pins
  message text treats a better message as a failure. See the
  `engineering-quality.md` section of that name, and ADR-010-A1.
- **Blast radius does not follow the change.** A storage policy that raised for
  anonymous callers broke the whole statement, including rows that other
  policies would have allowed. The damage was much bigger than the diff. See
  ADR-010-A1, "The seventh".
- **Absence is invisible in review.** Where safety comes from something being
  left out (a status not in an allow-list, a grant never given), nothing in the
  diff shows it. Test it by attempting the forbidden action and requiring a
  refusal. See "Absence of Assertion Is Absence of Test" in
  `engineering-quality.md`, and ADR-035.
- **Anything not in git is not in the system.** If a fresh clone can't
  reproduce something, it's state on one machine. The sharpest instance was a
  gitignore rule hiding `.env.example`, the only record of what a new
  environment needs. See the section of that name in `engineering-quality.md`.

## Authorization, condensed

ADR-010-A1 has the reasoning. Read it, not just this list.

- **Column grants prevent escalation; the row predicate doesn't.** A policy
  that says "you own this row" says nothing about which columns you may change
  in it.
- **Revoke default privileges before granting.** Supabase's defaults are
  broader than any policy.
- **`REVOKE ALL ... FROM PUBLIC` does not remove a direct grant to a role.**
  Revoke from the role itself, and check the result in the catalog.
- **Governance columns (status, verification, review fields) change only
  through SECURITY DEFINER functions,** never through a widened policy.
- **Every denial test needs a positive control.** A refusal proves nothing
  unless the same caller succeeds at the allowed path in the same setup.
- Column-scoped grants don't work with upsert. See the implementation note in
  ADR-010-A1.

## Conventions that are easy to break

- **Migrations are sequential and can't be changed once applied.** To fix
  one, write a new migration.
- **A new enum value can't be used as a literal in the transaction that adds
  it.** Postgres rejects it (SQLSTATE 55P04). Split the migration.
- **Expiry and lapse are worked out at read time.** There is no cron job and no
  stored "expired" state.
- **Error codes are a registry** (`src/lib/api/error-codes.ts`). Nothing
  classifies an error by matching its message text.
- **Copy tells the person what to do next and never blames them.**
- **Mobile-first.** The reason is in the product vision ("Who is on the other
  end") and ADR-008.

## Known residuals: decided, and deliberately not fixed

Don't "fix" these without a bible change that reverses the decision.

- `agent_profiles.user_id` is readable by any authenticated caller.
  ADR-010-A1 has the known-residual note.
- `apply_listing_revision` takes `reviewer_user_id` from the caller.
  ADR-010-A1 has the known-residual note.
- Areas are still free text, not a reference table. ADR-037 records the cost
  and the constraint on the fix. A second town can't launch until it's fixed.
- `expired` is still in the inspection enum as a leftover value. It is derived
  and can never be written. See ADR-019-A1.
