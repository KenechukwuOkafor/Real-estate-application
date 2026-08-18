---
document_id: REB-ARCH-005
title: Media Architecture
version: 1.0.0
status: Active
classification: Canonical
owner: Ruvo Engineering
last_updated:
review_cycle: Quarterly
---

# Media Architecture

## Purpose

The Media Architecture defines how Ruvo stores, validates, processes, optimizes, secures, delivers, and manages all user-uploaded media.

Media includes:

- Property Images
- Property Videos
- Verification Documents
- Profile Photos
- Future Media Types

The architecture is designed for scalability, performance, security, and cost efficiency.

---

# Design Principles

Media is a business asset.

Media must:

- Load quickly.
- Be resilient.
- Be secure.
- Be easy to cache.
- Scale independently of application servers.

Application servers should never permanently store uploaded media.

---

# Supported Media Types

## Property Images

Purpose

Primary listing gallery.

Formats

- JPG
- JPEG
- PNG
- WEBP

Future

- AVIF

---

## Property Videos

Purpose

Walkthrough videos.

Formats

- MP4 (H.264)
- MOV (converted)
- WEBM

Future

- HEVC
- AV1

---

## Verification Documents

Private.

Examples

- Government ID
- CAC
- Utility Bill
- Agency License

Never publicly accessible.

---

## Profile Images

Agent profile photos.

Public after approval.

---

# Storage Provider

MVP

Supabase Storage

Buckets

property-images

property-videos

verification-documents

profile-images

system-assets

Each bucket has independent security policies.

---

# Image Upload Flow

```
Browser

↓

Client Validation

↓

Signed Upload URL

↓

Supabase Storage

↓

Metadata Validation

↓

Image Processing

↓

Thumbnail Generation

↓

Database Record

↓

Listing Gallery
```

---

# Video Upload Flow

```
Browser

↓

Chunk Upload

↓

Temporary Storage

↓

Validation

↓

Compression

↓

Thumbnail Extraction

↓

Metadata Extraction

↓

Permanent Storage

↓

Database Update
```

---

# Upload Limits

## Images

Minimum

3 images

Maximum

10 images

Maximum size

10 MB each

Recommended resolution

1920px longest side

---

## Videos

Minimum

0

Maximum

1 (MVP)

Maximum duration

90 seconds

Maximum size

150 MB

Recommended resolution

1080p

Target bitrate

≈5–8 Mbps

Videos longer than the limit are rejected.

---

# Image Processing Pipeline

Every uploaded image should be processed.

Pipeline

Original Upload

↓

Virus Scan (future)

↓

Metadata Extraction

↓

Orientation Fix (EXIF)

↓

Resize

↓

Compression

↓

WEBP Generation

↓

Thumbnail Generation

↓

Store Variants

---

# Generated Variants

Original

Thumbnail (300px)

Medium (800px)

Large (1600px)

Future

AVIF

---

# Video Processing Pipeline

Original Upload

↓

Metadata Extraction

↓

Duration Validation

↓

Codec Validation

↓

Resolution Validation

↓

Compression

↓

Thumbnail Extraction

↓

Preview Clip (future)

↓

Store

---

# Metadata

Images

Width

Height

Format

File Size

Upload Date

Checksum

---

Videos

Duration

Resolution

Frame Rate

Codec

Bitrate

File Size

Thumbnail

Checksum

---

# Naming Convention

Files never use original filenames.

Example

UUIDv7.ext

Example

01982dfb.webp

01982dfb.mp4

This prevents collisions.

---

# Gallery Rules

Listings require:

Minimum

3 images

Maximum

10 images

Optional

1 walkthrough video

Images always appear before videos.

Gallery order:

Primary Image

↓

Additional Images

↓

Video

---

# Listing Cover

Exactly one image is the cover.

Changing the cover never changes file storage.

Only metadata.

---

# Media Visibility

Property Images

Public after listing approval.

---

Property Videos

Public after listing approval.

---

Verification Documents

Private.

Never publicly accessible.

---

Profile Images

Public.

---

# Delivery

> **Superseded by ADR-033 for listing media.**
>
> The position below — that media is served through CDN-backed public URLs,
> with signed URLs reserved for private assets — no longer holds. All listing
> media is stored privately and served through short-lived signed URLs
> generated at render time.
>
> The reason is that a public bucket cannot express a moderation decision. An
> image uploaded to a listing that was never approved, or was later rejected,
> remained retrievable by URL indefinitely. "Public after listing approval"
> below describes the intended semantics correctly; a public bucket simply
> could not enforce them.
>
> What is genuinely lost is CDN edge caching, which is why signed-URL lifetime
> became a deliberate decision rather than an implementation detail. See
> ADR-033 for the lifetimes and their reasoning.

Media is served through CDN-backed public URLs.

Private assets use signed URLs.

---

# Caching

Images

Long cache lifetime.

Videos

Long cache lifetime.

Private files

No public caching.

---

# Deletion Policy

Deleting a listing:

Soft deletes database records.

Media remains until cleanup jobs execute.

---

Cleanup jobs remove:

Orphaned images

Orphaned videos

Expired uploads

Unused thumbnails

---

# Duplicate Detection

Future releases may detect duplicate media using perceptual hashing.

The MVP stores uploads without duplicate analysis.

---

# Accessibility

Images require optional alt text.

Videos may include captions in future releases.

---

# Business Rules

| Rule ID | Rule | Severity |
|----------|------|----------|
| BR-MEDIA-001 | Listings require at least three images. | Critical |
| BR-MEDIA-002 | Listings may contain at most one video in the MVP. | High |
| BR-MEDIA-003 | Verification documents remain private. | Critical |
| BR-MEDIA-004 | Original filenames are never stored publicly. | High |
| BR-MEDIA-005 | Media processing occurs asynchronously. | High |
| BR-MEDIA-006 | Cover image must always exist while a listing is active. | Critical |

---

# Failure Modes

Examples

- Upload interrupted.
- Corrupt image.
- Unsupported codec.
- Failed compression.
- Thumbnail generation failure.
- Storage quota exceeded.
- Duplicate upload.
- Processing timeout.

User-facing errors should be clear and recoverable.

---

# Future Enhancements

- Multiple property videos.
- 360° photos.
- Virtual tours.
- Drone footage.
- Adaptive bitrate streaming (HLS/DASH).
- AI image enhancement.
- AI blur detection.
- AI quality scoring.
- Automatic watermarking.
- Automatic NSFW detection.
- Video transcription.
- Video chapter generation.
- 3D property walkthroughs.

---

# Related Documents

REB-ARCH-001 Database Specification

REB-ARCH-003 API Specification

REB-SEC-001 Security Architecture

REB-DOM-001 Listings

---

# Acceptance Criteria

This specification is complete when:

- Media types are defined.
- Upload limits are documented.
- Processing pipelines are specified.
- Security rules are explicit.
- Delivery architecture is defined.
