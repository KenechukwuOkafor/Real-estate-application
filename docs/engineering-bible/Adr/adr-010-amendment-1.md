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
- Revocation is blanket (`REVOKE ALL`), never an enumeration of privilege names.
- No `SECURITY DEFINER` function relies on its grant as its authorization check.
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

# Implementation Note — A Grant You Did Not Write, And A Revoke That Does Not Reach It

Requirement 1 of this amendment says default privileges are revoked. That was believed
satisfied and was satisfied **point-in-time**: migration 0010 revoked from the tables that
existed the day it ran. Default privileges are precisely the mechanism that makes a
point-in-time revoke stop being true, so every table created afterwards arrived carrying
the grants again. Three did — `jobs`, `listing_revisions`, `verification_documents`.

It surfaced only because CI and a developer machine disagreed. An integration test asserts
that an authenticated caller cannot insert into `public.jobs`, and asserts it *on privilege*
— "these fail on privilege before RLS is consulted". It passed locally and failed in CI:

```
expected /permission denied/i,
got     'new row violates row-level security policy'
```

RLS was catching what the grant was supposed to stop first. The test was right; its premise
was false. The local database differed only because an older CLI had narrowed the bootstrap
default; it had been passing against privileges the migrations never removed.

## Two sources of a grant, and a revoke that addresses one of them

For functions this became reachable rather than merely wrong. The idiom used throughout the
schema reads as a restriction and is not one:

```sql
revoke all on function f() from public;
grant execute on function f() to service_role;
```

Two separate mechanisms grant EXECUTE to a client role, and that pair fully addresses
neither:

1. **PostgreSQL's built-in default** grants EXECUTE on every new function to `PUBLIC`.
   `revoke ... from public` removes it — *where it was written*. Migrations 0017 and 0018
   never wrote it, so five job-queue functions carried `=X/` in every environment, the
   developer machine included. Four are `SECURITY DEFINER`, so RLS is not in the path.
   Confirmed end-to-end: `POST /rest/v1/rpc/job_queue_health` with nothing but the anon key
   answers `200`, and `claim_jobs` returns queued rows with their payloads.

2. **The default ACL grants EXECUTE directly to `anon` and `authenticated` as named roles.**
   `revoke ... from public` does **not** remove a direct grant to a named role — `PUBLIC` is
   not a group that contains them. So a function carrying the revoke was still executable by
   `anon` in any freshly built environment.

The second is not guessable from reading the code, which is why it is written down here.
Reproduced in a scratch container from the stock image:

```
create function public.probe_admin_only() returns int language sql as 'select 1';
revoke all on function public.probe_admin_only() from public;
grant execute on function public.probe_admin_only() to service_role;

     proname      | anon_can_execute | proacl
------------------+------------------+---------------------------------------------
 probe_admin_only | t                | {postgres=X/,anon=X/,authenticated=X/,service_role=X/}
```

Revoking from `anon` and `authenticated` explicitly produces the intended result:

```
revoke all on function public.probe_admin_only() from public, anon, authenticated;

     proname      | anon_can_execute | proacl
------------------+------------------+-----------------------------------
 probe_admin_only | f                | {postgres=X/,service_role=X/}
```

## The default-privileges form does not close it either

The obvious systemic fix — revoke it once, as a default, so no future function repeats it —
does not work for functions. `ALTER DEFAULT PRIVILEGES ... REVOKE ALL ON FUNCTIONS FROM
anon, authenticated` removes those two roles from the default ACL, and a function created
afterwards **still arrives with `=X/`**, because PostgreSQL's built-in `PUBLIC` EXECUTE
default is applied independently of that entry. Adding `FROM public` to the same statement
does not suppress it either:

```
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on functions from public;

-- default ACL now: f | {postgres=X/postgres,service_role=X/postgres}   <- looks closed
create function public.f_after3() returns int language sql as 'select 1';

  proname  | anon_can_execute | proacl
-----------+------------------+-----------------------------------------------------------
 f_after3  | t                | {=X/postgres,postgres=X/postgres,service_role=X/postgres}
```

The default ACL reads as closed and the function still arrives open. **Per-function
`REVOKE ... FROM public, anon, authenticated` is the only form observed to hold**, which is
why this cannot be solved once and must be written at every function — and therefore why it
is asserted in CI rather than trusted to reviewers.

For tables the default-privileges form *does* work, and is used. The two object types differ
here; do not reason from one to the other.

## The instrument could not see the thing it was pointed at

`information_schema.table_privileges` reports the seven SQL-standard privileges. It does
**not** report `MAINTAIN`, which PostgreSQL 17 added and which is exactly the privilege that
leaked through 0023's enumerated revoke.

So the natural way to write the check — query `information_schema`, assert the client roles
hold nothing unexpected — returns a clean result on a database where `anon` holds `MAINTAIN`
on three tables. It is not a weak check. It is a check that cannot see the defect, reporting
success.

This is the same shape as a denial test passing because RLS returns an empty result rather
than an error (see the Implementation Note above): in both cases the measurement is
structurally incapable of distinguishing the failure from the pass, and no amount of running
it more carefully helps.

**Privilege assertions read `has_table_privilege`, `has_function_privilege`,
`pg_class.relacl`, `pg_proc.proacl` and `pg_default_acl` — never `information_schema`.**

## What this cost

`apply_listing_revision` and `reject_listing_revision` are `SECURITY DEFINER`, contained no
authorization check of any kind, and take `reviewer_user_id` as a caller-supplied argument.
In any freshly built environment an anonymous caller could therefore approve a pending
revision onto a live listing — arbitrary title, description and price, past moderation,
attributed to any user id they named. Unexercised by the application, which reaches these
only through the service-role client behind an admin check. Reachable regardless: PostgREST
exposes every function in the exposed schema, and the application is not the only caller of
its own database.

## Known residual — the reviewer is still an argument

`apply_listing_revision` and `reject_listing_revision` now validate `reviewer_user_id`, but
it remains **caller-supplied**, which is inconsistent with how this project has resolved the
same question everywhere else. `listing_views.viewer_user_id` became a system default
(`current_app_user_id()`, INSERT not granted on the column). The inspection response window
moved inside the function rather than staying a parameter. In both cases the argument
disappeared rather than being checked.

It cannot disappear here while the caller is the service-role client, because that key
carries no user identity to derive a reviewer from — validation is the strongest available
form given that caller.

**The fully consistent shape** is to call these as the admin's own authenticated client and
derive the reviewer from the session, at which point the argument is gone and there is
nothing left to validate. That is a change to the admin service's client strategy, not to
these functions.

The residual today: an admin can attribute a moderation decision to a *different* admin.
Small, and the result is still a moderation record made by someone entitled to make one.
Recorded rather than fixed; not in the stack that introduced the check.

## Requirements added

6. **Default privileges are revoked as a default, not as a sweep.** `ALTER DEFAULT
   PRIVILEGES ... REVOKE ALL` for tables, sequences and functions. A `REVOKE ... ON ALL
   TABLES` is point-in-time and stops being true at the next `CREATE TABLE`.
7. **Revoke blanket, not by enumeration.** 0023 enumerated `TRUNCATE, REFERENCES, TRIGGER`.
   PostgreSQL 17 then added `MAINTAIN`, which walked through the enumeration and is still
   held on those three tables. `REVOKE ALL` is immune to the next one.
8. **A function's grant is not its authorization check.** Any `SECURITY DEFINER` function
   resolves and checks its caller in its own body. A function whose only protection is who
   holds EXECUTE is one default-ACL change away from having none.
9. **Privileges are asserted in CI, not assumed.** Assertions read `has_table_privilege`,
   `has_function_privilege` and `pg_default_acl` — **not** `information_schema`, which does
   not report `MAINTAIN` and is therefore blind to precisely the privilege that leaked.
10. **The Supabase CLI version is pinned.** `latest` let the CLI, the Postgres image, and
    that image's bootstrap default privileges change under CI without a commit. Between
    21 August and 3 September 2026 it did.

---

# Implementation Note — A Test Can Encode The Defect It Exists To Catch

A test asserts what someone believed. When the belief is the defect, the test passes and
defends it.

The clearest example this project has produced sat in the setup of
`listing-revision-integration.test.ts`, in a comment explaining why any user would do as the
reviewer:

> Any real user will do as the reviewer; the functions record it, they do not authorise from
> it — admin-service is what authorises.

Every clause is accurate as a description of the code. `apply_listing_revision` and
`reject_listing_revision` genuinely did not authorise from `reviewer_user_id`, and
`admin-service` genuinely was what authorised. And that is precisely the bug: two
`SECURITY DEFINER` functions performing a moderation write with no check of their own,
depending entirely on a grant, in a schema where — as recorded above — a grant is not
reliably what it appears to be.

The test suite therefore had a passing, green, well-written assertion whose premise was the
vulnerability. Nothing in it was going to fail while the exposure existed, because it had
been written to accommodate it. Fixing the functions turned four tests red, and the setup
comment was the specification that had to be rewritten.

## The shape to watch for

This is the third form of the same failure recorded in this amendment:

| Where | The measurement | Why it could not fail |
|---|---|---|
| RLS denial tests | HTTP status | denial and success both return 200 |
| Privilege assertions | `information_schema` | does not report `MAINTAIN` at all |
| The revision suite | an admin-only path | the test supplied a non-admin, and that passed |

In each case the check ran, reported success, and was structurally incapable of reporting
anything else.

## What to do about it

- A comment in a test explaining why a weaker input is acceptable is a claim about the
  authorization model. Check it against the model, not against the code's current behaviour
  — the code's current behaviour is what you are trying to verify.
- When a security fix makes tests fail, read the failures as specification changes before
  reaching for the tests. Four failures here were the suite correctly reporting that its
  assumption had been withdrawn.
- Prefer assertions that fail closed on an unexpected environment. `expect(error).toBeNull()`
  cannot tell you the call was refused for a *different* reason than the one under test;
  assert the sentinel.

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
  and derive the column list from what a surface renders rather than from what the query
  currently selects.
- Auditing SELECT and stopping there. `agent_profiles` had a carefully column-scoped
  UPDATE — 0013 withheld `verification_status`, `verified_at`, `free_listing_quota` and
  the rest as self-grants — sitting beside a table-wide INSERT that granted every one of
  them back. The row policy's `WITH CHECK` asserted `user_id = current_app_user_id()`,
  which verifies who a row belongs to and nothing about what it claims, so a signed-in
  user could `INSERT` themselves an already-verified profile with unlimited quota. When
  a column is withheld from UPDATE because holding it would be an escalation, check that
  INSERT withholds it too: the two paths reach the same column and only one of them was
  reviewed.
- Expecting `select("*")` to narrow itself to the granted columns. PostgREST expands it to
  every column in the table, so against a column-scoped grant it fails `42501` outright.
  That is the desired direction — fail closed — but it means a star select is not a way to
  discover what you may read, and any caller relying on one breaks the moment a grant is
  narrowed.

## Definition of Done

Default privileges are revoked, grants are column-scoped, escalation-relevant columns are
ungranted, and every denial test pairs with a control proving the data exists and is being
withheld.
