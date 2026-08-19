---
document_id: REB-ARCH-004
title: Row Level Security (RLS) Architecture
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated: 2026-08-18
review_cycle: Quarterly
---

# Row Level Security Architecture

## Purpose

This document defines the authorization model for the Ruvo platform using PostgreSQL Row Level Security (RLS).

RLS ensures that users can only read or modify data they are explicitly permitted to access, regardless of client implementation.

The database is the final enforcement layer for authorization.

---

# Design Principles

## Database-Enforced Security

Authorization must never rely solely on frontend code.

Every database query is evaluated against RLS policies.

---

## Default Deny

Every table begins with:

"No Access."

Access is granted only through explicit policies.

> **Qualified by ADR-010-A1.**
>
> "No Access" is a property of privileges as well as policies. A table with RLS
> enabled and default grants intact does not begin at no access — it begins at
> whatever the grants permit, with policies narrowing rows only.
>
> Default privileges are revoked first; policies are written second. A policy
> is a row predicate and cannot express which *columns* a caller may change,
> so a caller who legitimately owns a row is bounded by the grant, not the
> policy.

---

## Least Privilege

Users receive only the minimum permissions required.

---

## Ownership

Ownership determines most permissions.

Examples:

Listing → Agent

Conversation → Participants

Inspection → Requesting User

Message → Conversation

---

# User Roles

The MVP supports:

- Guest
- Seeker
- Agent
- Admin

Future:

- Moderator
- Support
- Regional Admin
- Super Admin

---

# Table Access Matrix

| Table | Guest | Seeker | Agent | Admin |
|--------|--------|---------|--------|-------|
| listings | Read Public | Read Public | Own + Public | Full |
| listing_images | Read Public | Read Public | Own | Full |
| inspection_requests | None | Own | Own Listings | Full |
| conversations | None | Participant | Participant | Reported Only* |
| messages | None | Participant | Participant | Reported Only* |
| verification_requests | None | Own | Own | Full |
| subscriptions | None | Own | Own | Full |
| notifications | None | Own | Own | Full |
| reports | Create | Own | Own | Full |
| audit_logs | None | None | None | Read |

*Only when required for moderation or investigations.

---

# Ownership Rules

A user owns:

- Their profile
- Their notification settings
- Their inspections
- Their reports

An agent additionally owns:

- Agent profile
- Listings
- Listing drafts
- Verification requests
- Subscription

---

# Public Data

The following resources are publicly accessible:

- Published listings
- Public agent profile (future)
- Cities
- Areas

Only approved and published listings are visible.

---

# Administrative Access

Administrators may:

- Read all business entities.
- Moderate listings.
- Review verification.
- Resolve reports.
- View analytics.
- Manage subscriptions.

Administrators must not bypass audit logging.

---

# Policy Categories

Each table should define policies for:

- SELECT
- INSERT
- UPDATE
- DELETE

DELETE should rarely be granted.

Soft deletes are preferred.

---

# Listing Policies

Guests

May SELECT only:

listing_status = 'published'

Agents

May:

SELECT own listings

INSERT own listings

UPDATE own listings

Cannot publish directly.

---

# Inspection Policies

Seekers

May create inspections.

May read their own inspections.

Agents

May read inspections for their own listings.

Cannot modify requester information.

---

# Conversation Policies

Participants only.

A user cannot access conversations they do not participate in.

---

# Message Policies

Participants only.

Users cannot edit messages after sending.

Deletion is not supported in the MVP.

---

# Verification Policies

Agents may:

Create

Read own

Update draft submissions

Administrators approve or reject.

---

# Subscription Policies

Users may only view their own subscription.

Administrators manage all subscriptions.

---

# Report Policies

Any authenticated user may submit reports.

Only administrators resolve reports.

---

# Audit Logs

Append-only.

No UPDATE.

No DELETE.

Only administrators may read.

---

# Security Invariants

- Users never access another user's private data.
- Agents only modify their own listings.
- Guests only access public resources.
- Audit logs remain immutable.
- RLS remains enabled on every business table.

---

# Business Rules

| Rule ID | Rule | Severity |
|----------|------|----------|
| BR-RLS-001 | Every business table must have RLS enabled. | Critical |
| BR-RLS-002 | Policies default to deny. | Critical |
| BR-RLS-003 | Ownership is validated at the database layer. | Critical |
| BR-RLS-004 | Guests only access public data. | Critical |
| BR-RLS-005 | Audit logs are read-only. | Critical |
| BR-RLS-006 | Default privileges are revoked before policies are written. | Critical |
| BR-RLS-007 | Columns governing moderation state, verification state, entitlement, identity or role membership are never granted to the authenticated role. | Critical |
| BR-RLS-008 | `TRUNCATE` is never granted to the anonymous or authenticated role, and `DELETE` only where a deletion path requires it. | Critical |
| BR-RLS-009 | Service-role privileges are granted explicitly, never inherited from table creation. | High |
| BR-RLS-010 | Every policy test asserts on returned contents and includes a control read proving a withheld row exists. | Critical |

*(BR-RLS-006 through BR-RLS-010 introduced by ADR-010-A1.)*

---

# Testing Requirements

Every RLS policy must include automated tests for:

- Authorized access
- Unauthorized access
- Cross-user access attempts
- Anonymous access
- Administrator access

No policy is considered complete without tests.

---

# Related Documents

- REB-DOM-003 Users & RBAC
- REB-ARCH-001 Database Specification
- REB-ARCH-003 API Specification
- REB-SEC-001 Security Architecture

---

# Acceptance Criteria

This specification is complete when:

- Every business table has documented RLS policies.
- Ownership rules are defined.
- Public vs. private resources are explicit.
- Authorization is enforced at the database layer.
- Automated policy testing is required.