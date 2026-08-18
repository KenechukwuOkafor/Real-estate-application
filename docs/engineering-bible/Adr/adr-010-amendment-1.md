---
id: ADR-010-A1
title: Amendment 1 to ADR-010 — Privilege Grants Are Part of the Authorization Boundary
category: Architecture Decision Record Amendment
status: Proposed
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

Proposed

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
- Never test a policy by status code alone.

## Common Mistakes

- Writing a correct ownership predicate and considering the boundary complete.
- Adding a column-level grant alongside an existing table-wide grant, which is inert.
- Assuming the service role holds privileges on newly created tables.
- Asserting a denial by observing an empty result without proving the row exists.

## Definition of Done

Default privileges are revoked, grants are column-scoped, escalation-relevant columns are
ungranted, and every denial test pairs with a control proving the data exists and is being
withheld.
