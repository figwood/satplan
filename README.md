# SatPlan - Satellite Planning System

A production-ready mission planning tool for scheduling Earth observation satellite passes over target areas.

![alt text](planning.png)

**Live demo**: https://satplan.fogsea.cf 
**Tech stack**: Go · WebAssembly (orbital mechanics) · OpenLayers · SQLite · Helm/Kubernetes

## Features

- **Simple Architecture**
  - Single Go binary serves both API and static files
  - No complex frontend framework overhead
  - Minimal dependencies
  
- **Backend (Go)**
  - RESTful API with Gorilla Mux router
  - JWT-based authentication for API security
  - SQLite database for data persistence
  - Automatic database initialization from `init.sql`
  - CORS support
  - Static file serving

- **Frontend (Vanilla JavaScript)**
  - Clean, modern UI with vanilla HTML/CSS/JS
  - Tab-based interface for different data views
  - Real-time data fetching from backend API
  - Responsive design
  - Admin panel for managing satellites, sensors, and TLE data
  - Automatic TLE updates from configured external sources



- **Twilight line visualization**
   - The map can render the day-night terminator (twilight line) so operators can quickly see illumination conditions on Earth.
   - In normal browsing mode, the terminator is drawn using the current timeline position.
   - When a planning result is available, the twilight line is no longer static: it is replayed alongside the planning timeline and updates continuously for each planning time step.
   - This makes it easier to judge whether each scheduled observation window happens in daylight, nighttime, or near sunrise/sunset transition zones.

- **Filter by Lighting Condition**
  - After a planning run, the **Filter** button opens a dialog with **Day** and **Night** checkboxes
  - Selecting only **Day** hides every strip whose midpoint falls in Earth's shadow; selecting only **Night** does the inverse
  - The filtered view updates both the results table and the map simultaneously

- **Greedy Auto-Select**
  - The **Auto-select** button runs a greedy coverage algorithm over the current results to pick the minimal useful subset of observation strips
  - Three objectives are available:

    | Objective | Behaviour |
    |---|---|
    | **Max coverage** | Greedy set-cover: repeatedly picks the strip that adds the most new grid points to the covered area until no uncovered points remain. |
    | **Min time** | Picks strips in order of highest coverage-per-second ratio, minimising total cumulative observation time while still growing coverage at each step. |
    | **Min strips** | Like max coverage, but stops as soon as the marginal gain of the next-best strip drops below 1 % of the planning-area grid (fewest strips for near-complete coverage). |

  - The algorithm samples the planning area on a 25 × 25 grid and uses ray-casting to test which grid points each strip polygon covers
  - After auto-select runs, the table checkboxes reflect the chosen subset and the map redraws to show only those strips

- **Interactive Map**
  - Click anywhere on the map after a planning run to inspect the scan strips at that location
  - **Single strip** — a panel slides in from the right edge showing satellite name, sensor name, resolution, start time, and stop time (UTC)
  - **Overlapping strips** — the panel lists all strips covering the clicked point; the first is selected automatically and clicking any item switches the active selection
  - The selected strip is highlighted on the map (bold red outline, stronger fill) and its corresponding row in the results table is highlighted and scrolled into view
  - Click the × button or an empty map area to dismiss the panel
  - The twilight line (day/night terminator) is rendered on the map and replayed alongside the planning timeline, making it easy to judge illumination conditions at each scheduled pass

## Database Schema

The system tracks:
- **Satellites**: Satellite information with NORAD IDs
- **Sensors**: Satellite sensor specifications
- **TLE (Two-Line Elements)**: Orbital data for satellites
- **Users**: System users
- **TLE Sites**: External data sources for TLE information

## Getting Started

### Prerequisites

- Go 1.21 or higher
- Docker and Docker Compose (for containerized deployment)

### Quick Start with Docker

```bash
# Build and start the application
docker build -t satplan:latest .

docker run -p 8080:8080 satplan:latest
```

**The application will be available at:**
- Application: http://localhost:8080
- Admin Panel: http://localhost:8080/admin
- API: http://localhost:8080/api/v1/*

**Default Admin Credentials:**
- Username: `admin`
- Password: `123456`
- **Important:** Change the password in production!

### Local Development

```bash
# Download Go dependencies
go mod download

# Create data directory
mkdir -p data

# Or build and run
go build 
./satplan
```

**Application will be available at:**
- Application: http://localhost:8080
- Admin Panel: http://localhost:8080/admin

**Default Admin Credentials:**
- Username: `admin`
- Password: `123456`
- **Important:** Change the password in production!

The database will be automatically created from `init.sql` on first run.

## API Endpoints

All API endpoints are prefixed with `/api/v1/`.

### Authentication

The API uses JWT (JSON Web Token) for authentication. Most endpoints require a valid JWT token.

#### Login
- `POST /api/v1/login` - Authenticate and receive JWT token

**Request Body:**
```json
{
  "username": "admin",
  "password": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "admin",
      "email": "test@test.com"
    }
  }
}
```

**Using the Token:**

Include the JWT token in the `Authorization` header for protected endpoints:

```
Authorization: Bearer <your-token-here>
```

**Example with curl:**
```bash
# Login to get token
curl -X POST http://localhost:8080/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'

# Use token for protected endpoints
curl -X GET http://localhost:8080/api/v1/satellites \
  -H "Authorization: Bearer <your-token-here>"
```

### Health Check
- `GET /api/v1/health` - Check API health and get statistics (public, no auth required)

### TLE Data (Protected)
- `GET /api/v1/tle/all` - Get recent TLE data (limited to 100)
- `GET /api/v1/tle/sat/{norad_id}` - Get TLE data for specific satellite
- `DELETE /api/v1/tle/{id}` - Delete a TLE record
- `POST /api/v1/sat/tle/update` - Manually update TLE data (bulk upload)
- `GET /api/v1/tle/sites` - Get all configured TLE data sources
- `POST /api/v1/tle/auto-update` - Automatically fetch and update TLE data from configured sites

### TLE Auto-Update Feature

The system can automatically fetch TLE (Two-Line Element) data from external sources configured in the `tle_site` table.

**How it works:**
1. Navigate to the Admin panel (`/admin`)
2. Go to the "TLE Data" tab
3. Click "Auto Update from Sites" button
4. The system will:
   - Fetch TLE data from all configured sites (e.g., Celestrak)
   - Parse the standard 3-line TLE format (name, line 1, line 2)
   - Extract NORAD catalog numbers
   - Update TLE records only for satellites that exist in your database
   - Report statistics (inserted, skipped, failed sites)

**Manual TLE Update:**
- Click "Manual Update" to paste TLE data directly in the standard 3-line format

**TLE Data Sources:**
The default configuration includes:
- Celestrak Resources: `http://celestrak.com/NORAD/elements/resource.txt`

Additional sources can be added to the `tle_site` table.

### Satellites (Protected)
- `GET /api/v1/sat/all` - Get all satellites
- `GET /api/v1/sat/{id}` - Get satellite by ID
- `POST /api/v1/sat/add` - Add a new satellite
- `PUT /api/v1/sat/update/{id}` - Update satellite information
- `DELETE /api/v1/sat/{id}` - Delete a satellite

### Sensors (Protected)
- `GET /api/v1/sen/all` - Get all sensors
- `GET /api/v1/sen/{id}` - Get sensor by ID
- `GET /api/v1/sen/bysat` - Get sensors by satellite ID
- `POST /api/v1/sen/add` - Add a new sensor
- `PUT /api/v1/sen/update/{id}` - Update sensor information
- `DELETE /api/v1/sen/{id}` - Delete a sensor

### Users (Protected)
- `GET /api/v1/user/all` - Get all users
- `GET /api/v1/user/me` - Get current user information

## Environment Variables

- `PORT` - Server port (default: 8080)
- `DB_PATH` - SQLite database file path (default: satplan.db)
- `JWT_SECRET` - Secret key for JWT token signing (default: "your-secret-key-change-in-production")
  - **Important:** Change this in production for security!

## Architecture
Browser
├── OpenLayers map (target area selection)
├── WASM module (orbital mechanics, compiled from Go)
│   ├── SGP4/SDP4 propagator
│   ├── Coverage footprint calculation
│   └── Pass window prediction
└── REST client → Go HTTP Server (port 8080)
├── /api/v1/* → API handlers (JWT auth)
├── /        → Static file serving
└── SQLite   → satellites, sensors, TLE data

**Why WebAssembly for orbital computation?**  
Orbital mechanics (SGP4 propagation, coverage geometry) runs entirely 
in the browser — no round-trip latency for interactive planning. The same 
Go code compiles to both the native backend and the WASM module.

## Helm Chart (Kubernetes)

This repository now includes a Helm chart at `helm/satplan`.

### Chart Contents

- `templates/deployment.yaml` - Deploys the SatPlan container
- `templates/service.yaml` - Exposes the app on port `8080`
- `templates/pvc.yaml` - Persists SQLite data under `/root/data`
- `templates/secret.yaml` - Stores `JWT_SECRET`
- `templates/ingress.yaml` - Optional Ingress support
- `values.yaml` - Central place for deployment configuration

### Important Values

- `image.repository` / `image.tag` - Container image used by the deployment
- `replicaCount` - Number of pods (keep `1` for SQLite)
- `persistence.enabled` - Enable persistent storage for `/root/data`
- `persistence.size` - PVC size for SQLite data
- `jwt.secret` - JWT secret (change this in production)
- `jwt.existingSecret` - Use an existing Kubernetes Secret instead of creating one
- `ingress.enabled` - Enable/disable Ingress creation

## Deploy to Kubernetes with Helm

### 1. Build and push image

```bash
# Example image name
export IMAGE_REPO=ghcr.io/<your-org>/satplan
export IMAGE_TAG=v1.0.0

docker build -t ${IMAGE_REPO}:${IMAGE_TAG} .
docker push ${IMAGE_REPO}:${IMAGE_TAG}
```

### 2. Create namespace

```bash
kubectl create namespace satplan
```

### 3. (Recommended) Create JWT secret manually

If you prefer managing the secret yourself, create it and set `jwt.existingSecret`:

```bash
kubectl -n satplan create secret generic satplan-jwt \
  --from-literal=JWT_SECRET='replace-with-strong-secret'
```

### 4. Install chart

```bash
helm upgrade --install satplan ./helm/satplan \
  -n satplan \
  --set image.repository=${IMAGE_REPO} \
  --set image.tag=${IMAGE_TAG} \
  --set jwt.existingSecret=satplan-jwt
```

If you want the chart to create the Secret automatically, remove `jwt.existingSecret` and set `jwt.secret` instead:

```bash
helm upgrade --install satplan ./helm/satplan \
  -n satplan \
  --set image.repository=${IMAGE_REPO} \
  --set image.tag=${IMAGE_TAG} \
  --set jwt.secret='replace-with-strong-secret'
```

### 5. Verify deployment

```bash
kubectl -n satplan get pods,svc,pvc
kubectl -n satplan logs deploy/satplan
```

### 6. Access the service

Port-forward for local testing:

```bash
kubectl -n satplan port-forward svc/satplan 8080:8080
```

Then open:
- Application: http://localhost:8080
- Admin Panel: http://localhost:8080/admin

### 7. Upgrade and rollback

```bash
# Upgrade with a new image tag
helm upgrade satplan ./helm/satplan \
  -n satplan \
  --set image.repository=${IMAGE_REPO} \
  --set image.tag=v1.0.1

# View revision history
helm -n satplan history satplan

# Roll back to previous revision
helm -n satplan rollback satplan 1
```

### Notes

- This chart is designed for SQLite and single-pod deployment by default.
- For high availability and multiple replicas, migrate to an external database.

## License

See LICENSE file for details.