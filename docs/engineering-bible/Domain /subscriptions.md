---
document_id: REB-DOM-005
title: Subscription Domain Specification
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# Subscription Domain Specification

## Purpose

The Subscription domain governs commercial access to agent features within the Ruvo platform.

Subscriptions determine an agent's ability to create, publish, and maintain listings while providing the primary recurring revenue model for the platform.

Subscriptions never affect public access to existing approved listings unless explicitly required by business policy.

---

# Objectives

The Subscription domain exists to:

- Monetize the platform.
- Encourage long-term agent retention.
- Support predictable recurring revenue.
- Restrict premium publishing capabilities.
- Scale commercially without changing core platform behavior.

---

# Product Philosophy

Subscriptions purchase publishing capability.

They do not purchase trust.

They do not purchase verification.

They do not bypass moderation.

Every listing remains subject to the same marketplace standards regardless of subscription tier.

---

# Supported Plans

The MVP supports:

- Basic
- Pro
- Enterprise

Exact limits are defined separately within the commercial pricing specification.

---

# Subscription Lifecycle

```
Inactive

↓

Trial (optional)

↓

Active

↓

Expiring Soon

↓

Expired

↓

Renewed
```

State transitions are defined in the State Machine specification.

---

# Subscription Entitlements

An active subscription allows an eligible agent to:

- Create listings.
- Submit listings for moderation.
- Republish eligible listings.
- Renew listings.
- Manage active inventory.

The exact limits depend on the subscribed plan.

---

# Subscription Expiry

When a subscription expires:

Existing approved listings remain publicly visible.

However, the agent may no longer:

- Create new listings.
- Submit new listings.
- Republish archived listings.
- Renew expired listings.

The platform should clearly communicate these restrictions.

---

# Relationship to Verification

Verification and subscription are independent systems.

Possible combinations include:

Verified + Active

Verified + Expired

Unverified + Active

Unverified + Expired

Permissions are determined by evaluating both domains together.

---

# Payment Integration

The MVP integrates with Paystack.

The subscription domain should remain payment-provider agnostic.

Business rules must not depend on a specific payment gateway.

---

# Renewal

Renewal restores publishing capabilities immediately after successful payment verification.

Previously restricted actions become available without requiring account recreation.

---

# Downgrades

Plan changes should preserve existing listings whenever possible.

Restrictions apply only when attempting actions outside the new entitlement limits.

---

# Administrator Responsibilities

Administrators may:

- View subscriptions.
- Extend subscriptions.
- Cancel subscriptions.
- Apply promotional access.
- Review payment history.

Administrative actions must be auditable.

---

# Notifications

Users should receive notifications when:

- Subscription activated.
- Renewal successful.
- Payment failed.
- Expiry approaching.
- Subscription expired.

---

# Business Rules

> **BR-SUB-001 is amended by ADR-034.**
>
> Entitlement to submit a listing is satisfied by an active subscription **or**
> remaining free listing quota. Quota is granted when an administrator approves
> an agent's verification, is never self-granted, and is consumed on submission.
>
> This is not a softening of the rule. It exists because no subscription can be
> created yet — billing is not built — so the rule as originally written made
> publishing unreachable for every agent rather than gating it. Verification
> remains a separate and unchanged gate: quota answers "how many", verification
> answers "at all".
>
> ADR-034 states that quota must not become a subscription tier. When billing
> lands, quota remains the founding-agent and administrative-grant path, not a
> free plan.

| Rule ID | Rule | Severity |
|----------|------|----------|
| BR-SUB-001 | Publishing a new listing requires an active subscription **or remaining free listing quota**. *(Amended by ADR-034.)* | Critical |
| BR-SUB-002 | Expired subscriptions do not remove existing approved listings. | Critical |
| BR-SUB-003 | An agent without entitlement cannot submit a listing for review. Drafting and editing remain available. | Critical |
| BR-SUB-004 | An agent without entitlement cannot resubmit an archived or expired listing. | Critical |
| BR-SUB-005 | Lapsed entitlement does not remove listings already approved. | Critical |
| BR-SUB-006 | Subscription status never bypasses moderation. | Critical |
| BR-SUB-007 | Subscription status never grants verification. | Critical |

---

# Domain Invariants

- Every subscription belongs to one agent.
- An agent may have only one active subscription.
- Subscription never implies verification.
- Subscription never bypasses moderation.
- Expiry immediately affects publishing permissions.
- Existing approved listings remain visible after expiry.

---

# Edge Cases

- Payment succeeds but webhook is delayed.
- Renewal occurs after expiry.
- Agent upgrades while listings are under review.
- Agent downgrades below current listing count.
- Paystack temporarily unavailable.

---

# Failure Modes

- Payment gateway unavailable.
- Duplicate webhook delivery.
- Subscription state mismatch.
- Payment reversal.
- Renewal race condition.

The platform must fail safely and preserve billing integrity.

---

# Related Documents

- REB-DOM-001 Listings
- REB-DOM-002 Verification
- REB-DOM-003 Users & RBAC
- REB-008 API Specification
- REB-009 State Machines

---

# Acceptance Criteria

This specification is complete when:

- Subscription lifecycle is defined.
- Entitlements are documented.
- Expiry behaviour is explicit.
- Business rules are enforceable.
- Payment independence is maintained.

---

# Entitlement Gates the Queue, Not the Workspace

Every rule in this document should be readable against one sentence:
**entitlement gates the moderation queue, never the workspace.**

Drafting, editing, uploading images and preparing a listing are workspace
activities. They produce no marketplace inventory, cost no reviewer time, and
are never entitlement-gated under any circumstance. Submitting for review is
the moment work enters a queue a human has to process, and that is where
entitlement is checked.

"Create" in earlier wording meant publish. BR-SUB-003, BR-SUB-004 and
BR-SUB-005 were reworded around the submission boundary because the original
phrasing could be read either way, and read one way it contradicted ADR-034.

See ADR-034.

---

# Ambiguities Under the Workspace/Queue Principle

Recorded, not reworded. Each of these reads ambiguously against "entitlement
gates the moderation queue, never the workspace", and none was changed here
because the decision belongs to the document owner.

## 1. "Create listings" appears on both sides

The **Subscription Entitlements** list says an active subscription allows an
agent to "Create listings", and the **Subscription Expiry** list says an
expired agent "may no longer: Create new listings".

Under the principle both are wrong as written: creating a draft is a workspace
activity and is never entitlement-gated. BR-SUB-003 now says so explicitly, so
the prose contradicts the rule table. If "create" means publish in both places,
they should say submit.

## 2. BR-SUB-005 now overlaps BR-SUB-002

- BR-SUB-002 — "Expired subscriptions do not remove existing approved listings."
- BR-SUB-005 — "Lapsed entitlement does not remove listings already approved."

These state the same thing. BR-SUB-005 is the broader of the two, because
"entitlement" covers quota as well as subscriptions, so it arguably subsumes
BR-SUB-002 entirely.

## 3. Listing renewal no longer has a rule

BR-SUB-005 previously read "Expired agents cannot renew expired listings" and
now covers a different subject. No rule governs listing renewal any more.

Note that nothing in the system supports the concept: `listing_status` has no
`expired` value — the states are draft, pending_review, approved, rejected,
archived, flagged and under_dispute — and no renewal or republish code path
exists. The "Renew listings" and "Republish eligible listings" entitlements
describe capabilities that have never been built, so the missing rule may be
correct rather than a gap.

## 4. "Republish" is undefined

BR-SUB-004 governs resubmitting an archived listing, but `archived` is
unreachable: no code path sets it. The rule is currently unexercisable.
