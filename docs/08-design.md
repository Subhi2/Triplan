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

Chart marks have their own tokens, `--chart-road` (`#0D9488`, dark `#13A494`) and `--chart-ghat` (`#C2410C`, dark `#E8651B`), checked with the dataviz palette validator against each surface (the brand teal reads too grey as a 2 px line), and `--chart-grid` (stone-200, dark stone-800).

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
- **Route cards.** The picked route on a white card with a 2 px teal border; the others quieter and compact. Under the towns, a hairpin line: a hairpin icon and "24 hairpins" bold in `ghat-dark`, then "· 54.6 km twisty" in `stone-600` (hidden on roads with no hairpins and under 5 km twisty). Road mix bar: NH teal, SH `state-road`, ghat `ghat`, other `stone-300`, 2 px gaps.
- **Road strip** (`RoadStrip`). A teal ribbon from 0 to the route length, ghat stretches thicker in `ghat` with a "GHAT" label, each listed place as a dot in its category colour (the active or hovered one larger, ringed in ink), round km marks below. Ghat positions come from `RoadMix.ghats`.
- **Elevation profile** (`RouteProfile`, `ElevationChart`). Under the route cards: "Ups and downs" with ↑ climb and ↓ descent in mono, then one 2 px `--chart-road` line over a 10% wash, ghat stretches redrawn in `--chart-ghat`, hairline gridlines at round heights, mono tick labels, and only the highest point labelled (a 4 px dot with a 2 px surface ring). A crosshair follows the pointer or the arrow keys (the chart is a `role=slider`), with a one-line readout pill in the top margin ("1,317 m km 55.2 · 4.8% down") and an ink dot at the same point on the map (`CursorDot`, both maps). Below: a Road / Ghat line key, the big climbs as rows ("↑ 853 m up in 16.0 km · 5.3% · to Valparai", tap to show it on the map), and a folded table of heights with the terrain credit. The selected route's card adds "↑ 1,262 m" after the hairpins.
- **3D ride preview** (`RidePreview`). Opened by a soft button under the profile ("Preview the ride in 3D", `brand-tint`, 48 px on phones). Full screen on the terrain: top left a frosted card with the trip in `font-display` and "km 28.0 of 62 · 394 m" in mono, with a `ghat` "Ghat" chip and a "Climbing 5.3%" chip under it; top right a round Close button; above the controls a white card for the place being passed (photo, name, category dot, km, detour), rising in; at the bottom a frosted panel with the scrubber over a small profile (done in teal, ahead in stone-300) and the Play button (`bg-brand`) with the speed chips (ink when chosen). The route ahead is white over a dark casing, the road done teal, the rider a teal dot with a white ring and a soft halo. "Save video" (outlined, with a red dot) turns the map into a portrait frame and shows an ink status bar ("Making a 30 s video · 42%", pulsing red dot, Cancel); the finished video opens in a white card to play back, Share (`bg-brand`) or Download. Video frames repeat the display: the trip card, the ghat and climb chips, the place card, a progress strip over the profile in teal, and a dark band with "Planned on Triplan" and the full credits.
- **Ride story** (`StoryShare`, `StoryCard`). A secondary "Ride story" button beside "Preview the ride in 3D" opens a dialog with the poster (9:16, rounded, hairline border), Share (`bg-brand`, only where the browser can share a file) and Download. The poster: paper ground, the brand dot and name, "RIDE STORY" (or "ROAD TRIP") tracked out, the trip at 88 px bold with "via …" muted under it, the route drawn 12 px teal on a white casing over a `brand-tint` panel with ghats in `ghat`, four white fact tiles (label muted, value 50 px bold), the profile as a teal line over a light wash, "WORTH STOPPING FOR" with km in teal and category dots, and "Plan yours at …" with the credits.
- **Site nav and footer** (`SiteNav`, `SiteFooter`) on the content pages (rides, places, trips, about): the name in `font-display` and Famous rides · Near me · Saved trips · About in `brand-dark` bold (the current page in ink, `aria-current`); the footer holds the data credits and links to About and the code.
- **Famous rides** (`/rides`): cards on white with a `RouteSketch` (the route's shape on `brand-tint`, start hollow, end filled), the title in `font-display`, the region, then km · time · hairpins (in `ghat-dark`) · climb in mono. A ride page: the title at 36 px, region · vehicle · best months, the blurb, a big sketch, four fact tiles, "Plan this ride" (primary), "Preview the ride in 3D" and "Ride story", the elevation profile, the road mix, a `marigold-tint` "Before you go" note, the stops, and "Worth stopping for" rows (km in mono, category dot, name, category · detour) linking to each place.
- **About, 404 and error pages**: About tells the story, how it works, the stack, every data source with its licence and the privacy rules, in the content-page layout. The 404 page ("This road doesn't go anywhere") and the error page ("Something went wrong on the way", with Try again) offer the planner and the famous rides. The planner header adds "Rides" from 640 px; the empty planner ends with About · Code on GitHub.
- **Plain words** (`PlainWordsBox`, only with the AI key): on the empty planner above the famous rides, a white card "Or say it in plain words" with a 16 px input and "Plan it" (primary), three example chips that plan at once, the result in `brand-dark` ("Pune → Devkund Waterfall · by bike · we picked …") or the error in red, and "Read by Claude (AI); what you type is not stored."
- **Try a famous ride** (`FamousRidesStrip`): on the empty planner under the trip form, a sideways-scrolling row of 160 px cards (sketch, title, km · hairpins) that open the ride in the planner.
- **Safety on the way** (`SafetyStops`): under the road strip, chips with a coloured dot and "66 hospitals" (count in mono), ink when picked; hospitals red, police blue, ATMs green, puncture shops amber, repair slate. The picked kind lists km (mono), name, "On the road" or "0.8 km off the road", and Call in `brand-dark`; its stops show on the map as small dots in the kind's colour with a white ring. A note says where the data comes from and to call 112 in an emergency.
- **Place rows** (`PlaceRow`). "KM" over the km in mono, the name bold, then category · detour (on route in `brand-dark`, detours in `marigold`), then rating · best time. The tick box on the right. Rows carry `data-km`, `data-name`, `data-detour`, `data-category` for the end-to-end tests.
- **Near me rows** (`NearbyRow`). Near me reads by time, not km: the ride time in mono leads ("MIN" over "35", or "HRS" over "1:05"; "KM" over the straight-line km when road times are unavailable), then the name bold, category · "34.2 km by road", then rating · best time. No tick box (there is no trip). Rows carry `data-name`, `data-category`, `data-ride-min`, `data-km`.
- **Time chips** (Near me). "Within" then 30 min / 1 h / 2 h / Half day as chips (ink when chosen), next to the Bike / Car segmented control.
- **Ride mode** (`RideMode`, "Ahead of you"). Full screen on paper, for a glance: the heading and count in 16 px, rows at least 80 px with the name in `font-display` 22 px, category and side ("ahead on the left"), and the km in 28 px mono; a teal arrow in a `brand-tint` disc points at the place relative to the way of travel. One ink "Stop" button, 48 px. The screen stays on (Wake Lock); the footer says "Glance only; pull over before tapping."
- **You are here** (`MeDot`, both maps). A teal dot with a white ring on a soft teal halo; while riding, a 70° teal fan points the way of travel.
- **Month chart** (`MonthStrip`). Twelve bars: best tall teal, OK medium `brand-soft`, avoid short `ghat`, unknown a stub. This month ringed in ink, with "Best time: now, in September" above.
- **Fact tiles.** White with a `stone-200` border, label above value; sentences span the full row.
- **Carry chips.** Items needed this month in `marigold-tint` with "needed now"; others outlined.

## Layout

- **≥ 1024 px:** three columns: trip and routes (24rem, paper) | road strip and places, or the open place (26rem, white) | map.
- **768–1023 px:** one side panel (26rem) holding everything, then the map.
- **< 768 px:** the map full screen. With a trip, the header floats over it (frosted, `backdrop-blur`), and the bottom sheet holds routes and places; the map keeps its framing clear of both (`topInset`, `bottomInset`).

- **Near me** follows the same layout: side panel (26rem) and map from 768 px; on phones the map full screen, a frosted header, and the chooser, chips and list in the bottom sheet (typing a place opens the sheet fully; picking on the map drops it to its smallest).

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
