---
document_id: REB-SEC-001
title: Security Architecture
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# Security Architecture

## Purpose

This document defines the security model of the Ruvo platform.

Security is designed as a layered system where every layer assumes the previous layer may fail.

No single security mechanism should be relied upon as the sole line of defense.

---

# Security Principles

## Defense in Depth

Security must exist at multiple layers:

- Browser
- Frontend
- API
- Database
- Storage
- Infrastructure

Compromise of one layer must not compromise the platform.

---

## Least Privilege

Every user, service, and component receives only the permissions required to perform its responsibilities.

Permissions should be additive rather than broad.

---

## Zero Trust

No request is trusted automatically.

Every request is authenticated, authorized, validated, and audited.

---

## Secure by Default

New features should inherit secure defaults.

Developers should have to opt into additional permissions rather than opt out of restrictions.

---

# Identity

Authentication is handled by Clerk.

Clerk is the canonical identity provider.

The backend trusts verified Clerk JWTs only.

Passwords are never stored by Ruvo.

---

# Authentication Flow

```
User

↓

Clerk Authentication

↓

JWT Issued

↓

Next.js

↓

Backend Validation

↓

Authorization

↓

Database (RLS)

↓

Business Logic
```

Every authenticated request validates:

- Token signature
- Token expiry
- User identity
- User role

---

# Authorization

Authorization occurs at multiple layers:

1. Route middleware
2. Backend service
3. Database Row Level Security (RLS)

The database is the final authority.

---

# Secrets Management

Secrets must never be committed to source control.

Secrets include:

- Clerk keys
- Supabase service role key
- Paystack secret key
- Sentry DSN
- API keys
- JWT signing secrets

Production secrets are managed through the deployment platform.

---

# Environment Separation

Separate environments are required:

- Development
- Staging
- Production

Each environment has:

- Independent database
- Independent storage
- Independent secrets
- Independent authentication configuration

Production data must never be copied into development.

---

# Input Validation

Every request is validated before business logic executes.

Validation includes:

- Required fields
- Type validation
- Length limits
- Enum validation
- Ownership checks
- Business rule validation

---

# File Upload Security

Only supported image formats are accepted.

Files are validated for:

- MIME type
- File extension
- Maximum size
- Corruption

Executable files are prohibited.

---

# Storage Security

> **Superseded in part by ADR-033.**
>
> "Public listing images are stored in controlled public buckets" no longer
> holds. Listing images are stored in a private bucket and served through
> short-lived signed URLs. The remaining statements in this section stand, and
> ADR-033 strengthens them: bucket-level size and MIME restrictions are now
> part of storage security, not only application validation.

Private files remain private.

Public listing images are stored in controlled public buckets.

Verification documents are stored in private buckets with restricted access.

Access is governed through signed URLs where appropriate.

---

# API Security

All protected endpoints require authentication.

Every request includes:

- Request ID
- User context
- Authorization checks

Administrative endpoints require elevated permissions.

---

# Rate Limiting

Rate limiting should apply to:

- Authentication attempts
- Listing creation
- Inspection requests
- Messaging
- Search
- Reports

Rate limits should be configurable.

---

# CSRF Protection

State-changing requests must be protected against CSRF where applicable.

---

# XSS Protection

User-generated content must be safely rendered.

The platform must never render unsanitized HTML.

---

# SQL Injection

Parameterized queries are mandatory.

Raw SQL should be minimized and reviewed.

---

# Content Security Policy

The platform should define a strict Content Security Policy (CSP).

Only trusted origins may execute scripts or load assets.

---

# Security Headers

Responses should include appropriate headers, including:

- Content-Security-Policy
- X-Content-Type-Options
- X-Frame-Options
- Referrer-Policy
- Strict-Transport-Security

---

# Logging & Monitoring

Security-relevant events should be logged, including:

- Failed logins
- Permission denials
- Suspicious activity
- Admin actions
- Verification decisions

Sensitive information must never be logged.

---

# Incident Response

Security incidents should follow a documented process:

1. Detect
2. Contain
3. Investigate
4. Recover
5. Review

Post-incident reviews should identify root causes and preventive actions.

---

# Business Rules

| Rule ID | Rule | Severity |
|----------|------|----------|
| BR-SEC-001 | Every protected endpoint requires authentication. | Critical |
| BR-SEC-002 | Authorization is enforced at multiple layers. | Critical |
| BR-SEC-003 | Secrets are never stored in source control. | Critical |
| BR-SEC-004 | All input is validated before processing. | Critical |
| BR-SEC-005 | Verification documents remain private. | Critical |
| BR-SEC-006 | RLS is the final authorization layer. | Critical |

---

# Security Invariants

- Passwords are never stored by Ruvo.
- Private files remain inaccessible without authorization.
- All secrets remain outside the repository.
- Every request is authenticated or explicitly public.
- Audit logs cannot be modified.
- Business data is protected by RLS.

---

# Threat Model

The platform should explicitly defend against:

- Account takeover
- Credential stuffing
- Unauthorized data access
- Broken access control
- SQL injection
- XSS
- CSRF
- File upload abuse
- Spam
- Enumeration attacks
- Brute-force attacks
- Replay attacks
- Session hijacking

---

# Future Enhancements

Future releases may include:

- Two-factor authentication
- Device management
- Session management dashboard
- Security alerts
- Risk-based authentication
- WebAuthn / Passkeys

---

# Related Documents

- REB-ARCH-004 Row Level Security
- REB-ARCH-003 API Specification
- REB-ARCH-001 Database Specification
- REB-DOM-003 Users & RBAC

---

# Acceptance Criteria

This specification is complete when:

- Authentication architecture is documented.
- Authorization model is defined.
- Secrets management is documented.
- Threat model is established.
- Security invariants are explicit.