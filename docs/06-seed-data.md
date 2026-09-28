# 06 · Seed data

Seed places for the Bengaluru → Kalasa demo. Coordinates are approximate (±500 m) and were not surveyed; **verify each pin on a map before launch**. Guide fields are a starting point for a human editor. Ratings are not seeded: they come from real reviews.

`scripts/seed.ts` should read the JSON block below.

## Categories

`temple, heritage, fort, viewpoint, waterfall, trek, lake, beach, food, coffee, fuel, stay, town`

## Carry items

`raincoat, leech_socks, cash, torch, jacket, gloves, water_2l, cap, trekking_shoes, grip_shoes, socks_hot_rock, modest_clothing, traditional_attire, snacks, dry_bag, spare_clothes, power_bank, first_aid, forest_permit`

## Places

```json
[
  {
    "slug": "shravanabelagola", "name": "Shravanabelagola (Gommateshwara)", "category": "heritage",
    "lat": 12.8543, "lng": 76.4847, "district": "Hassan",
    "guide": { "best_vehicles": ["bike","car"], "last_mile_note": "Park at the base. About 620 rock-cut steps, climbed barefoot.",
      "best_months": [10,11,12,1,2], "ok_months": [3,7,8,9], "avoid_months": [4,5],
      "best_time_of_day": "Before 9 am", "visit_duration_min": 120 },
    "carry": [["socks_hot_rock",[]],["water_2l",[]],["cap",[]]]
  },
  {
    "slug": "hasanamba-temple", "name": "Hasanamba Temple", "category": "temple",
    "lat": 13.0033, "lng": 76.1004, "district": "Hassan",
    "guide": { "best_vehicles": ["bike","car"], "notes": "Open only for about 10 days a year around Deepavali (Oct/Nov). Check dates.",
      "best_months": [10,11], "visit_duration_min": 90 },
    "carry": [["cash",[]]]
  },
  {
    "slug": "manjarabad-fort", "name": "Manjarabad Fort", "category": "fort",
    "lat": 12.9180, "lng": 75.7340, "district": "Hassan",
    "guide": { "best_vehicles": ["bike","car"], "last_mile_note": "Right off NH75; about 250 steps up.",
      "best_months": [8,9,10,11,12,1], "ok_months": [2,3,6,7], "visit_duration_min": 45 },
    "carry": [["raincoat",[6,7,8,9]],["grip_shoes",[]]]
  },
  {
    "slug": "bisle-ghat-viewpoint", "name": "Bisle Ghat Viewpoint", "category": "viewpoint",
    "lat": 12.7300, "lng": 75.6870, "district": "Hassan",
    "guide": { "best_vehicles": ["bike","car"], "last_mile_note": "Narrow, broken road through forest. No shops or fuel.",
      "best_months": [9,10,11,12], "avoid_months": [7], "visit_duration_min": 60 },
    "carry": [["snacks",[]],["leech_socks",[6,7,8,9,10]]]
  },
  {
    "slug": "devaramane", "name": "Devaramane Viewpoint", "category": "viewpoint",
    "lat": 13.0600, "lng": 75.5700, "district": "Chikkamagaluru",
    "guide": { "best_vehicles": ["bike"], "last_mile_note": "Last stretch is a narrow single-lane road.",
      "best_months": [10,11,12,1,2], "best_time_of_day": "Sunset", "visit_duration_min": 60 },
    "carry": [["jacket",[]],["torch",[]]]
  },
  {
    "slug": "ballalarayana-durga", "name": "Ballalarayana Durga", "category": "trek",
    "lat": 13.1500, "lng": 75.4700, "district": "Chikkamagaluru",
    "guide": { "best_vehicles": ["bike","on_foot"], "last_mile_note": "Ride to Sunkasale, then about 2 hours trek each way.",
      "best_months": [9,10,11,12,1,2], "avoid_months": [6,7], "permit_needed": "Check forest department rules before going.",
      "visit_duration_min": 300 },
    "carry": [["leech_socks",[6,7,8,9,10]],["water_2l",[]],["trekking_shoes",[]],["forest_permit",[]]]
  },
  {
    "slug": "belur-chennakeshava", "name": "Chennakeshava Temple, Belur", "category": "temple",
    "lat": 13.1625, "lng": 75.8607, "district": "Hassan",
    "guide": { "best_vehicles": ["bike","car","bus"], "best_months": [10,11,12,1,2], "ok_months": [3,6,7,8,9],
      "visit_duration_min": 90, "notes": "Part of the UNESCO Sacred Ensembles of the Hoysalas." },
    "carry": [["cash",[]],["modest_clothing",[]]]
  },
  {
    "slug": "halebidu-hoysaleswara", "name": "Hoysaleswara Temple, Halebidu", "category": "heritage",
    "lat": 13.2130, "lng": 75.9940, "district": "Hassan",
    "guide": { "best_vehicles": ["bike","car","bus"], "best_months": [10,11,12,1,2,3], "best_time_of_day": "Morning", "visit_duration_min": 90 },
    "carry": [["cap",[]],["water_2l",[]]]
  },
  {
    "slug": "mullayanagiri", "name": "Mullayanagiri Peak", "category": "trek",
    "lat": 13.3910, "lng": 75.7210, "district": "Chikkamagaluru",
    "guide": { "best_vehicles": ["bike","car"], "last_mile_note": "Steep hairpins; large vehicles may be restricted on weekends. Short climb to the top.",
      "best_months": [10,11,12,1,2], "best_time_of_day": "Sunrise", "visit_duration_min": 120 },
    "carry": [["jacket",[]],["gloves",[11,12,1]],["water_2l",[]]]
  },
  {
    "slug": "hirekolale-lake", "name": "Hirekolale Lake", "category": "lake",
    "lat": 13.3330, "lng": 75.7290, "district": "Chikkamagaluru",
    "guide": { "best_vehicles": ["bike","car"], "best_months": [8,9,10,11,12,1], "best_time_of_day": "Sunset", "visit_duration_min": 45 },
    "carry": [["snacks",[]]]
  },
  {
    "slug": "kalaseshwara-temple", "name": "Kalaseshwara Temple, Kalasa", "category": "temple",
    "lat": 13.2340, "lng": 75.3560, "district": "Chikkamagaluru",
    "guide": { "best_vehicles": ["bike","car"], "best_months": [10,11,12,1,2], "visit_duration_min": 45 },
    "carry": [["modest_clothing",[]]]
  },
  {
    "slug": "horanadu-annapoorneshwari", "name": "Horanadu Annapoorneshwari Temple", "category": "temple",
    "lat": 13.2640, "lng": 75.3250, "district": "Chikkamagaluru",
    "guide": { "best_vehicles": ["bike","car","bus"], "dress_code": "Traditional attire required. Confirm current rules before visiting.",
      "best_months": [10,11,12,1,2,3], "ok_months": [4,5,9], "visit_duration_min": 90 },
    "carry": [["traditional_attire",[]],["cash",[]]]
  },
  {
    "slug": "hanuman-gundi-falls", "name": "Hanuman Gundi Falls", "category": "waterfall",
    "lat": 13.2000, "lng": 75.2400, "district": "Chikkamagaluru",
    "guide": { "best_vehicles": ["bike","car"], "last_mile_note": "On the Kudremukh road, then a few hundred steps down.",
      "best_months": [8,9,10,11], "notes": "May be closed in heavy monsoon. Check before going.", "visit_duration_min": 75 },
    "carry": [["leech_socks",[6,7,8,9,10]],["dry_bag",[]],["spare_clothes",[]]]
  }
]
```

## Towns (for via labels)

```json
[
  {"name":"Bengaluru","lat":12.9716,"lng":77.5946},
  {"name":"Kunigal","lat":13.0232,"lng":77.0272},
  {"name":"Channarayapatna","lat":12.9030,"lng":76.3900},
  {"name":"Hassan","lat":13.0068,"lng":76.0996},
  {"name":"Sakleshpur","lat":12.9430,"lng":75.7850},
  {"name":"Mudigere","lat":13.1360,"lng":75.6400},
  {"name":"Kottigehara","lat":13.1180,"lng":75.5240},
  {"name":"Belur","lat":13.1650,"lng":75.8650},
  {"name":"Chikkamagaluru","lat":13.3161,"lng":75.7720},
  {"name":"Balehonnur","lat":13.3600,"lng":75.4600},
  {"name":"Kalasa","lat":13.2340,"lng":75.3560}
]
```

After the MVP, import more places from OpenStreetMap with an Overpass query over Karnataka for `tourism=viewpoint|attraction`, `historic=*`, `natural=waterfall|peak`, `amenity=place_of_worship` (filtered to notable ones via `wikidata` tag), as `status='unverified'`, `source='osm'`.
