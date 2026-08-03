# OrbitWatch

![OrbitWatch: Earth with satellite orbital paths](docs/images/orbitwatch-hero.png)

OrbitWatch is a modern portfolio project for exploring Earth and satellite systems in a 3D web experience.

## Current features

OrbitWatch now includes:

- a live public catalog of 10,000+ active spacecraft sourced from CelesTrak
- current-position orbital propagation from GP/OMM elements
- an interactive, GPU-instanced 3D Earth view supporting thousands of markers
- search by satellite name or NORAD ID
- operator and orbit-class filters for SpaceX, OneWeb, Amazon, Planet, NASA, and more
- satellite inspection with altitude, inclination, epoch, and catalog metadata

## Repository structure

- frontend/: React application and UI foundation
- backend/: FastAPI API and server configuration
- docs/: architecture notes and implementation decisions
- .github/: repository automation and future CI workflows

## Getting started

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at http://localhost:5173.

### Backend

```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

If dependencies were installed before the satellite catalog was added, run the `pip install` command again so the backend has the trusted CA bundle used for CelesTrak HTTPS requests.

The API health endpoint is available at http://localhost:8000/health and the catalog at http://localhost:8000/api/satellites.

The full active catalog is cached in memory and on disk for two hours to comply with CelesTrak's one-download-per-update policy. If CelesTrak is temporarily unavailable, the last successful catalog remains available. Orbital positions are visual estimates and must not be used for navigation or conjunction assessment.

## Environment variables

Copy the backend example environment file before running the API:

```bash
cp backend/.env.example backend/.env
```

## Notes on architecture decisions

- The project uses a monorepo structure to keep frontend and backend concerns separated while still sharing documentation and tooling.
- Vite was selected for the frontend because it offers a fast development loop and a modern TypeScript experience.
- FastAPI was chosen for the backend because it is simple, high-performing, and a strong fit for API-first product development.
- React Three Fiber and Drei were included early so the 3D visualization layer can be introduced without re-architecting the app later.
