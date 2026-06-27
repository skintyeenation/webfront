# Skin Tyee Nation — territory map & boundary analysis

Source image: [`skin-tyee-territory-map.jpeg`](skin-tyee-territory-map.jpeg) —
a scan titled **"Locations of Guiding Territory Certificate 601114 and Skin Tyee
Nation."** Hand annotations on the scan: *"TRAPLINE"*, *"LoO #64…"*.

> **Caveat:** the scan has **no lat/long graticule**, so all coordinates below are
> **estimates** georeferenced by eye against labelled towns/lakes + the 0–80 km
> scale bar. Treat as approximate; replace with the **official shapefile** (band
> office / BC FNESS / the GTC + trapline registries) before any legal/GIS use.

## What the map shows (legend)

- **Black outline** — **Skin Tyee Nation** territory (the large area).
- **Red outline** — **GTC 601114** (Guiding Territory Certificate), a smaller area
  in the centre, just south of Francois Lake.
- **Green hatch** — Parks & Protected Areas (e.g. **Tweedsmuir Park** to the south).
- Callout **"LoO 6404152"** points to a trapline (Licence of Occupation) near the
  GTC, east of Tetachuck.
- Inset: location within BC — central interior, between **Smithers**, **Prince
  George**, and **Williams Lake**.

## Region & extent (Skin Tyee Nation black outline)

Central interior British Columbia, on the **Nechako Plateau**, centred around
**Francois Lake / Ootsa Lake**. Framed by the communities of **Houston** (NW),
**Burns Lake** (N), **Fraser Lake** & **Vanderhoof** (E), with **Tweedsmuir Park**
to the south.

**Approximate bounding box**

| | Lat | Lng |
|---|---|---|
| North | ~54.55° N | (Houston / Morice area) |
| South | ~53.15° N | (south of Tweedsmuir) |
| West | | ~127.30° W (Morice/Kemano) |
| East | | ~123.95° W (Vanderhoof/Chilako) |

**Centre (approx.):** `53.85° N, 125.60° W` · span ≈ **225 km E–W × 155 km N–S**.

## Approximate boundary polygon (estimate)

Clockwise from the NW corner — `[lat, lng]`:

```json
[
  [54.55, -127.10],
  [54.48, -126.55],
  [54.33, -125.75],
  [54.10, -124.80],
  [54.02, -123.98],
  [53.55, -124.30],
  [53.20, -125.20],
  [53.15, -126.30],
  [53.25, -127.10],
  [53.90, -127.25],
  [54.55, -127.10]
]
```

(Used by the website's interactive territory hero — `website/web/lib/territory.ts`.)

## Key features inside the territory

- **Towns:** Houston, Burns Lake, Fraser Lake, Vanderhoof (E edge).
- **Lakes:** Francois, Ootsa, Tahtsa, Whitesail, Eutsuk, Morice, Fraser.
- **Rivers:** Nechako, Chilako, Dean, plus the West Road (Blackwater) corridor.
- **Parks:** Tweedsmuir (S).

## Important distinction

The black outline is the **asserted/traditional territory** (a broad area). It is
**not** the Indian Reserve (IR) parcels — Skin Tyee's reserves are small parcels
(around Francois/Uncha Lake) and are not delineated separately on this scan. Do
not conflate "territory" with "reserve" in any data model.
