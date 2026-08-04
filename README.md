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
- containerized production deployment

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

## Production deployment

The included `Dockerfile` builds the Vite frontend and serves it with FastAPI from one container. `render.yaml` defines a free Render web service with CI-gated automatic deployment and a health check.

[Deploy OrbitWatch to Render](https://render.com/deploy?repo=https://github.com/GuillermoBarreto/orbiwatch)

The Render dashboard will ask you to connect GitHub and approve creation of the `orbitwatch` web service. No API keys are required. Once deployed, the frontend and API use the same origin, avoiding CORS and environment-variable setup.

You can also run the production container locally:

```powershell
docker build -t orbitwatch .
docker run --rm -p 8000:8000 orbitwatch
```

Then open http://127.0.0.1:8000.

## Data architecture

OrbitWatch prefers CelesTrak's active OMM catalog and complies with its one-download-per-update policy by caching for two hours. If CelesTrak is unavailable or rate-limited before the first cache fill, the API uses the open SatNOGS TLE catalog. The latest successful normalized catalog is persisted in `backend/.cache` and served during upstream outages.

## Repository structure

- `frontend/`: React, TypeScript, TailwindCSS, React Three Fiber, and satellite.js
- `backend/`: FastAPI catalog aggregation, normalization, caching, and static serving
- `backend/tests/`: catalog normalization and classification tests
- `docs/`: project imagery and architecture notes
- `render.yaml` and `Dockerfile`: production deployment
