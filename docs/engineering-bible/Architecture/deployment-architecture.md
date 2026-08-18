---
document_id: REB-ARCH-010
title: Deployment Architecture
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# Deployment Architecture

## Purpose

This document defines the production deployment architecture of the Ruvo platform.

It specifies how application components, infrastructure, third-party services, environments, and operational concerns are organized.

The deployment architecture must support:

- High availability
- Scalability
- Security
- Maintainability
- Cost efficiency

---

# High-Level Architecture

```
                    Users
                      │
                      ▼
              Cloudflare DNS
                      │
                      ▼
                 Vercel CDN
                      │
                      ▼
               Next.js Application
                      │
      ┌───────────────┼────────────────┐
      ▼               ▼                ▼
   Clerk         Supabase         Sentry
 Authentication   Database       Monitoring
                  Storage
                  Realtime
                      │
                      ▼
                 PostgreSQL
```

---

# Infrastructure Components

## Frontend

Platform

Vercel

Responsibilities

- Next.js Hosting
- Edge Network
- Static Assets
- Server Components
- Route Handlers
- ISR
- Edge Middleware

---

## Database

Platform

Supabase PostgreSQL

Responsibilities

- Primary Database
- Row Level Security
- Database Functions
- Triggers
- Realtime
- Backups

Database is the single source of truth.

---

## Authentication

Platform

Clerk

Responsibilities

- Authentication
- Session Management
- JWT Issuance
- User Identity

Passwords are never stored by Ruvo.

---

## Storage

Platform

Supabase Storage

Buckets

- property-images
- property-videos
- verification-documents
- profile-images
- system-assets

---

## Monitoring

Platform

Sentry

Responsibilities

- Error Tracking
- Performance Monitoring
- Release Tracking
- Exception Alerts

---

## Payments

Platform

Paystack

Responsibilities

- Subscription Payments
- Webhooks
- Transaction Verification

---

# Environments

Three permanent environments exist.

Development

↓

Staging

↓

Production

Each environment has:

- Separate database
- Separate storage
- Separate authentication configuration
- Separate secrets
- Separate deployment

Production data must never be used in development.

---

# Domain Structure

Production

```
ruvio.co
```

Future

```
app.ruvio.co
api.ruvio.co
admin.ruvio.co
docs.ruvio.co
status.ruvio.co
```

Development

```
dev.ruvio.co
```

Staging

```
staging.ruvio.co
```

---

# Environment Variables

Environment variables are managed by Vercel.

Secrets include:

- Clerk Keys
- Supabase Keys
- Paystack Keys
- Sentry DSN
- Application Secrets

Secrets are never committed to source control.

---

# CI/CD

Every merge into the main branch triggers:

1. Build
2. Type Checking
3. Linting
4. Tests
5. Deployment

Failed builds prevent deployment.

---

# Database Migrations

Schema changes are version controlled.

Migration workflow:

Developer

↓

Migration File

↓

Review

↓

Merge

↓

Deploy

↓

Apply Migration

Production migrations are never edited after execution.

---

# Media Delivery

Media is served through CDN-backed URLs.

Public media is cacheable.

Private media requires signed access.

---

# HTTPS

HTTPS is mandatory.

HTTP requests redirect permanently to HTTPS.

TLS certificates are managed automatically.

---

# Health Checks

Application health endpoints:

/health

/readiness

/liveness

Health endpoints expose:

- Application status
- Database connectivity
- Storage connectivity

No sensitive information is returned.

---

# Scaling Strategy

## Horizontal Scaling

Application servers scale automatically.

Frontend remains stateless.

---

## Database Scaling

Vertical scaling initially.

Read replicas may be introduced in future.

---

## Storage Scaling

Supabase Storage scales independently.

---

## Search Scaling

MVP

PostgreSQL Full Text Search

Future

Dedicated Search Cluster

---

# Logging

Application logs

↓

Vercel

Errors

↓

Sentry

Database logs

↓

Supabase

---

# Backups

Database

Automatic daily backups.

Point-in-time recovery when supported.

Storage

Future backup policy.

Configuration

Version controlled.

---

# Disaster Recovery

Recovery priorities

1. Database
2. Storage
3. Authentication
4. Application

Recovery objectives are documented separately.

---

# Deployment Rules

Deployments must be:

Repeatable

Automated

Auditable

Rollback capable

---

# Business Rules

| Rule ID | Rule | Severity |
|----------|------|----------|
| BR-DEPLOY-001 | Production deployments require successful builds. | Critical |
| BR-DEPLOY-002 | Production uses HTTPS exclusively. | Critical |
| BR-DEPLOY-003 | Secrets remain outside source control. | Critical |
| BR-DEPLOY-004 | Every environment is isolated. | Critical |
| BR-DEPLOY-005 | Database migrations are version controlled. | Critical |

---

# Domain Invariants

- Production remains the authoritative environment.
- Every deployment is reproducible.
- Infrastructure remains stateless where possible.
- Secrets are centrally managed.
- Rollbacks are supported.

---

# Future Evolution

Future infrastructure may include:

- Dedicated API service
- Background worker cluster
- Redis
- Dedicated search engine
- Multiple regions
- Kubernetes
- Object CDN optimization
- AI processing workers
- Video transcoding cluster

---

# Related Documents

REB-SEC-001 Security Architecture

REB-ARCH-005 Media Architecture

REB-ARCH-007 Background Jobs

REB-ARCH-008 Caching Strategy

---

# Acceptance Criteria

Deployment Architecture is complete when:

- Infrastructure components are documented.
- Environment strategy is defined.
- CI/CD workflow is documented.
- Scaling strategy is established.
- Recovery strategy is referenced.