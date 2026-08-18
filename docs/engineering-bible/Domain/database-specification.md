---
document_id: REB-ARCH-001
title: Database Specification
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# Database Specification

## Purpose

This document defines the logical database architecture of the Ruvo platform.

It establishes the canonical data model, entity relationships, integrity constraints, indexing strategy, naming conventions, and persistence rules.

This document intentionally focuses on business data rather than implementation-specific SQL syntax.

---

# Design Goals

The database architecture must:

- Preserve marketplace integrity.
- Prevent invalid business states.
- Support future nationwide expansion.
- Scale to millions of listings.
- Minimize data duplication.
- Support auditability.
- Enable Row Level Security (RLS).
- Remain provider agnostic.

---

# Database Philosophy

The database is the source of truth.

Business rules should be enforced as close to the data layer as reasonably possible.

Frontend validation improves user experience.

Backend validation protects business logic.

Database constraints preserve data integrity.

---

# Aggregate Model

The platform is organized around the following primary aggregates.

```
User

├── Profile

├── Agent Profile

├── Subscription

├── Verification

└── Listings



Listing

├── Images

├── Views

├── Reports

├── Inspection Requests

└── Shares



Inspection

└── Conversation

     └── Messages



Administration

├── Audit Logs

├── Moderation Actions

└── Reports
```

Each aggregate owns its child entities.

Cross-aggregate references should occur through identifiers rather than direct object ownership.

---

# Canonical Entities

The MVP defines the following primary entities.

## Identity

- users
- user_profiles
- agent_profiles

---

## Marketplace

- listings
- listing_images
- listing_views
- listing_shares

---

## Trust

- verification_requests
- verification_documents

---

## Engagement

- inspection_requests
- conversations
- messages

---

## Commerce

- subscriptions
- subscription_plans
- transactions

---

## Administration

- reports
- moderation_actions
- audit_logs

---

## System

- notifications
- notification_preferences
- analytics_events

---

# Ownership Rules

Every entity must have exactly one owner.

Examples:

Listing → Agent

Inspection → Seeker

Conversation → Inspection

Message → Conversation

Verification → Agent

Ownership must never be ambiguous.

---

# Primary Keys

Every entity uses UUID version 7 as its primary identifier.

Requirements:

- Globally unique.
- Time sortable.
- Immutable.

Primary keys are never reused.

---

# Foreign Keys

Relationships must be explicit.

Orphaned records are prohibited.

Deletion rules are defined by each aggregate.

---

# Soft Delete Strategy

Business entities should use soft deletion.

Examples:

- Listings
- Users
- Conversations

Reference data should use hard deletion only where appropriate.

---

# Timestamp Policy

Every business entity should include:

- created_at
- updated_at

Where applicable:

- deleted_at
- published_at
- archived_at
- approved_at

All timestamps use UTC.

---

# Audit Strategy

Critical business actions generate immutable audit records.

Audit logs are append-only.

Audit history must never be rewritten.

---

# Naming Conventions

Tables:

snake_case plural

Example:

users

listings

inspection_requests

Columns:

snake_case

Examples:

created_at

listing_status

verification_state

Indexes:

idx_

Foreign keys:

fk_

Unique constraints:

uq_

Check constraints:

chk_

---

# Relationships

High-level relationships:

```
User

↓

Agent Profile

↓

Verification

↓

Subscription

↓

Listings

↓

Inspection Requests

↓

Conversation

↓

Messages
```

---

# Data Integrity

The database should enforce:

- Required fields.
- Valid foreign keys.
- Enumerated states.
- Unique identifiers.
- Ownership constraints.

Integrity should never rely solely on application code.

---

# Row Level Security

RLS policies should ensure:

Users only access their own private resources.

Agents only modify their own listings.

Seekers only access their own conversations.

Administrators receive elevated access through explicit policies.

---

# Indexing Strategy

Indexes should prioritize:

- Listing search
- Area lookup
- Agent lookup
- Verification lookup
- Inspection history
- Conversation retrieval
- Subscription status

Composite indexes should support common query patterns.

---

# Search Optimization

Frequently queried fields should be indexed.

Examples:

- city
- area
- property_type
- listing_status
- verification_status
- published_at
- price

---

# Transactions

Critical workflows should execute atomically.

Examples:

- Inspection request creation.
- Conversation creation.
- Listing publication.
- Verification approval.

Partial completion is unacceptable.

---

# Business Rules

| Rule ID | Rule | Severity |
|----------|------|----------|
| BR-DB-001 | Every entity has a UUIDv7 primary key. | Critical |
| BR-DB-002 | Foreign keys must preserve referential integrity. | Critical |
| BR-DB-003 | Soft deletes are used for business entities. | Critical |
| BR-DB-004 | Audit logs are append-only. | Critical |
| BR-DB-005 | RLS is enforced for private resources. | Critical |

---

# Domain Invariants

- Every listing belongs to exactly one agent.
- Every inspection belongs to exactly one listing.
- Every message belongs to exactly one conversation.
- Every verification belongs to exactly one agent.
- Every subscription belongs to exactly one agent.
- Every audit log is immutable.

---

# Future Expansion

The schema should accommodate:

- Additional cities.
- Additional countries.
- Commercial property.
- Property sales.
- Land transactions.
- Multiple subscription products.
- AI-generated insights.

Future growth should require additive migrations rather than destructive redesign.

---

# Acceptance Criteria

This specification is complete when:

- Canonical entities are defined.
- Ownership rules are explicit.
- Integrity constraints are documented.
- RLS strategy is established.
- Indexing philosophy is defined.