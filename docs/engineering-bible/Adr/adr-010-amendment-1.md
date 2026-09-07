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

Six instances of the same failure are now recorded in this project:

| Where | The measurement | Why it could not fail |
|---|---|---|
| RLS denial tests | HTTP status | denial and success both return 200 |
| Privilege assertions | `information_schema` | does not report `MAINTAIN` at all |
| The revision suite | an admin-only path | the test supplied a non-admin, and that passed |
| The populated-database replay | a backfill's `WHERE` clause | no seeded row matched it |
| The rented-listing PATCH probe | an UPDATE's error field | an RLS refusal is HTTP 200 with zero rows |
| The same probe, per column | a write that violated a CHECK | the error read as a refusal |

In each case the check ran, reported success, and was structurally incapable of reporting
anything else.

A seventh instance is recorded below and is **not** a member of this set. Those six are
instruments that could not see what they were pointed at. The seventh is an instrument
pointed in the right place, working correctly, at a defect that landed somewhere else
entirely.

**The fourth is the sharpest, and it is different in kind.** The first three made a *defect*
invisible. The fourth made a *check* meaningless — and it did so inside the instrument built
specifically to catch this class of problem.

The populated-database job exists because the replay from zero cannot test an upgrade: on an
empty database "a backfill matches nothing, a constraint is trivially satisfiable, and a
statement whose cost scales with row count is instant". Migration 0034 added
`listings.rejected_at` and backfilled `where status = 'rejected'`. The seed contained no
rejected listing. So the job seeded, migrated, matched zero rows, and reported success —
having verified exactly as much as the empty-database job it was built to compensate for.

Nothing about the job was wrong. The job did what it says. What was missing was a row, and
the absence of a row is not something a green check can express.

**So: a job that tests an upgrade path is only as good as the fixture it upgrades.** When a
migration's backfill, constraint or data change is conditional — and almost all of them are —
the condition needs a matching row in the seed, added in the same change as the migration.
Otherwise the reassurance is real and the coverage is not.

## The fifth and sixth: an instrument that had never been observed to fail

The last two rows come from one probe, written for migration 0036, and they are recorded
together because the second was found only by attacking the first.

`rented` is a listing status that returns to `approved` with no moderation, which is safe
only because a rented listing's content cannot be edited. That is enforced by an ABSENCE —
`rented` is in neither the `agents_update_own_listings` policy nor
`EDITABLE_LISTING_STATUSES` — so the probe PATCHes every column `authenticated` holds UPDATE
on and requires all of them to be refused.

**Row five is the first row of this table again, in a new costume.** The probe's first
version asked whether the UPDATE returned an error. It does not: PostgREST answers an
UPDATE that no policy admits with HTTP 200 and zero affected rows, because "no rows matched"
is indistinguishable from a filter that found nothing. The assertion would have passed
against a completely open database. This is the same defect as the RLS denial tests in row
one, arriving four amendments later in a different tool, which is the argument for the table
existing at all — the lesson did not transfer on its own.

**Row six is the one worth changing behaviour over, and it was not found by reading.**

The corrected probe passed. It was then MUTATION-TESTED: the
`agents_update_own_listings` policy was deliberately widened to admit `rented`, the probe
was re-run, and it should have named all sixteen columns as breached. It named fifteen.

`sublet_months` was invisible to it. The probe wrote one column at a time, and
`sublet_months = 4` against a fixture whose `rental_duration` is `'yearly'` violates the
pairing CHECK from 0019. The statement therefore came back as an ERROR — and the probe
treated an error as a refusal. Under a wide-open policy, that column was wide open and the
probe reported it closed.

The fix is in two parts, and the second is the general one. Columns that constrain each
other are now written as patches that move together, so the statement is legal. And an
error is now classified as a PROBE DEFECT rather than as a pass: a refusal by policy is
200-with-zero-rows and nothing else, so anything that fails differently means the probe is
not measuring what it claims to.

### A probe that has never been observed to fail has an unknown blind spot

This is the rule to take from it. A green security probe carries two claims — that the
thing is closed, and that the probe can tell. The first is what everyone reads. The second
is unverified until the probe has been seen to go red for the right reason.

Mutation testing is how you find out, and it is cheap: break the thing the probe guards,
confirm it objects, put it back. Fifteen-of-sixteen is a result that no amount of reading
the probe would have produced, because the missing column looked exactly like the others.

The three earlier rows in this table were all found by an incident or by an audit. This one
was found in ten minutes by deliberately making a passing test fail — which is available
before shipping rather than after.

## The seventh: a defect whose blast radius did not follow the change

Migration 0039 added a storage read policy for the new agent-avatar bucket. It mirrored the
row policy on the profile itself:

```sql
and ap.deleted_at is null
and ap.verification_status = 'verified'
```

`anon` holds SELECT on `verification_status` and not on `deleted_at`. A policy body is not
`SECURITY DEFINER` — its subqueries run with the caller's privileges — so for an anonymous
caller this policy did not admit and did not deny. **It raised.**

The rule was already written down. Migration 0040, one file later in the same slice, says it
about this exact table:

> Postgres refuses a `WHERE` on a column the caller cannot SELECT — so a defensive
> `.is("deleted_at", null)` here would fail the query outright rather than being harmlessly
> redundant.

It was broken one migration *earlier*, in a policy body rather than an application query,
where it did not look like the thing the rule was about.

### Why this one is different in kind

`SELECT` policies on a table are OR'd and Postgres evaluates them all. A policy that raises
does not merely fail to admit its own rows — it fails the whole statement, including rows
another policy would have admitted.

`storage.objects` holds every bucket's policies together. So a broken policy about **avatars**
denied anonymous reads of every **listing image** on the site: every photo on every public
listing page, from a change to a bucket that had not existed an hour earlier.

What caught it was `an anonymous visitor can read an approved listing's image` — a test
about a bucket this slice never touched, in a suite nobody would have thought to run against
an avatar change.

The six rows above all share a mitigation: a better instrument, aimed more honestly at the
thing it claims to measure. **That mitigation would not have helped here.** No avatar test
would have found this, however well written — a policy that raises for everyone is
indistinguishable from a policy that admits nobody, so a suite of avatar *denials* stays
fully green through it, and even a positive avatar assertion only finds it if someone thinks
to write one before knowing the failure exists.

The defect landed where the author had no reason to look. The mitigation is therefore not a
sharper instrument but a **broad enough suite that unrelated things break** — and, at
review time, the question of where else a shared object's policies are evaluated together.

### What follows from it

- **Check every column in a policy body against the grant held by every role in its `to`
  clause.** A policy body is not privileged. This is the same rule as "never filter on an
  ungranted column", and it is easiest to miss precisely where it is written in SQL rather
  than in a query builder.
- **Treat `storage.objects` as one shared surface.** Its policies are not partitioned by
  bucket; they are OR'd together per statement. A change scoped to one bucket is not scoped
  to one bucket.
- **Keep tests that assert unrelated things still work, and run the whole suite.** The value
  of the broad suite is precisely that it covers what the author was not thinking about. A
  targeted run of "the tests for the thing I changed" would have been green.
- **Pair every new read policy with a positive assertion**, not only denials. A denial suite
  cannot distinguish "correctly closed" from "raising for everyone".

## What to do about it

- A comment in a test explaining why a weaker input is acceptable is a claim about the
  authorization model. Check it against the model, not against the code's current behaviour
  — the code's current behaviour is what you are trying to verify.
- When a migration changes data conditionally, ask what row makes the condition true and
  whether the seed has one. A passing upgrade job proves nothing about a `WHERE` that matched
  nothing.
- When a security fix makes tests fail, read the failures as specification changes before
  reaching for the tests. Four failures here were the suite correctly reporting that its
  assumption had been withdrawn.
- Prefer assertions that fail closed on an unexpected environment. `expect(error).toBeNull()`
  cannot tell you the call was refused for a *different* reason than the one under test;
  assert the sentinel.
- Before trusting a security probe, make it fail. Widen the policy it guards, re-run it, and
  check it names everything it should — then put the policy back. A probe never observed
  failing has an unknown blind spot, and this is the only way to measure it.
- Never let a probe treat "errored" and "refused" as the same outcome. They are different
  results with different causes, and collapsing them is how a wide-open column reads as
  closed.
- Enumerate what a probe covers from the database — `information_schema.column_privileges`,
  not a hand-written list. A column granted in a later migration is otherwise a hole the
  probe keeps passing beside.
- Check every column named in a policy body against the grant held by every role in the
  policy's `to` clause. A policy body runs with the caller's privileges, so an ungranted
  column makes the policy raise — and a raising policy fails the whole statement, not just
  its own rows. On `storage.objects`, where every bucket's policies are evaluated together,
  that reaches buckets the change never touched.
- Ask where a link you just wrote actually lands. Adding "Change details" to a rented
  listing in the same slice that created the status looked complete; the edit page's `isLive`
  was `approved`-only, so it landed on "this listing cannot be edited" — leaving a rented
  listing uncorrectable by any route, since direct editing is refused by design. Nothing
  errored, no test covered a route that had never existed, and the page rendered fine. The
  same question is worth asking of links already in the tree: `dashboard-listings-table.tsx`
  and the dashboard activity feed both pointed at `/agent/listings/[listingId]`, which has
  never existed.

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
