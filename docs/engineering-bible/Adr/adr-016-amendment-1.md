---
id: ADR-016-A1
title: Amendment 1 to ADR-016 — Video Is Captured Under a Client-Side Budget, Not Accepted at the Server Ceiling
category: Architecture Decision Record Amendment
status: Accepted
version: 1.0
owners: Ruvo Engineering
date: 2026
amends:
  - ADR-016 Asynchronous Video Processing
related:
  - ADR-015 Asynchronous Image Processing Pipeline
  - ADR-015-A1 Images Are Served by Transformation at Signing Time
  - ADR-032 Postgres-Backed Job Queue
  - Media Architecture
---

# Amendment 1 to ADR-016 — Video Is Captured Under a Client-Side Budget, Not Accepted at the Server Ceiling

## Status

Accepted

---

# What This Amends

ADR-016's decision is unchanged: all uploaded videos enter an asynchronous
processing pipeline, and become available only after processing succeeds.

What changes is the **input contract**. ADR-016 and the Media Architecture
specify what the server will accept — 90 seconds, 150 MB, 1080p, a target
bitrate of 5–8 Mbps — and say nothing about what the client should produce. In
the absence of that, the acceptance ceiling becomes the de facto target, because
it is the only number written down.

That ceiling was written for a broadband upload. It is unusable on the network
the people who will use it are actually on.

---

# Context

Ruvo's agents are in Nsukka, on mid-range Android phones, on MTN, Airtel or Glo
mobile data. That is not an edge case to degrade gracefully for; it is the
entire user base.

Take a conservative planning figure of **1.5 Mbps sustained uplink** — Nigerian
4G under load, indoors, or at the edge of a cell, with 3G fallback lower still.
Against the current ceiling:

| Upload | Size | Time at 1.5 Mbps |
|---|---|---|
| Current ceiling | 150 MB | **≈ 13 minutes** |
| 1080p at 5 Mbps for 90s | ≈ 56 MB | ≈ 5 minutes |

Thirteen minutes of sustained mobile upload does not complete. It is interrupted
by a call, a signal drop, an app backgrounding, or a screen lock — and a
single-request upload that fails at 80% starts again from zero.

The data cost is real but secondary. At Nigerian bundle pricing of roughly
₦0.30–₦1.00 per MB, 150 MB is on the order of **₦45–₦150 per attempt**. That
matters, and it is not the thing that kills the feature. The thing that kills
the feature is that the attempt does not finish.

An agent who loses a thirteen-minute upload twice does not try a third time.
They stop using the feature, and on a product whose whole proposition is trust,
they may stop trusting the product.

---

# Decision

## 1. Two capture paths, one of them encouraged

Both are supported:

- **Record in-app.** The encouraged path, and the one the interface should make
  obviously primary.
- **Upload from gallery.** The fallback, for an agent who already shot the
  walkthrough before opening the app.

Recording in-app is preferred because it is the only path where the capture
parameters can be set rather than discovered. A gallery file is whatever the
phone's camera app produced, which on a modern mid-range Android is frequently
1080p or 4K at a bitrate nobody chose.

## 2. Client-side compression is a requirement, not an optimisation

**Every video is compressed on the device before upload, on both paths.** A
gallery file is transcoded down to the capture budget before a single byte
leaves the phone.

This is stated as a requirement because an optimisation is something that can be
deferred, and deferring this one produces a feature that ships and is not used.

## 3. The capture budget is separate from the acceptance ceiling

| | Value | Purpose |
|---|---|---|
| **Capture duration** | **60 seconds** | What the app records or trims to |
| **Capture resolution** | **720p (1280×720), 30fps** | Downscale anything larger |
| **Capture bitrate** | **≈2 Mbps video, 96 kbps AAC audio** | |
| **Nominal output** | **≈16 MB** | What a normal walkthrough weighs |
| **Client hard ceiling** | **25 MB** | Re-encode at 540p rather than upload above this |
| **Server acceptance** | **150 MB** | Unchanged — a safety rail, never a target |

The arithmetic behind the budget, so it can be re-derived rather than trusted:
90 seconds is the longest an agent should wait for an upload; at 1.5 Mbps that
is ≈16 MB. A 60-second clip at ≈2.1 Mbps combined lands at ≈15.7 MB, which
uploads in about 85 seconds on that link and roughly 40 on a good one.

**The application must not be capable of producing a file near the server
ceiling.** If it can, the ceiling is a target again.

## 4. Sixty seconds rather than ninety

The duration cap drops from 90 seconds to 60.

At 90 seconds the bitrate has to fall to ≈1.4 Mbps to stay inside the budget,
which looks poor on the pans and slow movement a walkthrough is made of. At 60
seconds there is room for ≈2 Mbps and a picture worth watching.

It is also the better product constraint. A 60-second walkthrough is edited by
necessity; a 90-second one often is not. And a failed upload costs a third less
to retry.

## 5. Resumable upload is table stakes

Uploads are **chunked and resumable** — a dropped connection resumes rather than
restarts.

This is not a refinement to add later. On this network, at any file size, a
non-resumable upload is a coin flip, and the smaller budget above reduces the
odds of needing a resume without removing it.

---

# Consequences

## Positive

- The feature is usable by the people it is for.
- Upload time drops from ≈13 minutes to ≈85 seconds on a conservative link.
- Per-attempt data cost falls by roughly an order of magnitude.
- A dropped connection stops being a total loss.
- Server-side transcoding gets a smaller, more predictable input.

## Negative

- Client-side compression costs battery and time on the agent's device before
  the upload starts. They pay for the bytes either way, so this is a shift
  rather than an addition — but it is a visible one.
- Two capture paths is more UI than one.
- Resumable upload means a chunked protocol (tus, or a vendor SDK) rather than a
  single signed PUT, which is the same shape image upload uses today.
- 720p is visibly softer than 1080p on a desktop. Accepted: the viewer is on a
  phone too.

---

# Non-Negotiable Constraints

- The application never produces a file near the server acceptance ceiling.
- Client-side compression happens on both capture paths, never only on one.
- The acceptance ceiling is a safety rail and is never presented to an agent as
  a target or a capability.
- Upload is resumable.
- Capture limits are configuration, not constants in the encoder call site, so
  they can be tuned against real telemetry without a deploy.

---

# Open Questions

- What is the real uplink distribution for our agents? The 1.5 Mbps figure is a
  defensible planning assumption, not a measurement. The first deployment should
  record actual upload throughput and duration so these numbers can be replaced
  with evidence.
- Does 720p/60s hold up for larger properties, where a walkthrough may genuinely
  need longer?
- Should a failed upload retain the compressed local file for a later retry over
  Wi-Fi?
