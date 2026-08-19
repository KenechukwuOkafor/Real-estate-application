---
title: Security Checklist
version: 1.0
status: Approved
owners:
  - Ruvo Engineering
last_updated: 2026
related:
  - Engineering Foundation
  - Engineering Workflow
  - Engineering Quality
  - Reliability & Observability
  - ADR-003 Clerk
  - ADR-010 Row Level Security
  - ADR-022 Role-Based Access Control
  - ADR-023 Defense in Depth
  - ADR-024 Rate Limiting
---

# Security Checklist

> "Security is a design requirement, not a testing phase."

---

# Purpose

This document defines the minimum security standards that every engineer must follow when building features within Ruvo.

Security is everyone's responsibility.

Every feature should be secure by default before it is merged into the codebase.

---

# Scope

This document covers:

- Authentication
- Authorization
- Database Security
- API Security
- Input Validation
- File Upload Security
- Secret Management
- Web Security
- Dependency Security
- Infrastructure Security
- Security Reviews

---

# Security Principles

Every feature should follow these principles.

## Defense in Depth

Multiple independent security layers should protect every sensitive operation.

Never rely on a single security mechanism.

---

## Least Privilege

Users, services and administrators receive only the permissions they require.

Never grant unnecessary access.

---

## Secure by Default

The safest behaviour should be the default behaviour.

Security should not depend upon developer memory.

---

## Fail Securely

If uncertainty exists, deny access.

Never expose sensitive information during failures.

---

## Zero Trust

Every request must be verified.

Never assume trust because a request originated internally.

---

# Authentication

Authentication is managed exclusively by Clerk.

Rules:

✓ Never implement custom authentication.

✓ Never store passwords.

✓ Validate authenticated sessions.

✓ Protect all authenticated routes.

✓ Expired sessions must fail gracefully.

---

# Authorization

Authentication identifies users.

Authorization determines what they may do.

Rules:

✓ RBAC enforced.

✓ Ownership validated.

✓ Administrative permissions verified.

✓ Server-side authorization only.

Never trust client-side permissions.

---

# Row Level Security

RLS protects persistent data.

Rules:

✓ RLS enabled for every table.

✓ Policies reviewed.

✓ Anonymous access explicitly defined.

✓ Service role used only where necessary.

Never bypass RLS unnecessarily.

---

# API Security

Every API should:

✓ Validate input.

✓ Validate authentication.

✓ Validate authorization.

✓ Sanitize responses.

✓ Return consistent errors.

✓ Use HTTPS.

✓ Rate limit sensitive endpoints.

Avoid exposing internal implementation details.

---

# Input Validation

Every external input is untrusted.

Validate:

- Body
- Query Parameters
- URL Parameters
- Headers
- Uploaded Files

Reject invalid data immediately.

---

# Output Encoding

User-generated content should be encoded before rendering.

Prevent:

- Cross-site scripting
- HTML injection
- Script injection

---

# File Upload Security

Supported file types only.

Requirements:

✓ MIME validation

✓ File extension validation

✓ File size limits

✓ Virus scanning (future)

✓ Metadata validation

✓ Randomized filenames

✓ Storage isolation

Executable uploads are prohibited.

---

# Secrets Management

Secrets must never appear in:

- Source code
- Logs
- Screenshots
- Documentation
- Git history

Secrets belong exclusively in secure environment management systems.

---

# Dependency Security

Dependencies introduce security risk.

Requirements:

✓ Trusted maintainers

✓ Active maintenance

✓ License review

✓ Vulnerability scanning

✓ Regular updates

Remove unused dependencies promptly.

---

# Web Security

The platform should implement:

✓ HTTPS

✓ Secure Cookies

✓ HttpOnly Cookies

✓ SameSite Protection

✓ CSP

✓ HSTS

✓ X-Frame-Options

✓ Referrer Policy

✓ Content-Type Protection

---

# Database Security

Requirements:

✓ Parameterized queries

✓ Least privilege

✓ Indexed searches

✓ Audit logging

✓ Secure migrations

Avoid dynamic SQL wherever possible.

---

# Injection Prevention

Protect against:

✓ SQL Injection

✓ XSS

✓ CSRF

✓ Command Injection

✓ SSRF

✓ Path Traversal

✓ Open Redirects

Validate before executing.

---

# Rate Limiting

Protect:

- Login
- Registration
- Password reset
- Messaging
- Reporting
- Search APIs
- Upload APIs

Limits should reflect endpoint sensitivity.

---

# Logging Security

Logs must never contain:

- Passwords

- Tokens

- Session identifiers

- Payment credentials

- Secret keys

Logs should support investigations without exposing confidential information.

---

# Error Security

Errors returned to users should never reveal:

- Stack traces

- SQL queries

- Internal paths

- Secrets

- Infrastructure details

Detailed errors belong in monitoring systems.

---

# Background Job Security

Workers should:

✓ Validate inputs

✓ Validate permissions

✓ Avoid privilege escalation

✓ Log failures

✓ Retry safely

Background jobs are not exempt from security requirements.

---

# Infrastructure Security

Production infrastructure should enforce:

✓ HTTPS

✓ Environment isolation

✓ Secret rotation

✓ Least privilege

✓ Monitoring

✓ Backup protection

✓ Secure deployment pipeline

---

# Security Reviews

Every pull request should evaluate:

Authentication

☐ Required

Authorization

☐ Correct

Validation

☐ Complete

Secrets

☐ Safe

Logging

☐ Secure

Dependencies

☐ Reviewed

Performance

☐ Acceptable

Documentation

☐ Updated

---

# Common Security Mistakes

Avoid:

- Trusting client input

- Hardcoded secrets

- Missing authorization

- Missing validation

- Logging sensitive information

- Excessive permissions

- Ignoring dependency vulnerabilities

- Returning detailed errors

---

# AI Engineering Guidance

AI-generated code should:

- Validate every external input.

- Respect RBAC.

- Respect RLS.

- Never bypass authorization.

- Avoid introducing insecure dependencies.

- Follow OWASP recommendations.

Security requirements are mandatory—not optional enhancements.

---

# Engineering Security Checklist

Before merge:

✓ Authentication verified

✓ Authorization verified

✓ Validation complete

✓ RLS respected

✓ Rate limiting considered

✓ Sensitive data protected

✓ Logging reviewed

✓ Dependencies reviewed

✓ Security review completed

---

# Definition of Done

Security requirements are satisfied when:

- Authentication is enforced.

- Authorization is correct.

- Data access is protected.

- Inputs are validated.

- Sensitive data is protected.

- Logging is secure.

- Known attack vectors are mitigated.

- Security review is approved.

---

# Related Documents

- Engineering Foundation
- Engineering Workflow
- Engineering Quality
- Reliability & Observability
- Engineering Governance
- Architecture Documentation
- ADR Collection