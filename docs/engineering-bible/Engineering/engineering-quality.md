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

Until the pipeline covers it, the obligation is manual and belongs in the
migration itself: apply it to a populated copy, and record in a comment what the
form protects against, so the next person does not "simplify" it back into the
version that only passes on an empty database.

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