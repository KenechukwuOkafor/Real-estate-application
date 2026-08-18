---
document_id: REB-DOM-003
title: Users & Role-Based Access Control (RBAC) Domain Specification
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# Users & RBAC Domain Specification

## Purpose

This document defines the user model, platform roles, permissions, authorization boundaries, and access control policies for Ruvo.

Role-Based Access Control (RBAC) is a foundational architectural component of the platform. Every action performed within Ruvo MUST be evaluated against the permissions defined in this document.

Authentication answers **who a user is**.

Authorization answers **what that user is allowed to do**.

---

# Objectives

The RBAC system exists to:

- Protect sensitive platform data.
- Prevent unauthorized actions.
- Clearly separate user responsibilities.
- Simplify permission management.
- Scale cleanly as new roles are introduced.

---

# Design Principles

## Least Privilege

Every role should receive only the permissions required to perform its responsibilities.

No role should possess unnecessary privileges.

---

## Explicit Permissions

Permissions MUST be explicitly granted.

The absence of a permission implies denial.

---

## Backend Enforcement

Authorization MUST always be enforced by backend services.

Frontend controls exist for usability only and MUST NOT be relied upon for security.

---

## Auditability

Permission-sensitive actions SHOULD be logged for operational auditing.

---

# Supported Roles

The MVP supports three primary platform roles.

## Property Seeker

Represents individuals searching for accommodation or other real estate opportunities.

Primary responsibilities:

- Browse listings.
- Search listings.
- Request inspections.
- Chat with agents.
- Share listings.
- Report listings.

Seekers cannot create or manage listings.

---

## Agent

Represents individuals or organizations advertising properties.

Primary responsibilities:

- Create listings.
- Edit listings.
- Submit listings for moderation.
- Manage inspections.
- Respond to chats.
- Maintain profile information.

Agents are subject to verification and subscription requirements.

---

## Administrator

Represents authorized Ruvo staff responsible for operating the marketplace.

Administrators oversee platform quality and operational integrity.

Administrative capabilities include:

- Listing moderation.
- Verification review.
- User management.
- Report resolution.
- Analytics.
- Subscription oversight.
- Platform operations.

---

# Role Assignment

Every user account MUST have exactly one primary platform role.

Role changes are administrative actions and should be auditable.

---

# Authentication

Authentication is provided through Clerk.

The authentication provider establishes user identity.

Application permissions remain the responsibility of Ruvo.

---

# Authorization

Authorization is performed by Ruvo.

Every protected action MUST verify:

- Authentication status.
- Assigned role.
- Resource ownership.
- Business rules.
- Account status.

Authorization decisions MUST NOT depend solely on frontend state.

---

# Permission Matrix

## Property Seeker

Allowed:

- Register account.
- Verify email.
- Verify phone number.
- Browse listings.
- Search listings.
- Share listings.
- Request inspections.
- Chat after inspection request.
- Report listings.
- Manage profile.

Not allowed:

- Create listings.
- Submit verification.
- Moderate listings.
- Access admin tools.

---

## Agent

Allowed:

- Everything available to seekers where applicable.
- Create drafts.
- Edit own listings.
- Submit verification.
- Submit listings.
- Respond to inspections.
- Manage listing media.
- Manage subscription.
- Respond to conversations.

Not allowed:

- Moderate marketplace.
- Approve verification.
- View administrative analytics.
- Manage other users.

---

## Administrator

Allowed:

- Moderate listings.
- Approve listings.
- Reject listings.
- Review verification.
- Manage users.
- Resolve reports.
- View analytics.
- Manage subscriptions.
- Audit platform activity.

Administrators should only use elevated privileges when required for operational responsibilities.

---

# Resource Ownership

Ownership determines whether a user may modify a resource.

Examples:

A listing belongs to one agent.

A verification request belongs to one agent.

A conversation belongs to its participants.

Users may modify only resources they own unless elevated permissions explicitly permit otherwise.

---

# Account States

Accounts may exist in multiple operational states.

Examples include:

- Active
- Suspended
- Disabled
- Pending Verification

Account state affects available permissions.

---

# Permission Evaluation Order

Every protected request should evaluate authorization in the following order:

1. Authentication.
2. Account status.
3. User role.
4. Resource ownership.
5. Business rule validation.
6. Requested operation.

Failure at any stage terminates authorization.

---

# Future Roles

The architecture should allow introduction of additional roles including:

- Inspector
- Moderator
- Customer Support
- Super Administrator
- Business Agent

The RBAC implementation should remain extensible.

---

# Domain Invariants

The following rules must always remain true.

- Every account has exactly one primary role.
- Authorization is enforced by backend services.
- Ownership never bypasses business rules.
- Administrators are subject to audit logging.
- Users cannot elevate their own permissions.
- Permission evaluation follows a consistent order.

---

# Edge Cases

Examples include:

- User changes role.
- Suspended agent attempts login.
- Deleted account owns active listings.
- Shared resource accessed after ownership transfer.
- Clerk account exists but application profile creation fails.

---

# Failure Modes

Examples include:

- Authentication provider unavailable.
- Authorization service unavailable.
- Database role mismatch.
- Invalid permission cache.
- Corrupted ownership reference.

The platform should fail securely.

Access should be denied rather than granted.

---

# Related Documents

- REB-DOM-001 Listings
- REB-DOM-002 Verification
- REB-010 Security & RBAC
- REB-007 Database Architecture

---

# Acceptance Criteria

This specification is complete when:

- Every supported role is defined.
- Permission boundaries are explicit.
- Ownership rules are documented.
- Authorization principles are established.
- Future extensibility is preserved.