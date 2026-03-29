# NAVIGEN - Smart Travel Guide

An AI-powered travel planning platform that generates day-wise itineraries with realistic stop pacing, budget-aware food and hotel suggestions, and transport cost estimation.

This monorepo includes:

- A FastAPI backend with planning and travel APIs
- A React frontend for trip creation, itinerary visualization, and interaction
- PostgreSQL support via Docker Compose

## Table of Contents

- Overview
- Key Features
- Tech Stack
- Repository Structure
- Quick Start (Local Development)
- Environment Configuration
- Run with Docker Compose
- API Overview
- Testing and Validation
- Troubleshooting
- Deployment Notes
- Contributing

## Overview

NAVIGEN helps users generate practical travel plans by combining:

- Budget tier constraints (hotel, food, activities)
- Pace-based stop counts per day
- Nearby attraction discovery and ranking
- Real-world travel distance estimation and transport costing
- Food and hotel recommendations with fallback resilience

## Key Features

- Budget-aware planning
	- Hotel, food, and stop costs constrained by budget tier
- Pace-aware itinerary generation
	- Relaxed, Balanced, and Fast-paced planning styles
- Daily meal coverage
	- Breakfast, Lunch, and Dinner included per day
- Hotel recommendation controls
	- Price-band filtering and lodging-only validation
- Transport expense model
	- Tier-based INR per-km rates with daily base costs
- Trip persistence
	- Save, list, fetch, and delete trips via API

## Tech Stack

### Backend

- Python 3.10+
- FastAPI
- SQLAlchemy + Alembic
- PostgreSQL (recommended)
- httpx for external API calls

### Frontend

- React (Create React App)
- React Router
- Axios
- Leaflet + React-Leaflet

### Infrastructure

- Docker + Docker Compose

## Repository Structure

```text
smart-travel-guide/
	backend/
		app/
			api/
			services/
			agents/
			db/
			schemas/
			ml/
		migrations/
		requirements.txt
	frontend/
		src/
		public/
		package.json
	docker-compose.yml
	README.md
	SETUP_GUIDE.md
```

## Quick Start (Local Development)

### Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer
- npm
- Git

### 1) Clone and enter project

```bash
git clone https://github.com/DhaneshKolu/Navigen-Smart_Travel_Guide.git
cd Navigen-Smart_Travel_Guide
```

### 2) Backend setup

Windows (PowerShell):

```powershell
cd backend
python -m venv ..\venv
..\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

macOS/Linux:

```bash
cd backend
python3 -m venv ../venv
source ../venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend health check:

- http://127.0.0.1:8000/health

### 3) Frontend setup

Open a new terminal:

```bash
cd frontend
npm install
npm start
```

Frontend will be available at:

- http://localhost:3000

## Environment Configuration

Create a backend environment file at backend/.env.

Example:

```env
DATABASE_URL=postgresql://travel_user:travel_pass@localhost:5432/travel_planner
SECRET_KEY=replace-with-a-strong-secret
ACCESS_TOKEN_EXPIRE_MINUTES=120
ALLOWED_ORIGINS=http://localhost:3000

# Optional external API keys
GOOGLE_PLACES_API_KEY=
GEOAPIFY_API_KEY=
OPENWEATHER_API_KEY=
ORS_API_KEY=
```

Notes:

- ALLOWED_ORIGINS supports comma-separated values
- Without external keys, fallback logic still keeps the app usable

## Run with Docker Compose

From project root:

```bash
docker compose up --build
```

Services:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- PostgreSQL: localhost:5432

To stop:

```bash
docker compose down
```

To stop and remove data volume:

```bash
docker compose down -v
```

## API Overview

Main backend app entrypoint:

- backend/app/main.py

Included route groups:

- Health API
- Auth API
- User APIs
- Travel API
- Itinerary API
- Plan API
- Weather API

Common endpoints:

- GET /health
- POST /api/plan
- GET /api/trips
- GET /api/trips/{trip_id}
- POST /api/trips
- DELETE /api/trips/{trip_id}

Tip:

- Open FastAPI docs at http://127.0.0.1:8000/docs when backend is running.

## Testing and Validation

Backend syntax check:

```bash
cd backend
python -m compileall app
```

Frontend production build:

```bash
cd frontend
npm run build
```

Frontend tests:

```bash
cd frontend
npm test
```

## Troubleshooting

### 1) CORS issues in frontend

- Ensure backend is running on port 8000
- Ensure frontend is running on port 3000
- Ensure ALLOWED_ORIGINS includes http://localhost:3000

### 2) Backend cannot start due to DB errors

- Check DATABASE_URL
- If using Docker, ensure db container is healthy

### 3) Slow or sparse external place/hotel results

- External providers can rate-limit or timeout
- The app includes fallback logic for hotels/food when provider responses are limited

### 4) Frontend cannot reach API

- Confirm backend health endpoint returns OK
- Check browser network tab for blocked requests

## Deployment Notes

Suggested production setup:

- Backend: Uvicorn/Gunicorn behind reverse proxy
- Frontend: Static hosting or Nginx container
- Database: Managed PostgreSQL
- Secrets: Inject via environment variables

Minimum deployment checklist:

- Configure ALLOWED_ORIGINS with production frontend URL
- Configure DATABASE_URL for production DB
- Set strong SECRET_KEY
- Enable HTTPS at reverse proxy/load balancer level

## Contributing

1. Create a feature branch
2. Make focused commits
3. Run backend and frontend checks
4. Open a pull request with summary and test notes



