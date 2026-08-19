---
document_id: REB-DOM-006
title: Messaging Domain Specification
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# Messaging Domain Specification

## Purpose

The Messaging domain enables direct communication between property seekers and agents after a valid inspection request has been created.

Messaging exists to facilitate conversations that help users arrange inspections, ask property-related questions, and complete the property discovery process.

Messaging is intentionally limited in scope and is not designed to compete with general-purpose messaging platforms.

---

# Objectives

The Messaging domain exists to:

- Enable communication after genuine interest has been expressed.
- Reduce spam.
- Protect marketplace quality.
- Increase successful inspections.
- Maintain conversation context around a specific property.

---

# Product Philosophy

Messaging is a consequence of intent.

A conversation is earned through an inspection request rather than freely initiated.

This reduces unsolicited messages while ensuring conversations are meaningful.

---

# Conversation Creation

A conversation is automatically created when:

- A property seeker submits an inspection request.
- The inspection request is successfully recorded.

Users cannot manually create conversations.

---

# Conversation Participants

Each conversation has exactly two participants:

- One property seeker.
- One listing agent.

No additional participants may join the conversation.

---

# Listing Scope

Every conversation belongs to exactly one listing.

The same seeker contacting the same agent about different listings creates separate conversations.

This preserves context and simplifies moderation.

---

# Conversation Lifecycle

```
Created

↓

Active

↓

Inactive

↓

Expired (Read-Only)

↓

Archived
```

Lifecycle transitions are defined in the State Machine specification.

---

# Conversation Expiry

A conversation expires after **48 hours of inactivity**.

Expired conversations:

- Remain visible to participants.
- Become read-only.
- Cannot receive new messages.
- Preserve historical records.

---

# Message Types

The MVP supports only:

- Plain text messages.

The following are explicitly out of scope:

- Images
- Videos
- Voice notes
- Documents
- Stickers
- GIFs
- Reactions
- Polls
- Payments

---

# Message Constraints

Messages MUST:

- Belong to exactly one conversation.
- Have exactly one sender.
- Be timestamped.
- Preserve chronological order.

Messages MUST NOT be editable after sending.

Messages MUST NOT be deleted by users.

Administrative deletion policies are defined separately.

---

# Read Status

Each message supports:

- Sent
- Delivered
- Read

Read receipts are visible only to conversation participants.

---

# Notifications

Participants should receive notifications for:

- New messages.
- Conversation expiry warnings.
- Conversation expiration.

Notification channels are defined in the Notifications domain.

---

# Rate Limiting

The platform SHOULD apply rate limits to reduce spam.

Repeated abuse may result in temporary messaging restrictions.

---

# Moderation

Administrators may:

- View reported conversations.
- Investigate abuse reports.
- Suspend messaging privileges.
- Preserve conversations for investigation.

Moderators MUST NOT alter message content.

---

# Relationship to Inspection

Every conversation originates from exactly one inspection request.

If an inspection request is invalid, the associated conversation must not be created.

---

# Business Rules

| Rule ID | Rule | Severity |
|----------|------|----------|
| BR-MSG-001 | Only inspection requests may create conversations. | Critical |
| BR-MSG-002 | Every conversation belongs to one listing. | Critical |
| BR-MSG-003 | Every conversation has exactly two participants. | Critical |
| BR-MSG-004 | Conversations expire after 48 hours of inactivity. | Critical |
| BR-MSG-005 | Expired conversations are read-only. | Critical |
| BR-MSG-006 | Messages cannot be edited after sending. | High |
| BR-MSG-007 | Messages cannot be deleted by users. | High |
| BR-MSG-008 | Only text messages are supported in the MVP. | High |

---

# Domain Invariants

The following rules must always remain true:

- A conversation cannot exist without an inspection request.
- A conversation always belongs to exactly one listing.
- A message always belongs to exactly one conversation.
- A message always has exactly one sender.
- Conversations never contain more than two participants.
- Messages are immutable after creation.
- Expired conversations are read-only.

---

# Edge Cases

Examples include:

- Both users send messages simultaneously.
- Listing becomes unavailable during an active conversation.
- Agent loses verification during a conversation.
- Conversation expires while one participant is typing.
- Duplicate inspection requests.
- User account suspended during an active conversation.

---

# Failure Modes

Examples include:

- Notification delivery failure.
- Message persistence failure.
- Duplicate message submission.
- Temporary database outage.
- Network interruption during message sending.

The platform should prevent duplicate messages and preserve message ordering.

---

# Future Enhancements

Potential future features include:

- Image sharing.
- Document attachments.
- Voice notes.
- Typing indicators.
- Online presence.
- Message search.
- Emoji reactions.
- AI-assisted moderation.

These features are intentionally excluded from the MVP.

---

# Related Documents

- REB-DOM-004 Inspection
- REB-DOM-001 Listings
- REB-DOM-003 Users & RBAC
- REB-DOM-007 Notifications
- REB-009 State Machines

---

# Acceptance Criteria

This specification is complete when:

- Conversation creation rules are defined.
- Participant rules are explicit.
- Expiry behavior is documented.
- Message constraints are defined.
- Business rules are enforceable.
- Future scope is clearly separated from MVP functionality.