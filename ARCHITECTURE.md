# Ruvo Architecture

## Purpose

This document defines the system rules for Ruvo. It is the canonical reference for domain behavior, RBAC, listing constraints, and state transitions.

## Recommended Stack

- Frontend: Next.js App Router
- Backend: Next.js Route Handlers and Server Actions on Node.js
- Database: Supabase Postgres
- Auth: Clerk
- Payments: Paystack
- Monitoring: Sentry
- Hosting: Vercel

## Backend Decision

Use Node.js for the main backend.

Reasoning:
- The product already depends on `Next.js`, `Clerk`, `Supabase`, `Paystack`, `Sentry`, and `Vercel`. Node.js keeps the runtime aligned with the app platform.
- The data model is strongly relational: listings, agents, subscriptions, disputes, audit logs, reports, messages, and status transitions all fit Postgres better than MongoDB.
- RLS is a core requirement. Supabase Postgres gives first-class policy enforcement. MongoDB does not.
- Cursor pagination, indexed filtering, uniqueness constraints, transactional workflows, and auditability are easier and safer in Postgres.
- LLM support later does not require switching the core backend. A future Python worker can be added for embeddings, classification, moderation assist, or async jobs if needed.

Do not use Django + MongoDB as the core platform for this product.

## System Boundaries

### Public App

Allows anonymous users to:
- browse approved listings
- filter and sort listings
- open listing details
- share listings
- submit inspection requests after authentication when required by the flow

### Authenticated App

Allows authenticated users to:
- manage profile
- perform role-based actions
- send and receive in-app messages
- request inspections
- save listings
- report listings, agents, and messages

### Agent Workspace

Allows verified agents to:
- manage drafts
- submit listings for review
- track moderation decisions
- manage subscription state

### Admin Workspace

Allows admins to:
- review agent verification submissions
- moderate listings
- resolve disputes
- manage reports
- inspect audit trails

## RBAC Rules

## Core Principles

- A user has one account.
- A user may hold multiple roles.
- Roles are selected during signup and persisted in the database.
- Authorization is enforced in both backend business logic and Postgres RLS.
- Admins do not impersonate users.
- Public endpoints never bypass listing visibility rules.

## Roles

- `student`
- `agent`
- `admin`

## Role Permissions

### Student

Can:
- browse approved listings
- save listings
- request inspections
- send messages in authorized chats
- report listings, agents, and messages

Cannot:
- submit listings
- moderate content
- verify agents
- access admin dashboards

### Agent

Can:
- create and edit listing drafts
- submit listings for review if verified and subscription-entitled
- view own listing moderation history
- respond to inspection chats
- report listings, agents, and messages

Cannot:
- publish listings directly
- review own verification
- moderate other agents
- bypass subscription restrictions

### Admin

Can:
- review and update agent verification status
- review, approve, reject, archive, flag, and dispute listings
- resolve reports
- inspect audit logs
- manage policy-driven workflows

Cannot:
- impersonate users
- bypass audit logging
- edit data directly in production without migrations or controlled admin flows

## Listing Rules

## Public Visibility

- Only listings with status `approved` are publicly visible.
- Listings under dispute are hidden from public access.
- Soft-deleted listings are never publicly visible.
- Expired subscriptions do not hide already-approved listings.

## Listing Ownership

- Each listing belongs to one agent account.
- Only the listing owner or an admin may modify a listing.
- Ownership disputes suspend visibility until resolved.

## Listing Content Requirements

Each listing must include:
- title
- description
- property type
- price
- area
- city
- state
- latitude
- longitude
- structured property attributes
- at least 3 images

Optional:
- video URL
- amenities JSON

Forbidden:
- missing price
- "call for price"
- "DM for price"
- duplicate active listing for the same property

## Property Types

Allowed values:
- `self_contain`
- `1_bedroom`
- `2_bedroom`
- `3_bedroom`
- `shop`
- `lodge_room`

Special rule:
- `self_contain` forces `bedrooms = 1` and `bathrooms = 1`

## Location Rules

Launch defaults:
- `city = Nsukka`
- `state = Enugu`

Rules:
- `area` is free text for now
- latitude and longitude are required for approved listings
- future area normalization must not break existing listing URLs or filters

## Media Rules

- Minimum images: 3
- Maximum images: 10
- Images are stored as optimized derivatives
- Original uploads may be retained privately for reprocessing if needed
- Public delivery format should be WebP where supported
- Video is optional and at most one per listing in v1

## Duplicate and Dispute Rules

### Duplicate Policy

- Only one active public listing may exist per real property.
- Active statuses for duplicate detection are:
  - `pending_review`
  - `approved`
  - `flagged`
  - `under_dispute`
- Duplicates are rejected or flagged for review.

### Disputes

- Ownership disputes move the listing to `under_dispute`.
- `under_dispute` listings are hidden from public view.
- Evidence is required from the involved agents.
- Admin resolves disputes manually.

## Subscription Rules

- Plans: `basic`, `pro`, `enterprise`
- Subscription status gates listing creation and resubmission.
- If subscription expires:
  - existing approved listings remain visible
  - agent cannot create new listings
  - agent cannot resubmit moderated listings

## Messaging Rules

- Messaging is in-app only.
- Text only in v1.
- Attachments are not supported.
- Phone numbers are allowed in message content.
- Every message is stored and auditable.

## Inspection Rules

- Inspection is initiated from a listing action.
- Creating an inspection request opens or links a chat.
- Inspection requests expire after 48 hours if no response.
- Rate limiting applies.

## Reporting Rules

Users can report:
- listings
- agents
- messages

Rules:
- no automatic suspension on first report
- all enforcement requires admin review
- escalation logic may prioritize review queues but cannot bypass admin action

## Audit Rules

Track at minimum:
- listing status changes
- listing content changes
- agent verification changes
- subscription changes
- report decisions
- admin actions

## Data Rules

- Soft deletes only for core business data
- No hard deletes for listings, messages, audits, subscriptions, reports, or verification records
- JSON fields may be used for flexible metadata, but core filterable fields must remain structured columns

## State Machines

## Listing State Machine

States:
- `draft`
- `pending_review`
- `approved`
- `rejected`
- `archived`
- `flagged`
- `under_dispute`

Allowed transitions:

| From | To |
| --- | --- |
| `draft` | `pending_review` |
| `draft` | `archived` |
| `pending_review` | `approved` |
| `pending_review` | `rejected` |
| `pending_review` | `flagged` |
| `approved` | `archived` |
| `approved` | `flagged` |
| `approved` | `under_dispute` |
| `rejected` | `draft` |
| `flagged` | `approved` |
| `flagged` | `rejected` |
| `flagged` | `under_dispute` |
| `under_dispute` | `approved` |
| `under_dispute` | `rejected` |
| `archived` | `draft` |

Rules:
- all transitions must be validated in backend logic
- high-risk transitions also require DB-safe enforcement via constrained update paths
- no direct public mutation of `approved` state by agents

## Agent Verification State Machine

States:
- `not_submitted`
- `pending_review`
- `verified`
- `rejected`
- `suspended`

Allowed transitions:

| From | To |
| --- | --- |
| `not_submitted` | `pending_review` |
| `pending_review` | `verified` |
| `pending_review` | `rejected` |
| `verified` | `suspended` |
| `rejected` | `pending_review` |
| `suspended` | `pending_review` |

Rules:
- only admins can set `verified`, `rejected`, or `suspended`
- only verified agents can submit listings for review
- unverified agents may still create drafts

## Inspection State Machine

States:
- `requested`
- `responded`
- `expired`
- `cancelled`
- `completed`

Allowed transitions:

| From | To |
| --- | --- |
| `requested` | `responded` |
| `requested` | `expired` |
| `requested` | `cancelled` |
| `responded` | `completed` |
| `responded` | `cancelled` |

## Operational Constraints

- Default-deny RLS on every business table
- Version-controlled migrations only
- Critical operations use transactions
- Public APIs expose only approved, non-deleted, non-hidden records
- Monitoring must be configured before production launch
