# AstraScope Documentation

This folder holds project notes and architecture decisions for the AstraScope platform (formerly OrbiWatch).

## Current scope

- Monorepo structure for frontend and backend
- Vite + React + TypeScript frontend baseline
- FastAPI backend with CORS and health endpoint
- Shared environment configuration pattern

## Implemented architecture

- Satellite catalog aggregation and SGP4/SDP4 visualization
- Impact Watch with NASA/JPL near-Earth object and fireball adapters
- Shared interactive 3D Earth scene infrastructure
- Split Vercel frontend and Render FastAPI deployment
