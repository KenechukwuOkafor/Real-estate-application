---
id: ADR-010-A1
title: Amendment 1 to ADR-010 — Privilege Grants Are Part of the Authorization Boundary
category: Architecture Decision Record Amendment
status: Accepted
version: 1.0
owners: Ruvo Engineering
date: 2026
amends:
  - ADR-010 Row Level Security
related:
  - ADR-023 Layered Authorization
  - Row Level Security
  - Security Architecture
---

# Amendment 1 to ADR-010 — Privilege Grants Are Part of the Authorization Boundary

## Status

Accepted

---

# Context

ADR-010 establishes row-level security as the final authorization layer. It describes
policies: predicates determining which rows a caller may see or change.

Implementing it surfaced two facts the original decision did not account for. Both were
found during migration, not by review, and both were live.

## Ownership of a row does not bound what may be changed within it

An agent legitimately owns their listing row. A policy expressing "an agent may update
listings they own" is correct as a row predicate and insufficient as an authorization
boundary, because the agent's own row contains the column that determines whether the
listing is published.

The same shape recurs across the schema:

| Column | What row-ownership alone would permit |
|---|---|
| `listings.status` | Self-approval, bypassing moderation entirely |
| `agent_profiles.verification_status` | Self-verification |
| `agent_profiles.free_listing_quota` | Minting one's own submission allowance |
| `inspection_requests.requester_user_id` | Rewriting who made a request |
| `listing_images.storage_path` | Undoing verified upload metadata |
| `user_roles` | Direct self-promotion to administrator |

In each case the row predicate is satisfied and the operation should still be refused. What
prevents it is the column not being granted, not the policy.

## Default privileges were broader than any policy

The database granted `SELECT`, `INSERT`, `UPDATE`, `DELETE` and `TRUNCATE` on every table to
both the anonymous and authenticated roles by default. Row-level security was the only thing
between an unauthenticated caller and destructive statements against core tables.

This inverted ADR-010's intent. RLS was specified as the *final* boundary; it was operating
as the *only* one.

The consequence was not theoretical. A column-level grant intended to restrict chat updates
was inert while a table-wide grant remained, and a chat participant could satisfy the update
predicate through the agent branch and reassign a conversation to themselves.

---

# Amendment

ADR-010 is amended to state that the authorization boundary at the database consists of
privilege grants and policies together, and that policies alone do not constitute it.

The following become requirements:

1. **Default privileges are revoked.** Anonymous and authenticated roles hold no privileges
   on a table until explicitly granted. Enabling RLS on a table with default grants intact
   does not satisfy ADR-010.
2. **Grants are column-scoped where a column confers privilege.** Any column whose value
   determines moderation state, verification state, entitlement, identity, or role
   membership is omitted from the grant, regardless of who owns the row.
3. **Destructive privileges are not granted by default.** `DELETE` and `TRUNCATE` are granted
   only where a deletion path exists. Soft deletion is an update.
4. **Insert grants constrain initial state.** Where a row's initial value of a governed
   column matters, the insert policy constrains it — a listing may be inserted only as a
   draft.
5. **Service-role privileges are explicit.** They are not inherited from table creation and
   must be granted deliberately, or paths depending on them fail only in a freshly built
   environment.

---

# Rationale

## The row predicate answers the wrong question

A policy answers "may this caller touch this row". The escalations above all require
answering "may this caller change this field", which is a grant, not a predicate.

## A revoked grant fails closed and cannot be reasoned around

A missing column privilege refuses at the database with a permission error. It does not
depend on a predicate being written correctly, and it cannot be satisfied by a caller who
legitimately owns the row.

## Defence in depth was the point

ADR-010 exists so the database keeps protecting the platform when application code has a bug.
A configuration in which policies are the sole boundary reproduces the single-layer failure
mode ADR-010 was written to eliminate.

---

# Consequences

## Positive

- Escalation through legitimately owned rows becomes impossible rather than merely
  unimplemented.
- Destructive statements against core tables are refused before any policy is evaluated.
- Failures are permission errors, which are louder and more diagnosable than empty results.

## Negative

- Every new table requires a deliberate grant decision, not only a policy.
- A missing grant produces an error that can be mistaken for a policy problem.
- Column-scoped grants must be revisited whenever a column is added.

---

# Non-Negotiable Constraints

- Default privileges are revoked on every table before grants are written.
- No column governing moderation state, verification state, entitlement, identity, or role
  membership is granted to the authenticated role.
- `TRUNCATE` is never granted to the anonymous or authenticated role.
- Enabling RLS without reviewing grants does not satisfy ADR-010.
- Every escalation-relevant column has a test asserting the stored value is unchanged after
  an attempt to modify it.

---

# Implementation Note

Denial of a read under RLS is an empty result, not an error status. A policy denying all
access and a policy working correctly are indistinguishable from a status code alone.

Every policy test must assert on returned contents and include a control read proving the
withheld row exists. A test asserting only a successful status would pass against a policy
that denies everything.

---

# Implementation Note — Column-Scoped Grants Are Incompatible With Upsert

Column-scoped grants and `.upsert()` cannot both be used on the same table.

PostgREST compiles an upsert to `INSERT ... ON CONFLICT DO UPDATE SET`, and every column
in the payload appears in that SET list — including the identity column the payload must
carry to identify the row. Postgres checks column privileges for the SET list **when it
plans the statement**, not per row. The UPDATE privilege is therefore required even on a
first insert into an empty table, where no conflict is possible and no update will ever
run.

Against a table-wide `GRANT UPDATE` this is invisible. Against the column-scoped grants
this amendment requires, it fails.

## The failure signature

```
42501  permission denied for table <name>
```

Raised on a **first insert, where no conflict was possible**. That combination is the
diagnostic: a privilege error on a statement that was only ever going to insert. It does
not name the column it wanted, and the plain `INSERT` of the same payload succeeds, which
is the quickest way to confirm the diagnosis.

It is easy to misread as a policy problem and "fix" by widening the grant. That is the
wrong repair: it hands back exactly the privilege the column scoping withheld, and on
these tables that privilege is usually a self-grant.

## What to do instead

Read, then insert or update, touching only granted columns:

```ts
const { data: existing } = await client
  .from("agent_profiles").select("id").eq("user_id", userId).maybeSingle();

const result = existing
  ? await client.from("agent_profiles").update(fields).eq("id", existing.id)
  : await client.from("agent_profiles").insert({ ...fields, user_id: userId });
```

The extra read is not a correctness risk where the conflict target is UNIQUE: a concurrent
insert loses on the constraint rather than producing a duplicate.

`ON CONFLICT DO NOTHING` — `.upsert(..., { ignoreDuplicates: true })` — needs no UPDATE
privilege and is safe, but it returns no row for the conflicting case, so it suits
fire-and-forget writes rather than ones whose id the caller needs.

Both defects found this way were live. Creating an agent profile returned HTTP 500 for
every new agent, blocking onboarding at its first step. Saving a listing failed for every
user, on every attempt. In both cases the grant was correct and the application code was
wrong.

---

# Related Documents

- ADR-010 Row Level Security
- ADR-023 Layered Authorization
- Row Level Security
- Security Architecture

---

# AI Implementation Guidance

## Non-Negotiable Rules

- Never enable RLS on a table without first revoking default privileges.
- Never grant a column that determines moderation, verification, entitlement, identity, or
  role membership.
- Never assume a column-level grant is effective while a table-wide grant exists on the same
  table.
- Never grant `TRUNCATE` or `DELETE` without a deletion path requiring it.
- Never use `.upsert()` on a table with column-scoped grants. It demands UPDATE on every
  payload column at plan time, including on a first insert.
- Never test a policy by status code alone.

## Common Mistakes

- Writing a correct ownership predicate and considering the boundary complete.
- Adding a column-level grant alongside an existing table-wide grant, which is inert.
- Assuming the service role holds privileges on newly created tables.
- Using `.upsert()` against column-scoped grants. Postgres evaluates column privileges when
  it plans the statement rather than per row, so the `ON CONFLICT DO UPDATE SET` list
  demands UPDATE on every payload column even on a first insert where no conflict was
  possible. It fails `42501 permission denied for table <name>` while the plain `INSERT`
  of the same payload succeeds. Read-then-insert-or-update, touching only granted columns.
- Widening a grant to make a 42501 go away. On these tables the withheld privilege is
  usually the self-grant the scoping existed to prevent; the repair belongs in the query.
- Asserting a denial by observing an empty result without proving the row exists.
- Trusting a table because its row predicate is good. A correct ownership or visibility
  predicate answers the row question so convincingly that nobody goes on to read the
  column list, so a table with careful row-level policy is where an over-wide grant
  survives longest. `agent_profiles` held a table-wide `grant select ... to anon`
  underneath a policy that correctly exposed only verified, undeleted profiles — which
  made a moderator's `rejection_reason` and an agent's remaining `free_listing_quota`
  readable by any unauthenticated caller. Review the grant separately from the policy,
  and derive the column list from what the code queries rather than from what the query
  currently selects — see the two entries below for why "what it renders" is the wrong
  place to stop.
- Auditing SELECT and stopping there. `agent_profiles` had a carefully column-scoped
  UPDATE — 0013 withheld `verification_status`, `verified_at`, `free_listing_quota` and
  the rest as self-grants — sitting beside a table-wide INSERT that granted every one of
  them back. The row policy's `WITH CHECK` asserted `user_id = current_app_user_id()`,
  which verifies who a row belongs to and nothing about what it claims, so a signed-in
  user could `INSERT` themselves an already-verified profile with unlimited quota. When
  a column is withheld from UPDATE because holding it would be an escalation, check that
  INSERT withholds it too: the two paths reach the same column and only one of them was
  reviewed.
- Deriving a column grant from what a surface *renders*. It is the right instinct and it
  is not sufficient: Postgres refuses a `WHERE` on a column the caller cannot `SELECT`, so
  a column can be required by the grant and never reach a screen. `agent_profiles.deleted_at`
  is rendered nowhere and two queries filter `.is("deleted_at", null)` — withholding it
  would have failed both. Derive the grant from what is **queried** — selected, filtered,
  ordered and joined on — and probe the result rather than reasoning about it.
- Letting a mutation in a test run at an undeclared position. The guard protecting
  `agent_profiles.rejection_reason` seeds a probe value in `beforeAll` so its denials are
  withholding something rather than returning nothing, and the restore was first written
  as a test. Vitest runs tests in file order, so the restore ran *before* the denials and
  emptied the very values they existed to prove were withheld — every assertion would
  have passed against a null column, which is this document's own "asserting a denial by
  observing an empty result" mistake, committed inside the guard against it. Setup and
  teardown belong in `beforeAll`/`afterAll`, where their position is part of the contract;
  a mutation written as a test has no declared position at all.
- Expecting `select("*")` to narrow itself to the granted columns. PostgREST expands it to
  every column in the table, so against a column-scoped grant it fails `42501` outright.
  That is the desired direction — fail closed — but it means a star select is not a way to
  discover what you may read, and any caller relying on one breaks the moment a grant is
  narrowed.

## Definition of Done

Default privileges are revoked, grants are column-scoped, escalation-relevant columns are
ungranted **on every write path that can set them, INSERT as well as UPDATE**, and every
denial test pairs with a control proving the data exists and is being withheld — with the
mutation that creates that data in `beforeAll` and its restore in `afterAll`, never as a
test.
