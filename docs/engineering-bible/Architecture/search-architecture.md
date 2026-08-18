---
document_id: REB-ARCH-006
title: Search Architecture
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# Search Architecture

## Purpose

The Search Architecture defines how property seekers discover listings on the Ruvo platform.

Search is the primary entry point into the marketplace and must be fast, relevant, predictable, and scalable.

The architecture is designed to support Nigeria-wide expansion while remaining efficient for the MVP launch in Nsukka.

---

# Design Philosophy

Search should help users find properties quickly rather than expose every listing.

Search must prioritize relevance over completeness.

The platform should require as little typing as possible.

---

# Search Objectives

Search exists to:

- Discover listings.
- Reduce search friction.
- Surface relevant properties.
- Support location-first exploration.
- Enable filtering.
- Scale to millions of listings.

---

# Search Hierarchy

The search hierarchy is:

Country

↓

State

↓

City

↓

LGA

↓

Area / Neighborhood

↓

Property

Example

Nigeria

↓

Enugu

↓

Nsukka

↓

University Road

↓

Listing

---

# Search Entry Points

Users may search using:

- City
- Area
- Neighborhood
- Landmark (future)
- School
- Property type

Future

- Agent
- Listing ID

---

# Search Index

Only searchable listings are indexed.

Requirements:

Listing Status = Published

AND

Approved = True

Drafts are never searchable.

Rejected listings are never searchable.

Archived listings are removed from the index.

---

# Searchable Fields

Location

- State
- City
- LGA
- Area

Property

- Property Type
- Bedrooms
- Bathrooms

Commercial

- Price
- Rental Frequency

Metadata

- Listing Title
- Amenities
- Verification Status

---

# Default Ranking

Results should prioritize:

1. Exact area match
2. Verified agents
3. Most recent listings
4. Complete listings
5. Popular listings

Future

- Personalized ranking

---

# Search Filters

Location

✓ State

✓ City

✓ LGA

✓ Area

---

Property

✓ Property Type

✓ Bedrooms

✓ Bathrooms

✓ Furnished

✓ Shared Apartment

✓ Self Contain

---

Price

✓ Minimum Price

✓ Maximum Price

✓ Rental Frequency

---

Trust

✓ Verified Agents Only

---

Amenities

✓ Water

✓ Electricity

✓ Parking

✓ WiFi

✓ Security

✓ Air Conditioning

✓ Balcony

Future

✓ Pet Friendly

✓ Generator

✓ Swimming Pool

---

# Sorting

Supported

Newest

Oldest

Price Low → High

Price High → Low

Most Viewed

Future

Closest

Trending

Recommended

---

# Search Suggestions

Autocomplete should suggest:

Cities

Areas

Neighborhoods

Property Types

Suggestions should appear after minimal input.

---

# Empty States

If no listings match:

Suggest:

Nearby areas

Different price range

Different property type

Recently added listings

The user should never reach a dead end.

---

# Search Performance

Target response time:

<300ms

Maximum acceptable:

<1 second

Search must remain responsive under load.

---

# Search Pagination

Cursor-based pagination only.

Infinite scrolling is preferred over numbered pages.

---

# Map Search

Map search is supported.

Users may:

Move map

Zoom

Refresh results

Visible map region determines search bounds.

Exact property locations remain hidden unless the agent chooses to share them.

---

# Duplicate Listings

Multiple agents may advertise the same property.

Search treats each listing independently.

Future releases may visually group similar listings.

---

# Search Analytics

Track:

Searches

Popular areas

Popular filters

Zero-result searches

Click-through rate

Inspection conversion

---

# SEO

Public listings should generate:

- Clean URLs
- Canonical URLs
- Structured metadata
- Open Graph previews

Example

/nsukka/university-road/self-contain/modern-self-contain-01982dfb

---

# Caching

Frequently searched areas should be cached.

Examples:

Nsukka

Independence Layout

GRA

Lekki Phase 1

---

# Failure Modes

Examples

Search index unavailable.

Slow database query.

Cache miss.

Corrupted index.

Zero-result queries.

Search should gracefully fall back to database queries where appropriate.

---

# Future Search Roadmap

Phase 1

PostgreSQL Full Text Search

---

Phase 2

Trigram similarity

Synonym support

Typo tolerance

---

Phase 3

Dedicated search engine

(Meilisearch / Typesense)

---

Phase 4

AI-assisted semantic search

Examples

"cheap student apartment near UNN"

"quiet family house"

"house with constant light"

---

# Business Rules

| Rule ID | Rule | Severity |
|----------|------|----------|
| BR-SEARCH-001 | Only published listings are searchable. | Critical |
| BR-SEARCH-002 | Search must support filtering. | Critical |
| BR-SEARCH-003 | Search results are cursor paginated. | Critical |
| BR-SEARCH-004 | Exact area matches rank above partial matches. | High |
| BR-SEARCH-005 | Search should degrade gracefully if indexing fails. | High |

---

# Domain Invariants

- Draft listings never appear.
- Rejected listings never appear.
- Archived listings are removed.
- Search never exposes hidden locations.
- Ranking remains deterministic for identical inputs.

---

# Related Documents

REB-DOM-001 Listings

REB-ARCH-001 Database Specification

REB-ARCH-002 Event Catalog

REB-ARCH-005 Media Architecture

---

# Acceptance Criteria

The Search Architecture is complete when:

- Search hierarchy is defined.
- Filters are documented.
- Ranking strategy is explicit.
- Performance targets are established.
- Future scalability path is documented.