# Ruvo

Trust-first real estate marketplace infrastructure for verified listings, starting in Nsukka.

## Stack

- Next.js App Router
- Node.js route handlers and server-side logic
- Supabase Postgres
- Clerk
- Paystack
- Sentry

## Getting Started

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in the browser.

## Core Project Docs

- `ARCHITECTURE.md`
- `SCHEMA.md`
- `API_CONTRACTS.md`
- `AGENT_RULES.md`

## Initial Structure

```text
src/
  app/
  components/
  features/
  lib/
  server/
  types/
supabase/
  migrations/
  policies/
```

## Next Steps

- add environment variables
- integrate Clerk
- integrate Supabase
- add first migration set for Slice 1
- build the public listing system

## Environment Variables

See `.env.example`.

## Local Supabase Workflow

Start the local Supabase stack if needed:

```bash
npx supabase start
```

Reset the local database and apply migrations plus the seed file:

```bash
npx supabase db reset
```

Files involved:
- `supabase/migrations/0001_initial_slice_1.sql`
- `supabase/migrations/0002_public_listing_policies.sql`
- `supabase/seed.sql`
