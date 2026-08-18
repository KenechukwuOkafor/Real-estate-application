---
document_id: REB-ARCH-009
title: State Machines
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# State Machines

## Purpose

This document defines the canonical lifecycle of every stateful business entity within the Ruvo platform.

A state machine specifies:

- Valid states
- Valid transitions
- Invalid transitions
- Transition triggers
- Business rules
- Side effects

No entity may transition between states unless explicitly defined in this document.

---

# Design Principles

## Explicit States

Every business entity exists in exactly one state at any moment.

---

## Explicit Transitions

Transitions must be deterministic.

Hidden transitions are prohibited.

---

## Validation

Every transition validates:

- Current state
- User permissions
- Business rules
- Required data

---

## Events

Successful transitions emit business events.

Failed transitions emit nothing.

---

# Listing State Machine

## States

Draft

↓

Submitted

↓

Under Review

↓

Approved

↓

Published

↓

Archived

Rejected

Flagged

---

## Valid Transitions

Draft

→ Submitted

Submitted

→ Under Review

Under Review

→ Approved

Under Review

→ Rejected

Approved

→ Published

Published

→ Archived

Published

→ Flagged

Flagged

→ Published

Rejected

→ Draft

---

## Invalid Examples

Published

→ Draft

Archived

→ Published

Rejected

→ Published

---

## Transition Side Effects

Submitted

- Notify admin
- Create audit log

Approved

- Publish event
- Index listing
- Notify agent

Published

- Visible in search
- Public URL available

Archived

- Remove from search
- Invalidate caches

---

# Verification State Machine

## States

Draft

↓

Submitted

↓

Under Review

↓

Approved

Rejected

Expired (future)

Revoked

---

## Valid Transitions

Draft

→ Submitted

Submitted

→ Under Review

Under Review

→ Approved

Under Review

→ Rejected

Approved

→ Revoked

Rejected

→ Draft

---

## Side Effects

Approved

- Agent becomes verified
- Verified badge enabled
- Listing eligibility updated

Revoked

- Verified badge removed
- Future submissions restricted

---

# Inspection State Machine

## States

Requested

↓

Accepted

↓

Scheduled

↓

Completed

Declined

Cancelled

Expired

---

## Valid Transitions

Requested

→ Accepted

Requested

→ Declined

Accepted

→ Scheduled

Scheduled

→ Completed

Requested

→ Cancelled

Accepted

→ Cancelled

Requested

→ Expired

---

## Side Effects

Requested

- Create conversation
- Notify agent

Completed

- Record analytics
- Close inspection

Expired

- Close conversation (if unopened)

---

# Conversation State Machine

## States

Active

↓

Expired

Closed (future)

---

## Valid Transitions

Active

→ Expired

Active

→ Closed

---

## Side Effects

Expired

- Disable new messages
- Preserve history

---

# Subscription State Machine

## States

Pending

↓

Active

↓

Grace Period

↓

Expired

Cancelled

---

## Valid Transitions

Pending

→ Active

Active

→ Grace Period

Grace Period

→ Expired

Active

→ Cancelled

Expired

→ Active (Renewal)

---

## Side Effects

Active

- Listing limits enabled

Expired

- Prevent new listings
- Existing listings remain visible (per current product decision)

Cancelled

- Stop renewals

---

# Report State Machine

## States

Open

↓

Investigating

↓

Resolved

Dismissed

---

## Valid Transitions

Open

→ Investigating

Investigating

→ Resolved

Investigating

→ Dismissed

---

# Notification State Machine

Queued

↓

Sending

↓

Delivered

↓

Read

Archived

Failed

---

# Media Processing State Machine

Uploaded

↓

Validating

↓

Processing

↓

Ready

Failed

Deleted

---

# Background Job State Machine

Queued

↓

Running

↓

Completed

Retrying

Failed

Cancelled

---

# Transition Rules

Every transition must:

- Validate permissions.
- Validate business rules.
- Execute atomically.
- Produce an audit record where applicable.
- Emit business events after successful commit.

---

# Business Rules

| Rule ID | Rule | Severity |
|----------|------|----------|
| BR-SM-001 | Every entity has exactly one active state. | Critical |
| BR-SM-002 | Undefined transitions are prohibited. | Critical |
| BR-SM-003 | Successful transitions emit events. | Critical |
| BR-SM-004 | Failed transitions emit no events. | Critical |
| BR-SM-005 | State transitions are atomic. | Critical |

---

# Domain Invariants

- States are mutually exclusive.
- Transitions are deterministic.
- Business rules are enforced before transitions.
- Side effects occur only after successful transitions.
- Invalid transitions are rejected.

---

# Future Enhancements

Future releases may introduce:

- Workflow versioning.
- Approval chains.
- Configurable workflows.
- AI-assisted moderation states.
- Automated expiry transitions.

---

# Related Documents

REB-ARCH-002 Event Catalog

REB-ARCH-003 API Specification

REB-ARCH-007 Background Jobs

REB-DOM-001 Listings

REB-DOM-002 Verification

REB-DOM-004 Inspection

REB-DOM-005 Subscriptions

---

# Acceptance Criteria

This specification is complete when:

- Every stateful entity has a documented lifecycle.
- Valid transitions are explicit.
- Invalid transitions are prohibited.
- Side effects are documented.
- Transition rules are enforced consistently.