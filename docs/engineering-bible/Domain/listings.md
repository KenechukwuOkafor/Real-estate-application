---
document_id: REB-DOM-001
title: Listings Domain Specification
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# Listings Domain Specification

## Purpose

The Listings domain defines the primary business entity of the Ruvo platform.

A listing represents a property advertisement published by an agent and made discoverable to property seekers.

Every major platform feature—including search, inspections, messaging, moderation, subscriptions, analytics, and sharing—depends on listings.

This document defines the business behavior of listings independently of implementation details.

---

# Domain Objectives

The Listings domain exists to:

- Provide accurate property information.
- Enable trustworthy property discovery.
- Standardize property presentation.
- Support moderation workflows.
- Enable inspections.
- Support agent marketing.
- Preserve marketplace quality.

---

# Core Principles

The Listings domain is governed by the following principles.

## Accuracy

Listings should accurately represent the property being advertised.

---

## Transparency

Property information should be clear and structured.

Important information must never be intentionally hidden.

---

## Moderation

Listings are moderated.

Publication is a privilege, not an automatic right.

---

## Traceability

Every significant listing action should be auditable.

---

## Shareability

Listings should be easily shared both within and outside the platform.

---

## Longevity

Listings may become unavailable, but historical references (such as shared links) should remain valid.

---

# Listing Definition

A listing is a structured representation of a property being advertised.

A listing is not the property itself.

Multiple listings may reference the same physical property under defined business rules.

---

# Listing Ownership

A listing always belongs to exactly one agent account.

Ownership determines:

- Editing permissions.
- Submission permissions.
- Archive permissions.
- Subscription eligibility.

Ownership does **not** imply legal ownership of the property.

---

# Listing Lifecycle

Every listing progresses through defined lifecycle states.

The detailed state machine is specified in **REB-009 State Machines**.

At a high level:

```
Draft
↓

Submitted

↓

Under Review

↓

Approved

↓

Published

↓

Unavailable / Archived
```

State transitions MUST follow the approved workflow.

Direct state manipulation is prohibited.

---

# Listing Visibility

Listings may exist in the database without being publicly visible.

Only publicly available listings may appear in:

- Search
- Browsing
- Area pages
- Shared links

Internal states remain accessible only to authorized users.

---

# Public Listing Requirements

Every published listing MUST include:

- Title
- Property type
- Area
- Price
- Rental duration
- Description
- Property images
- Agent information
- Last updated timestamp

Optional fields are defined separately.

---

# Images

Images are critical to listing quality.

Requirements:

- Minimum: 3 images
- Maximum: 10 images
- WebP compression
- Responsive delivery
- Lazy loading

Listings failing image requirements MUST NOT be published.

---

# Property Types

The MVP supports:

- Self Contain
- One Bedroom
- Two Bedroom
- Three Bedroom
- Four Bedroom
- Duplex
- Bungalow
- Shop
- Office
- Land

Additional property types may be introduced later.

---

# Rental Duration

Supported values:

| Value | Meaning | Month count |
|---|---|---|
| `yearly` | A recurring annual tenancy | Must be absent |
| `monthly` | A recurring monthly tenancy | Must be absent |
| `sublet` | A fixed run of months on someone else's lease | **Required** |

The platform primarily targets yearly rentals, and yearly remains the common
case.

Renamed from "Rental Frequency". A sublet is not a frequency — it does not
recur, it runs for a stated number of months and then it is over — and calling
its length a frequency invites the conflation the schema now forbids.

## Sublets

- **Agents only.** No seeker may post one. This needs no separate rule:
  creating any listing requires an agent profile, so it follows from listing
  creation being agents-only.
- **A number of months, and nothing else.** No start date, no end date, no
  availability window. The platform displays what the agent set; whether it is
  still available is between the seeker and the agent, as with everything else
  here.
- **Nothing expires or auto-hides.** A sublet whose period has passed stays in
  the feed until the agent removes it. There is no expiry job and none is
  wanted.

## The month count is required if and only if the duration is sublet

Enforced by a CHECK constraint on `listings`, not only by the form. A form rule
holds until the next caller — PostgREST, a script, a future admin tool — and
this one is the difference between a sublet and a listing that says nothing
about how long it runs.

There is deliberately **no default duration** in the database. A default of
`yearly` would restore the assumption this model exists to remove: an insert
that forgot the duration would silently become annual, which is how "per year"
came to be hardcoded in the first place.

## Display

| Duration | Beside the price | Detail heading |
|---|---|---|
| `yearly` | "per year" | "Annual price" |
| `monthly` | "per month" | "Monthly price" |
| `sublet` | the month count, e.g. "4 months" | "Sublet price" |

A sublet is additionally marked on the type line, because it is a materially
different arrangement from a tenancy and a seeker should not have to infer that
from a price suffix. Yearly and monthly are not labelled: they are the ordinary
case, and marking them would make the sublet marker harder to see.

---

# Property Information

Every listing should describe:

- Property type
- Price
- Rental duration
- Area
- Address (controlled visibility)
- Bedrooms
- Bathrooms
- Kitchens
- Description
- Amenities
- Availability status

---

# Area Model

Areas are grouped within cities.

Examples for Nsukka include:

- Hill Top
- Behind Flat
- Beach
- Odenigbo
- Ihe/Owerre
- Other recognized districts

Areas are first-class search entities.

Future cities will define their own standardized area catalogs.

---

# Sharing

Listings MUST support external sharing.

Shared links should:

- Open directly to the listing.
- Display appropriate metadata.
- Remain stable.
- Fall back gracefully if unavailable.

Sharing is considered a core growth mechanism.

---

# Duplicate Listings

Multiple agents MAY advertise the same property.

However:

Only one listing for a property may remain actively verified at any given time.

Ownership disputes should move affected listings into an operational review workflow.

Duplicate detection should assist administrators but should not automatically reject listings.

---

# Listing Expiration

Listings may become unavailable because:

- Property rented.
- Agent archived listing.
- Moderation action.
- Subscription restriction.
- Verification issue.

Unavailable listings should preserve historical references.

---

# Moderation

Every listing is subject to moderation.

Moderators may:

- Approve
- Reject
- Flag
- Archive
- Request changes

Moderation decisions should be recorded for auditing.

---

# Analytics

The Listings domain should support:

- Views
- Shares
- Inspection requests
- Agent response metrics
- Popular areas
- Conversion tracking

Analytics are intended to improve marketplace quality.

---

# Dependencies

The Listings domain depends on:

- Users
- Agent Profiles
- Verification
- Search
- Messaging
- Inspections
- Subscriptions
- Notifications
- Analytics

Changes to the Listings domain should be evaluated for downstream impact.

---

# Acceptance Criteria

The Listings specification is considered complete when:

- Listing lifecycle is fully documented.
- Business rules are explicit.
- Visibility rules are defined.
- Sharing behavior is specified.
- Moderation requirements are documented.
- Property structure is standardized.