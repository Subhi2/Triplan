# 08 · Design ("Ghat Road")

Decided 2026-09-30. Mockups: the "Triplan website design" canvas (claude.ai artifact, private to the owner). This page is the source of truth for the code.

## Principles

- **The road is the organising idea.** Places read in km order, led by a big km marker; the road strip shows the whole route with its ghats and stops.
- **Phones first.** One primary action pinned to the bottom, 44 px touch targets, 16 px inputs, the map never covered by more than it needs to be.
- **Calm surfaces, one accent.** Warm paper ground, white cards and sheets, teal for the route and primary actions. Colour carries meaning (category, ghat, rating), never decoration.
- **Motion explains, never decorates.** Things move to show where they came from; everything stops for "reduce motion".

## Tokens (`src/app/globals.css`)

| Token | Value | Use |
|---|---|---|
| `stone-100` (paper) | `#F4F1EA` | Page ground (`--background`) |
| `--surface` | `#FFFFFF` | Cards, sheets, the places column |
| `stone-900` (ink) | `#1B1A17` | Text, selected chips |
| `stone-600` | `#5B574F` | Secondary text (6.4:1 on paper) |
| `stone-200` | `#E2DDD2` | Borders, dividers |
| `brand` / `brand-dark` / `brand-tint` / `brand-soft` | `#0F766E` / `#0B4F4A` / `#E3F0EE` / `#9CCFC6` | Route, primary buttons, links / active rows / "OK" months |
| `ghat` / `ghat-dark` | `#C2410C` / `#9A3412` | Ghat stretches, avoid months, warnings |
| `marigold` / `marigold-tint` | `#B45309` / `#FBEBD7` | Ratings, detours, items needed now |
| `state-road` | `#E0A63A` | State highways in the road mix |

The whole `stone` scale is remapped to these warm tones, so `stone-*` classes anywhere take the palette. Dark mode keeps working through the same scale (`--background` stone-950, `--surface` stone-900). Category colours stay in `src/lib/categories.ts`.

## Type (`src/app/layout.tsx`, next/font)

| Role | Font | Class | Sizes |
|---|---|---|---|
| Display and headings | Bricolage Grotesque 600–800 | `font-display` | 28–30 px place names, 17–20 px section headings, tight tracking |
| Body | Atkinson Hyperlegible 400/700 | default `font-sans` | 16 px body and inputs, 13–14 px meta |
| Numbers | IBM Plex Mono 500/600 | `font-mono` + `tabular` | km markers, times, distances |

Atkinson Hyperlegible was designed for low vision and reads well on a phone in sunlight. Avoid Inter, Roboto and Arial.

## Components

- **Buttons.** Primary: `bg-brand`, white, bold, `rounded-xl`, 48 px on phones. Secondary: white with a `stone-300` border. Soft: `bg-brand-tint` with `brand-dark` text. Icons are inline stroke SVGs, never emoji.
- **Chips.** `rounded-full`; off: `bg-stone-100`; on: ink (`bg-stone-900`, white, bold). A category chip leads with its colour dot. Counts in mono.
- **Segmented control** (Bike / Car): a `stone-100` pill holding the options; the chosen one `bg-brand`.
- **Route cards.** The picked route on a white card with a 2 px teal border; the others quieter and compact. Road mix bar: NH teal, SH `state-road`, ghat `ghat`, other `stone-300`, 2 px gaps.
- **Road strip** (`RoadStrip`). A teal ribbon from 0 to the route length, ghat stretches thicker in `ghat` with a "GHAT" label, each listed place as a dot in its category colour (the active or hovered one larger, ringed in ink), round km marks below. Ghat positions come from `RoadMix.ghats`.
- **Place rows** (`PlaceRow`). "KM" over the km in mono, the name bold, then category · detour (on route in `brand-dark`, detours in `marigold`), then rating · best time. The tick box on the right. Rows carry `data-km`, `data-name`, `data-detour`, `data-category` for the end-to-end tests.
- **Month chart** (`MonthStrip`). Twelve bars: best tall teal, OK medium `brand-soft`, avoid short `ghat`, unknown a stub. This month ringed in ink, with "Best time: now, in September" above.
- **Fact tiles.** White with a `stone-200` border, label above value; sentences span the full row.
- **Carry chips.** Items needed this month in `marigold-tint` with "needed now"; others outlined.

## Layout

- **≥ 1024 px:** three columns: trip and routes (24rem, paper) | road strip and places, or the open place (26rem, white) | map.
- **768–1023 px:** one side panel (26rem) holding everything, then the map.
- **< 768 px:** the map full screen. With a trip, the header floats over it (frosted, `backdrop-blur`), and the bottom sheet holds routes and places; the map keeps its framing clear of both (`topInset`, `bottomInset`).

## Motion

| What | How |
|---|---|
| Picked route | Draws itself along the road, 1.2 s, ease-out (`useDrawIn`, both maps) |
| Lists and cards | Rise 8 px into place (`animate-rise`), 40–60 ms apart, at most 10 staggered |
| Month bars | Grow from the bottom (`animate-grow-up`), 30 ms apart |
| Bottom sheet | Springs up (`animate-sheet-in`, slight overshoot) |
| Loading | Shimmer blocks where routes, places and photos will be |
| Press / focus | Scale 0.97 on press; 3 px teal focus ring |
| Reduced motion | Every animation and transition off (`prefers-reduced-motion`) |
