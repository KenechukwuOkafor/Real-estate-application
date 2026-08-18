---
document_id: REB-DOM-004
title: Inspection Domain Specification
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# Inspection Domain Specification

## Purpose

The Inspection domain governs the process through which a property seeker expresses serious interest in a property by requesting a physical inspection.

An inspection request represents the primary conversion event within the Ruvo platform and serves as the bridge between passive browsing and active engagement.

Inspection requests initiate structured communication between seekers and agents while providing measurable business value to the platform.

---

# Objectives

The Inspection domain exists to:

- Convert browsing into genuine enquiries.
- Connect seekers with agents.
- Encourage physical property inspection before commitment.
- Measure marketplace engagement.
- Improve marketplace trust.
- Generate meaningful analytics.

---

# Product Philosophy

Inspection requests represent intent.

Users should be encouraged to inspect properties before making financial commitments.

The platform facilitates introductions but does not participate in inspection scheduling beyond the tools provided.

---

# Workflow Overview

```
Browse Listing

↓

Open Listing

↓

Request Inspection

↓

Notify Agent

↓

Create Conversation

↓

Agent Responds

↓

Inspection Occurs

↓

Conversation Continues (Optional)
```

---

# Inspection Request

An inspection request is created by a property seeker.

Each request is associated with:

- One listing
- One seeker
- One agent

---

# Eligibility

A user MUST:

- Be authenticated.
- Have a verified email.
- Have a verified phone number.
- Request an inspection only on published listings.

---

# Inspection Payload

Each inspection request records:

- Requesting user
- Target listing
- Assigned agent
- Timestamp
- Optional message
- Current status

---

# Inspection Status

Supported statuses:

- Requested
- Accepted
- Declined
- Cancelled
- Completed
- Expired

State transitions are defined in REB-009.

---

# Messaging Integration

An inspection request automatically creates a conversation between the seeker and the listing agent.

The conversation exists only for that listing.

---

# Conversation Rules

The MVP supports:

- Text messages only.

Future versions may introduce:

- Images
- Documents
- Voice notes
- Video

---

# Conversation Lifetime

The initial implementation uses a 48-hour inactivity expiry.

Expired conversations become read-only.

Historical messages remain visible.

---

# Agent Responsibilities

Agents should respond promptly to inspection requests.

Response time contributes to operational analytics.

---

# Seeker Responsibilities

Seekers should attend scheduled inspections or cancel when unable to attend.

Repeated abuse may be subject to moderation.

---

# Notifications

Notifications should be sent when:

- Inspection requested.
- Agent responds.
- Inspection cancelled.
- Inspection completed.

---

# Analytics

Metrics include:

- Inspection requests.
- Acceptance rate.
- Cancellation rate.
- Agent response time.
- Inspection conversion rate.
- Popular properties.
- Popular areas.

---

# Business Rules

| Rule ID | Rule | Severity |
|----------|------|----------|
| BR-INSP-001 | Only authenticated users may request inspections. | Critical |
| BR-INSP-002 | Only published listings accept inspection requests. | Critical |
| BR-INSP-003 | Every inspection request belongs to exactly one listing. | Critical |
| BR-INSP-004 | Every inspection request creates exactly one conversation. | Critical |
| BR-INSP-005 | Conversations are scoped to a single listing. | High |
| BR-INSP-006 | Inspection requests are immutable once completed. | High |

---

# Domain Invariants

The following rules must always remain true.

- Every inspection references exactly one listing.
- Every inspection references exactly one seeker.
- Every inspection references exactly one agent.
- Inspection requests cannot exist without a listing.
- Completed inspections cannot return to Requested.
- Every conversation originates from an inspection request.

---

# Edge Cases

Examples include:

- Listing archived after inspection request.
- Agent loses verification during an active conversation.
- Listing deleted before inspection.
- User blocks another user.
- Duplicate inspection requests.
- Agent never responds.

---

# Failure Modes

Examples include:

- Notification delivery failure.
- Chat service unavailable.
- Listing archived during request.
- Database write failure.
- Duplicate submission caused by network retry.

---

# Related Documents

- REB-DOM-001 Listings
- REB-DOM-003 Users & RBAC
- REB-DOM-005 Messaging
- REB-009 State Machines

---

# Acceptance Criteria

This specification is complete when:

- Inspection lifecycle is fully defined.
- Business rules are explicit.
- Analytics are documented.
- Messaging integration is specified.
- Domain invariants are enforced.