# AstraScope

Formerly OrbiWatch.

![AstraScope: Earth with satellite orbital paths](docs/images/orbitwatch-hero.png)

AstraScope is an interactive space-monitoring platform built with React, Three.js, and FastAPI. Explore Earth's orbital neighborhood and near-space activity in real time through satellite tracking, near-Earth object close approaches, and reconstructed atmospheric fireball events.

## Features

- the complete public CelesTrak active catalog with automatic SatNOGS fallback
- persistent, provenance-aware caching that automatically recovers to the primary catalog
- compressed catalog responses for efficient delivery of thousands of orbital records
- SGP4/SDP4 propagation from OMM and TLE orbital elements
- GPU-instanced rendering for thousands of spacecraft
- operator, orbit-class, name, and NORAD filtering
- side-by-side comparison of live orbital and mission data
- pause, real time, and accelerated simulation up to 600×
- selected-satellite ground track and coverage footprint
- current latitude, longitude, altitude, purpose, operator, and catalog metadata
- saved or device-based observer location
- upcoming 24-hour pass predictions above 10° elevation
- Sky Tonight forecast ranking Watchlist passes by rise time and geometric conditions
- responsive desktop and mobile interface
- split Vercel frontend and Render API deployment configuration
- Impact Watch for upcoming near-Earth object approaches, potentially hazardous classifications, and recent atmospheric fireballs
- Global Orbital Catalog modes for active satellites, propagable on-orbit objects, and the broader public SATCAT
- rocket-body and opt-in debris visualization layers with GPU-instanced markers
- paginated public-catalog search by name, NORAD ID, international designator, and owner

## Global Orbital Catalog

AstraScope separates orbital propagation data from catalog metadata so it can represent objects responsibly without inventing positions. **Active Satellites** remains the default and loads current propagable payloads. **On-Orbit Objects** can include inactive payloads and optional rocket-body and debris layers when the configured orbital provider supplies current GP elements. **All Public Catalog** searches CelesTrak SATCAT metadata, including records that have no current elements; those records are labeled “Orbital elements unavailable” and are not rendered on the globe.

The API exposes separate, cache-aware concepts:

- `GET /catalog/summary` — real provider-derived counts by object type and status
- `GET /catalog/objects` — paginated metadata with mode, type, status, orbit, and search filters
- `GET /catalog/search` — search alias for the paginated metadata endpoint
- `GET /catalog/objects/{norad_id}` — selected-object metadata joined to cached orbital data
- `GET /catalog/orbits` — lightweight propagable records for the globe
- `GET /catalog/providers` — credential-safe provider health and last-success timestamps

The legacy `GET /satellites` endpoint remains available for existing clients and deep links. Existing `?satellite=…` URLs and device-local Watchlists are preserved.

AstraScope aggregates publicly available orbital data. Restricted, classified, newly launched, lost, or uncataloged objects may not be represented.

## Data Sources

- **CelesTrak GP** supplies public OMM-compatible general perturbations data. AstraScope uses structured JSON rather than relying exclusively on fixed-width TLEs, allowing modern NORAD catalog numbers above 99,999. Orbital downloads are cached for two hours.
- **CelesTrak SATCAT** supplies the daily bulk public catalog used for object type, operational status, ownership, launch/decay, and catalog-orbit metadata. It is cached separately for 24 hours and joined by NORAD catalog number.
- **Space-Track** is the preferred full GP source only when backend `SPACE_TRACK_IDENTITY` and `SPACE_TRACK_PASSWORD` credentials are configured. The application uses `class/gp`, never `gp_history`, persists successful results, and limits full-catalog refreshes to no more than hourly.
- **SatNOGS DB** is an orbital fallback and a future on-demand radio enrichment source. SatNOGS data is available under CC BY-SA 4.0; transmitter data is not included in the bulk globe payload.
- **ESA DISCOS** is not enabled in this release. It remains an optional authenticated enrichment source; AstraScope does not fail when DISCOS credentials are absent.

Provider names are returned with records through `dataSources`. Provider credentials remain backend-only, are never placed in `VITE_` variables, and are not returned by provider-health APIs. The last successful local catalog remains available during transient provider outages. CelesTrak, Space-Track, SatNOGS, and ESA retain ownership of and set the usage terms for their respective data.

## Satellite Experience

Selecting a spacecraft opens a responsive detail panel with its propagated position and velocity, orbital period, identifiers, operator/category data, orbital-element epoch, and curated launch details when those facts are available. The selected marker and orbit are emphasized in the 3D view, and **Focus satellite** performs a smooth, temporary camera move while preserving normal orbit controls afterward.

Actions include a smooth one-shot focus, continuous follow mode with an explicit exit, orbit-aware View Orbit framing, Watchlist add/remove, copy a canonical `?satellite=…` share link, and open an authoritative source. The device-local Watchlist preserves existing AstraScope storage and legacy OrbiWatch migration. The default globe prioritizes active payloads; optional rocket-body and debris layers do not limit full public-catalog search. When an observer location is set, the panel shows passes above 10°, including rise/set time, duration, maximum elevation, range, and propagated directions. These are orbital passes, not guarantees of naked-eye visibility.

Imagery is deliberately limited to a reviewed metadata map for notable spacecraft and families (ISS, Hubble, Landsat, NOAA, GPS, Starlink, and Sentinel). Verified imagery includes an explicit credit and source link. Other objects use compact category-based AstraScope fallback artwork; the same fallback replaces any image that fails to load. Metadata is static and cached with the catalog—AstraScope does not scrape image search or invent missing launch facts. Public orbital catalogs remain incomplete, propagated positions become less reliable as elements age, and generic constellation descriptions do not identify an individual spacecraft's exact mission.

## Impact Watch

Use the in-app mode selector to switch between Satellite Watch and Impact Watch. The selected view is reflected in the URL (`?view=impact`), so Impact Watch can be bookmarked or shared and browser Back/Forward navigation works as expected. Impact Watch displays NASA/JPL NeoWs close approaches for the next seven days and CNEOS fireball records for selectable recent periods. It includes hazardous-classification, date, diameter, energy, and coordinate-availability filters. Fireballs with reported coordinates are plotted on the existing globe; events without coordinates remain available in the list.

“Potentially hazardous” is a NASA/JPL classification based on an object's size and how closely its orbit can approach Earth. It does **not** mean an impact is predicted. Close-approach distances are computed by NASA/JPL, and fireballs are detected or reconstructed atmospheric events reported by U.S. Government sensors. Coverage and fields can be incomplete. AstraScope does not calculate collision probability or asteroid trajectories and is not an emergency warning, navigation, or planetary-defense system.

Backend endpoints (also available with an `/api` prefix):

- `GET /impact/neos?days=7&hazardous=false&min_diameter_km=0`
- `GET /impact/fireballs?days=30&min_energy=0&has_coordinates=true`

Responses contain normalized camel-case records, provider provenance, update time, and structured upstream errors. Impact responses are cached in-process for 15 minutes. The JPL Fireball API is unauthenticated. NeoWs uses the backend-only `NASA_API_KEY`; it defaults to NASA's rate-limited `DEMO_KEY` for local evaluation. Set a registered key in production, and never place it in a `VITE_` variable.

Orbital predictions are intended for education and visualization—not navigation, conjunction assessment, or operational decisions.

## Local development

Install dependencies:

```powershell
npm install
python -m pip install -r backend/requirements-dev.txt
```

Run the API and frontend in separate terminals:

```powershell
npm run dev:backend
```

```powershell
npm run dev:frontend
```

Open http://127.0.0.1:5173. The API health check is at http://127.0.0.1:8000/api/health.

## Validation

```powershell
npm run lint:frontend
npm run build:frontend
npm --prefix frontend test -- --run
python -m pytest backend/tests -q
```

## Deployment

Legacy production domains currently remain active during the branding migration. Keep the existing Vercel and Render project identifiers and URLs until the application branding is verified in production.

### Frontend — Vercel

Import `GuillermoBarreto/orbiwatch` into Vercel with these settings:

- Provider: Vercel
- Root directory: `frontend`
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`
- Required environment variable: `VITE_API_BASE_URL`

Set `VITE_API_BASE_URL` to the public Render service URL without a trailing slash, for example `https://orbiwatch-api.onrender.com`. Vite embeds `VITE_` variables in the client bundle, so never store secrets or API keys in them.

### Backend — Render

The root `render.yaml` defines the API service. The equivalent manual settings are:

- Provider: Render
- Service type: Web Service
- Runtime: Python
- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`

Required Render environment variables:

```text
APP_ENV=production
CORS_ORIGINS=https://orbiwatch.vercel.app
NASA_API_KEY=your-nasa-api-key
```

Optional Space-Track credentials enable the broader catalog of recently propagable tracked objects,
including inactive payloads, rocket bodies, and debris. Keep these values in Render's secret environment
settings—never commit them or expose them through `VITE_` variables:

```text
SPACE_TRACK_IDENTITY=your-space-track-email
SPACE_TRACK_PASSWORD=your-space-track-password
```

Without those credentials, AstraScope uses CelesTrak's complete public active catalog. SatNOGS remains the
last-resort fallback. Catalog downloads are cached for two hours, staying below Space-Track's documented
limit of one bulk GP request per hour.

Replace the example Vercel URL with the production domain assigned to the frontend. `CORS_ORIGINS` accepts comma-separated origins, so a future custom domain can be added without code changes:

```text
CORS_ORIGINS=https://orbiwatch.vercel.app,https://www.guillermobarreto.dev
```

Deploy the Render backend first, copy its public URL into Vercel as `VITE_API_BASE_URL`, and then deploy the frontend. No final deployment URL is hardcoded in source.

## Data architecture

AstraScope prefers CelesTrak's active OMM catalog and complies with its one-download-per-update policy by caching for two hours. If CelesTrak is unavailable or rate-limited before the first cache fill, the API uses the open SatNOGS TLE catalog. The latest successful normalized catalog is persisted in `backend/.cache` and served during upstream outages.

## Repository structure

- `frontend/`: React, TypeScript, TailwindCSS, React Three Fiber, and satellite.js
- `backend/`: FastAPI catalog aggregation, normalization, caching, and CORS configuration
- `backend/app/api/impact.py`: validated Impact Watch routes and structured failure responses
- `backend/app/services/`: NASA/JPL adapters, normalization, and request caching
- `backend/tests/`: catalog normalization and classification tests
- `docs/`: project imagery and architecture notes
- `render.yaml`: Render backend deployment configuration
