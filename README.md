# OrbitWatch

![OrbitWatch: Earth with satellite orbital paths](docs/images/orbitwatch-hero.png)

OrbitWatch is a modern portfolio project for exploring Earth and satellite systems in a 3D web experience.

## Current milestone

This repository now contains the foundation for a scalable monorepo with:

- a Vite + React + TypeScript frontend
- a FastAPI backend with CORS and a health endpoint
- TailwindCSS styling support
- React Three Fiber and Drei installed for future 3D work
- strict TypeScript configuration and path aliases

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

The API health endpoint is available at http://localhost:8000/health.

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
