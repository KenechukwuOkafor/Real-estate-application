---
title: Engineering Workflow
version: 1.0
status: Approved
owners:
  - Ruvo Engineering
last_updated: 2026
related:
  - Engineering Foundation
  - Architecture Decision Records
  - Vertical Slice Architecture
---

# Engineering Workflow

> "Every feature follows the same path from idea to production."

---

# Purpose

This document defines the standard engineering workflow used to design, implement, test, review, and deploy every feature within Ruvo.

The objective is consistency, predictability, and maintainability.

No feature should bypass this workflow.

---

# Scope

This document covers:

- Feature lifecycle
- Vertical Slice Development
- API development standards
- Testing strategy
- Definition of Done
- Git workflow
- Branching strategy
- Code review process
- Pull request requirements

---

# Workflow Principles

Every feature should be:

- Small
- Incremental
- Testable
- Reviewable
- Reversible
- Fully documented

Large features are broken into multiple vertical slices.

---

# Development Lifecycle

Every feature progresses through the following stages.

```text
Requirements

↓

Architecture Review

↓

Vertical Slice Planning

↓

Implementation

↓

Testing

↓

Documentation

↓

Code Review

↓

Merge

↓

Deployment

↓

Monitoring
```

Skipping stages is not permitted.

---

# Vertical Slice Development

Ruvo is developed using **Vertical Slice Architecture**.

Each feature slice contains everything required for that capability.

A complete slice includes:

```text
Feature

↓

Database

↓

API

↓

Business Logic

↓

Validation

↓

UI

↓

Testing

↓

Documentation
```

### Example

Inspection Scheduling

Includes:

- Database migration
- API endpoint
- Validation
- Business rules
- Notification event
- UI
- Tests
- Documentation

Avoid implementing all database work before beginning API or UI work.

---

# Feature Planning

Before implementation begins, confirm:

- User story is understood.
- Relevant ADRs have been reviewed.
- Domain boundaries are identified.
- Existing patterns have been examined.
- Required dependencies are known.

Every feature should solve one clearly defined business problem.

---

# API Development Standards

APIs are designed around business capabilities rather than database tables.

### Principles

- RESTful resource naming
- Predictable URL structure
- Consistent response formats
- Strong validation
- Typed request/response models
- Clear error responses
- Pagination where required
- Authentication for protected routes
- Authorization through RBAC
- RLS enforced at the database

### Response Format

Successful responses:

```json
{
  "data": {},
  "meta": {}
}
```

Error responses:

```json
{
  "error": {
    "code": "LISTING_NOT_FOUND",
    "message": "Listing does not exist."
  }
}
```

Avoid inconsistent response structures.

---

# Implementation Order

Every feature should generally follow this order.

```text
Domain Model

↓

Database

↓

Validation

↓

API

↓

Business Services

↓

Events

↓

UI

↓

Tests

↓

Documentation
```

This keeps implementation aligned with architecture.

---

# Testing Strategy

Testing follows the testing pyramid.

```text
           E2E

        Integration

      Unit Tests
```

## Unit Tests

Validate:

- Business logic
- Utilities
- Validation
- Calculations

---

## Integration Tests

Validate:

- API routes
- Database interactions
- Authentication
- Authorization
- Event publishing

---

## End-to-End Tests

Validate complete user journeys.

Examples:

- Register account
- Publish listing
- Upload media
- Schedule inspection
- Purchase subscription

---

# Testing Rules

Every new feature must include tests.

Bug fixes require regression tests whenever practical.

Failing tests block merges.

---

# Git Workflow

Development follows a feature-branch workflow.

```text
main

↓

feature/listings

↓

feature/search

↓

feature/media

↓

Pull Request

↓

Merge
```

Direct commits to `main` are prohibited.

---

# Commit Standards

Commits should be:

- Small
- Atomic
- Descriptive

Examples:

```text
feat(listings): add listing approval workflow

fix(media): prevent duplicate uploads

refactor(search): simplify query builder

docs(architecture): update media pipeline
```

Avoid vague messages such as:

```text
update

changes

fix

done
```

---

# Branch Naming

Use descriptive branch names.

Examples:

```text
feature/listing-search

feature/inspection-booking

feature/media-upload

bugfix/login-timeout

refactor/payment-service

docs/engineering-handbook
```

---

# Pull Request Checklist

Every PR must include:

- Purpose
- Summary of changes
- Related issue
- Screenshots (if UI changes)
- Migration notes (if applicable)
- Testing evidence
- Documentation updates

---

# Code Review Checklist

Reviewers evaluate:

## Architecture

- Follows ADRs
- Respects domain boundaries
- Uses approved patterns

---

## Code Quality

- Readable
- Maintainable
- Consistent
- Well structured

---

## Security

- Authentication
- Authorization
- Validation
- Input sanitization

---

## Performance

- Query efficiency
- Rendering performance
- Caching opportunities

---

## Testing

- Unit tests
- Integration tests
- Edge cases

---

## Documentation

- Updated when necessary
- Matches implementation

---

# Merge Requirements

A pull request may be merged only if:

- CI passes.
- Tests pass.
- Lint passes.
- Documentation is updated.
- Required approvals are received.
- No blocking review comments remain.

---

# Deployment Readiness Checklist

Before deployment:

- Database migrations verified
- Environment variables validated
- Monitoring configured
- Feature flags reviewed (if applicable)
- Rollback plan confirmed

---

# Common Workflow Mistakes

Avoid:

- Large pull requests
- Mixing unrelated changes
- Skipping tests
- Delaying documentation
- Ignoring review feedback
- Merging failing builds
- Implementing without reviewing ADRs

---

# AI Development Workflow

AI coding assistants must:

1. Load relevant architecture documents.
2. Read applicable ADRs.
3. Understand the target domain.
4. Generate implementation.
5. Generate tests.
6. Update documentation.
7. Prepare code for human review.

AI should never introduce undocumented architectural patterns.

---

# Definition of Done

A feature is complete when:

- Business requirements are satisfied.
- Architecture remains compliant.
- Tests pass.
- Code review is approved.
- Documentation is updated.
- Monitoring is considered.
- Performance is acceptable.
- Security requirements are met.
- The feature is production-ready.

---

# Related Documents

- Engineering Foundation
- Engineering Quality
- Reliability & Observability
- Security Checklist
- Engineering Governance
- Architecture Documentation
- Architecture Decision Records