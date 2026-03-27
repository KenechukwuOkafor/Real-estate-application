# Ruvo Agent Rules

## Purpose

This file is the implementation memory system for the Ruvo codebase. Any agent or contributor working in this repository must follow these rules unless a later explicit project decision overrides them.

## Core Standards

- Prioritize trust, data integrity, and auditability over speed hacks.
- Build with vertical slices.
- Finish one feature end-to-end before opening the next major slice.
- Enforce business rules in three layers when appropriate:
  - UI validation
  - backend/service validation
  - database constraints and RLS
- Prefer simple, explicit code over abstract frameworks invented too early.

## Platform Rules

- Main application runtime is Node.js with Next.js.
- Primary database is Supabase Postgres.
- Authentication is Clerk.
- Do not introduce MongoDB as a primary datastore for marketplace entities.
- Do not introduce Django as a parallel primary backend unless there is an approved architecture change.
- If LLM features are added later, prefer a separate worker or service for AI-specific tasks instead of moving the core product backend.

## Folder Structure

Target structure:

```text
src/
  app/
    (public)/
    (auth)/
    agent/
    admin/
    api/
  components/
  features/
    listings/
    auth/
    agents/
    inspections/
    chats/
    subscriptions/
    reports/
  lib/
    auth/
    db/
    rls/
    api/
    validation/
    monitoring/
  server/
    services/
    repositories/
    policies/
    workflows/
  types/
supabase/
  migrations/
  policies/
docs/
```

Rules:
- keep domain logic inside `src/features` and `src/server`
- keep raw database access out of UI components
- keep admin logic separated from agent logic
- avoid a flat `utils/` dumping ground

## Naming Rules

- Use clear domain names. Prefer `inspectionRequest` over vague names like `requestItem`.
- Database tables use `snake_case`.
- Database columns use `snake_case`.
- TypeScript files use `kebab-case`.
- React components use `PascalCase`.
- Route handlers should be named by resource and action, not by UI page terminology.
- Enum values should be stable, lowercase, and underscore-separated.

## Coding Standards

- Use TypeScript strict mode.
- Validate request payloads with a schema library such as Zod.
- Keep route handlers thin.
- Put business logic in services, not directly in route handlers.
- Put authorization checks in dedicated policy helpers or service guards.
- Use transactions for multi-step state changes.
- Log all moderation and critical state changes to `audit_logs`.
- Prefer explicit return types on service functions that cross domain boundaries.
- Keep functions small enough that their business rule is obvious.

## State and Business Rules

- Never let agents set listing status directly to `approved`.
- Never expose unapproved listings on public endpoints.
- Never let unverified agents submit listings for review.
- Never hard delete core business records.
- Never trust client-provided role claims without server verification.
- Never trust client-side validation as the only validation layer.
- Never treat free-text area names as unique identifiers.
- Never bypass duplicate checks when approving listings.

## RLS Rules

- Every business table starts with RLS enabled.
- Default policy posture is deny all.
- Add policies intentionally and minimally.
- Public read policies must apply only to records intended for public visibility.
- Owner policies must scope by authenticated user identity, not client-provided IDs.
- Admin privileges must be explicit and auditable.
- RLS policies must be reviewed alongside application authorization logic.
- Never ship a new table handling sensitive or user-generated data without RLS consideration.

## Migration Rules

- All schema changes go through version-controlled SQL migrations.
- Never edit production data manually as a substitute for a migration.
- Never change the database directly from the Supabase dashboard for permanent schema work.
- Each migration should do one coherent thing.
- Prefer additive migrations over destructive rewrites.
- Backfills must be explicit and safe to rerun when possible.
- Schema constraints belong in migrations, not only in ORM code.
- Add indexes with a clear query reason.
- Test rollback assumptions even if rollbacks are not automated.

## API Rules

- Use a consistent response envelope.
- Use cursor pagination for collections.
- Use stable error codes.
- Do not leak internal DB errors to clients.
- Public endpoints return only the minimum safe fields.
- Administrative endpoints require explicit role checks and audit logging.

## UI Rules

- Public listing pages must show clear pricing.
- Do not hide key listing details behind a contact wall.
- Do not design flows that push users into WhatsApp as the primary system path.
- Build structured forms, not vague free-text-heavy forms.
- Use optimistic UI only where failure recovery is straightforward.

## Observability Rules

- Add Sentry before launch.
- Critical actions must have structured logs or audit events.
- Track listing views and inspection requests from the beginning.
- Do not add analytics that interfere with page performance or privacy posture without review.

## Security Rules

- Default deny.
- Validate auth in every protected route.
- Validate ownership on every owned resource mutation.
- Rate limit inspection requests, message sends, and verification submissions.
- Sanitize or safely render user-generated text.
- Store secrets only in environment variables or platform secret managers.

## Never Do This

- Never bypass RLS by using elevated database credentials in user-facing request paths unless there is a tightly scoped server-side reason and explicit authorization guard.
- Never merge schema and business-rule changes without updating docs.
- Never introduce silent state transitions.
- Never publish listings with fewer than 3 images.
- Never use "call for price" style placeholder pricing.
- Never hardcode role decisions in the UI as the only enforcement.
- Never build admin-only actions into public routes.
- Never create duplicate listing records as a shortcut for edits or resubmissions.
- Never rely on Mongo-style flexible documents for fields that must be filtered, indexed, or constrained.

## LLM Integration Rules

- LLM features must be additive, not foundational, in v1.
- Use LLMs for support tasks such as summarization, moderation assistance, search enrichment, or agent tooling only after the core marketplace works.
- Do not let an LLM make final moderation or verification decisions without human review.
- Do not store sensitive prompts or outputs without reviewing privacy impact.

## Documentation Rules

- Update `ARCHITECTURE.md` when system rules change.
- Update `SCHEMA.md` when tables, fields, or constraints change.
- Update `API_CONTRACTS.md` when endpoint contracts change.
- Update this file when engineering rules or structure changes.

## Delivery Rule

When in doubt, choose the path that preserves:
1. trust
2. data integrity
3. operational clarity
4. future scalability
