# OrbitWatch

![OrbitWatch: Earth with satellite orbital paths](docs/images/orbitwatch-hero.png)

OrbitWatch is an interactive 3D satellite explorer built with React, Three.js, and FastAPI. It combines public orbital catalogs with SGP4/SDP4 propagation to visualize spacecraft positions, ground tracks, coverage footprints, and upcoming passes over an observer.

## Features

- live public catalogs from CelesTrak with automatic SatNOGS fallback
- persistent, rate-limit-aware catalog caching
- SGP4/SDP4 propagation from OMM and TLE orbital elements
- GPU-instanced rendering for thousands of spacecraft
- operator, orbit-class, name, and NORAD filtering
- pause, real time, and accelerated simulation up to 600×
- selected-satellite ground track and coverage footprint
- current latitude, longitude, altitude, purpose, operator, and catalog metadata
- saved or device-based observer location
- upcoming 24-hour pass predictions above 10° elevation
- responsive desktop and mobile interface
- split Vercel frontend and Render API deployment configuration

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
```

Replace the example Vercel URL with the production domain assigned to the frontend. `CORS_ORIGINS` accepts comma-separated origins, so a future custom domain can be added without code changes:

```text
CORS_ORIGINS=https://orbiwatch.vercel.app,https://www.guillermobarreto.dev
```

Deploy the Render backend first, copy its public URL into Vercel as `VITE_API_BASE_URL`, and then deploy the frontend. No final deployment URL is hardcoded in source.

## Data architecture

OrbitWatch prefers CelesTrak's active OMM catalog and complies with its one-download-per-update policy by caching for two hours. If CelesTrak is unavailable or rate-limited before the first cache fill, the API uses the open SatNOGS TLE catalog. The latest successful normalized catalog is persisted in `backend/.cache` and served during upstream outages.

## Repository structure

- `frontend/`: React, TypeScript, TailwindCSS, React Three Fiber, and satellite.js
- `backend/`: FastAPI catalog aggregation, normalization, caching, and CORS configuration
- `backend/tests/`: catalog normalization and classification tests
- `docs/`: project imagery and architecture notes
- `render.yaml`: Render backend deployment configuration
