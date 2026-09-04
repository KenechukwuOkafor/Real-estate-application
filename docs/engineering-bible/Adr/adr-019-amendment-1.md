---
id: ADR-019-A1
title: Amendment 1 to ADR-019 — An Inspection Is a Commitment With a Deadline, Not a Scheduled Appointment
category: Architecture Decision Record Amendment
status: Accepted
version: 1.0
owners: Ruvo Engineering
date: 2026
amends:
  - ADR-019 Adopt Property Inspection as an Independent Business Workflow
related:
  - ADR-010 Row Level Security as a First-Class Authorization Layer
  - ADR-010-A1 Privilege Grants Are Part of the Authorization Boundary
  - ADR-011 Comprehensive Audit Logging
  - REB-DOM-004 Inspection Domain Specification
---

# Amendment 1 to ADR-019 — An Inspection Is a Commitment With a Deadline, Not a Scheduled Appointment

## Status

Accepted

---

# Context

ADR-019 names the lifecycle `Requested → Pending Confirmation → Confirmed → Completed` and
assigns the Inspection domain "Scheduling", "Confirmation", "Rescheduling" and
"Cancellation". None of that was ever built. The code writes `accepted` and `declined`,
there has never been a scheduled-time column, and REB-DOM-004 already says the opposite in
plain words: *"The platform facilitates introductions but does not participate in
inspection scheduling beyond the tools provided."*

So the canonical record contained a contradiction, and only one side of it described the
product. That was tolerable while the second half of the lifecycle did not exist. Building
it made the contradiction load-bearing: anyone implementing "Completed" from ADR-019 would
first have implemented a confirmation step and a scheduled time, because ADR-019 says the
domain owns them.

The referenced state-transition document, REB-009, is cited by four domain specifications
and does not exist in the repository. There was no canonical transition table to consult.

---

# Decision

An inspection is a **commitment with a deadline**, not an appointment at a time.

The lifecycle is:

```
requested ──(48 hours, expires_at)──> [expired]
    │
    └─ accepted ──(4 days, completion_deadline)──> [lapsed]
           │
           └─ completed        (terminal)

requested ──> declined         (terminal)

requested ──> cancelled        (terminal, the seeker's own act)
accepted  ──> cancelled        (terminal, the seeker's own act)
```

Square brackets mark states that are **derived at read time and never stored**.

- Accepting fixes a four-day deadline by which the agent must mark the inspection
  complete. Four days is an outer bound, not a waiting period: the same hour is fine.
- Marking complete is the agent's act alone. The seeker is not asked to confirm.
- An accepted inspection never marked has **lapsed**.
- The **seeker** may withdraw from either live state. Cancelling is not lapsing: a
  cancelled row is not accepted, so no completion window runs against it.
- There is no scheduled time, no slot, no negotiation and no rescheduling. The parties
  agree when and where in the chat or outside the app.

"Pending Confirmation", "Confirmed", "Rescheduling" and "Scheduling" are struck from
ADR-019. `Confirmed` was only ever a name for `accepted`.

---

# Rationale

## A deadline is not an appointment

Nothing here must be honoured *at* a time, only *by* one. That single distinction removes
the scheduled-time column, the date picker, the slot negotiation, the reschedule flow and
the timezone question with it. The platform states the commitment and its deadline; the
people arrange the rest, which is what they were doing anyway.

## A derived state cannot be forged, drift, or be half-written

`lapsed` is not in `public.inspection_status` and never will be. Nothing writes it: a
lapsed inspection is an accepted row whose `completion_deadline` has passed with
`completed_at` still null, computed when somebody looks. Storing it would require something
to run at the instant it became true, which is a scheduler this project does not have — and
a stored copy is a copy that can disagree with the rule.

This mirrors the 48-hour response window, which has always been read-time. Two live defects
came from reading the stored `status` instead of the rule, and both are recorded in
`src/features/inspections/expiry.ts`.

## Two windows, one definition

The windows differ only in which column carries the deadline and what the miss is called,
so they are one table in one module rather than two functions. A second
`isLapsed()` beside `isAwaitingResponse()` is precisely the shape the earlier defects had.

## A derived state should be a type the database cannot produce

This is the general principle, and it is worth stating apart from inspections.

When a state is derived and never stored, model it as a type the database cannot
produce, and let the compiler enumerate every surface that owes it a decision.

Concretely: `public.inspection_status` is `StoredInspectionStatus`, and what a reader gets
back is `InspectionStatus = StoredInspectionStatus | "lapsed"`. The two vocabularies are
deliberately different types. Any write path is checked against the first, so `lapsed` can
never be handed to something that writes; every label map, badge and branch is checked
against the second, so none of them can ship without deciding what a lapse looks like.

**This is a stronger guarantee than a test, because it cannot be forgotten.** A test covers
the surfaces somebody thought of on the day. An exhaustive union covers the surface that
gets added next year by someone who never read this document — they cannot compile without
answering the question.

It is not theoretical. The constraint "a lapse does not close the chat" was written into
this amendment before the code existed, by the person who then failed to notice that
`listCurrentAgentInspectionRequests` gated both the unread-message count and the
"Open chat" link on `effectiveStatus === "accepted"`. The moment `lapsed` became its own
state, that gate would have hidden the conversation and stopped counting messages in it —
closing the chat in all but name, in the exact slice that forbade doing so. Nothing caught
it by inspection. Widening the union produced a type error at both call sites, which is
what caught it, and `conversationExists` is the fix.

The lesson generalises past this domain: a derived state added to the same type as the
stored ones buys a smaller diff and pays for it by making every consumer's omission
invisible.

## Withdrawal belongs to the seeker, and only the seeker

A seeker who accepts a visit and then cannot attend must be able to say so. Without that,
their only exit is silence, and silence on an accepted inspection is a **lapse** — recorded,
and countable against an agent who did nothing wrong. The absence of a cancel path did not
merely inconvenience the seeker; it corrupted the one signal the completion window was
introduced to keep.

Agents have no equivalent, deliberately. An agent who accepted and cannot attend says so in
the chat. A one-tap withdrawal would weaken the commitment that accepting is meant to make,
and it would double as a way to clear a lapse on day four — the record would then measure
who remembered to press a button, not who turned up.

**The cost of that, stated rather than hidden:** an agent who withdraws honestly takes the
same lapse as one who simply went silent. That is a perverse incentive, and it is real. It
is also, today, a defect in what the lapse *count* can distinguish rather than a missing
button — and nothing reads that count yet. When something does, "the agent said they could
not make it" must become distinguishable from "the agent said nothing", and the answer at
that point is a richer signal, not a cancel button that erases the record.

## The grant was the real decision

Migration 0012 granted the owning agent `update (status, responded_at, updated_at)`. RLS
governs *which row*, never *which value*, so the owning agent could `PATCH` `status`
directly through PostgREST — to `completed`, on a request nobody accepted, at any time. A
four-day window layered above that grant would have been decorative.

`status` on `inspection_requests` is governance in the same sense as `listings.status`
(ADR-010-A1): the privilege that writes `accepted` is the privilege that writes
`completed`. Migration 0030 revokes UPDATE entirely and routes both transitions through
SECURITY DEFINER functions. Moving accept/decline was not optional — it wrote `status`
through that same grant.

---

# What This Does Not Change

- **BR-INSP-006**, inspection requests are immutable once completed. Previously true only
  as an absence, since nothing wrote `completed` at all; now enforced by a trigger that
  holds for every caller, service role included.
- **The chat's independent lifetime.** A lapse does not close the conversation and must
  never be made to. The likeliest reason a mark was never made is that the visit was
  rearranged in that very thread.
- **The 48-hour response window**, unchanged in duration and mechanism.

---

# Consequences

## Negative, stated plainly

- **A lapse cannot be notified.** Nothing happens at the instant it becomes true, so there
  is no event to hang a message on. ADR-019's "Missed appointments" metric and any
  notification of one are unmeasurable by construction, and are struck.
- **`expired` remains a vestigial enum value.** It is derived and can now never be written,
  while its twin `lapsed` deliberately has no enum value at all — which makes `expired` the
  odd one out rather than a precedent. Removing an enum value costs more than the confusion
  it saves, so it stays as a fossil.
- **The four days live in SQL; the words live in TypeScript.** Two places for one number,
  accepted because only one of them is enforcement.
- **Clock skew is visible.** The UI derives `lapsed` from Node's clock and the function
  enforces with Postgres's, so a user can see time remaining and still be refused. The
  database is authoritative; the refusal copy is written to be plain rather than accusing.

## Positive

- Completion and lapse are countable per agent from day one, by query, with nothing
  written and no metric exposed. The data exists when there is enough of it to be fair
  with, which a reliability score built on three inspections would not be.

---

# Non-Negotiable Constraints

- Never add `lapsed` to `public.inspection_status`. It is derived; keeping it out of the
  enum is what makes the type split above work, and the type split is what makes every
  consumer decide.
- Never collapse `StoredInspectionStatus` and `InspectionStatus` into one type to quiet a
  cast. The cast is the point at which the two vocabularies meet, and it belongs in the
  expiry module alone.
- Never write a row — audit, status or otherwise — on *observing* a lapse. Reads stay reads.
- Never derive the completion deadline from `responded_at`. It is stored so that changing
  the policy cannot move deadlines on inspections already in flight.
- Never grant `status`, `completed_at` or `completion_deadline` to any client role.
- Never add a scheduled-time column, a date picker, or slot negotiation.
- A lapse never closes a chat and never produces a seeker-facing score or badge.
- Never give agents a cancel path that clears a lapse. If honest withdrawal needs
  recognising, it is recorded as its own fact — it does not erase the record.
- Cancelling must never be counted as a lapse. It is free today because a cancelled row
  leaves the accepted state; keep it that way.
- Seeker-facing copy for a lapse names the agent's silence. It never blames the seeker, and
  it never claims the inspection did not happen — nobody knows that.

---

# AI Implementation Guidance — Common Mistakes

- Reading ADR-019's original lifecycle diagram and building a confirmation step or a
  scheduled time. It describes a product that was never built; this amendment governs.
- Adding a cron or background job to sweep lapses into the database.
- Reading `inspection_requests.status` instead of `effectiveInspectionStatus`. The column
  is stale by design.
- Extending a deadline to be helpful. It is write-once, enforced by trigger.
- Adding a reliability percentage because completion is now tracked. Tracking it and
  showing it are separate decisions, and only the first has been taken.
