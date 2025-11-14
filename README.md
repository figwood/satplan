# SatPlan - Satellite Planning System

A satellite mission planning and tracking system with Go backend serving a static frontend.

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