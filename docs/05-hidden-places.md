# 05 · Hidden places pipeline

Find places that riders post about on YouTube and Instagram before they appear on maps, work out where they are, and add them to the map after a human checks them.

## Rules (non-negotiable)

- **Official APIs only.** No scraping of Instagram, YouTube or Google. Scraping breaks their terms and gets keys and accounts banned.
- **Link and embed, never re-host.** Store the post URL, creator, caption and our own extracted facts. Show videos with the official embed players. Credit the creator on the place page.
- **Human in the loop.** Nothing discovered goes live without admin approval. Many "hidden" spots are on private land, in forest reserves, or unsafe in monsoon; the reviewer sets `permit_needed`, `avoid_months` and notes, or rejects.
- **Respect takedown requests** from creators and landowners (admin can hide a place and its linked posts).

## Sources

### YouTube Data API v3

- Get an API key in Google Cloud Console. Default quota: **10,000 units/day**.
- `search.list` costs **100 units** → about 90 searches/day after other calls. `videos.list` costs 1 unit per call (up to 50 IDs per call).
- Useful search params: `q`, `type=video`, `location=lat,lng`, `locationRadius=30km`, `publishedAfter` (last 30 days on routine runs), `regionCode=IN`, `relevanceLanguage=en` (also run Kannada queries), `videoDuration=short` to focus on Shorts, `order=date` or `viewCount`.
- `location` only matches videos the uploader geotagged, which is rare. Run **both** a location search and keyword searches per region.
- Then call `videos.list?part=snippet,statistics,recordingDetails` for full description, tags, view count, and `recordingDetails.location` when present.
- Captions/transcripts are not downloadable through the API for other people's videos. Use title, description and tags only.
- Store `external_id` = video ID. Embed with `https://www.youtube.com/embed/{id}`.

### Instagram Graph API

- Requires: an **Instagram Business or Creator account** connected to a Facebook Page, a Meta developer app, and **app review** for the `instagram_basic` and Instagram Public Content Access feature. Plan for this to take weeks and possibly be refused.
- Hashtag search: `GET /ig_hashtag_search?user_id={ig-user-id}&q={tag}` → hashtag ID, then `/{hashtag-id}/recent_media` (last 24 hours) and `/{hashtag-id}/top_media`.
- Limit: **30 unique hashtags per rolling 7 days** per account. Pick them per region (e.g. `#sakleshpur`, `#chikmagalurdiaries`, `#kudremukh`, `#kalasa`).
- Returned fields include caption, media type, permalink, timestamp, like and comment counts. **Location is not returned** for other users' media, so the place always comes from the caption.
- Display with Instagram oEmbed (needs a Meta app token).
- Fallback that needs no approval: users paste reel links in "Add a place" (`source = 'user_link'`); we store the link and the text they type.

### User submissions

The most reliable source of exact pins. See Phase 5.

## Pipeline

```
discovery_region (name, center, radius, keywords, hashtags)
      │  nightly job, per active region, within quota
      ▼
1. FETCH     YouTube search (keywords × region) + Instagram hashtags
             → upsert social_post (status 'new'), skip already-seen IDs
      ▼
2. EXTRACT   LLM reads title + caption + tags → extracted JSON
             → status 'extracted' (or 'ignored' if not a place)
      ▼
3. LOCATE    if post has geo: use it
             else geocode "name, nearest_town, district, Karnataka" via Nominatim
             → keep only results within region radius + 20 km
      ▼
4. MATCH     existing place within 2 km with name similarity > 0.4 (pg_trgm)
             or alt_names match → link post to place (status 'matched')
             else → status 'candidate'
      ▼
5. GROUP     candidates with similar names within 3 km are grouped into one card
      ▼
6. REVIEW    admin queue: embedded post(s), extracted fields, draggable pin
             Approve → create place (status 'verified', source 'youtube'/'instagram')
                       + place_guide from extracted hints (reviewer edits)
             Reject  → status 'rejected' with reason
      ▼
7. SIGNALS   trending_score = sum over posts in last 30 days of log10(1 + views)
             recomputed nightly; "Trending" badge above a threshold
```

## LLM extraction

Use the Anthropic API (Claude Haiku class model for cost; batch requests). Ask for strict JSON and validate with Zod; drop results that fail validation.

System prompt:

```
You extract travel places from social media posts about Karnataka and nearby regions of India.
Return JSON only, matching the schema. If the post is not about a specific visitable place
(e.g. a vlog intro, a food review with no place, a product ad), return {"is_place": false}.
Never invent a place name that is not in the text. Use null when unsure.
```

User message: the region name, then `TITLE:`, `DESCRIPTION:`, `TAGS:`.

Output schema:

```json
{
  "is_place": true,
  "places": [
    {
      "name": "Kallathigiri Falls",
      "alt_names": ["Kalhatti Falls"],
      "category": "waterfall",
      "nearest_town": "Kemmangundi",
      "district": "Chikkamagaluru",
      "confidence": 0.8,
      "hints": {
        "best_months": [7, 8, 9, 10],
        "vehicle": "bike",
        "access_note": "Short walk from the road",
        "carry": ["raincoat", "leech_socks"],
        "warnings": ["Slippery rocks"]
      }
    }
  ]
}
```

`category` must be one of the `category.slug` values. A post can mention several places; create one candidate per place.

## Scheduling and budgets

- Nightly job processes regions ordered by `last_run_at`, stopping when the YouTube quota budget (default 9,000 units) or the Instagram hashtag budget is reached.
- Keep a `api_usage` table (date, provider, units) to enforce budgets across runs.
- LLM: batch up to 50 posts per run per region; cache by post ID so re-runs never re-extract.

## Seed discovery regions

| Region | Center (lat, lng) | Radius | Keywords |
|---|---|---|---|
| Sakleshpur | 12.943, 75.785 | 30 km | "Sakleshpur hidden places", "Sakleshpur waterfall", "Bisle ghat", "Sakleshpur trek" |
| Mudigere / Kottigehara | 13.136, 75.640 | 25 km | "Mudigere viewpoint", "Kottigehara", "Charmadi ghat" |
| Chikkamagaluru | 13.316, 75.772 | 35 km | "Chikmagalur hidden places", "Chikmagalur waterfall", "Mullayanagiri" |
| Kalasa / Kudremukh | 13.234, 75.357 | 30 km | "Kalasa", "Kudremukh", "Horanadu", "Samse" |
