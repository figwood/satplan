# SatPlan - Satellite Planning System (Static)

The SatPlan experience is now delivered as a static OpenLayers planner. The entire application lives under `static/`, which means the UI can be deployed directly to Cloudflare Pages, Workers, or any static host without a Go backend or database.

![alt text](planning.png)

> This branch is a static-only variant of SatPlan, deployable to 
> Cloudflare Pages + Workers without a Go backend.  
> For the full-featured version with Go backend and Kubernetes support, 
> see the [main branch](../../tree/main).

## What's in this repo
- `static/index.html` – the single entry point with the satellite tree, controls, and the map surface.
- `static/script.js` – all the UI logic, including the embedded satellite tree and the localStorage cache guard.
- `static/styles.css` – the bespoke styles for the planner.

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
- The planner automatically calls the D1-backed `/api/tle/refresh` endpoint when a planning run starts and the stored TLEs are older than eight hours relative to the planning start time.
- If the automatic refresh fails, the UI console.logs the operator and continues with the latest available data.
- TLE CRUD now lives in D1: `/api/tle` supports GET/POST/PUT/DELETE, and `/api/tle/status` returns the most recent sync timestamp.

## Admin console
The repository also ships with `static/admin.html`, a browser-based admin console for maintaining the D1-backed catalog. When the Worker or Pages Functions are running, open `/admin` (or `/admin.html`) and sign in with a username/password stored in the `sys_user` table from `init.sql`. The page authenticates against `/api/admin/auth` with Basic Auth and stores the credentials in localStorage for the current browser.

Important: the lightweight `npx http-server -p 8080` workflow above is enough for viewing the planner UI, but it does not provide the `/api/admin/*` endpoints. To use the admin console locally, run the project through Wrangler so the Worker, D1 binding, and admin APIs are available.

The admin page is split into four tabs:
- `Satellites`: add, edit, and delete satellites. When creating or editing a satellite, paste a 2-line or 3-line TLE block and the form will parse the NORAD ID automatically; saving the satellite also writes the latest TLE record.
- `Sensors`: create and maintain sensor definitions for a selected satellite, including resolution, swath width, left/right side angles, observe angle, initial angle, and display color.
- `TLE Data`: review stored TLE rows, delete stale records, paste bulk 3-line TLE text for manual updates, or trigger `Auto Update` to fetch fresh orbital data from the configured external feeds.
- `TLE Sites`: manage the external TLE feed list used by automatic refreshes by adding, editing, or removing site name, source URL, and description entries.

For local development with admin features enabled, start the Worker from the repo root with your untracked local config and then visit the admin route in the browser:

```bash
npx wrangler dev --config wrangler.local.toml
```

## Twilight line visualization
- The map can render the day-night terminator (twilight line) so operators can quickly see illumination conditions on Earth.
- In normal browsing mode, the terminator is drawn using the current timeline position.
- When a planning result is available, the twilight line is no longer static: it is replayed alongside the planning timeline and updates continuously for each planning time step.
- This makes it easier to judge whether each scheduled observation window happens in daylight, nighttime, or near sunrise/sunset transition zones.

## Interactive strip details panel

After a planning run completes, clicking anywhere on the map inspects the scan strips at that location:

- **Single strip** — a panel slides in from the right edge of the map showing the satellite name, sensor name, resolution, start time, and stop time (UTC) for that strip.
- **Overlapping strips** — the panel lists all strips that cover the clicked point. The first strip is selected automatically; clicking any item in the list switches the active selection.
- **Active selection** — the selected strip is highlighted on the map (bold red outline, stronger fill) and its corresponding row in the results table is highlighted and scrolled into view.
- **Dismiss** — click the × button in the panel header, or click an empty area of the map, to close the panel.

The panel closes automatically whenever the displayed strip list changes (e.g. after applying a filter or running auto-select).

## Filtering and auto-selecting planning results

After a planning run completes, two post-processing buttons become available in the results toolbar.

### Filter by lighting condition
The **Filter** button opens a dialog with two checkboxes — **Day** and **Night** — that let operators narrow the displayed observation windows by illumination condition. Selecting only **Day** hides every strip whose midpoint falls in the Earth's shadow; selecting only **Night** does the inverse. When both boxes are checked (the default) all results are shown. The filtered view updates both the results table and the map simultaneously.

### Greedy auto-select
The **Auto-select** button opens a dialog where operators choose an optimization objective, then runs a greedy coverage algorithm over the current results table to tick the minimal useful subset of observation strips. Three objectives are available:

| Objective | Behaviour |
|---|---|
| **Max coverage** | Greedy set-cover: repeatedly picks the strip that adds the most new grid points to the covered area until no uncovered points remain. |
| **Min time** | Picks strips in order of highest coverage-per-second ratio, minimising total cumulative observation time while still growing coverage at each step. |
| **Min strips** | Like max coverage, but stops as soon as the marginal gain of the next-best strip drops below 1 % of the planning-area grid (fewest strips for near-complete coverage). |

The algorithm samples the planning area on a 25 × 25 grid and uses ray-casting to test which grid points each strip polygon covers. After auto-select runs, the table checkboxes reflect the chosen subset and the map redraws to show only those strips.

## D1-backed satellite catalog
`index.js` reads the tables inside `init.sql` and exposes a `/api/satellites` endpoint that mirrors the satellite/sensor/TLE hierarchy consumed by the planner. The endpoint is wired to the `SATPLAN_D1` binding declared in `wrangler.toml`, so deployers can ship the SQL seed, connect it to a Cloudflare D1 database, and let the UI surface live data. When the API is unreachable (for example, during local static hosting), the planner silently falls back to the embedded tree described above.

## Deploying to Cloudflare
1. Build or bundle your `static/` directory (including `index.html`, `script.js`, `styles.css`, and `tiles/`). The Pages preview now also runs the `functions/api/satellites.js` handler, so you can run `wrangler pages dev static --local` from the repo root to exercise the D1-backed tree while developing.
2. Push those files to Cloudflare Pages or reference them from a Cloudflare Worker. No backend service or database is required anymore—just serve the static files over HTTPS. Make sure the `SATPLAN_D1` binding in `wrangler.toml` points at your D1 database and that the schema from `satplan.sql` is imported into that database before publishing.
3. Ensure the `/api/tle/refresh` endpoint is reachable in production so the planner can automatically keep orbital data current.
