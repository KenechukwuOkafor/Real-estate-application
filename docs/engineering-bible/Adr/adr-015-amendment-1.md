---
id: ADR-015-A1
title: Amendment 1 to ADR-015 — Images Are Served by Transformation at Signing Time, Not by Pre-Generated Variants
category: Architecture Decision Record Amendment
status: Accepted
version: 1.0
owners: Ruvo Engineering
date: 2026
amends:
  - ADR-015 Asynchronous Image Processing Pipeline
related:
  - ADR-016 Asynchronous Video Processing
  - ADR-032 Postgres-Backed Job Queue
  - ADR-033 Listing Media Is Private and Served by Signed URL
  - Media Architecture
---

# Amendment 1 to ADR-015 — Images Are Served by Transformation at Signing Time, Not by Pre-Generated Variants

## Status

Accepted

---

# Context

ADR-015 specifies a pipeline that generates responsive variants and thumbnails, stores
them, and serves the derivative matching the requesting device. It was written before
ADR-033 made listing media private, and it assumed variant generation was the only way to
avoid serving originals to clients.

ADR-033 raised a question the original decision could not have answered: whether the
storage provider's image transformation works on privately stored objects, or only on
public buckets. The answer determines whether optimized delivery is a pipeline or a
parameter.

It works on private objects, through the signed-URL path specifically. Transform options
are supplied when the signed URL is created:

```ts
supabase.storage.from('property-images').createSignedUrl(path, 60, {
  transform: { width: 800, height: 600 },
})
```

This makes most of the pipeline unnecessary for images.

---

# Decision

**For images, optimized delivery is a transformation applied at signed-URL creation. Ruvo
does not pre-generate, store, or serve responsive variants.**

The following stages of the ADR-015 pipeline are superseded **for images only**:

- Responsive variant generation
- Thumbnail generation
- Optimization and format conversion as pipeline stages
- Storage of derivatives
- Selection among stored derivatives at delivery time

The following stages **stand unchanged**, because transformation does not perform them:

- MIME validation
- Virus scanning
- EXIF extraction and metadata normalization
- Storage verification

ADR-015's delivery principle is unchanged and now enforced by a different mechanism:
clients still never receive original uploads directly. They receive a signed URL whose
transform parameters are fixed at signing time.

---

# Rationale

## The client cannot alter the transformation

Transform options are embedded in the token attached to the signed URL and cannot be
changed after signing. A recipient cannot rewrite dimensions to force arbitrary renders,
so exposing transformation to clients does not expose a render farm to them. This is the
property that makes serving transformation directly acceptable where an open resizing
endpoint would not be.

## Pricing is per origin image, not per transformation

Billing counts origin images consumed, not transformations produced. Five renditions of one
photograph cost the same as one. This inverts the economics the original ADR assumed:
pre-generating variants multiplies storage without reducing cost, and generating them
lazily has no per-render penalty. Variants would now be a cost centre with no compensating
saving.

## The queue is not needed for image sizing

ADR-032 supplies the mechanism ADR-015 was waiting for, but images no longer need it for
sizing. There is no image work to enqueue at upload time beyond validation and scanning,
and there is no media lane consumer for resizing. The lane remains justified by ADR-016.

## Removing a stage removes its failure modes

A variant pipeline can partially succeed: some renditions written, others not, a record
saying published while a size is missing. Transformation at signing time cannot half-exist —
the derivative is produced on request or the request fails.

---

# What This Does Not Change

- **ADR-016 is unaffected.** Video still requires the full asynchronous pipeline as
  written: transcoding is genuinely long-running, produces artefacts that must be stored,
  and has no serving-time equivalent. The queue's `media` lane exists for it.
- **ADR-033 is unaffected.** Media stays private and is reached only by signed URL. This
  amendment describes what those URLs may additionally carry.
- **ADR-015's asynchronous requirement stands for the stages that remain.** Virus scanning
  in particular must not run in the request.

---

# Consequences

## Positive

- No worker, variant generation, variant storage, or media-lane consumer for images.
- Storage holds one object per image instead of one per rendition.
- New renditions require no backfill; a new size is a new parameter.
- No published-but-incomplete state for images.

## Negative

- **Supabase Pro becomes a hard dependency.** Image transformation is not available on the
  Free plan. Local development is unblocked — the standard Docker Compose stack bundles and
  wires up `imgproxy` — so this can be built against locally, but it cannot ship without a
  paid project. This is a real dependency, not a future consideration.
- Cost scales with distinct origin images at $5 per 1,000 beyond the plan's included 100.
- Delivery is coupled to the storage provider's transformation service. Replacing the
  provider now means replacing image delivery, where pre-generated variants would have
  been portable artefacts.
- First render of a given transformation is slower than serving a stored derivative.

---

# Non-Negotiable Constraints

- Clients never receive original uploads directly.
- Transform parameters are set at signing time by the server, never accepted from the
  client and passed through.
- Virus scanning and MIME validation remain preconditions of publication and remain
  asynchronous.
- Images are not pre-generated into stored variants.

---

# Related Documents

- ADR-015 Asynchronous Image Processing Pipeline
- ADR-016 Asynchronous Video Processing
- ADR-032 Postgres-Backed Job Queue
- ADR-033 Listing Media Is Private and Served by Signed URL
- Media Architecture

---

# AI Implementation Guidance

## Context

An image is stored once. Sizes are produced at signing time by passing `transform` to
`createSignedUrl`, not by a pipeline that writes derivatives.

## Non-Negotiable Rules

- Never generate, store, or serve pre-computed image variants.
- Never accept transform parameters from the client and pass them to the signer. The server
  chooses the rendition; the token then makes it unalterable.
- Never enqueue an image resizing job. There is no consumer, and creating one reintroduces
  the pipeline this amendment removed.
- Never treat virus scanning or MIME validation as superseded. Transformation does not
  perform them.
- Never assume image transformation works on the Free plan. It does not.

## Common Mistakes

- Reading ADR-015's pipeline diagram and building variant generation from it without
  reading this amendment.
- Adding a `media` lane handler for images because the lane exists. It exists for video.
- Assuming a transformed URL is public. It is a signed URL and still expires.
- Treating the bundled local `imgproxy` as evidence the feature is available on the
  deployed plan.

## Definition of Done

One stored object per image, renditions produced by transform options at signing time,
transform parameters chosen server-side, and no variant generation anywhere in the codebase.
