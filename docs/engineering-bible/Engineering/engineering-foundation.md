---
title: Engineering Foundation
version: 1.0
status: Approved
owners:
  - Ruvo Engineering
last_updated: 2026
related:
  - Architecture README
  - Architecture Decision Records
  - Engineering Workflow
---

# Engineering Foundation

> "Architecture defines what we build. Engineering defines how we build it."

---

# Purpose

This document establishes the engineering standards, principles, technologies, and development conventions used throughout the Ruvo platform.

Every engineer, contributor, contractor, and AI coding assistant must understand and follow this document before contributing to the codebase.

This document serves as the canonical reference for engineering practices and complements the Architecture documentation.

---

# Scope

This document defines:

- Engineering philosophy
- Technology stack
- Repository organization
- Project structure
- Development environment
- Coding conventions
- TypeScript standards
- React standards
- Next.js standards
- Supabase standards
- Clerk standards
- Architecture compliance
- AI engineering rules

Operational procedures, testing, security, release management, and governance are defined in subsequent Engineering Handbook documents.

---

# Engineering Philosophy

Ruvo follows an architecture-first engineering model.

Engineering decisions must reinforce the documented architecture rather than redefine it during implementation.

The platform prioritizes:

- Simplicity
- Consistency
- Maintainability
- Security
- Scalability
- Developer experience
- AI-assisted productivity

---

# Engineering Principles

Every engineering decision should satisfy the following principles.

## 1. Architecture First

Architecture precedes implementation.

Implementation never introduces architectural changes independently.

Major engineering decisions require an ADR.

---

## 2. Vertical Slice Development

Features are implemented vertically.

Each slice includes:

- Database
- API
- Business Logic
- UI
- Tests
- Documentation

Horizontal development is avoided.

---

## 3. Domain-Driven Thinking

Code is organized around business capabilities rather than technical layers.

Business domains own their own:

- Models
- Services
- Events
- Business rules

---

## 4. Security by Default

Security is built into every feature.

Never assume later implementation will secure unfinished functionality.

---

## 5. Performance by Design

Performance is considered during design rather than after deployment.

---

## 6. Documentation as Code

Documentation evolves with implementation.

Architecture documentation is considered production code.

---

## 7. AI-Assisted Engineering

AI accelerates implementation.

Humans own architecture and final approval.

---

## 8. Explicit Over Implicit

Prefer explicit naming, configuration, and behavior.

Avoid hidden assumptions.

---

## 9. Consistency Over Cleverness

Readable and predictable code is preferred over clever implementations.

---

## 10. Continuous Improvement

Engineering standards evolve through documented architectural decisions rather than informal conventions.

---

# Technology Stack

The approved technology stack is defined by accepted Architecture Decision Records.

| Layer | Technology |
|---------|------------|
| Frontend | Next.js |
| Language | TypeScript |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui |
| Authentication | Clerk |
| Database | PostgreSQL (Supabase) |
| Storage | Supabase Storage |
| Search | PostgreSQL Full Text Search |
| Payments | Paystack |
| Maps | Google Maps Platform |
| Monitoring | Sentry |
| Deployment | Vercel |
| Background Jobs | Event-driven workers |
| Package Manager | pnpm |

Technology substitutions require architectural approval.

---

# Technology Selection Principles

Technologies are selected according to:

- Long-term maintainability
- Community maturity
- Type safety
- Developer productivity
- Scalability
- Operational simplicity

Technology adoption follows documented ADRs.

---

# Repository Organization

The repository follows a feature-oriented architecture.

High-level structure:

```
apps/
packages/
docs/
supabase/
scripts/
.github/
```

Documentation remains alongside implementation.

---

# Project Structure

Application code is organized by business capability.

Avoid organizing by framework concepts alone.

Example:

```
features/

listings/

agents/

users/

verification/

messaging/

payments/

media/

search/

notifications/
```

Each feature owns:

- Components
- Services
- API handlers
- Validation
- Types
- Tests

---

# Development Environment

Every engineer should maintain a consistent local environment.

Required software includes:

- Node.js (LTS)
- pnpm
- Git
- Docker Desktop
- Supabase CLI
- VS Code (recommended)

Operating systems supported:

- macOS
- Linux
- Windows (WSL2 preferred)

---

# Local Development Workflow

Development follows a consistent lifecycle.

```
Pull latest changes

↓

Install dependencies

↓

Run local services

↓

Implement feature

↓

Run tests

↓

Lint

↓

Review

↓

Commit

↓

Push

↓

Pull Request
```

---

# Environment Variables

Environment configuration follows these principles:

- Never commit secrets.
- Local development uses `.env.local`.
- Production secrets are managed by deployment infrastructure.
- Environment variables are documented.
- Every variable has a single responsibility.

---

# Package Management

Ruvo standardizes on **pnpm**.

Rules:

- One package manager only.
- Lockfiles are committed.
- Dependency duplication is avoided.
- Packages must have clear ownership.

---

# Coding Standards

Every code contribution should be:

- Readable
- Predictable
- Testable
- Maintainable
- Well documented

Code should optimize for long-term clarity rather than minimal line count.

---

# Naming Conventions

Prefer descriptive names.

Examples:

Good:

```
createListing()

scheduleInspection()

approveVerification()
```

Avoid:

```
handle()

process()

temp()

data()

item()
```

Names should communicate business intent.

---

# File Organization

Files should have one primary responsibility.

Avoid excessively large files.

Related logic remains close together.

Cross-feature imports should remain minimal.

---

# TypeScript Standards

TypeScript is used in strict mode.

Guidelines:

- Avoid `any`.
- Prefer interfaces for public contracts.
- Prefer inferred types where clarity is preserved.
- Model business concepts explicitly.
- Enable strict compiler settings.

Type safety is mandatory.

---

# React Standards

Components should be:

- Small
- Focused
- Reusable
- Predictable

Business logic belongs outside presentation components whenever possible.

Favor composition over inheritance.

---

# Next.js Standards

Follow the App Router architecture.

Guidelines:

- Prefer Server Components.
- Use Client Components only when necessary.
- Minimize client-side JavaScript.
- Optimize data fetching.
- Respect caching strategies.

---

# Supabase Standards

Supabase is the source of truth for persistent application data.

Rules:

- RLS enabled by default.
- Database migrations are version controlled.
- Business logic belongs in application services.
- Avoid bypassing RLS.

---

# Clerk Standards

Authentication responsibilities belong exclusively to Clerk.

Rules:

- Never store passwords.
- Never implement custom authentication.
- Authorization remains separate from authentication.
- Session validation occurs on protected routes.

---

# Architecture Compliance

Implementation must remain consistent with:

- Architecture documentation
- Domain documentation
- Architecture Decision Records

When implementation conflicts with architecture:

Architecture is updated first.

Implementation follows afterward.

---

# AI Engineering Rules

AI coding assistants must:

- Read relevant architecture documents first.
- Respect accepted ADRs.
- Avoid introducing undocumented patterns.
- Follow existing naming conventions.
- Preserve domain boundaries.
- Update documentation alongside implementation.

AI-generated code always requires human review.

---

# Common Engineering Mistakes

Avoid:

- Bypassing documented architecture.
- Large unstructured components.
- Tight coupling between domains.
- Hidden business rules.
- Duplicate implementations.
- Excessive abstraction.
- Premature optimization.
- Framework-driven architecture.

---

# Engineering Checklist

Before implementation:

- Relevant ADRs reviewed.
- Domain boundaries understood.
- Existing patterns identified.

Before merge:

- Tests passing.
- Lint passing.
- Documentation updated.
- Architecture respected.
- Naming consistent.
- Performance considered.
- Security reviewed.

---

# Definition of Done

Engineering work is complete when:

- Requirements are implemented.
- Architecture remains consistent.
- Tests pass.
- Documentation is updated.
- Code review is approved.
- Performance is acceptable.
- Security requirements are satisfied.

---

# Related Documents

- Engineering Workflow
- Engineering Quality
- Reliability & Observability
- Security Checklist
- Engineering Governance
- Architecture Documentation
- Architecture Decision Records