# Ruvo Schema

## Notes

- Data types are written for Postgres.
- `id` columns use UUID.
- Every core table includes timestamps.
- Every core business table supports soft delete via `deleted_at`.
- `updated_at` should be maintained by trigger or application layer.
- `created_by` and `updated_by` fields are added where auditability matters.

## Enums

### `app_role`

- `student`
- `agent`
- `admin`

### `listing_status`

- `draft`
- `pending_review`
- `approved`
- `rejected`
- `archived`
- `flagged`
- `under_dispute`

### `property_type`

- `self_contain`
- `1_bedroom`
- `2_bedroom`
- `3_bedroom`
- `shop`
- `lodge_room`

### `agent_verification_status`

- `not_submitted`
- `pending_review`
- `verified`
- `rejected`
- `suspended`

### `subscription_plan`

- `basic`
- `pro`
- `enterprise`

### `subscription_status`

- `active`
- `expired`
- `cancelled`
- `grace_period`

### `inspection_status`

- `requested`
- `responded`
- `expired`
- `cancelled`
- `completed`

### `chat_type`

- `inspection`
- `support`

### `report_target_type`

- `listing`
- `agent`
- `message`

### `report_status`

- `open`
- `under_review`
- `resolved`
- `dismissed`

### `notification_channel`

- `in_app`
- `email`

## Tables

## `users`

Canonical app user record synced from Clerk.

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `clerk_user_id` | `text` | not null, unique |
| `email` | `citext` | not null, unique |
| `full_name` | `text` | null |
| `avatar_url` | `text` | null |
| `phone_number` | `text` | null |
| `is_active` | `boolean` | not null default true |
| `last_seen_at` | `timestamptz` | null |
| `created_at` | `timestamptz` | not null default now() |
| `updated_at` | `timestamptz` | not null default now() |
| `deleted_at` | `timestamptz` | null |

Indexes:
- unique index on `clerk_user_id`
- unique index on `email` where `deleted_at is null`

## `user_roles`

Supports one account with multiple roles.

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `user_id` | `uuid` | not null, references `users(id)` |
| `role` | `app_role` | not null |
| `created_at` | `timestamptz` | not null default now() |

Constraints:
- unique (`user_id`, `role`)

Indexes:
- index on `user_id`
- index on `role`

## `agent_profiles`

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `user_id` | `uuid` | not null, unique, references `users(id)` |
| `display_name` | `text` | not null |
| `bio` | `text` | null |
| `verification_status` | `agent_verification_status` | not null default `not_submitted` |
| `verification_submitted_at` | `timestamptz` | null |
| `verified_at` | `timestamptz` | null |
| `verified_by` | `uuid` | null, references `users(id)` |
| `rejection_reason` | `text` | null |
| `suspension_reason` | `text` | null |
| `founding_agent` | `boolean` | not null default false |
| `free_listing_quota` | `integer` | not null default 0 check (`free_listing_quota >= 0`) |
| `created_at` | `timestamptz` | not null default now() |
| `updated_at` | `timestamptz` | not null default now() |
| `deleted_at` | `timestamptz` | null |

Indexes:
- index on `verification_status`
- index on `founding_agent`

## `subscriptions`

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `agent_profile_id` | `uuid` | not null, references `agent_profiles(id)` |
| `plan` | `subscription_plan` | not null |
| `status` | `subscription_status` | not null |
| `starts_at` | `timestamptz` | not null |
| `expires_at` | `timestamptz` | not null |
| `cancelled_at` | `timestamptz` | null |
| `provider` | `text` | not null default `paystack` |
| `provider_reference` | `text` | null, unique |
| `metadata` | `jsonb` | not null default `'{}'::jsonb` |
| `created_at` | `timestamptz` | not null default now() |
| `updated_at` | `timestamptz` | not null default now() |
| `deleted_at` | `timestamptz` | null |

Indexes:
- index on `agent_profile_id`
- index on (`status`, `expires_at`)

## `listings`

This is the core marketplace table.

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `public_uuid` | `uuid` | not null, unique |
| `agent_profile_id` | `uuid` | not null, references `agent_profiles(id)` |
| `status` | `listing_status` | not null default `draft` |
| `title` | `text` | not null |
| `slug` | `text` | not null |
| `description` | `text` | not null |
| `property_type` | `property_type` | not null |
| `price_naira` | `bigint` | not null check (`price_naira > 0`) |
| `bedrooms` | `integer` | not null check (`bedrooms >= 0`) |
| `bathrooms` | `integer` | not null check (`bathrooms >= 0`) |
| `area` | `text` | not null |
| `city` | `text` | not null default `'Nsukka'` |
| `state` | `text` | not null default `'Enugu'` |
| `country` | `text` | not null default `'Nigeria'` |
| `latitude` | `numeric(9,6)` | null |
| `longitude` | `numeric(9,6)` | null |
| `amenities` | `jsonb` | not null default `'[]'::jsonb` |
| `video_url` | `text` | null |
| `cover_image_id` | `uuid` | null |
| `duplicate_fingerprint` | `text` | null |
| `rejection_reason` | `text` | null |
| `flag_reason` | `text` | null |
| `dispute_reason` | `text` | null |
| `approved_at` | `timestamptz` | null |
| `approved_by` | `uuid` | null, references `users(id)` |
| `submitted_at` | `timestamptz` | null |
| `archived_at` | `timestamptz` | null |
| `created_at` | `timestamptz` | not null default now() |
| `updated_at` | `timestamptz` | not null default now() |
| `deleted_at` | `timestamptz` | null |

Constraints:
- unique (`agent_profile_id`, `slug`)
- check `property_type <> 'self_contain' or (bedrooms = 1 and bathrooms = 1)`
- check `char_length(trim(title)) > 0`
- check `char_length(trim(description)) > 0`
- check `char_length(trim(area)) > 0`

Indexes:
- index on `agent_profile_id`
- index on `status`
- index on `property_type`
- index on `price_naira`
- index on `area`
- index on (`status`, `city`, `state`, `price_naira`, `id`)
- index on (`status`, `property_type`, `bedrooms`, `id`)
- index on `approved_at`
- index on `deleted_at`
- unique partial index on `duplicate_fingerprint` where `status in ('pending_review', 'approved', 'flagged', 'under_dispute') and deleted_at is null`

Notes:
- `duplicate_fingerprint` will be generated from normalized address/location/property attributes and refined later.
- `cover_image_id` should reference `listing_images(id)` after table creation to avoid circular migration issues.

## `listing_images`

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `listing_id` | `uuid` | not null, references `listings(id)` |
| `storage_path` | `text` | not null |
| `public_url` | `text` | not null |
| `position` | `integer` | not null check (`position >= 0`) |
| `width` | `integer` | null |
| `height` | `integer` | null |
| `mime_type` | `text` | not null |
| `size_bytes` | `integer` | not null check (`size_bytes > 0`) |
| `is_cover` | `boolean` | not null default false |
| `created_at` | `timestamptz` | not null default now() |
| `deleted_at` | `timestamptz` | null |

Constraints:
- unique (`listing_id`, `position`)

Indexes:
- index on `listing_id`
- index on (`listing_id`, `is_cover`)

Rules enforced in application and moderation flow:
- minimum 3 non-deleted images before submission
- maximum 10 non-deleted images per listing

## `listing_views`

Append-mostly analytics table.

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `listing_id` | `uuid` | not null, references `listings(id)` |
| `viewer_user_id` | `uuid` | null, references `users(id)` |
| `session_id` | `text` | null |
| `ip_hash` | `text` | null |
| `user_agent` | `text` | null |
| `referrer` | `text` | null |
| `created_at` | `timestamptz` | not null default now() |

Indexes:
- index on `listing_id`
- index on (`listing_id`, `created_at`)
- index on `viewer_user_id`

## `saved_listings`

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `user_id` | `uuid` | not null, references `users(id)` |
| `listing_id` | `uuid` | not null, references `listings(id)` |
| `created_at` | `timestamptz` | not null default now() |

Constraints:
- unique (`user_id`, `listing_id`)

Indexes:
- index on `user_id`
- index on `listing_id`

## `inspection_requests`

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `listing_id` | `uuid` | not null, references `listings(id)` |
| `requester_user_id` | `uuid` | not null, references `users(id)` |
| `agent_profile_id` | `uuid` | not null, references `agent_profiles(id)` |
| `status` | `inspection_status` | not null default `requested` |
| `message` | `text` | null |
| `requested_at` | `timestamptz` | not null default now() |
| `responded_at` | `timestamptz` | null |
| `expires_at` | `timestamptz` | not null |
| `cancelled_at` | `timestamptz` | null |
| `completed_at` | `timestamptz` | null |
| `chat_id` | `uuid` | null |
| `created_at` | `timestamptz` | not null default now() |
| `updated_at` | `timestamptz` | not null default now() |
| `deleted_at` | `timestamptz` | null |

Indexes:
- index on `listing_id`
- index on `requester_user_id`
- index on `agent_profile_id`
- index on (`status`, `expires_at`)

## `chats`

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `type` | `chat_type` | not null |
| `listing_id` | `uuid` | null, references `listings(id)` |
| `inspection_request_id` | `uuid` | null, unique, references `inspection_requests(id)` |
| `student_user_id` | `uuid` | not null, references `users(id)` |
| `agent_profile_id` | `uuid` | not null, references `agent_profiles(id)` |
| `last_message_at` | `timestamptz` | null |
| `closed_at` | `timestamptz` | null |
| `created_at` | `timestamptz` | not null default now() |
| `updated_at` | `timestamptz` | not null default now() |
| `deleted_at` | `timestamptz` | null |

Indexes:
- index on `student_user_id`
- index on `agent_profile_id`
- index on `listing_id`
- index on `last_message_at`

## `messages`

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `chat_id` | `uuid` | not null, references `chats(id)` |
| `sender_user_id` | `uuid` | not null, references `users(id)` |
| `body` | `text` | not null |
| `read_at` | `timestamptz` | null |
| `created_at` | `timestamptz` | not null default now() |
| `deleted_at` | `timestamptz` | null |

Constraints:
- check `char_length(trim(body)) > 0`

Indexes:
- index on `chat_id`
- index on (`chat_id`, `created_at`)
- index on `sender_user_id`

## `reports`

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `reporter_user_id` | `uuid` | not null, references `users(id)` |
| `target_type` | `report_target_type` | not null |
| `target_id` | `uuid` | not null |
| `reason` | `text` | not null |
| `status` | `report_status` | not null default `open` |
| `resolution_notes` | `text` | null |
| `resolved_by` | `uuid` | null, references `users(id)` |
| `resolved_at` | `timestamptz` | null |
| `created_at` | `timestamptz` | not null default now() |
| `updated_at` | `timestamptz` | not null default now() |
| `deleted_at` | `timestamptz` | null |

Indexes:
- index on `reporter_user_id`
- index on (`target_type`, `target_id`)
- index on `status`

## `notifications`

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `user_id` | `uuid` | not null, references `users(id)` |
| `channel` | `notification_channel` | not null |
| `type` | `text` | not null |
| `payload` | `jsonb` | not null default `'{}'::jsonb` |
| `sent_at` | `timestamptz` | null |
| `read_at` | `timestamptz` | null |
| `created_at` | `timestamptz` | not null default now() |

Indexes:
- index on `user_id`
- index on (`user_id`, `read_at`)

## `audit_logs`

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `actor_user_id` | `uuid` | null, references `users(id)` |
| `entity_type` | `text` | not null |
| `entity_id` | `uuid` | not null |
| `action` | `text` | not null |
| `before_data` | `jsonb` | null |
| `after_data` | `jsonb` | null |
| `metadata` | `jsonb` | not null default `'{}'::jsonb` |
| `created_at` | `timestamptz` | not null default now() |

Indexes:
- index on (`entity_type`, `entity_id`)
- index on `actor_user_id`
- index on `created_at`

## `rate_limit_events`

Used for application-level throttling and abuse detection.

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `key` | `text` | not null |
| `action` | `text` | not null |
| `count` | `integer` | not null default 1 check (`count > 0`) |
| `window_started_at` | `timestamptz` | not null |
| `expires_at` | `timestamptz` | not null |
| `created_at` | `timestamptz` | not null default now() |

Indexes:
- index on (`key`, `action`, `window_started_at`)
- index on `expires_at`

## Referential Follow-Up

After creating `listing_images`, add:
- foreign key from `listings.cover_image_id` to `listing_images.id`

After creating `chats`, add:
- foreign key from `inspection_requests.chat_id` to `chats.id`

## RLS Expectations

- `users`: self-read and self-update only, admin exception
- `user_roles`: self-read, admin-managed write
- `agent_profiles`: public read for verified/public fields, owner read/write where appropriate, admin full access
- `listings`: public read only for approved and visible records, owner access to own records, admin full access
- `listing_images`: visibility follows listing visibility
- `messages`: only chat participants and admins
- `reports`: reporter can create and read own reports, admins moderate
- `audit_logs`: admin-only
