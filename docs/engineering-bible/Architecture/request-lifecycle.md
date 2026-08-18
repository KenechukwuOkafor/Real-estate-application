---
document_id: REB-ARCH-011
title: Request Lifecycle Architecture
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# Request Lifecycle Architecture

## Purpose

This document defines the canonical execution flow for every incoming request handled by the Ruvo platform.

Every feature—regardless of complexity—must follow this lifecycle.

The objective is to ensure consistency, maintainability, observability, security, and correctness across the entire application.

---

# Guiding Principles

## Single Flow

Every request follows the same high-level execution pipeline.

No feature may bypass authentication, authorization, validation, or auditing.

---

## Separation of Concerns

Each layer has exactly one responsibility.

Business rules belong to the Domain Layer.

Infrastructure concerns belong to Infrastructure Services.

Presentation belongs to the UI.

---

## Stateless Processing

Each HTTP request must be processed independently.

Servers should not depend on in-memory state.

---

## Transactional Integrity

Business operations that modify multiple entities must execute within a single database transaction whenever possible.

---

# Canonical Request Flow

```

Browser / Mobile App

↓

Next.js Route Handler

↓

Middleware

↓

Authentication (Clerk)

↓

Authorization (RBAC + RLS)

↓

Request Validation

↓

Application Service

↓

Domain Service

↓

Repository Layer

↓

Database Transaction

↓

Commit

↓

Emit Domain Events

↓

Background Jobs

↓

Cache Invalidation

↓

API Response

↓

Frontend State Update

```

---

# Stage 1 — Client Request

The client initiates an HTTP request.

Examples:

- Search Listings
- Create Listing
- Request Inspection
- Send Message
- Upload Media

Responsibilities:

- Collect user input
- Attach authentication credentials
- Display loading state

The client performs only basic validation.

Business validation belongs to the backend.

---

# Stage 2 — Route Handler

The route handler is the entry point.

Responsibilities:

- Receive request
- Parse payload
- Delegate to application service

Responsibilities explicitly excluded:

- Business logic
- Database queries
- Authorization decisions

---

# Stage 3 — Middleware

Middleware executes before business logic.

Responsibilities:

- Request ID generation
- Authentication initialization
- Rate limiting
- Security headers
- Logging context

Middleware must not execute business rules.

---

# Stage 4 — Authentication

Authentication verifies identity.

Provider:

Clerk

Checks include:

- JWT validity
- Expiration
- Session status

Unauthenticated requests terminate immediately.

---

# Stage 5 — Authorization

Authorization determines whether the authenticated user may perform the requested action.

Checks include:

- Role
- Ownership
- Listing permissions
- Verification status

The database remains the final authority through Row Level Security (RLS).

---

# Stage 6 — Request Validation

Validation occurs before business logic.

Validation includes:

- Required fields
- Data types
- Length constraints
- Enum validation
- File constraints
- Business prerequisites

Validation failures return structured errors.

---

# Stage 7 — Application Service

The Application Service orchestrates the use case.

Responsibilities:

- Coordinate domain services
- Manage transactions
- Invoke repositories
- Publish events

Application services should not contain complex business rules.

---

# Stage 8 — Domain Service

The Domain Service contains business rules.

Examples:

- Can this listing be published?
- Is this inspection valid?
- Can this subscription create another listing?

Domain services remain independent of HTTP and UI concerns.

---

# Stage 9 — Repository Layer

Repositories abstract persistence.

Responsibilities:

- Query database
- Save aggregates
- Execute transactions

Repositories never contain business logic.

---

# Stage 10 — Database Transaction

All related writes execute atomically.

If any operation fails:

↓

Rollback

↓

Return Error

Partial updates are prohibited.

---

# Stage 11 — Domain Events

Successful transactions emit domain events.

Examples:

ListingPublished

InspectionRequested

VerificationApproved

SubscriptionExpired

Events are emitted only after the transaction commits successfully.

---

# Stage 12 — Background Processing

Background workers consume events.

Examples:

- Search indexing
- Notification delivery
- Media processing
- Analytics updates
- Cache invalidation

Background jobs must not delay the HTTP response.

---

# Stage 13 — Cache Management

Relevant caches are refreshed or invalidated.

Examples:

Listing Cache

Search Cache

Homepage Cache

City Cache

---

# Stage 14 — API Response

The response should be:

- Predictable
- Versioned
- Typed
- Consistent

Every response includes:

- Status
- Data
- Metadata
- Error information (if applicable)

---

# Stage 15 — Frontend Update

The client updates:

- Local state
- Optimistic UI
- Cache
- Navigation
- Notifications

No frontend business logic should duplicate backend rules.

---

# Example Flow — Create Listing

```

Agent

↓

POST /listings

↓

Authenticate

↓

Authorize

↓

Validate Payload

↓

Application Service

↓

Listing Domain Service

↓

Save Listing

↓

Commit Transaction

↓

Emit ListingCreated

↓

Queue Thumbnail Processing

↓

Return Success

↓

Update UI

```

---

# Example Flow — Request Inspection

```

Seeker

↓

POST /inspection-requests

↓

Authenticate

↓

Authorize

↓

Validate Listing

↓

Create Inspection

↓

Create Conversation

↓

Commit

↓

Emit InspectionRequested

↓

Send Notifications

↓

Return Success

```

---

# Error Handling

Errors are categorized as:

- Validation Errors
- Authorization Errors
- Authentication Errors
- Business Rule Violations
- Infrastructure Failures
- Unexpected Errors

Errors must never expose internal implementation details.

---

# Logging

Every request records:

- Request ID
- User ID (if authenticated)
- Route
- Duration
- Response Status
- Error Details (if applicable)

Sensitive information must never be logged.

---

# Performance Targets

Authentication:

<20ms

Authorization:

<20ms

Validation:

<10ms

Application Service:

<100ms

Database:

<150ms

Total request target:

<300ms

---

# Business Rules

| Rule ID | Rule | Severity |
|----------|------|----------|
| BR-RQ-001 | Every request follows the canonical lifecycle. | Critical |
| BR-RQ-002 | Business logic belongs only in the Domain Layer. | Critical |
| BR-RQ-003 | Transactions are atomic. | Critical |
| BR-RQ-004 | Events are emitted only after successful commits. | Critical |
| BR-RQ-005 | Background work never blocks HTTP responses. | Critical |

---

# Domain Invariants

- Every request is authenticated or explicitly public.
- Authorization precedes business logic.
- Validation precedes persistence.
- Transactions remain atomic.
- Events are emitted after commits.
- Background jobs remain asynchronous.

---

# Future Enhancements

- Distributed tracing
- OpenTelemetry integration
- Request replay tooling
- Circuit breakers
- Service-level metrics

---

# Related Documents

- REB-ARCH-001 Database Specification
- REB-ARCH-002 Event Catalog
- REB-ARCH-003 API Specification
- REB-ARCH-004 Row Level Security
- REB-ARCH-007 Background Jobs
- REB-SEC-001 Security Architecture

---

# Acceptance Criteria

This specification is complete when:

- Every request stage is documented.
- Responsibilities are clearly separated.
- Transaction boundaries are defined.
- Event emission rules are explicit.
- Background processing is integrated.