# 07 · Growth plan

Product view, written 2026-09-29 after the MVP went live (https://triplan-blue.vercel.app). What makes riders pick this app, come back and bring friends; which open-source tools and open data get us there; and what to build in which order. Build steps for each item are in `04-build-plan.md`.

## Positioning

**"Everything worth stopping for on your exact road, and what you need to ride it."**

| Alternative | What riders use it for | What it does not do (our gap to fill) |
|---|---|---|
| Google Maps | Navigation, searching a place | No list of what is along the road; no season, vehicle or packing advice; "search along route" only for fuel and food |
| Kurviger, Calimoto | Twisty motorcycle routes | Paid, Europe-first; thin place data for India |
| Wanderlog, TripIt | Itineraries for a destination | Nothing about the road between two towns |
| OsmAnd, Organic Maps | Offline navigation | No curation, no "is it worth it" |
| Komoot | Planning and sharing rides, sending them to devices | Sold to Bending Spoons in 2025; new users now pay to send routes to devices. Hiking and cycling first |
| REVER | Twisty roads, ride tracking, live location for friends (LiveRIDE) | Paid tiers, US-first; nothing about the places on the road |
| Rajmargyatra (NHAI) | Tolls on the route, highway amenities, the 1033 helpline, complaints | No places worth stopping for, no rider guidance; rated 2.6/5 on the App Store |
| Instagram, YouTube | Finding hidden places | Scattered, no map, no route |
| AI chat (ChatGPT and others) | "Plan me a trip" | Invents places: the "Sacred Canyon of Humantay" sent tourists to a place that does not exist (OECD AI incident, 2025) |

Our edge: the corridor search (places on *this* road, in km order), India-wide open data (38,000+ places from OpenStreetMap), and rider guidance (best vehicle, months, what to carry). The growth plan widens that edge with ride-safety utilities and turns every planned trip into something shared. Trust is part of the edge: every place is a real point on the map, and every rule or alert links to its official source.

## Growth loops

1. **Search → place page → planner.** 20,000+ place pages that search engines can index ("Manjarabad Fort best time to visit", "places between Bengaluru and Kalasa"). Needs a sitemap, structured data, real photos and a clear "Plan a ride here".
2. **Plan → share → new rider.** Rides are group plans; in India the plan goes to a WhatsApp group. Every shared link must unfurl into a card showing the route, distance and stops, and open straight into the planner.
3. **Utility → return visit.** Riders come back before each ride if the app answers "Will I run out of fuel? Will I reach before dark? Will it rain on the ghat?". Installing to the home screen (already a PWA) and GPX export put it into their ride routine.
4. **Contribute → better data → more search traffic** (Phase 5): reviews and photos from riders who used the app.

## How we choose features

Decided by the owner 2026-10-15: build only features that no one else can take away later. Every feature's data and services are checked before it enters the plan (the same rule is in `CLAUDE.md`, "Choosing new features").

| Passes | Fails |
|---|---|
| Our own data | Needs someone's approval or an answer first (app reviews, "email them and ask") |
| Open data under a published licence that allows commercial use, downloaded and stored by us (ODbL, CC0, CC BY, Apache-2.0, CDLA-Permissive) | Terms missing, unclear or non-commercial |
| Open-source software we can run on our own server | Works only on someone else's free public server, with no way to run it ourselves |
| Paid services we already use and could swap (Supabase, Vercel, Anthropic, Google behind its budget), when the feature switches off cleanly without them | |

What changed when the rule was made: G5's scenic route no longer uses Valhalla's public server, the offline pack uses our own map file instead of OpenFreeMap downloads, and Mapillary is out. SACHET alerts pass: every feed states it is public domain. Phases 6 (YouTube API) and 7 (Instagram, Meta app review) are checked against the rule before either starts.

## Feature list, by priority

**G1 · Now: no API keys, no cost, no product decision needed.** Built in the Growth phase of `04`.

| # | Feature | Why it sells | Tools and data (licence) |
|---|---|---|---|
| G1.1 | **Share cards and SEO**: link previews for trips and places, sitemap, robots, schema.org data, native Share / WhatsApp button | Every shared trip advertises the app; place pages rank | `next/og` (built into Next.js), Next metadata routes, schema.org `TouristAttraction` |
| G1.2 | **Photos from Wikimedia Commons** for places with a Wikidata id | Pages with photos get clicked and shared; most places have none today | Wikidata `P18` + Commons `imageinfo`/`extmetadata` APIs (CC BY / CC BY-SA / PD, author and licence stored per image) |
| G1.3 | **Ride check**: longest stretch without fuel against the vehicle's range; start time → arrival → sunset warning | Safety is the top worry on ghat rides; no map app answers it | 18,000 fuel stations already imported from OSM; `suncalc` (BSD-2) |
| G1.4 | **GPX export** of the route, stops and ticked places | Riders navigate with OsmAnd, Organic Maps, Garmin, and offline apps; "works with my device" | GPX 1.1 (open format), no dependency |
| G1.5 | **Weather on the ride**: rain, temperature and wind at each part of the route at the time the rider gets there | "Will it rain on Charmadi at 4 pm?" is asked before every monsoon ride | MET Norway Locationforecast (free, commercial use allowed, CC BY 4.0, identify with User-Agent). Open-Meteo's free API is for non-commercial use only, so it is not used |

**G2 · Next: free, more work.**

| # | Feature | Tools and data (licence) |
|---|---|---|
| G2.1 | Safety stops along the route: hospitals, police, puncture and bike repair shops, ATMs, toilets (filter chips; count per 50 km) | OSM tags `amenity=hospital|police|atm|toilets`, `shop=motorcycle_repair|tyres|car_repair` through the existing Overpass import |
| G2.2 | Elevation profile and ghat climbs on each route card ("climbs 900 m in 18 km at Charmadi") | Mapterhorn terrain tiles (Copernicus DEM, code BSD-3) or AWS Terrain Tiles (open data), read server-side; `maplibre-contour` (BSD-3) and MapLibre hillshade for the map |
| G2.3 | "Scenic / back roads" route option (avoids highways) | Valhalla (MIT) `motorcycle` costing with `use_highways` near 0, or GraphHopper (Apache-2.0) with a curvature custom model, on our own server only (never a public server; see "How we choose features"). G5 gives the scenic score and the "Scenic" label among the routes we already find |
| G2.4 | Popular route pages (`/routes/bengaluru-to-kalasa`): top places, route options, best months; generated from saved trips | Existing corridor search, ISR |
| G2.5 | Multi-day planner: split by riding hours per day, suggest overnight towns and stays near the split | Stay places from OSM (1,100+ imported) |
| G2.6 | Offline trip pack: route, places and map tiles for the corridor saved on the phone | Serwist (already used, MIT), PMTiles (BSD-3), `maplibre-offline-pmtiles`. Uses the MapLibre view: Google's map tiles cannot be saved offline |
| G2.7 | Languages: Kannada, Hindi, Tamil, Malayalam, Marathi | `next-intl` (MIT) |
| G2.8 | Measure it: which features get used, where visitors come from | Umami (MIT, self-host or free cloud tier) or Vercel Web Analytics (free tier); GlitchTip (open source) or Sentry free plan for errors |

Status (2026-10-02): G2.1, G2.2, G2.4, G2.5 and G2.8 are built in "Growth G3 · Showcase" (`04-build-plan.md`). Changes from the table: G2.2 reads AWS Terrain Tiles (Terrarium PNGs; SRTM, GMTED2010 and ETOPO1 credited to USGS and NOAA), because Mapterhorn does not cover India; G2.4 starts from a hand-picked list of famous rides, not from saved trips (too few yet); safety stops and stays live in their own `service_point` table, not as places with pages.

**G3 · Showcase (decided 2026-10-02).** Features that give the app an identity on LinkedIn and in shared links, built in `04-build-plan.md` "Growth G3 · Showcase":

| Feature | Why it sells | Tools and data (licence) |
|---|---|---|
| Hairpins and twistiness per route | Riders choose roads by their bends; no map app counts them | Our route geometry; the method described on roadcurvature.com, written as our own code |
| Elevation profile and climbs | "Climbs 900 m in 18 km" is how riders describe a ghat | AWS Terrain Tiles (open data, attribution), `fast-png` (MIT) |
| 3D ride preview, saved as a video | The demo-video feature; every saved video advertises the app | MapLibre terrain (BSD-3), the same tiles, browser `MediaRecorder` |
| Ride story poster | Instagram stories and WhatsApp status are where Indian riders share plans | `next/og` |
| Famous rides pages | One tap shows a stranger what the app does; pages rank for "Kalhatti ghat hairpins" | Our own data, ISR |
| Plan in plain words | Typing a wish is easier than filling a form | Claude Haiku 4.5 through structured outputs (about US$0.002 a request, capped per day) |
| One-command data setup | Anyone who clones the repo gets the whole dataset | GitHub Releases; snapshot under ODbL because it is derived from OpenStreetMap |

**G4 · Fix and fill (decided 2026-10-09).** The features are ahead of the data. Almost every place page said "Not known yet" for months, vehicle and what to carry, had no description and often no photo. G4 fills those from open data (estimated guidance labelled as such, Wikidata and Wikipedia text, more Commons photos). It also cleans the OpenStreetMap import, closes the risks an audit found and fixes the phone dead ends. Steps are in `04-build-plan.md` "Growth G4 · Fix and fill". Saved trips get a per-device edit token instead of being editable by anyone.

**G5 · Ride day, smart picks, ride together, riders' content (decided 2026-10-14).** Chosen after web research on rider apps, travel research, open data and open-source projects ("Research behind G5" below). Four groups, built in this order, each checked by the owner before the next. Steps are in `04-build-plan.md` "Growth G5".

| Group | Feature | Why it sells | Tools and data (licence) |
|---|---|---|---|
| A · Ride day | Alerts on the route | "Is there a red alert on the ghat today?" answered with official warnings, not rumours | NDMA SACHET CAP 1.2 feeds (IMD, NDMA, state disaster authorities, INCOIS), read on the server and cached 10 minutes. Each feed states `<copyright>public domain</copyright>`; district outlines are our own, from OpenStreetMap |
| A | Road rules and permits | Night bans, e-passes and permits catch riders out; no map app checks them against the arrival time | Our own list (`data/road-rules.json`); each rule has its official link and the date it was checked |
| A | Break planner | Road-safety bodies advise a break every 2 hours or 100 km, and warn of a dip at 2–4 pm | Our places and service points along the route |
| A | Tolls and trip cost | Bikes pay no national-highway tolls; car drivers ask what the trip costs | OSM `barrier=toll_booth` (ODbL); NHAI's June 2025 statement that two-wheelers stay exempt; the FASTag annual pass (₹3,000 for 200 NH and NE crossings, private cars) |
| A | Helplines | 1033 (national highways) and 112 one tap away | No data needed |
| B · Smart picks | Best stops for my time | Hundreds of places on a route are too many for a newcomer; the app picks the most worthwhile that fit the time | Tourist trip design (orienteering) heuristics over our own ranking |
| B | Popular ↔ Offbeat | Some riders want the famous stops, others the ones few people visit | Re-ranking toward the long tail, as in popularity-bias research |
| B | Sunset stop | End the day at a viewpoint at the right time | `suncalc` (BSD-2) |
| B | Scenic score and the "Scenic" label | Riders choose a road for the ride, not the time | Our places and road mix only; the label goes to the most scenic of the routes OSRM already gives. (Valhalla's public server dropped 2026-10-15) |
| C · Ride together | Ride your GPX | A ride from Strava, Garmin or the Royal Enfield app becomes hairpins, a profile, the places passed, a 3D replay and a poster | `@tmcw/togeojson` (BSD-2), in the browser |
| C | Offline trip pack | Ghats and Ladakh have no signal | Our own PMTiles (BSD-3) file of India, cut from a Protomaps build of OpenStreetMap (ODbL) and stored by us; at most 3,000 tiles or 50 MB a pack. (OpenFreeMap downloads dropped 2026-10-15) |
| C | Ride together | Groups split up on ghats; REVER's LiveRIDE shows riders want a live map | Supabase Realtime Broadcast and Presence (free plan: 200 connections, 100 messages a second); positions never stored |
| D · Riders' content | More food, fuel and stays | The fuel gap and the break planner are only as good as the pumps and cafes we know | Overture Places (CDLA-Permissive-2.0; Apache-2.0 for its Foursquare records; CC0 for AllThePlaces), after a quality check against OSM |
| D | Reviews, photos and road reports without sign-in | First-hand, fresh data; a road report says what no map knows ("landslide at km 23, one lane open") | ALTCHA (MIT; proof of work, no key or cookies) with per-visitor limits, a Claude Haiku pre-screen and an admin queue. Only admins sign in |

This settles the question G4 left open, how to stop spam without sign-in: proof of work, per-visitor limits, a device token for editing one's own posts, an AI pre-screen and approval by an admin.

**Later: needs decisions, accounts or money.**

- "Add a place" (Phase 5 steps 3–4). Reviews and rider photos are in G5.
- Hidden places from YouTube (Phase 6). YouTube's developer policies require API data to be refreshed or deleted within 30 days: keep the video id and our own extracted facts (see `05-hidden-places.md`).
- Google fills the gaps (decided 2026-09-29, step list in `04` "Growth G1-Google"): Google map, exact Google Maps links, and Google photos and reviews for places with none of our own, within Google's free monthly usage.
- Landslide nowcast from NASA's LHASA (daily, 1 km rasters; needs raster processing).
- Photos of the road itself: Panoramax (MIT software we could run ourselves, open images; little coverage in India yet). Mapillary is left out: its commercial API terms are unclear.
- An off-highway "Scenic" route and twisty-road routing: Valhalla or GraphHopper on our own server (with self-hosted OSRM, Phase 8). Costs a server; no public routing servers.
- Stretches without phone signal from OpenCelliD cell towers (CC BY-SA 4.0, share-alike). Ookla's open data is non-commercial, so it cannot be used.
- "Avoid this area": draw it on the map (terra-draw, MIT) and route around it with Valhalla's `exclude_polygons`, once Valhalla runs on our own server.
- "Ask this route": questions answered only from the places, rules and services on the route, never invented.
- "Seen in films": filming locations from Wikidata (set-jetting is a 2026 travel trend in Expedia's Unpack '26).
- Languages (G2.7).

## Research behind G5

Web research of 2026-10-14. What we read, and what each finding changed.

**Rider apps and the market**
- Motorcycle apps compete on twisty routing (Calimoto, Kurviger), road-character filters and live tracking (REVER), and round trips with offline maps (Scenic): [SlashGear](https://www.slashgear.com/1755865/motorcycle-apps-find-routes-track-rides), [GeoRide's 2026 roundup](https://eu.georide.com/blogs/georide/applications-itineraires-moto) (written by a competitor). REVER's [LiveRIDE](https://rever.co/press-releases/rever-introduces-liveride-a-collection-of-safety-features-to-keep-friends-and-family-informed-while-you-ride) shares a friends map, a browser follow link and an SMS at the start and end of a ride → **Ride together**.
- Komoot was sold to Bending Spoons in 2025 and new users pay to send routes to devices ([BikeRadar](https://www.bikeradar.com/news/komoot-acquisition)); the [Royal Enfield app](https://royalenfield.com/in/en/re-app)'s Tripper imports GPX → **Ride your GPX** and free GPX everywhere.
- NHAI's [Rajmargyatra](https://apps.apple.com/in/app/id6449488412) shows tolls on the route, amenities and the 1033 helpline → **Tolls** and **Helplines**, with the places it lacks.
- India's road trips: tier-2 corridors grow fastest ([Business Today, July 2026](https://www.businesstoday.in/latest/trends/story/indias-new-road-trip-map-mumbai-pune-busiest-road-trip-route-but-tier-2-routes-are-growing-fastest-report-544737-2026-07-23)); shorter, more frequent domestic trips and more planning with AI ([Agoda 2026](https://www.hotel-online.com/index.php/news/agodas-2026-travel-trends-reveal-indias-new-era-of-inward-wanderlust)).
- Trust in AI planning is low: only 6% of travellers fully trust it ([Skift, July 2026](https://skift.com/2026/07/02/otas-are-betting-on-traveler-trust-but-the-scramble-is-on-to-win-the-trust-of-ai-agents/)), and an AI itinerary sent tourists to a canyon that does not exist ([OECD AI incident](https://oecd.ai/en/incidents/2025-09-29-8b4f)) → plain words and every AI feature resolve only to our own places.

**Theories and research**
- Tourist trip design is an orienteering problem: pick the stops worth the most within a time budget ([Gavalas et al. 2014](https://unpaywall.org/10.1007%2FS10732-014-9242-5), [Ruiz-Meza and Montoya-Torres 2022](https://doaj.org/article/0a77a455f7294612b5d4aa7f2aa6cf53), [Gunawan, Lau and Vansteenwegen 2016](https://ink.library.smu.edu.sg/sis_research/3271)) → **Best stops for my time**.
- Choice overload is real mainly for people without settled preferences or expertise ([Scheibehenne et al. 2010 meta-analysis](https://abcwest.cogs.indiana.edu/pmwiki/pdf/scheibehenne.options.2010.pdf)) → a short pick for newcomers, with the full list kept.
- Plog's venturer and dependable travellers ([a critique of the model](https://research.polyu.edu.hk/en/publications/are-psychographics-predictors-of-destination-life-cycles/)), and popularity bias in place recommenders with re-ranking toward the long tail ([Abdollahpouri et al. 2019](https://arxiv.org/pdf/1901.07555), [POI popularity bias](https://arxiv.org/pdf/2202.13307)) → **Popular ↔ Offbeat**.
- Routes about 12% longer are seen as more beautiful and quiet ([Quercia et al. 2014](https://www.technologyreview.com/2014/07/08/12999/forget-the-shortest-route-across-a-city-new-algorithm-finds-the-most-beautiful/)); coast, mountains, castles and viaducts make places scenic ([Seresinhe et al. 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5541537)) → **Scenic route** and the scenic score from our viewpoints, peaks, lakes, forts and ghats.
- The peak-end rule: an experience is remembered by its peak and its end ([Travel Tech Essentialist](https://traveltechessentialist.substack.com/p/travel-tech-essentialist-92-the-peak)). Evidence in tourism is thin → only a small **Sunset stop**.
- Rider fatigue: a break every 2 hours or 100 km, and a dip at 2–4 pm ([NZTA](https://nzta.govt.nz/roadcode/motorcycle-code/about-limits/rider-fatigue), [IAM RoadSmart](https://iamroadsmart.com/news-and-insights/blog-post-details/tips/2020/02/18/too-tired-to-ride-tips-from-iam-roadsmart)) → **Break planner**.
- Ratings from few reviews need a lower bound or a prior ([Evan Miller](https://www.evanmiller.org/how-not-to-sort-by-average-rating.html)) → a Bayesian average for our ratings.
- Badges mostly serve a sense of competence and their effect is mixed ([Self-Determination Theory study](https://eprints.whiterose.ac.uk/139776)) → no leaderboards; at most a personal log later.
- Phones can sense potholes and braking ([Nericell, Microsoft Research India, tested in Bengaluru](https://www.microsoft.com/en-us/research/project/nericell/)). A PWA cannot sense in the background → later, if ever.

**Open data and open-source projects**
- [SACHET's CAP feeds](https://thejeshgn.com/2025/05/28/common-alerting-protocol-cap-in-the-indian-context/): one RSS feed for India and one per state, each item a CAP 1.2 message with district polygons in lat,lon order, no CORS. IMD also runs a keyed [API portal](https://api.imd.gov.in/).
- [Valhalla](https://valhalla.github.io/valhalla/api/route/api-reference/) (MIT): `motorcycle` costing with `use_highways` (0–1, default 0.5) and `use_trails` (0–1, default 0), plus `use_tolls`, `exclude_polygons` and `alternates`. [GraphHopper](https://discuss.graphhopper.com/t/help-on-curvature-settings-in-custom-model/9885) (Apache-2.0) has a curvature value for custom models and round trips, the self-hosted alternative.
- [OpenFreeMap](https://openfreemap.org/): offline downloads up to 3,000 tiles or 50 MB each, at most 4 requests at a time, with a User-Agent naming the app, which a browser cannot set. [PMTiles](https://til.simonwillison.net/gis/pmtiles) extracts a region by its box, so we keep our own file instead.
- [Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits); [Traccar](https://github.com/traccar/traccar-client) (Apache-2.0) as a reference for live tracking.
- [togeojson](https://npmjs.com/package/@tmcw/togeojson) (BSD-2), [terra-draw](https://classic.yarnpkg.com/en/package/terra-draw) (MIT), [ALTCHA](https://altcha.org/open-source-captcha/) (MIT), [VROOM](https://pypi.org/project/pyvroom) (route optimisation, not needed while stops keep their km order), [opening_hours.js](https://github.com/opening-hours/opening_hours.js) (LGPL-3.0; India's holidays not built in).
- [Overture Places](https://docs.overturemaps.org/guides/places): 64 million+ places with a confidence score each; the licence follows the source. Foursquare's own [open places](https://foursquare.com/resources/blog/data/evolving-fsq-open-source-places/) now need a portal token, and Overture already carries them.
- Tolls: two-wheelers stay exempt ([Deccan Herald](https://www.deccanherald.com/india/nhai-rubbishes-toll-on-two-wheelers-as-fake-news-clarifies-no-plans-to-levy-charges-3603830)); the [FASTag annual pass](https://www.outlookmoney.com/news/fastag-annual-pass-launched-at-rs-3000-for-one-year-or-200-trips).
- Road rules to seed, each to be checked at its official source: the [Bandipur night ban](https://www.onmanorama.com/news/kerala/2019/10/05/why-is-there-a-night-traffic-on-nh-766-bandipur-reserve-forest.amp.html), the [Ooty and Kodaikanal e-pass](https://outlooktraveller.com/travelnews/whats-new/kodaikanal-and-ooty-e-pass-extended-heres-all-you-need-to-know-about-it), [Ladakh's fee and permits](https://vargiskhan.com/log/how-to-get-ladakh-permit).
- YouTube's [developer policies](https://developers.google.com/youtube/terms/developer-policies-guide): API data refreshed or deleted within 30 days.

**Checked and left out**
- Ookla's open speed data: CC BY-NC-SA, not for commercial use.
- Valhalla's public FOSSGIS server for the scenic route: a free volunteer server that asks apps to announce themselves and can throttle them. Only a Valhalla on our own server (2026-10-15).
- Offline packs downloaded from OpenFreeMap: their rules need a User-Agent a browser cannot send, so it would need their permission. Our own PMTiles file instead (2026-10-15).
- [Mapillary](https://help.mapillary.com/hc/en-us/articles/115001770409-CC-BY-SA-license-for-open-data): commercial API terms unclear.
- Open Charge Map: licence per record and little data for India; OSM's `amenity=charging_station` instead, when EV range checks come.
- MoRTH accident black spots: published as highway and km-stone lists, [no coordinates](https://visionias.in/current-affairs/upsc-daily-news-summary/article/2025-11-03/the-indian-express/polity-and-governance/govt-to-release-nh-black-spot-data-based-on-real-time-e-dar) yet.
- [NASA LHASA](https://registry.opendata.aws/nasa-landslide-project/), [Panoramax](https://docs.panoramax.fr/federated-catalog/), [OpenCelliD](https://en.wikipedia.org/wiki/OpenCelliD): see "Later".

## Making money

Commercial use needs **Vercel Pro (US$20/month)** first: the Hobby plan is for non-commercial use only. Open data licences above allow commercial use with attribution, except Open-Meteo's free API (not used).

In order of fit with the product:

1. **Stays along the route**: affiliate links from the "stay" places and multi-day split (Booking.com and Agoda have affiliate programmes; homestays directly).
2. **Bike rentals** at the start city (direct partnerships, e.g. Royal Brothers lists partner enquiries; no public affiliate programme found).
3. **Riding gear** linked from "What to carry" (Amazon Associates India: about 5–7% for sports, apparel and luggage).
4. **Featured listings** for cafes, homestays and garages on the route, always labelled "Sponsored" and never changing the km order.
5. **Rider Pro** (later): offline packs, multi-day planner, unlimited GPX. Only once the free app has regular users.
6. **Clubs and tour operators**: branded group-ride pages.

## What to measure

Trips planned per week, share links opened, trips saved, home-screen installs, visitors who return within 30 days, search impressions and clicks (Google Search Console, free). Set these up with G2.8 before spending on anything else. G5 adds events for alerts shown, stops picked, GPX files opened, packs saved, rooms opened, and reviews and reports posted.
