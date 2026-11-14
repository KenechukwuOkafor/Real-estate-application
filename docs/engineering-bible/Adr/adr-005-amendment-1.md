---
id: ADR-005-A1
title: Amendment 1 to ADR-005 — A Slice Is a Unit of Delivery, Not a Directory
category: Architecture Decision Record Amendment
status: Accepted
version: 1.0
owners: Ruvo Engineering
date: 2026
amends:
  - ADR-005 Adopt Vertical Slice Architecture as the Primary Application Architecture
related:
  - ADR-010 Row Level Security as a First-Class Authorization Layer
  - ADR-010-A1 Privilege Grants Are Part of the Authorization Boundary
  - ADR-001 Adopt Next.js
---

# Amendment 1 to ADR-005 — A Slice Is a Unit of Delivery, Not a Directory

## Status

Accepted

---

# Context

ADR-005 says every feature lives in its own directory that holds its own database
access, rules, API handlers, UI and tests. That isn't what was built. The code
has been layered on the server side since the foundation commit (`631846f`,
August 2026), across 43 migrations and every feature since:

| Where | What it holds | Organized by |
|---|---|---|
| `src/app/` | Routes, pages, API handlers | URL (Next.js requires this) |
| `src/features/<domain>/` | UI components, hooks, and pure domain rules with no I/O (validation, editability, submit readiness) | Domain |
| `src/server/{services,repositories,policies,jobs}/` | Data access, orchestration, authorization tests, the job queue | Technical role; files named by domain |
| `supabase/migrations/` | Schema, RLS policies, grants, SECURITY DEFINER functions | Sequence (one global order) |

Until this amendment, the conflict was only written down in the Phase-0 spec
(`docs/superpowers/specs/2026-08-04-ruvo-phase-0-stabilization-design.md`,
"Unresolved conflict"). That spec promised a vertical-slice refactor in "Phase 2",
which never happened. Deleting `AGENT_RULES.md`, which prescribed the layers,
left ADR-005 in charge and the code disagreeing with it, with nothing saying so.

---

# Does ADR-005's reasoning still hold?

**Part of it does, and that part is a real cost.** ADR-005's main argument was
that layering spreads one feature across many directories. It does. Every feature
merge from #32 to #42 touched four to seven top-level areas (`src/app`,
`src/features`, `src/server`, `src/lib`, `src/types`, `supabase/migrations`,
`supabase/seed.sql`). The Phase-0 plan found the coupling concretely:
`src/types/database.ts` is imported by every repository, `audit-service` by five
services, and `agents-repository` by both the chat and inspection services. A
layered core and slice-shaped commits could not both compile.

**Its premise does not hold here, for two reasons ADR-005 did not foresee:**

1. **The most important business rules live in Postgres.** Under ADR-010 and
   ADR-010-A1, the authorization boundary is RLS policies, column grants and
   SECURITY DEFINER functions. They live in `supabase/migrations/`, one
   sequential, global, immutable series that no feature directory can own. A
   "slice" that owned its own database rules would have to own migration files,
   and the migration order is shared by every feature.
2. **The framework owns routing.** The App Router requires pages and handlers
   under `src/app/`. A feature directory can never hold its own API handlers.

So the full ADR-005 slice, where one directory owns everything, was never
available here. What was available was a choice about where server-side TypeScript
lives. That code was layered, named by domain (`listings-repository.ts`,
`inspection-service.ts`), and has stayed that way.

**What the evidence doesn't show:** no defect in `engineering-quality.md` or the
ADR implementation notes is blamed on how the code is organized. That's absence
of evidence, not proof of no cost. Spreading changes across directories costs
review time and context, and nobody has measured that.

---

# Amendment

1. **In this codebase, a slice is a unit of delivery.** It is one capability,
   built end to end through every layer it needs, and shipped as one PR. It is
   not a directory. This is the sense "one slice per PR" already uses.
2. **The table above is the architecture.** Pure domain rules and UI go in
   `src/features/<domain>/`. I/O and orchestration go in `src/server/` by role,
   with files named for their domain. Database rules go in migrations.
3. **The Phase-2 vertical-slice refactor is withdrawn.** Moving `src/server/`
   into feature directories would still leave routes and database rules
   outside them, so it would not deliver the locality ADR-005 promised.
4. **ADR-005's principles that still apply stay binding:** directories and files
   are named for business capabilities, shared code has to justify itself, and
   there are no "miscellaneous" folders.

---

# Consequences

- A feature still touches several directories. That cost is accepted, and
  domain naming is how it's softened: searching for a domain word finds its
  repository, service, policies and UI.
- Empty placeholder directories (`src/server/workflows/`,
  `src/features/reports/`, `src/features/subscriptions/`) exist only on one
  machine, because git doesn't track empty directories. They aren't part of
  the architecture.

---

# Revisit When

- Feature ownership is split between people or teams. That is ADR-005's
  ownership argument, and it would then be live.
- A defect is traced to cross-service coupling in `src/server/`. That would be
  the first evidence that the layering costs correctness, not just navigation.
