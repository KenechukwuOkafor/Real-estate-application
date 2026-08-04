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
- local dev auth toggle and dev-login page exist for seeded test users
- Shared env helpers exist.
- Supabase browser, server, and admin clients exist.
- Clerk middleware protects authenticated routes.

### Database

Current migrations:
- `0001_initial_slice_1.sql`
- `0002_public_listing_policies.sql`
- `0003_agent_verification_submissions.sql`
- `0004_listing_media_bucket.sql`
- `0005_inspection_requests_and_chats.sql`
- `0006_subscriptions.sql`

Current seed path:
- `supabase/seed.sql`

### Public Listing Slice

Built:
- public listings API
- listing detail API
- listing view tracking API
- inspection request API
- chat inbox and thread pages for inspection conversations
- listings page
- listing detail page
- listing detail inspection request form
- filter UI
- active filter chips
- cursor-based load-more path
- saved listings API (save and unsave)
- user reports API (listings, agents, messages)

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
- draft listing update (`PATCH /api/agent/listings/:id`)
- signed storage upload targets plus browser upload to listing media storage
- submit draft for review
- inspection chat access from the agent workspace
- accept or decline inspection requests from the chat thread
- subscription entitlement gating for draft creation and review submission

### Admin Workflow

Built:
- admin moderation queue page
- approve listing API
- reject listing API
- flag and dispute listing APIs plus richer moderation queue context
- admin verification review page
- approve and reject agent verification APIs
- audit logging for approval and rejection

## Current Working Flows

These flows currently exist end to end:

1. Public user can browse and filter approved listings.
2. Authenticated user can request an inspection from a public listing, which creates an inspection request and linked chat record.
3. Authenticated user can open inspection chats, read the thread, and send messages.
4. Agent can accept or decline an inspection request from the related chat thread.
5. Authenticated user can bootstrap app identity and roles.
6. Agent can:
- open workspace
- create or update agent profile
- submit verification request
- create draft listing
- register listing images
- submit listing for review
7. Admin can:
- open verification review queue
- approve agent verification
- reject agent verification
- open pending review queue
- approve listing
- reject listing

## Important Current Limitations

These are known and intentional for now:

- no audit log explorer UI exists yet
- no notifications are sent on moderation decisions yet
- no Paystack checkout or webhook integration exists yet
- no dedicated agent inspection queue exists outside the chat inbox
- dev-login requires the seeded users to exist in the connected database

## Known Operational Constraint

`npm run typecheck` and `npm run build` should be run sequentially, not in parallel.

Reason:
- Next.js generates `.next/types`
- parallel runs can race and create false failures

This is a tooling constraint, not a product bug.

## Development Workflow Memory

During the development phase, browser validation should run through the existing Chrome CDP bridge instead of assuming direct local browser access.

Current working pattern:
- use the user-provided CDP bridge URL when available
- verify bridge health first with `GET /status`
- inspect supported commands with `GET /actions` if needed
- drive the browser with `POST /run`
- standard target app URL is `http://localhost:3001`
- use CDP actions such as `navigate`, `getUrl`, `getText`, `evaluate`, `click`, `type`, `reload`, `waitForUrl`, and `screenshot`
- when asked if the full page is visible, do not assume; capture a screenshot and inspect rendered output
- treat screenshot review plus DOM/text inspection through the CDP bridge as the default frontend verification loop

Important constraint:
- the local codex sandbox may block direct access to localhost ports and external tunnels, so CDP bridge requests may require escalated execution

## What We Just Finished

Most recent completed work:
- full architecture review and rating (8.5/10)
- extracted shared `routeErrorResponse` and `AppError` utility in `src/lib/api/errors.ts`
- refactored all admin and agent route handlers to use the shared error handler (eliminated ~150 lines of duplicated string-matching error logic)
- fixed double auth lookup — `approveListingAsAdmin` now gets `adminUserId` from its own `requireAdminContext()` context instead of relying on the route handler to pass it
- added `PATCH /api/agent/listings/:id` endpoint for updating draft and rejected listings
- added `POST /api/saved-listings` and `DELETE /api/saved-listings/:listingId` endpoints
- added `POST /api/reports` endpoint with audit logging
- added migration `0007_reports.sql` for reports table with RLS
- updated `database.ts` to add reports table and report_target_type / report_status enums
- fixed `SCHEMA.md` inspection_status enum drift (was `responded`, is `accepted`/`declined`)
- fixed `ARCHITECTURE.md` inspection state machine to match actual DB enum values
- updated `README.md` to reflect current state (correct port, accurate next steps, dev auth instructions, migration list)
- updated `.env.example` to include all required variables with clear comments

## What Must Be Done Next

Immediate next priority:

1. Paystack subscription purchase and webhook handling
   - `POST /api/subscriptions/checkout` — initiate Paystack checkout
   - `POST /api/webhooks/paystack` — handle subscription payment webhook

2. Inspection lifecycle management
   - expiry job to move `requested` → `expired` after 48 hours
   - `POST /api/inspection-requests/:id/complete` — mark inspection completed

3. Notification delivery
   - send in-app or email notification when listing is approved/rejected
   - send notification when agent verification is approved/rejected

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
- we completed public listings, auth bootstrap, agent onboarding basics, real storage-backed image upload, listing submission, admin approve/reject moderation, and audit logging for key workflow actions
- next we should deepen moderation and build verification review, then move into inspection/chat/subscription flows
