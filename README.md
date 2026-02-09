# SatPlan - Satellite Planning System (Static)

The SatPlan experience is now delivered as a static OpenLayers planner. The entire application lives under `static/`, which means the UI can be deployed directly to Cloudflare Pages, Workers, or any static host without a Go backend or database.

## What's in this repo
- `static/index.html` – the single entry point with the satellite tree, controls, and the map surface.
- `static/script.js` – all the UI logic, including the embedded satellite tree, TLE refresh button, and the localStorage cache guard.
- `static/styles.css` – the bespoke styles for the planner.
- `static/tiles/` – pre-generated map tiles. Keep this folder when publishing so the planner can fall back to fast local imagery.

## Running locally
1. `cd static` (the entire UI lives inside this directory).
2. Run any static server, for example:
   ```bash
   npx http-server -p 8080
   ```
3. Open `http://localhost:8080` in a browser. The planner no longer depends on Go, JWTs, or a database.

## Customizing the satellite tree
The satellite and sensor hierarchy is still defined inside the `EMBEDDED_TREE_DATA` constant in `static/script.js`, but the UI now prefers the D1-backed catalog described below before falling back to this embedded snapshot. Update or extend the `satellite` entries (NORAD IDs, colors, TLE lines) and their child `sensor` objects (resolutions, observation angles) if you need a quick override or want to test without the API.

## TLE updates, caching, and status
- The `Refresh TLE` button in the map controls is wired to a fixed feed: `https://celestrak.com/NORAD/elements/resource.txt`. The URL is defined in `static/script.js` if you ever need a different source.
- Every successful fetch parses the returned 2/3-line blocks, writes the latest lines into the tree, and caches the resulting payload plus a timestamp in `localStorage` under `satplanTLECache`.
- The UI now shows the last successful sync time (UTC) and turns the status label green when the cache is fresh, orange if it is older than eight hours, and red when a refresh fails. Explicit error text is shown in the status strip whenever the fetch cannot reach the feed.
- Caching in `localStorage` protects the upstream provider from being hit every planning run. To force re-sync, either use the refresh button (it overwrites the cache) or run `localStorage.removeItem('satplanTLECache')` in the browser console before clicking “Refresh TLE”.

## Tiles & assets
Keep `static/tiles/` in the deployment bundle so OpenLayers can load the bundled imagery. If you regenerate tiles locally, overwrite the files inside `tiles/` before publishing so the planner uses the newest basemap data.

## D1-backed satellite catalog
`functions/api/satellites.js` reads the tables inside `satplan.sql` and exposes a `/api/satellites` endpoint that mirrors the satellite/sensor/TLE hierarchy consumed by the planner. The endpoint is wired to the `SATPLAN_D1` binding declared in `wrangler.toml`, so deployers can ship the SQL seed, connect it to a Cloudflare D1 database, and let the UI surface live data. When the API is unreachable (for example, during local static hosting), the planner silently falls back to the embedded tree described above.

## Deploying to Cloudflare
1. Build or bundle your `static/` directory (including `index.html`, `script.js`, `styles.css`, and `tiles/`). The Pages preview now also runs the `functions/api/satellites.js` handler, so you can run `wrangler pages dev static --local` from the repo root to exercise the D1-backed tree while developing.
2. Push those files to Cloudflare Pages or reference them from a Cloudflare Worker. No backend service or database is required anymore—just serve the static files over HTTPS. Make sure the `SATPLAN_D1` binding in `wrangler.toml` points at your D1 database and that the schema from `satplan.sql` is imported into that database before publishing.
3. Keep the `Refresh TLE` button handy in production so operators can refresh the orbital data without touching a backend.
