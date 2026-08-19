---
document_id: REB-ARCH-002
title: Event Catalog
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# Event Catalog

## Purpose

This document defines every business event produced within the Ruvo platform.

Business events describe significant occurrences that other domains may react to.

Events represent facts.

They are immutable and describe something that has already happened.

Example:

✔ Listing Approved

✘ Approve Listing

The former is an event.

The latter is a command.

---

# Design Principles

## Events Are Facts

Events describe completed business actions.

They are never requests.

---

## Immutable

Once emitted, events are never modified.

---

## Domain Owned

Every event belongs to exactly one domain.

---

## Event Consumers

Multiple systems may consume the same event.

Examples include:

- Notifications
- Analytics
- Search
- Audit Logs
- Background Jobs

---

# Event Naming Convention

Events use PascalCase.

Examples:

ListingCreated

ListingApproved

InspectionRequested

ConversationCreated

SubscriptionExpired

VerificationApproved

---

# Listing Events

## ListingCreated

Producer

Listings Domain

Consumers

- Audit Logs
- Analytics

Payload

- listing_id
- agent_id
- created_at

---

## ListingSubmitted

Producer

Listings

Consumers

- Moderation
- Notifications
- Audit Logs

---

## ListingApproved

Producer

Moderation

Consumers

- Search
- Notifications
- Analytics
- Audit Logs

---

## ListingRejected

Producer

Moderation

Consumers

- Notifications
- Analytics

---

## ListingArchived

Producer

Listings

Consumers

- Search
- Analytics
- Audit Logs

---

## ListingViewed

Producer

Public Listings

Consumers

- Analytics

---

## ListingShared

Producer

Public Listings

Consumers

- Analytics

---

# Verification Events

VerificationSubmitted

VerificationApproved

VerificationRejected

VerificationRevoked

Consumers

- Notifications
- Listings
- Audit Logs
- Analytics

---

# Inspection Events

InspectionRequested

InspectionAccepted

InspectionDeclined

InspectionCancelled

InspectionCompleted

Consumers

- Messaging
- Notifications
- Analytics
- Audit Logs

---

# Messaging Events

ConversationCreated

MessageSent

ConversationExpired

Consumers

- Notifications
- Analytics

---

# Subscription Events

SubscriptionPurchased

SubscriptionRenewed

SubscriptionExpired

SubscriptionCancelled

Consumers

- Listings
- Notifications
- Analytics
- Audit Logs

---

# User Events

UserRegistered

UserLoggedIn

ProfileUpdated

AccountSuspended

AccountReactivated

Consumers

- Analytics
- Audit Logs

---

# Administrative Events

ReportSubmitted

ReportResolved

ModerationDecisionRecorded

AuditEntryCreated

Consumers

- Analytics
- Notifications

---

# Event Delivery

Events should be published only after successful transaction completion.

Failed transactions must never emit events.

---

# Event Ordering

Within an aggregate, events should preserve chronological order.

Example:

ListingCreated

↓

ListingSubmitted

↓

ListingApproved

↓

ListingArchived

Invalid ordering must never occur.

---

# Event Idempotency

Consumers must safely handle duplicate events.

Processing the same event twice must not corrupt system state.

---

# Event Versioning

Breaking changes require a new event version.

Example:

ListingApproved.v2

Older consumers should continue functioning until migration.

---

# Event Storage

Business events are not the source of truth.

The database remains authoritative.

Events communicate changes between domains.

---

# Event Replay

Future versions may support event replay for:

- Analytics rebuilding
- Search index rebuilding
- Notification recovery

The MVP does not require replay support.

---

# Business Rules

| Rule ID | Rule | Severity |
|----------|------|----------|
| BR-EVT-001 | Events describe completed actions only. | Critical |
| BR-EVT-002 | Failed transactions emit no events. | Critical |
| BR-EVT-003 | Events are immutable. | Critical |
| BR-EVT-004 | Duplicate events must be safely handled. | Critical |
| BR-EVT-005 | Event ordering must remain consistent. | High |

---

# Domain Invariants

- Events are immutable.
- Every event has exactly one producer.
- Events never mutate business data.
- Events are append-only.
- Events are timestamped.
- Events may have multiple consumers.

---

# Future Enhancements

Future releases may introduce:

- Event streaming
- Kafka
- RabbitMQ
- Event sourcing
- Webhooks
- Third-party integrations

The MVP uses events internally only.

---

# Related Documents

REB-DOM-001 Listings

REB-DOM-002 Verification

REB-DOM-004 Inspection

REB-DOM-005 Subscriptions

REB-DOM-006 Messaging

REB-DOM-010 Notifications

REB-ARCH-001 Database Specification

---

# Acceptance Criteria

The Event Catalog is complete when:

- Every business event is documented.
- Producers are identified.
- Consumers are identified.
- Ordering rules are explicit.
- Delivery guarantees are defined.