---
document_id: REB-ARCH-008
title: Caching Strategy
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# Caching Strategy

## Purpose

This document defines the caching architecture of the Ruvo platform.

Caching exists to reduce latency, improve scalability, decrease infrastructure costs, and deliver a consistent user experience.

The cache is an optimization layer.

It is **never** the source of truth.

The PostgreSQL database remains the authoritative source of business data.

---

# Design Principles

## Source of Truth

The database owns business data.

Caches only contain copies.

---

## Cache Invalidates Before It Lies

Serving slightly stale data is acceptable.

Serving incorrect data is not.

Whenever correctness is uncertain, bypass the cache.

---

## Event Driven

Caches should be refreshed or invalidated by business events.

Examples:

ListingApproved

↓

Invalidate Listing Cache

↓

Invalidate Search Cache

↓

Refresh Homepage

---

## Predictable

Every cache entry should have:

- Owner
- Lifetime
- Invalidation rule

---

# Cache Layers

The platform consists of multiple cache layers.

Browser Cache

↓

CDN Cache

↓

Next.js Cache

↓

Application Cache

↓

Database

Each layer serves a specific purpose.

---

# Browser Cache

Caches:

- Images
- Videos
- CSS
- JavaScript
- Fonts

Business data should not remain cached indefinitely.

---

# CDN Cache

The CDN caches:

- Property images
- Property videos
- Static assets
- Generated thumbnails

Private resources are never cached publicly.

---

# Next.js Cache

The frontend caches:

- Public listings
- Search pages
- Landing pages
- City pages

Server Components may use incremental caching where appropriate.

---

# Application Cache

Future versions may cache:

- Popular searches
- Popular cities
- Area statistics
- Trending listings

The MVP should keep application caching simple.

---

# Cacheable Resources

Suitable for caching:

✓ Published listings

✓ Search results

✓ Area metadata

✓ City metadata

✓ Property images

✓ Property videos

✓ Public profile information

---

Not suitable:

✗ User sessions

✗ Verification documents

✗ Payment status

✗ Conversations

✗ Notifications

✗ Audit logs

---

# Cache Keys

Keys should be deterministic.

Examples:

listing:{id}

city:{slug}

area:{slug}

search:{hash}

homepage

---

# Cache Lifetimes

Static Assets

Long-lived.

---

Images

Long-lived.

---

Videos

Long-lived.

---

Public Listings

Medium-lived.

Invalidated on updates.

---

Search Results

Short-lived.

Invalidated when listings change.

---

Analytics

Very short-lived.

---

# Cache Invalidation

Invalidation is event-driven.

Examples

ListingUpdated

↓

Invalidate:

listing:{id}

↓

search:*

↓

homepage

---

ListingArchived

↓

Remove listing cache

↓

Invalidate search

↓

Invalidate city cache

---

SubscriptionExpired

↓

Invalidate listing visibility

---

VerificationApproved

↓

Refresh agent profile

---

# Cache Warming

Frequently accessed resources may be regenerated proactively.

Examples:

Nsukka listings

Top cities

Popular searches

Featured listings

---

# Search Cache

Frequently repeated searches may be cached.

Examples:

Self Contain Nsukka

One Bedroom UNN

Two Bedroom GRA

Search caches should expire automatically.

---

# Media Cache

Images and videos should use immutable URLs.

Changing media creates a new asset identifier rather than replacing the existing one.

This maximizes CDN efficiency.

---

# Cache Monitoring

Monitor:

- Cache hit rate
- Cache miss rate
- Evictions
- Stale entries
- Cache size
- Average lookup time

---

# Failure Handling

If cache fails:

↓

Read directly from database.

The application must remain fully functional.

Cache failures must never cause downtime.

---

# Business Rules

| Rule ID | Rule | Severity |
|----------|------|----------|
| BR-CACHE-001 | Database remains the source of truth. | Critical |
| BR-CACHE-002 | Cache failures must not interrupt user requests. | Critical |
| BR-CACHE-003 | Private data must never be publicly cached. | Critical |
| BR-CACHE-004 | Cache invalidation is event-driven. | High |
| BR-CACHE-005 | Media assets use immutable URLs. | High |

---

# Domain Invariants

- Cache never owns business data.
- Cache entries are disposable.
- Every cache entry has an invalidation strategy.
- Private resources bypass public caches.
- Cache failures degrade gracefully.

---

# Failure Modes

Examples:

- CDN unavailable.
- Stale search cache.
- Corrupted cache entry.
- Cache stampede.
- Cache eviction.
- Cache synchronization delay.

Fallback is always:

↓

Database

---

# Future Enhancements

- Redis
- Edge caching
- Regional caches
- Intelligent cache warming
- Predictive caching
- AI-driven cache optimization

---

# Related Documents

REB-ARCH-001 Database Specification

REB-ARCH-002 Event Catalog

REB-ARCH-005 Media Architecture

REB-ARCH-006 Search Architecture

---

# Acceptance Criteria

This specification is complete when:

- Cache layers are defined.
- Cache ownership is explicit.
- Invalidation rules are documented.
- Failure behavior is specified.
- Monitoring requirements are defined.