# Ruvo

Trust-first real estate marketplace infrastructure for verified listings, starting in Nsukka.

## Stack

- Next.js App Router (v16)
- Node.js route handlers and server-side logic
- Supabase Postgres (RLS-enforced)
- Clerk (authentication)
- Paystack (subscriptions and payments)
- Sentry (monitoring)
- Vercel (hosting)

## Getting Started

Copy the environment file and fill in your values:

```bash
cp .env.example .env.local
```

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The dev server runs at [http://localhost:3001](http://localhost:3001).

## Local Database Setup

Start the local Supabase stack:

```bash
npx supabase start
```

Apply migrations and seed data:

```bash
npx supabase db reset
```

Migrations applied (in order):
- `0001_initial_slice_1.sql` — core tables: users, listings, images, saved_listings, audit_logs
- `0002_public_listing_policies.sql` — public RLS policies for listings
- `0003_agent_verification_submissions.sql` — agent verification workflow
- `0004_listing_media_bucket.sql` — Supabase Storage bucket for listing images
- `0005_inspection_requests_and_chats.sql` — inspection requests, chats, messages
- `0006_subscriptions.sql` — agent subscription plans and entitlement
- `0007_reports.sql` — user reports on listings, agents, and messages

## Development Auth

Set `ENABLE_DEV_AUTH=true` and `NEXT_PUBLIC_ENABLE_DEV_AUTH=true` to enable local login without Clerk. The dev login panel is available at `/dev-login`. Seeded test users:

| Role | Email |
|------|-------|
| Student | student1@ruvo.local |
| Agent (verified) | agent1@ruvo.local |
| Admin | admin1@ruvo.local |

Dev auth only works when seeded users exist in the connected database.

## Type Checking

Run type check and build **sequentially**, not in parallel (Next.js generates `.next/types` during the build step):

```bash
npm run typecheck
npm run build
```

## Project Docs

- `ARCHITECTURE.md` — system rules, RBAC, state machines, listing constraints
- `SCHEMA.md` — database schema, enums, table definitions, RLS expectations
- `API_CONTRACTS.md` — endpoint contracts, request/response shapes, pagination format
- `AGENT_RULES.md` — engineering rules, coding standards, migration rules

## Folder Structure

```text
src/
  app/           Next.js App Router pages and API routes
  components/    Shared UI components
  features/      Domain feature modules (listings, agents, chats, auth)
  lib/           Infrastructure utilities (auth, db, api helpers)
  server/
    services/    Business logic layer
    repositories/  Database access layer
  types/         Shared TypeScript types (database.ts is auto-generated)
supabase/
  migrations/    Version-controlled SQL migrations
  policies/      Exported RLS policy SQL
```

## What Is Built

- Public listing browse, filter, and detail pages
- Cursor-based paginated listing API
- Listing view tracking
- Agent workspace: profile, verification, draft listing creation, image upload, review submission
- Admin moderation queue: approve, reject, flag, dispute listings
- Admin verification review: approve and reject agent verification submissions
- Inspection request creation from listing detail
- Chat inbox and threaded messages for inspection conversations
- Agent accept/decline inspection response
- Subscription entitlement gating for listing creation and submission
- Saved listings (save and unsave)
- User reporting (listings, agents, messages)
- Audit logging across all critical workflow actions
- Dev login flow for local development

## Next Priority

1. Paystack subscription purchase and webhook handling
2. Inspection expiry job and completion flow
3. Notification delivery on moderation decisions
