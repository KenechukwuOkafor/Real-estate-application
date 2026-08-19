# Ruvo API Contracts

## Principles

- All responses are JSON unless explicitly serving metadata or images.
- Public listing endpoints are readable without authentication.
- Authenticated endpoints require Clerk session validation.
- Authorization is enforced in backend logic after authentication.
- Pagination is cursor-based by default for collection endpoints.
- Soft-deleted records are excluded unless the endpoint is explicitly administrative.

## Base Conventions

### Success Envelope

```json
{
  "data": {},
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

### Error Envelope

```json
{
  "error": {
    "code": "LISTING_NOT_FOUND",
    "message": "Listing not found.",
    "details": null
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

### Cursor Pagination Envelope

```json
{
  "data": [],
  "pagination": {
    "nextCursor": "eyJpZCI6Ii4uLiJ9",
    "hasMore": true,
    "limit": 20
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

## HTTP Status Rules

- `200` success
- `201` created
- `400` invalid request
- `401` unauthenticated
- `403` unauthorized
- `404` not found
- `409` conflict
- `422` semantic validation failure
- `429` rate limited
- `500` internal error

## Error Codes

Common codes:
- `UNAUTHENTICATED`
- `UNAUTHORIZED`
- `VALIDATION_ERROR`
- `RATE_LIMITED`
- `NOT_FOUND`
- `CONFLICT`
- `INTERNAL_ERROR`

Domain codes:
- `LISTING_NOT_FOUND`
- `LISTING_NOT_PUBLIC`
- `LISTING_STATE_TRANSITION_INVALID`
- `LISTING_DUPLICATE_DETECTED`
- `LISTING_IMAGE_COUNT_INVALID`
- `AGENT_NOT_VERIFIED`
- `SUBSCRIPTION_REQUIRED`
- `INSPECTION_REQUEST_EXPIRED`
- `CHAT_ACCESS_DENIED`
- `REPORT_TARGET_NOT_FOUND`

## Public Endpoints

## `GET /api/listings`

Returns public approved listings.

Query params:
- `cursor`: opaque string
- `limit`: integer, default `20`, max `50`
- `sort`: `newest` or `price_asc` or `price_desc`
- `area`: string
- `city`: string
- `state`: string
- `propertyType`: enum
- `bedrooms`: integer
- `minPrice`: integer
- `maxPrice`: integer
- `verifiedOnly`: boolean

Response `200`:

```json
{
  "data": [
    {
      "id": "listing_uuid",
      "publicId": "public_uuid",
      "slug": "clean-self-contain-okwuoji",
      "title": "Clean Self Contain in Okwuoji",
      "propertyType": "self_contain",
      "priceNaira": 250000,
      "bedrooms": 1,
      "bathrooms": 1,
      "area": "Okwuoji",
      "city": "Nsukka",
      "state": "Enugu",
      "coverImageUrl": "https://...",
      "agent": {
        "displayName": "Prime Homes",
        "isVerified": true
      },
      "approvedAt": "2026-03-27T12:00:00.000Z"
    }
  ],
  "pagination": {
    "nextCursor": "opaque_cursor",
    "hasMore": true,
    "limit": 20
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

Rules:
- returns approved, non-deleted, non-hidden listings only
- default sort is `newest`
- `verifiedOnly=true` restricts results to verified agents

## `GET /api/listings/:slugOrPublicId`

Returns public listing detail. The route should support slug lookup and slug plus public UUID resolution internally.

Response `200`:

```json
{
  "data": {
    "id": "listing_uuid",
    "publicId": "public_uuid",
    "slug": "clean-self-contain-okwuoji",
    "title": "Clean Self Contain in Okwuoji",
    "description": "Structured listing description.",
    "status": "approved",
    "propertyType": "self_contain",
    "priceNaira": 250000,
    "bedrooms": 1,
    "bathrooms": 1,
    "area": "Okwuoji",
    "city": "Nsukka",
    "state": "Enugu",
    "country": "Nigeria",
    "latitude": 6.856,
    "longitude": 7.395,
    "amenities": ["water", "tiled_floor"],
    "videoUrl": null,
    "images": [
      {
        "id": "image_uuid",
        "url": "https://...",
        "position": 0,
        "isCover": true
      }
    ],
    "agent": {
      "id": "agent_uuid",
      "displayName": "Prime Homes",
      "isVerified": true
    },
    "share": {
      "canonicalUrl": "https://app.example.com/listings/clean-self-contain-okwuoji--public_uuid"
    },
    "approvedAt": "2026-03-27T12:00:00.000Z"
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

Response `404`:
- listing does not exist

Response `410` optional:
- listing existed but is no longer available

## `POST /api/listings/:id/views`

Tracks a listing view.

Request body:

```json
{
  "sessionId": "anon_session_optional",
  "referrer": "https://google.com"
}
```

Response `201`:

```json
{
  "data": {
    "tracked": true
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

## Authenticated User Endpoints

## `POST /api/saved-listings`

Request body:

```json
{
  "listingId": "listing_uuid"
}
```

Response `201`:

```json
{
  "data": {
    "saved": true
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

## `DELETE /api/saved-listings/:listingId`

Response `200`:

```json
{
  "data": {
    "saved": false
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

## `POST /api/inspection-requests`

Creates an inspection request and, when successful, a related chat.

Request body:

```json
{
  "listingId": "listing_uuid",
  "message": "I want to inspect this property tomorrow."
}
```

Response `201`:

```json
{
  "data": {
    "inspectionRequest": {
      "id": "inspection_uuid",
      "status": "requested",
      "expiresAt": "2026-03-29T12:00:00.000Z"
    },
    "chat": {
      "id": "chat_uuid"
    }
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

Validation:
- listing must be public and approved
- requester cannot be the listing owner
- rate limit applies

## `POST /api/reports`

Request body:

```json
{
  "targetType": "listing",
  "targetId": "target_uuid",
  "reason": "Price appears misleading."
}
```

Response `201`:

```json
{
  "data": {
    "id": "report_uuid",
    "status": "open"
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

## Agent Endpoints

## `POST /api/agent/listings`

Creates a draft listing.

Request body:

```json
{
  "title": "Clean Self Contain in Okwuoji",
  "description": "Structured description",
  "propertyType": "self_contain",
  "priceNaira": 250000,
  "bedrooms": 1,
  "bathrooms": 1,
  "area": "Okwuoji",
  "city": "Nsukka",
  "state": "Enugu",
  "latitude": 6.856,
  "longitude": 7.395,
  "amenities": ["water", "tiled_floor"]
}
```

Response `201`:

```json
{
  "data": {
    "id": "listing_uuid",
    "status": "draft"
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

Rules:
- authenticated user must have `agent` role
- drafts may be created before verification

## `PATCH /api/agent/listings/:id`

Updates a draft or rejected listing that the agent owns. Send only the fields to change.

Request body (all fields optional):

```json
{
  "title": "Updated title",
  "description": "Updated description",
  "propertyType": "self_contain",
  "priceNaira": 280000,
  "bedrooms": 1,
  "bathrooms": 1,
  "area": "Okwuoji",
  "city": "Nsukka",
  "state": "Enugu",
  "latitude": 6.856,
  "longitude": 7.395,
  "amenities": ["water", "tiled_floor"]
}
```

Response `200`:

```json
{
  "data": {
    "id": "listing_uuid",
    "status": "draft"
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

Validation:
- listing must be in `draft` or `rejected` state
- agent must own the listing
- merged field values are validated against all listing content rules

## `POST /api/agent/listings/:id/images`

Registers uploaded listing images after storage upload completes.

Request body:

```json
{
  "images": [
    {
      "storagePath": "listings/123/cover.webp",
      "publicUrl": "https://...",
      "position": 0,
      "mimeType": "image/webp",
      "sizeBytes": 120300
    }
  ]
}
```

Response `201`:

```json
{
  "data": {
    "count": 3
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

Validation:
- max 10 active images

## `POST /api/agent/listings/:id/submit`

Submits a draft for review.

Response `200`:

```json
{
  "data": {
    "id": "listing_uuid",
    "status": "pending_review"
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

Validation:
- agent must be verified
- active subscription or founding-agent quota must allow submission
- minimum 3 images
- duplicate detection must pass or send for review flow

## `GET /api/agent/listings`

Returns listings owned by the authenticated agent.

Query params:
- `status`
- `cursor`
- `limit`

## `POST /api/agent/verification-submissions`

Creates or resubmits a verification request.

Request body:

```json
{
  "fullLegalName": "Agent Name",
  "notes": "Optional explanation",
  "documents": [
    {
      "type": "id_card",
      "url": "https://..."
    }
  ]
}
```

Response `201`:

```json
{
  "data": {
    "status": "pending_review"
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

## Chat Endpoints

## `GET /api/chats`

Returns chats for the authenticated user.

## `GET /api/chats/:id/messages`

Returns messages for a chat using cursor pagination.

## `POST /api/chats/:id/messages`

Request body:

```json
{
  "body": "Hello, is this still available?"
}
```

Response `201`:

```json
{
  "data": {
    "id": "message_uuid",
    "body": "Hello, is this still available?",
    "createdAt": "2026-03-27T12:00:00.000Z"
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

Validation:
- sender must be a participant in the chat
- rate limit applies
- empty messages are rejected

## Admin Endpoints

## `GET /api/admin/listings`

Returns moderated listing queue.

Query params:
- `status`
- `cursor`
- `limit`

## `POST /api/admin/listings/:id/approve`

Response `200`:

```json
{
  "data": {
    "id": "listing_uuid",
    "status": "approved"
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

## `POST /api/admin/listings/:id/reject`

Request body:

```json
{
  "reason": "Duplicate listing detected."
}
```

## `POST /api/admin/listings/:id/flag`

Request body:

```json
{
  "reason": "Ownership mismatch."
}
```

## `POST /api/admin/listings/:id/dispute`

Request body:

```json
{
  "reason": "Competing ownership claim received."
}
```

## `POST /api/admin/agents/:id/verify`

Response `200`:

```json
{
  "data": {
    "id": "agent_uuid",
    "verificationStatus": "verified"
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

## `POST /api/admin/agents/:id/reject`

Request body:

```json
{
  "reason": "Document mismatch."
}
```

## `GET /api/admin/reports`

Returns report moderation queue.

## Pagination Format

Opaque cursor contract:

```json
{
  "sort": "newest",
  "lastValue": "2026-03-27T12:00:00.000Z",
  "lastId": "uuid"
}
```

Rules:
- clients treat cursor as opaque
- server may base64 encode the payload
- stable secondary sort by `id` is required

## Validation Rules

- all write endpoints validate body shape at the edge
- business rules are validated in the service layer
- database constraints are the final integrity layer

## API Versioning

- start with unversioned internal API under `/api`
- introduce `/api/v1` only when backward compatibility becomes necessary
