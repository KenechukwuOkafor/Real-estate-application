# Ruvo Memory

## Role

I am the chief engineer and architect for Ruvo.

My job is to:
- preserve product and system coherence
- make implementation decisions that match the locked architecture
- prevent short-term hacks from damaging long-term scalability
- keep the codebase, schema, APIs, and workflow aligned
- maintain a current memory of what is built, what is pending, and what changed

This file is the main project memory.

Whenever major work is completed, architecture changes, bugs are fixed, or priorities change, this file must be updated.

## Core Rules I Must Always Remember

- Trust is the product foundation.
- Verified listings and clear pricing are non-negotiable.
- Build in vertical slices.
- Enforce critical rules in backend logic and database constraints, not just UI.
- Default deny for RLS.
- Never hard delete core business data.
- Never bypass the architecture docs silently.
- Keep the product centered on Nsukka-first launch, then expansion.
- Prefer explicit, stable system design over fast but fragile shortcuts.

## Canonical Project Docs

These remain the formal reference docs:
- `ARCHITECTURE.md`
- `SCHEMA.md`
- `API_CONTRACTS.md`
- `AGENT_RULES.md`

This file complements them by tracking live project state.

## Locked Stack

- Frontend: Next.js App Router
- Backend: Next.js route handlers on Node.js
- Database: Supabase Postgres
- Auth: Clerk
- Payments: Paystack
- Monitoring: Sentry
- Hosting: Vercel

## Product Truth

Ruvo is a trust-first real estate marketplace focused on verified rentals.

Launch market:
- Nsukka

Core roles:
- student
- agent
- admin

North star:
- successful inspection requests

## What Is Already Built

### Foundation

- Next.js app scaffold is set up.
- Clerk and Supabase SDKs are installed.
- Shared env helpers exist.
- Supabase browser, server, and admin clients exist.
- Clerk middleware protects authenticated routes.

### Database

Current migrations:
- `0001_initial_slice_1.sql`
- `0002_public_listing_policies.sql`
- `0003_agent_verification_submissions.sql`

Current seed path:
- `supabase/seed.sql`

### Public Listing Slice

Built:
- public listings API
- listing detail API
- listing view tracking API
- listings page
- listing detail page
- filter UI
- active filter chips
- cursor-based load-more path

### Auth And User Bootstrap

Built:
- Clerk provider wired into app layout
- app shell header with auth-aware navigation
- `/api/me`
- `/api/me/bootstrap`
- onboarding flow with role selection
- dashboard flow based on app user roles

### Agent Workflow

Built:
- agent workspace
- agent profile setup
- verification submission
- draft listing creation
- listing image registration using metadata
- submit draft for review

### Admin Workflow

Built:
- admin moderation queue page
- approve listing API
- reject listing API

## Current Working Flows

These flows currently exist end to end:

1. Public user can browse and filter approved listings.
2. Authenticated user can bootstrap app identity and roles.
3. Agent can:
- open workspace
- create or update agent profile
- submit verification request
- create draft listing
- register listing images
- submit listing for review
4. Admin can:
- open pending review queue
- approve listing
- reject listing

## Important Current Limitations

These are known and intentional for now:

- image upload is metadata registration only, not real binary storage upload
- verification review UI is not built yet
- admin moderation is basic and does not yet include flag/dispute flows
- no audit log writes are attached to moderation actions yet
- no notifications are sent on moderation decisions yet
- no subscription gating is enforced yet
- no real chat or inspection workflow yet

## Known Operational Constraint

`npm run typecheck` and `npm run build` should be run sequentially, not in parallel.

Reason:
- Next.js generates `.next/types`
- parallel runs can race and create false failures

This is a tooling constraint, not a product bug.

## What We Just Finished

Most recent completed work:
- added agent verification submission persistence
- added agent listing image registration
- added draft submission for review
- added admin moderation queue
- added approve/reject moderation actions

## What Must Be Done Next

Immediate next priority:

1. Replace image metadata registration with real storage upload flow
- use Supabase Storage or approved storage path
- support image upload from agent UI
- persist returned storage path and public URL correctly

2. Add audit logging for high-value actions
- agent profile changes
- verification submission
- listing creation
- listing submission
- admin approval
- admin rejection

3. Improve admin moderation
- add flag flow
- add dispute flow
- show more listing context in queue

4. Continue toward marketplace operations
- inspection request flow
- in-app chat
- subscription gating

## How To Update This File

This file must be updated when any of the following happen:
- a new feature is completed
- an important bug is fixed
- architecture changes
- schema changes
- API contracts change
- major product priorities shift
- a blocker or important technical constraint is discovered

Every update should touch these sections when relevant:
- `What Is Already Built`
- `Important Current Limitations`
- `What We Just Finished`
- `What Must Be Done Next`

## If The User Asks "Where Did We Stop?"

Answer from this file first.

Current answer:
- we completed public listings, auth bootstrap, agent onboarding basics, draft listing creation, image registration, listing submission, and admin approve/reject moderation
- next we should implement real image upload storage and audit logging
