# SatPlan - Satellite Planning System

A satellite mission planning and tracking system with Go backend serving a static frontend.

## Project Structure

```
satplan/
├── main.go              # Go backend server and API
├── static/              # Static frontend files
│   ├── index.html      # Main HTML page
│   ├── styles.css      # Stylesheet
│   └── script.js       # JavaScript for API interaction
├── init.sql            # Database initialization script
├── go.mod              # Go module dependencies
├── go.sum              # Go dependency checksums
├── Dockerfile          # Docker build configuration
├── docker-compose.yml  # Docker orchestration
└── README.md           # This file
```

## Features

- **Simple Architecture**
  - Single Go binary serves both API and static files
  - No complex frontend framework overhead
  - Minimal dependencies
  
- **Backend (Go)**
  - RESTful API with Gorilla Mux router
  - SQLite database for data persistence
  - Automatic database initialization from `init.sql`
  - CORS support
  - Static file serving

- **Frontend (Vanilla JavaScript)**
  - Clean, modern UI with vanilla HTML/CSS/JS
  - Tab-based interface for different data views
  - Real-time data fetching from backend API
  - Responsive design

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
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down
```

**The application will be available at:**
- Application: http://localhost:8080
- API: http://localhost:8080/api/v1/*

### Local Development

```bash
# Download Go dependencies
go mod download

# Create data directory
mkdir -p data

# Run the application
go run main.go

# Or build and run
go build -o satplan main.go
./satplan
```

**Application will be available at:**
- http://localhost:8080

The database will be automatically created from `init.sql` on first run.

## API Endpoints

All API endpoints are prefixed with `/api/v1/`.

### Health Check
- `GET /api/v1/health` - Check API health and get statistics

### Satellites
- `GET /api/v1/satellites` - Get all satellites
- `GET /api/v1/satellites/{id}` - Get satellite by ID

### Sensors
- `GET /api/v1/sensors` - Get all sensors
- `GET /api/v1/sensors/{id}` - Get sensor by ID

### TLE Data
- `GET /api/v1/tle` - Get recent TLE data (limited to 100)
- `GET /api/v1/tle/satellite/{norad_id}` - Get TLE data for specific satellite

## Environment Variables

- `PORT` - Server port (default: 8080)
- `DB_PATH` - SQLite database file path (default: satplan.db)

## Architecture

Single Go application serving both API and static frontend:

```
┌─────────────────────────────────────┐
│   Go HTTP Server (Port 8080)       │
│                                     │
│  ├── /api/v1/*  → API Handlers      │
│  │   └── JSON responses             │
│  │                                  │
│  ├── /          → Static Files      │
│  │   └── HTML/CSS/JS                │
│  │                                  │
│  └── SQLite Database                │
│      └── data/satplan.db            │
└─────────────────────────────────────┘
```

Benefits:
- Single binary deployment
- No CORS issues
- Fast static file serving
- Minimal dependencies
- Easy to scale

## License

See LICENSE file for details.