---
id: ADR-017-A1
title: Amendment 1 to ADR-017 — Suspension Removes an Agent From View, Not From Their Commitments
category: Architecture Decision Record Amendment
status: Accepted
version: 1.0
owners: Ruvo Engineering
date: 2026
amends:
  - ADR-017 Adopt Manual Agent Verification as the Foundation of Marketplace Trust
  - BR-ADM-006 (Admin & Moderation Domain)
related:
  - ADR-010-A1 Privilege Grants Are Part of the Authorization Boundary
  - ADR-018 Listing Approval Workflow
  - ADR-019-A1 An Inspection Is a Commitment With a Deadline
---

# Amendment 1 to ADR-017 — Suspension Removes an Agent From View, Not From Their Commitments

## Status

Accepted

---

# Context

ADR-017 lists `Suspended` among the verification states. BR-ADM-006 (Critical)
said **"Suspended users lose access immediately."** Neither said what suspension
does, and nothing in the system did what BR-ADM-006 described:

- **No path writes it.** No function or route sets `verification_status =
  'suspended'` or `suspension_reason`. A suspension could only be made by editing
  the database by hand, and could not be undone except the same way, because an
  agent cannot resubmit verification from `suspended`.
- **If set by hand,** it removed the agent's listings and public page from view
  (the verified-agent policy drops them from every public join) and blocked
  submitting a listing for review. Nothing else changed. The agent could still
  sign in, chat, answer and complete inspections, withdraw listings, and **push
  revisions to approved listings into the moderation queue.**
- **The agent was never told why.** The portal showed "Suspended" in four places
  and the reason nowhere. `suspension_reason` is readable by `service_role` only.
- **`users.is_active` exists and nothing reads or writes it.** "Lose access"
  was never implemented at all.

So the rule said one thing, the system did a softer thing by accident, and the
softer thing had one real gap in it.

---

# Decision

**Suspension removes an agent from view and from the moderation queue. It does
not remove them from commitments already made.** BR-ADM-006 is amended to say
so.

## What a suspended agent can no longer do

| | How |
|---|---|
| **Be seen by seekers.** Their listings leave every public surface, and `/a/<handle>` stops resolving. | Already true: `public_can_read_verified_agent_profiles` admits only `verified`, and public listing reads inner-join it. |
| **Submit a listing for review.** | Already true: entitlement requires `verified`. |
| **Submit a revision to a listing.** | **New.** `submit_listing_revision` refuses a `suspended` caller (0044). This closes the gap above: a hidden agent must not keep feeding the moderation queue. It checks `suspended` specifically, not "anything but verified", because a verified agent can only move to suspended, so suspended is the only non-verified status that can hold an approved or rented listing. The broader test would also have refused fixtures modelling an unverified owner, a state production can't reach. |
| **Resubmit verification.** | Already true: `suspended` is not a resubmittable status. |

## What a suspended agent can still do, deliberately

- **Sign in, and use the portal.**
- **Continue every conversation, and answer and complete inspections already
  requested or accepted.**
- **Withdraw a listing, and mark one rented or available.** These only reduce
  what a seeker might be offered.
- **Keep and edit drafts.** A draft reaches nobody, and it cannot be submitted.

## How it is applied, undone, and explained

- **Applied** by `suspend_agent(target, reason)` and **undone** by
  `reinstate_agent(target)`. Both are SECURITY DEFINER, both are gated on
  `assert_caller_moderates`, and both are audited. EXECUTE is granted to no
  client role. Following ADR-010-A1, a governance column changes through a
  function, never through a widened policy.
- **A reason is required,** for the same reason as reject, flag and dispute:
  the agent reads it as written, and a blank one is refused rather than
  replaced with a stock phrase.
- **Reinstatement returns the agent to `verified`, not to `pending_review`.**
  Suspension is a moderation judgement, not a finding that the identity
  documents were wrong. Requiring a fresh submission would make lifting a
  suspension depend on the agent re-uploading documents nobody doubts.
  Reinstating clears the reason.
- **The agent is told,** through `own_agent_suspension_reason()`. It is a
  function, not a column grant, for the same reason as
  `own_agent_rejection_reason()` (see 0027): the grant that would let an agent
  read their own note would let any signed-in user read everyone's. The message
  says what suspension means (hidden from seekers, can't submit, existing
  conversations and inspections continue) and offers the WhatsApp route to a
  person.

## Where an admin does it

From the agent shown on each row of `/admin/listings`. That page gains a small
admin navigation linking it and `/admin/verification`. Until now nothing linked
to the moderation queue at all, and adding a suspension surface behind an
unreachable page would make a second unreachable admin page.

The same page lists **every suspended agent**, with their reason and a
Reinstate button, whether or not they still have a listing in the queue.
Without that, suspending from a queue row would be a one-way door: once the
agent's listings left the queue, there would be no Reinstate button anywhere.

---

# Rationale

**A suspended agent still has seekers depending on them.** There are
conversations in progress and inspections already accepted, with clocks
running (ADR-019-A1). Cutting the agent's access strands those seekers, who
have done nothing wrong. Suspension is a moderation action against an agent,
not against the people who are relying on them.

**It is proportionate.** The agent stops being able to attract new business,
which is the point, without breaking commitments already made. An agent who
needs to be cut off entirely is a different case: fraud, or a safety concern
about the agent themselves. That is account-level disabling, and it is not
this.

**The revision gap is closed because it contradicts the decision.** Revisions
are the one way a hidden agent could keep putting new content in front of
moderators, and eventually back in front of seekers.

---

# Consequences

## Positive

- Suspension can be applied and lifted without touching the database by hand,
  and every change is audited.
- The agent learns what happened, why, what it means for them, and who to ask.

## Negative / known residuals

- **Suspension is only reachable from the listing queue.** An admin can suspend
  an agent who has a listing in `/admin/listings`, and nobody else. The likely
  triggers (a flagged or disputed listing) all put a listing there, but an agent
  with nothing in the queue cannot be suspended from the UI. **The eventual
  answer is an admin agents page** that lists and searches agents.
- **Seekers holding a link to a suspended agent's listing get a 404,** not the
  "no longer available" page, which covers only rented and archived listings.
  This is unchanged by this amendment.
- **`create_inspection_request_with_chat` checks that the listing is approved,
  not that its agent is verified.** A seeker cannot reach a suspended agent's
  listing through the product, but a direct call with a listing id they
  already hold would still create a request. This is recorded, not closed.
- **Account-level disabling (`users.is_active`) stays unbuilt.** It is the
  answer for the "cut off entirely" case above, and nothing reads it yet.

---

# Non-Negotiable Constraints

- No client role holds EXECUTE on `suspend_agent` or `reinstate_agent`, and CI
  asserts it.
- `suspension_reason` stays ungranted to `anon` and `authenticated`. The agent
  reads their own through `own_agent_suspension_reason()` only.
- Every denial test has a positive control (ADR-010-A1).
