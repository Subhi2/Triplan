# Bike Travelling Guide

A route explorer for bike and car travellers. The user picks a start, a destination and optional via stops (to force a specific path), and the app shows every worthwhile place along that exact route: temples, forts, viewpoints, waterfalls, treks, lakes, food and fuel. Each place has a category, rating, photos, reviews, best vehicle, best time to visit and items to carry. A discovery pipeline finds "hidden places" from YouTube and Instagram posts.

Reference example used throughout: **Bengaluru → Kalasa**, via Sakleshpur (NH75 → Sakleshpur → Mudigere → Kottigehara) or via Chikkamagaluru (NH75 → Hassan → Belur → Chikkamagaluru → Balehonnur). Both share NH75 up to Hassan.

## Read these first

| File | What it covers |
|---|---|
| `docs/01-product-spec.md` | Features, screens, user stories, acceptance criteria |
| `docs/02-architecture.md` | Stack, folders, services, routing and corridor search |
| `docs/03-data-model.md` | Postgres + PostGIS schema (SQL) and TypeScript types |
| `docs/04-build-plan.md` | Phased build steps. Work through phases in order |
| `docs/05-hidden-places.md` | YouTube / Instagram discovery pipeline and its rules |
| `docs/06-seed-data.md` | Seed places for the Bengaluru → Kalasa demo |

## Stack (decided)

- **Next.js 15 (App Router) + TypeScript**, deployed as a PWA. Tailwind CSS for styling.
- **MapLibre GL JS** via `react-map-gl/maplibre` for maps. OpenStreetMap-based tiles (MapTiler free tier or OpenFreeMap).
- **Supabase**: Postgres with **PostGIS**, Auth, Storage.
- **Routing**: OSRM (public demo server in dev, self-hosted later) behind a `RoutingProvider` interface so Google Routes / GraphHopper can be swapped in.
- **Geocoding**: Nominatim (dev) behind a `GeocodingProvider` interface.
- **Drizzle ORM** for schema and queries; raw SQL for PostGIS functions.
- **Zod** for validating every API input and external API response.
- **Vitest** for unit tests, **Playwright** for end-to-end.
- **pnpm** as package manager.

## Commands

```bash
pnpm install
pnpm dev              # Next.js dev server on :3000
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest
pnpm test:e2e         # Playwright
pnpm db:migrate       # apply Drizzle migrations
pnpm db:seed          # load docs/06 seed data
pnpm job:discover     # run hidden-places discovery once (phase 6)
```

Add these scripts to `package.json` as the phases introduce them.

## Conventions

- TypeScript `strict: true`. No `any` without a comment explaining why.
- Server-only code (DB, API keys, external APIs) lives under `src/server/`. Never import it from client components.
- All external API calls go through a provider interface in `src/server/providers/`, so each can be mocked in tests.
- Distances are stored in metres and shown as km with one decimal. Coordinates are `[lng, lat]` (GeoJSON order) everywhere in code.
- Months are stored as integers 1–12.
- Every image stored or displayed must carry `source`, `license` and `author`. Never re-host social media videos or photos; embed or link them.
- Secrets live in `.env.local` (never committed). Keep `.env.example` up to date.
- Run `pnpm lint && pnpm typecheck && pnpm test` before calling a task done.
- Small commits, one feature per commit, message in imperative mood.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
NEXT_PUBLIC_MAP_STYLE_URL=        # MapLibre style JSON URL
OSRM_BASE_URL=https://router.project-osrm.org
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
NOMINATIM_USER_AGENT=bike-travelling-guide/0.1 (contact email)
YOUTUBE_API_KEY=                  # phase 6
INSTAGRAM_ACCESS_TOKEN=           # phase 7, needs Meta app review
INSTAGRAM_BUSINESS_ACCOUNT_ID=    # phase 7
ANTHROPIC_API_KEY=                # phase 6, place-name extraction
```

## Things to avoid

- Do not scrape Instagram, YouTube or Google. Use official APIs only.
- Do not store Google Places content beyond what its terms allow (place IDs can be stored; ratings, reviews, photos are display-only and cached briefly).
- Public OSRM and Nominatim servers have strict usage limits (Nominatim: max 1 request/second, custom User-Agent required). Cache responses and never call them in a loop without throttling.
