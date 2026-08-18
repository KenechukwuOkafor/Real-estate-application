---
title: Reliability & Observability
version: 1.0
status: Approved
owners:
  - Ruvo Engineering
last_updated: 2026
related:
  - Engineering Foundation
  - Engineering Workflow
  - Engineering Quality
  - ADR-026 Sentry
  - ADR-027 Background Jobs
---

# Reliability & Observability

> "You cannot operate what you cannot observe."

---

# Purpose

This document defines the engineering standards for building reliable, observable, and diagnosable software within Ruvo.

Every production service should provide enough information to detect failures, investigate incidents, and measure system health.

Reliability is treated as a product feature.

---

# Scope

This document defines:

- Reliability principles
- Logging standards
- Monitoring
- Metrics
- Distributed tracing
- Correlation IDs
- Alerting
- Background job monitoring
- Health checks
- Operational readiness

---

# Reliability Principles

Every service should be:

- Reliable
- Observable
- Measurable
- Recoverable
- Predictable

Failures should be detected automatically rather than reported by users.

---

# Observability Principles

Every production system should answer:

1. What happened?
2. When did it happen?
3. Where did it happen?
4. Why did it happen?
5. Who was affected?
6. Can it be reproduced?

If these questions cannot be answered, observability is insufficient.

---

# Pillars of Observability

Ruvo follows the three pillars of observability.

```text
Logs

↓

Metrics

↓

Traces
```

Together they provide a complete operational picture.

---

# Logging Standards

Logs should communicate meaningful operational events.

Logging is intended for engineers—not end users.

---

## Log Levels

Use consistent severity levels.

| Level | Purpose |
|--------|----------|
| DEBUG | Local debugging only |
| INFO | Normal business events |
| WARN | Recoverable issues |
| ERROR | Failed operations |
| FATAL | Service cannot continue |

---

## Structured Logging

Logs should be structured rather than free-form.

Example:

```json
{
  "timestamp": "...",
  "level": "ERROR",
  "service": "listing-api",
  "requestId": "...",
  "userId": "...",
  "event": "ListingApprovalFailed",
  "message": "Listing not found"
}
```

Avoid plain-text logs whenever structured logging is possible.

---

# Logging Rules

Every log should include, where applicable:

- Timestamp
- Severity
- Service
- Environment
- Request ID
- User ID (if authenticated)
- Event name
- Error code
- Duration

Never log secrets.

---

# Sensitive Data

The following must never appear in logs:

- Passwords
- Authentication tokens
- Session cookies
- Payment credentials
- Personally sensitive information
- API secrets

Logs should support debugging without exposing confidential data.

---

# Monitoring

Production monitoring should include:

- API availability
- Error rates
- Response times
- Database health
- Queue health
- Background workers
- Storage availability
- External service health

Monitoring is continuous.

---

# Metrics

Metrics should measure:

## Application

- Request count
- Success rate
- Failure rate
- Latency

---

## Business

- Listings created
- Inspection requests
- Verification approvals
- Subscription activations

---

## Infrastructure

- CPU
- Memory
- Database connections
- Queue depth
- Storage usage

Business and infrastructure metrics should remain separate.

---

# Correlation IDs

Every request receives a unique correlation ID.

The ID follows the request through:

```text
Browser

↓

API

↓

Business Service

↓

Database

↓

Background Jobs

↓

Notifications
```

This enables complete request tracing.

---

# Distributed Tracing

Long-running workflows should be traceable across services.

Examples:

- Listing submission
- Image processing
- Payment completion
- Agent verification
- Inspection workflow

Tracing should span every participating service.

---

# Background Job Monitoring

Workers should expose:

- Queue size
- Processing rate
- Failure rate
- Retry count
- Average execution time
- Dead-letter queue size

Background jobs must be observable independently of web requests.

---

# Health Checks

Every production service should expose a health endpoint.

Health checks validate:

- Service availability
- Database connectivity
- Storage connectivity
- Queue availability
- External dependencies (where appropriate)

Health endpoints should not expose sensitive information.

---

# Error Monitoring

Unexpected errors are reported automatically through Sentry.

Every error should include:

- Stack trace
- Release version
- Environment
- Request ID
- User context (when appropriate)

Sensitive data must be sanitized before reporting.

---

# Alerting

Alerts should notify engineers only for actionable events.

Avoid alert fatigue.

Severity levels:

- Critical
- High
- Medium
- Low

Every alert should have a documented response procedure.

---

# Reliability Engineering

Design systems to:

- Retry transient failures
- Fail gracefully
- Preserve user data
- Recover automatically when possible
- Isolate failures

A single failure should not cascade across domains.

---

# Performance Monitoring

Track:

- API latency
- Slow queries
- Rendering performance
- Background job duration
- Search performance
- Media processing time

Performance regressions should be measurable.

---

# Incident Readiness

Every production issue should be traceable using:

- Logs
- Metrics
- Traces
- Error reports
- Deployment history

The goal is rapid diagnosis rather than guesswork.

---

# Common Observability Mistakes

Avoid:

- Logging everything
- Logging nothing
- Missing request IDs
- Ignoring warnings
- Unstructured logs
- Silent failures
- Missing health checks
- Monitoring only infrastructure

---

# AI Engineering Guidance

AI-generated services should:

- Emit structured logs
- Include correlation IDs
- Produce actionable errors
- Support monitoring
- Preserve traceability

Observability should be implemented alongside functionality—not added later.

---

# Engineering Checklist

Before merge:

✓ Structured logging implemented

✓ Correlation IDs propagated

✓ Errors reported

✓ Metrics identified

✓ Health checks considered

✓ Background jobs monitored

✓ Sensitive data excluded

---

# Definition of Done

Reliability requirements are satisfied when:

- Production behaviour is observable.
- Failures are detectable.
- Logs are structured.
- Metrics are collected.
- Traces are available.
- Alerts are actionable.
- Services expose health information.
- Engineers can diagnose failures without reproducing them locally.

---

# Related Documents

- Engineering Foundation
- Engineering Workflow
- Engineering Quality
- Security Checklist
- Engineering Governance
- ADR-026 Sentry
- ADR-027 Background Jobs