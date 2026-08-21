---
title: Engineering Quality
version: 1.0
status: Approved
owners:
  - Ruvo Engineering
last_updated: 2026
related:
  - Engineering Foundation
  - Engineering Workflow
  - Security Checklist
  - Architecture Decision Records
---

# Engineering Quality

> "Quality is not something added after development. It is engineered into every commit."

---

# Purpose

This document defines the engineering quality standards for Ruvo.

It establishes how engineers should evaluate software quality throughout the development lifecycle, ensuring the platform remains maintainable, scalable, secure, and performant.

---

# Scope

This document covers:

- Engineering quality principles
- Maintainability
- Dependency management
- Error handling
- Performance engineering
- Technical debt
- Refactoring standards
- Engineering checklists

---

# Engineering Quality Principles

Every implementation should optimize for:

- Correctness
- Simplicity
- Readability
- Predictability
- Testability
- Maintainability
- Performance
- Reliability

When trade-offs exist, prioritize long-term maintainability over short-term convenience.

---

# Code Maintainability

Maintainable code should be:

- Easy to understand
- Easy to modify
- Easy to extend
- Easy to test
- Easy to remove

Every engineer should be able to understand a feature without requiring its original author.

---

# Simplicity First

Prefer the simplest solution that satisfies current requirements.

Avoid:

- Premature abstraction
- Clever implementations
- Unnecessary design patterns
- Over-engineering

Complexity must be justified.

---

# Single Responsibility

Every component should have one primary responsibility.

Examples include:

- One API route
- One service
- One hook
- One validation module
- One UI responsibility

Avoid "God Objects" that accumulate unrelated functionality.

---

# Dependency Policy

Dependencies introduce maintenance, security, and operational costs.

Every dependency must provide clear value.

---

## Approved Dependency Criteria

A dependency should be:

- Actively maintained
- Well documented
- Widely adopted
- TypeScript compatible
- Secure
- Stable
- Compatible with the existing architecture

---

## Before Adding a Dependency

Ask:

- Can existing platform capabilities solve this?
- Can we build this ourselves reasonably?
- Is the maintenance cost acceptable?
- Does this duplicate existing functionality?
- Is the package actively maintained?

New dependencies should be reviewed during code review.

---

## Dependency Rules

Prefer:

- Native browser APIs
- Native JavaScript
- Framework capabilities

before introducing third-party packages.

Duplicate libraries performing similar functions are prohibited.

---

# Error Handling

Errors are expected.

Systems should fail predictably and recover gracefully whenever possible.

---

## Error Principles

Errors should be:

- Explicit
- Actionable
- Logged
- Observable
- Recoverable where appropriate

Never silently ignore failures.

---

## Error Categories

### Validation Errors

Returned to users with clear guidance.

---

### Business Rule Errors

Examples:

- Listing already approved
- Subscription expired

Should be predictable.

---

### Infrastructure Errors

Examples:

- Database unavailable
- Storage timeout
- External API failure

Should trigger monitoring.

---

### Unexpected Errors

Unexpected exceptions should:

- Be logged
- Be monitored
- Return safe responses
- Avoid exposing internal details

---

# User-Facing Errors

Error messages should:

Explain:

- What happened
- Why it happened (when appropriate)
- What the user can do next

Avoid technical implementation details.

---

# Error Recovery

Whenever possible:

- Retry transient failures
- Preserve user input
- Continue unaffected operations
- Degrade gracefully

---

# Performance Engineering

Performance is a design requirement.

It should not be treated as a post-launch optimization task.

---

# Performance Principles

Optimize:

- User experience
- Database efficiency
- Network efficiency
- Rendering performance
- Asset delivery

Measure before optimizing.

---

# Database Performance

Prefer:

- Indexed queries
- Pagination
- Explicit projections
- Efficient joins

Avoid:

- N+1 queries
- Full table scans
- Unbounded queries
- Excessive database round trips

---

# Frontend Performance

Prefer:

- Server Components
- Lazy loading
- Code splitting
- Optimized images
- Efficient state management

Avoid unnecessary client-side JavaScript.

---

# API Performance

APIs should:

- Return only required fields
- Support pagination
- Validate efficiently
- Avoid redundant processing

Long-running work belongs in background jobs.

---

# Caching Principles

Cache where appropriate.

Possible caching layers include:

- Browser
- CDN
- Next.js
- Database query cache

Caching must never compromise correctness.

---

# Technical Debt

Technical debt is acceptable only when:

- Explicitly documented
- Intentionally accepted
- Time-bounded
- Tracked

Hidden technical debt is prohibited.

---

# Refactoring Standards

Refactoring should:

- Preserve behaviour
- Improve readability
- Reduce duplication
- Simplify maintenance

Large refactors should be incremental.

---

# Engineering Metrics

Quality is measured using:

- Test coverage
- Build success rate
- Review quality
- Deployment frequency
- Defect rate
- Mean time to recovery
- Performance metrics

Metrics guide improvement rather than assign blame.

---

# Test Fixture Fidelity

> A fixture that cannot fail the way production fails is worse than no fixture,
> because it converts an unknown into a false certainty.

A missing test leaves a known gap. A test built on a fixture representing a
state production never occupies reports success for a scenario that does not
exist, and the green result is what stops anyone looking further. The first
costs coverage; the second costs coverage *and* buys a false belief with it.

## The rule

A fixture must be able to reach the failure modes the code it stands in for can
reach. When a fixture is a stand-in for a real component, it must fail the way
that component fails — same error type, same identifiers, same shape.

## Evidence

Five instances in this codebase, all found after the fact and none found by the
test that should have caught them:

| Fixture | State it represented | What it hid |
|---|---|---|
| Seeded agent quota of 20 | A quota no real agent is issued | The entitlement check was never exercised at its boundary, so the break went unseen |
| Seeded logins | Sessions minted outside the real auth path | The RLS policies were incompatible with the tokens production actually issues |
| Fabricated storage paths | Object paths nothing had written | Nothing in the system ever read them, so the read path was untested |
| `new Error("LISTING_STATE_CONFLICT")` | A compare-and-set loss thrown as a bare Error | The repository throws `AppError`, which resolves to 409; the bare Error resolves to 500. The test asserted a failure mode that no longer existed |
| **The empty database CI replays migrations into** | A database with no rows in it | A migration that backfills existing rows cannot fail, because there are none. See below — this one is not a fixture anyone wrote |

The fourth is the clearest illustration because the divergence is one line: the
mock and the real repository disagreed about the *type* thrown, and the
assertion was on the message, which both happened to share. The test passed for
a reason unrelated to the behaviour it claimed to cover.

## Applying it

- Prefer a fixture derived from the real thing — the real error class, a value
  from the real seed path, an object the real writer produced.
- When a stand-in must be hand-written, assert on the property that
  distinguishes it. Asserting on a message both a correct and an incorrect
  fixture share proves nothing.
- When a value is chosen for convenience (a generous quota, a round number),
  say so at the fixture and note which boundary it therefore does not test.
- Treat a fixture drifting from its real counterpart as a defect in its own
  right, not as tidying. The test is green either way, which is exactly the
  problem.

## The empty database is a fixture

> A migration is tested against a database. If that database is empty, every
> statement that operates on existing rows is a no-op, and a broken migration
> passes.

The four instances above are fixtures somebody wrote. This one is not. It is the
starting state of the pipeline itself, and it is a fixture in exactly the sense
that matters: **a stand-in for production that cannot fail the way production
fails.** That makes it the most dangerous of the five, because there is no
author to have known better and no file to review.

### The instance

Adding a required `rental_duration` column to `listings` needed every existing
row backfilled. The obvious form:

```sql
alter table public.listings add column rental_duration public.rental_duration;
update public.listings set rental_duration = 'yearly' where rental_duration is null;
alter table public.listings alter column rental_duration set not null;
```

This fails on any database that already holds listings:

```
ERROR:  cannot ALTER TABLE "listings" because it has pending trigger events
```

The `UPDATE` queues the `set_updated_at` trigger, and `SET NOT NULL` cannot run
while those events are pending. Supabase applies each migration inside one
transaction, so the two statements cannot be separated within the file.

**CI passed it.** The pipeline replays migrations from zero into an empty
database, so the `UPDATE` matched zero rows, queued no trigger events, and the
`ALTER` succeeded. The migration was green on every run and would have failed on
the first `db push` against real data — in production, during a deploy, with no
prior signal.

It was found by applying the migration by hand to a populated local database,
which is the only place the difference exists.

### The fix, and why it is not merely a workaround

```sql
alter table public.listings
  add column rental_duration public.rental_duration not null default 'yearly';
alter table public.listings alter column rental_duration drop default;
```

Adding a `NOT NULL` column *with* a default is a catalog-only operation in
PostgreSQL 11 and later: existing rows are satisfied without a table rewrite and
without an `UPDATE`, so no trigger events are queued. The default is then
dropped so no future insert can silently inherit it. The backfill and the
constraint land in one statement that behaves identically on an empty and a
populated table — which is the actual property being sought.

### The general rule

**Any migration that operates on existing rows is untested by a replay from
zero.** The pipeline is structurally blind to this class, not accidentally so:
replaying from an empty database is the correct way to verify that migrations
compose, and it is the wrong way to verify that they upgrade.

The two are different questions:

| Question | Answered by |
|---|---|
| Do these migrations compose into the intended schema? | Replay from zero (what CI does) |
| Will this migration survive contact with existing data? | Applying it to a database that has that data |

Statements to treat as unverified until run against rows:

- `UPDATE` / `DELETE` as part of a schema change — the backfill above.
- `SET NOT NULL` on a column being populated in the same migration.
- Adding a `CHECK` or a `UNIQUE` constraint that existing rows must already
  satisfy. On an empty table every constraint is satisfiable.
- Changing a column type where a cast must succeed for every stored value.
- Dropping a column or table something still writes to.
- Anything whose cost scales with row count. A rewrite that is instant on zero
  rows can hold a lock for minutes on a real table.

### What now covers it

The pipeline has a second migration job, **"Replay migrations against a
populated database"**, added after this was found. It builds the schema as it
exists *before* the change, seeds it, and only then applies the migrations the
change adds — one transaction per file, which is how Supabase applies them.
Seeding first and migrating second is the order production is in.

It is a **required check**, not advisory. A guard that can be merged past is a
suggestion.

It was verified by observation rather than by reasoning, on the same rule that
governs the RLS denial tests: a guard that has never been seen to catch anything
has not been tested. A migration with the broken shape was pushed on a scratch
branch, and the two jobs disagreed on the same commit — the replay from zero
passed, the populated replay failed with the exact `pending trigger events`
error. That disagreement is the blind spot, made visible.

Its limits, worth knowing before trusting it:

- It runs against **seed-scale data**. It catches correctness failures on
  existing rows; it does not catch a lock held too long or a rewrite too slow on
  a table with a million rows in it.
- It considers **added** migration files. A migration modified after being
  applied is a different failure, and one already forbidden.
- A migration still has to say in a comment what its form protects against, so
  the next person does not "simplify" it back into the version that only passes
  on an empty database. The job catches the regression; the comment explains it.

A statement-level linter such as `squawk` is the natural second layer if this
proves insufficient: it flags dangerous statement *shapes* — a `NOT NULL` added
without a default, a constraint added without `NOT VALID`, an index built
without `CONCURRENTLY` — without needing data at all. It was deliberately not
added alongside this. A linter catches the patterns somebody anticipated, the
populated replay catches the general case, and one layer that works is worth
more than two that overlap.

---

# A Test Can Encode the Defect It Exists to Catch

> The suite that protects against a coupling can be built on it.

## The instance

Error copy was keyed on message text: fourteen components rendered
`payload.error.message` verbatim, so the API's internal vocabulary was the
user's copy. Removing that coupling meant messages stopped being a contract.

The tests then failed — and the reason is the point. They asserted things like:

```ts
expect(() => validate(input)).toThrow(/how many months/i);
expect(archive()).rejects.toThrow("AGENT_NOT_VERIFIED");
```

**Those assertions were the coupling.** A suite written to protect the
behaviour had encoded the exact defect the behaviour needed removing. Every one
of them had to change, and each was a small argument for leaving the prose
alone — which is how a defect defends itself.

It is the same shape as a fixture that misrepresents reality: green, confident,
and wrong about the thing it claims to check. A fixture lies about the world; an
assertion on prose lies about what the contract *is*.

## The rule

**Assert on the contract, not on its presentation.** A code, a status, a
structured field, an identifier — anything the system promises. Human-readable
strings are not promises: they are meant to change as the writing improves, and
a test that freezes one converts an improvement into a failure.

## Where it hides

- `toThrow("SOME_MESSAGE")` and `toThrow(/some prose/)` — assert on `code`.
- Comparing a message to decide control flow, in tests or in components.
- Snapshot tests over user-facing text, which pin every word by default.
- Asserting an exact sentence of copy. Assert its *shape* instead: that it
  contains no internal vocabulary, that it names an action, that three states
  produce three different sentences. Those survive rewording; the sentence does
  not.

## The tell

If improving a message breaks a test, the test was asserting the wrong thing —
**even when the test is green today**. The question to ask of an assertion is
not "does this pass" but "what would have to change for this to fail, and is
that change a defect or an improvement?"

---

# Absence of Assertion Is Absence of Test

> A suite is green because it never asked the question.

Test Fixture Fidelity is about a test asserting the wrong thing. *A Test Can
Encode the Defect It Exists to Catch* is about a test asserting the thing that
needs removing. This is the neighbour of both, and it is distinct from them: a
test that asserts **nothing at all** about the fact it appears to cover.

There is nothing to review here. No wrong fixture, no wrong assertion, no
suspicious line. The suite passes, it is well written, and the gap is a sentence
that is not on the page.

## The instance

The agent inspection inbox shipped with seven rendered tests. They asserted the
page rendered, the listing title appeared, the seeker's message appeared, the
countdown read `N hours left`, an expired request stayed visible and labelled,
the count excluded expired ones, and a seeker was refused. All seven passed.

None of them asserted **the name of the person who asked** — which is one of the
two facts the surface exists to show.

The name was read through a PostgREST embed on `public.users`, and that table is
readable only by yourself or an admin. So the embed returned `null` for every
row and the page fell back to `"A seeker"` on every request. Adding one line
failed immediately:

```ts
expect(page.text).toContain(seekerName);
expect(page.text).not.toContain("A seeker");
```

The same embed lives in `chat-repository`, which had been rendering the literal
word `"student"` in the chat header and the chat list for months. Nobody had
asserted on a counterparty name there either.

## The tell: a denied embed is silent

This is what makes the class hard to see. Under RLS, a denied *row* read is not
an error — it is HTTP 200 with `null` or `[]`. An embed on a table the caller
cannot see into does not throw, does not warn, and does not log. The code path
looks exactly like a successful one that happened to find nothing:

```ts
requesterName: request.users?.full_name?.trim() || "A seeker",
```

That line is indistinguishable, at a glance and in review, from correct code
handling a genuinely nameless user. The `??` and the `||` that make code robust
are the same operators that make this invisible. **A fallback converts a
permission failure into a plausible value.**

Anywhere a fallback stands behind a permission-checked read, the fallback is
load-bearing evidence and must be asserted against — not just the happy path,
but that the fallback is *not* what rendered.

## The general rule

**Enumerate what a surface claims to show, then check that a test names each
item.** Not "is this feature tested" — the inbox was thoroughly tested — but "is
this *fact* asserted". Count the assertions against the list, and the ones with
no line beside them are untested regardless of how green the file is.

The failure mode is not laziness. It is that assertions get written for the
things that were hard to build. The countdown was interesting, so it was
asserted. The name was a field on a row, so it was assumed.

## Applying it

- For every value a page displays, point at the assertion that would fail if it
  vanished. If you cannot, it is not tested.
- Never let a fallback go unasserted. Pair every `toContain(realValue)` with
  `not.toContain(fallbackValue)`, or the fallback will pass for the real thing.
- Treat any cross-table read under RLS as suspect until asserted: embeds,
  joins, and nested selects fail *quietly* and return a shape the code accepts.
- When one surface turns out to have this gap, grep for the same read elsewhere
  before fixing only the one you found. The inbox and the chat header shared an
  embed and therefore shared a defect.
- Write the assertion that would catch the feature being deleted, not the
  assertion that confirms it was written.

---

# Correctness Does Not Compose

> Every component was correct. Every pair was broken. None of it was found by
> reviewing either half.

Test Fixture Fidelity above is about a stand-in that cannot fail the way the
real thing fails. This is its neighbour: two real things, each correct on its
own, whose *interaction* is wrong. Reviewing either one finds nothing, because
there is nothing wrong with either one.

## The rule

**A correctness argument about a component is not a correctness argument about
the system.** When two mechanisms meet — a constraint and a write pattern, a
grant and a policy, a migration and existing data — the meeting point is a thing
that has to be exercised, not a thing that can be reasoned about from the parts.

## Evidence

Four instances in this codebase. In every one, both components were correct in
isolation, and in every one the defect was found by *running the combination*
rather than by reading either half:

| The pair | Each half, correct | The interaction, broken |
|---|---|---|
| **`.upsert()` + column grants** | The grant was correctly column-scoped. The upsert was ordinary. | `.upsert()` demands UPDATE on `user_id` at plan time even when inserting, so correctly-scoped grants blocked every agent's first action |
| **Migration + populated table** | The backfill was correct. `SET NOT NULL` was correct. | Together in one transaction they fail with `pending trigger events` — but only when rows exist, and CI replays into an empty database |
| **Seed data + real code path** | The seed was valid. The entitlement check was correct. | A seeded quota of 20 meant the check was never exercised at its boundary, so a deadlock shipped unseen |
| **Soft delete + unique constraint** | Soft delete was correct. `unique (listing_id, position)` was correct. | A removed image keeps its position forever, so uploading a replacement into the freed slot fails — the obvious next action after a removal |

## The test that finds these is the boring one

Not one of these was found by a clever edge case. Each was found by the most
ordinary sequence a user would perform:

- Create your profile. *(upsert + grants)*
- Deploy the migration to a database that has data in it. *(migration + rows)*
- Submit a listing when your quota is what a real agent is issued. *(seed + path)*
- Remove the wrong photo, then add the right one. *(soft delete + constraint)*

That last one is the sharpest. The removal feature was tested thoroughly —
eleven assertions covering ownership, status, cover promotion, and idempotency —
and every one passed. The defect was in what an agent does *next*, which no test
covering removal would ever reach.

**Write the test that continues past the feature you built.** The bug is
usually one step after the last assertion.

## Applying it

- When you add a constraint, ask what existing write pattern now meets it.
- When you add a soft delete, audit every unique constraint on that table. A
  deleted row still occupies its uniqueness slot unless the index says
  `where deleted_at is null`.
- When you add a grant, ask which policies now let that column be written, and
  to which rows. Ownership answers *whose*; status answers *still yours to
  change*.
- When you write a migration that touches existing rows, run it against rows.
- Prefer a test that performs two operations in sequence over two tests that
  each perform one. The sequence is where these live.

---

# The Rendered Suites Are Local-Only: The Standing Bet

> A deliberate tradeoff, with a written trigger for revisiting it. Recorded so
> the argument is not re-derived from scratch each time it costs something.

## The bet

The rendered-page suites (`npm run test:rendered`) need a running application.
CI has no server for them, so they are **excluded from the CI run entirely**
rather than skipped inside it — the pipeline asserts zero skipped tests, and a
suite that skips in CI reports success for work it never did.

The alternative is a CI job that builds and starts the app. That is roughly **90
seconds added to every run**, paid on every commit forever, against a class of
bug that had not yet escaped when the decision was made.

The bet was: *not worth it yet, and the evidence for changing our minds is a
rendering defect actually reaching `main`.*

## The ledger

**Instance 1 — a stale assertion, undetected across a merge.**

`5c552c5` ("edit a live listing, reviewed before a seeker sees it") made an
approved listing changeable through review. A rendered test still asserted the
old behaviour:

```ts
expect(page.text).toContain("cannot be edited");
```

It failed from the moment that commit merged and stayed failing on `main`
through the next slice. CI was green throughout, because CI cannot run it. It
was found only when the next slice happened to run the local suite.

Note what this instance *is* and is not. It is a **stale test**, not a broken
page — the application behaved correctly the whole time; the assertion had gone
out of date. The cost was a confusing red run and the time to establish it was
pre-existing rather than freshly caused, which is exactly the diagnosis tax a
long-red test imposes. No user saw anything.

## The trigger

**One instance is the documented tradeoff. A second is evidence.**

If a rendered assertion is again found stale or failing on `main` — or, more
seriously, if a genuine rendering defect reaches `main` — that is the signal to
add the CI job and stop paying in diagnosis time. Add the instance to the ledger
above either way; the count is the argument.

Until then the mitigation is procedural, and it is cheap: **run
`npm run test:rendered` before opening a PR that touches a rendered surface.**
A slice that changes what a page says has to look at the page.

---

# Common Quality Issues

Avoid:

- Duplicate logic
- Circular dependencies
- Deep nesting
- Large functions
- Massive components
- Magic numbers
- Hardcoded configuration
- Hidden business rules
- Fixtures representing states production never occupies (see Test Fixture Fidelity)
- Migrations verified only by a replay from zero, when they operate on existing rows (see Test Fixture Fidelity)
- Reasoning about two mechanisms separately instead of exercising them together (see Correctness Does Not Compose)
- Asserting on human-readable strings instead of on the contract (see A Test Can Encode the Defect It Exists to Catch)
- Displaying a value no test names, especially behind a fallback — a denied RLS read returns null rather than erroring (see Absence of Assertion Is Absence of Test)
- A unique constraint on a soft-deletable table that does not exclude deleted rows

---

# AI Engineering Guidance

AI-generated code should:

- Prefer existing abstractions
- Avoid introducing unnecessary libraries
- Respect dependency policy
- Handle errors explicitly
- Optimize for readability
- Follow performance guidelines

Generated code should improve—not reduce—the maintainability of the codebase.

---

# Engineering Checklist

Before merge:

✓ Dependency review completed

✓ Error handling implemented

✓ Performance considered

✓ Code simplified

✓ Duplication minimized

✓ Technical debt documented

✓ Refactoring opportunities evaluated

✓ Architecture respected

---

# Definition of Done

Engineering quality requirements are satisfied when:

- Dependencies are justified.
- Errors are handled predictably.
- Performance expectations are met.
- Code remains maintainable.
- Technical debt is documented.
- No unnecessary complexity has been introduced.

---

# Related Documents

- Engineering Foundation
- Engineering Workflow
- Reliability & Observability
- Security Checklist
- Engineering Governance
- Architecture Decision Records