package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
	_ "github.com/mattn/go-sqlite3"
)

var (
	db        *sql.DB
	dataFile  = "satplan.db"
	staticDir = "static"
)

// Models
type Satellite struct {
	ID       int    `json:"id"`
	NoardID  string `json:"noard_id"`
	Name     string `json:"name"`
	HexColor string `json:"hex_color"`
}

type Sensor struct {
	ID             int     `json:"id"`
	SatNoardID     string  `json:"sat_noard_id"`
	SatName        string  `json:"sat_name"`
	Name           string  `json:"name"`
	Resolution     float64 `json:"resolution"`
	Width          float64 `json:"width"`
	RightSideAngle float64 `json:"right_side_angle"`
	LeftSideAngle  float64 `json:"left_side_angle"`
	ObserveAngle   float64 `json:"observe_angle"`
	HexColor       string  `json:"hex_color"`
	InitAngle      float64 `json:"init_angle"`
}

type TLE struct {
	ID         int    `json:"id"`
	SatNoardID string `json:"sat_noard_id"`
	Time       int64  `json:"time"`
	Line1      string `json:"line1"`
	Line2      string `json:"line2"`
}

type Response struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func main() {
	// Initialize database
	var err error
	db, err = initDB()
	if err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer db.Close()

	// Create router
	r := mux.NewRouter()

	// API routes
	api := r.PathPrefix("/api/v1").Subrouter()
	api.HandleFunc("/health", healthCheck).Methods("GET")
	api.HandleFunc("/satellites", getSatellites).Methods("GET")
	api.HandleFunc("/satellites/{id}", getSatelliteByID).Methods("GET")
	api.HandleFunc("/sensors", getSensors).Methods("GET")
	api.HandleFunc("/sensors/{id}", getSensorByID).Methods("GET")
	api.HandleFunc("/tle", getTLEs).Methods("GET")
	api.HandleFunc("/tle/satellite/{norad_id}", getTLEBySatellite).Methods("GET")

	// Serve static files
	r.PathPrefix("/").Handler(http.FileServer(http.Dir(staticDir + "/")))

	// Add CORS middleware
	r.Use(corsMiddleware)

	// Get port from environment or default to 8080
	port := getEnvOrDefault("PORT", "8080")

	fmt.Printf("Server starting on port %s\n", port)
	fmt.Printf("API available at: http://localhost:%s/api/v1/\n", port)
	fmt.Printf("Frontend available at: http://localhost:%s/\n", port)

	log.Fatal(http.ListenAndServe(":"+port, r))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func initDB() (*sql.DB, error) {
	dbPath := getEnvOrDefault("DB_PATH", dataFile)

	// Check if database exists
	dbExists := fileExists(dbPath)

	database, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}

	// If database doesn't exist, initialize it with init.sql
	if !dbExists {
		log.Println("Database not found, initializing from init.sql...")
		initSQL, err := os.ReadFile("init.sql")
		if err != nil {
			return nil, fmt.Errorf("failed to read init.sql: %v", err)
		}

		_, err = database.Exec(string(initSQL))
		if err != nil {
			return nil, fmt.Errorf("failed to execute init.sql: %v", err)
		}
		log.Println("Database initialized successfully")
	}

	return database, nil
}

func fileExists(filename string) bool {
	info, err := os.Stat(filename)
	if os.IsNotExist(err) {
		return false
	}
	return !info.IsDir()
}

// API Handlers
func healthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Count records
	var satCount, sensorCount, tleCount int
	db.QueryRow("SELECT COUNT(*) FROM satellite").Scan(&satCount)
	db.QueryRow("SELECT COUNT(*) FROM sensor").Scan(&sensorCount)
	db.QueryRow("SELECT COUNT(*) FROM tle").Scan(&tleCount)

	response := Response{
		Success: true,
		Message: "Server is healthy",
		Data: map[string]interface{}{
			"status":     "ok",
			"version":    "1.0.0",
			"satellites": satCount,
			"sensors":    sensorCount,
			"tle_count":  tleCount,
		},
	}

	json.NewEncoder(w).Encode(response)
}

func getSatellites(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	rows, err := db.Query("SELECT id, noard_id, name, hex_color FROM satellite ORDER BY name")
	if err != nil {
		response := Response{
			Success: false,
			Message: "Failed to query satellites: " + err.Error(),
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}
	defer rows.Close()

	satellites := []Satellite{}
	for rows.Next() {
		var s Satellite
		if err := rows.Scan(&s.ID, &s.NoardID, &s.Name, &s.HexColor); err != nil {
			log.Printf("Error scanning satellite: %v", err)
			continue
		}
		satellites = append(satellites, s)
	}

	response := Response{
		Success: true,
		Message: "Satellites retrieved successfully",
		Data:    satellites,
	}

	json.NewEncoder(w).Encode(response)
}

func getSatelliteByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	vars := mux.Vars(r)
	id := vars["id"]

	var s Satellite
	err := db.QueryRow("SELECT id, noard_id, name, hex_color FROM satellite WHERE id = ?", id).
		Scan(&s.ID, &s.NoardID, &s.Name, &s.HexColor)

	if err == sql.ErrNoRows {
		response := Response{
			Success: false,
			Message: "Satellite not found",
		}
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(response)
		return
	} else if err != nil {
		response := Response{
			Success: false,
			Message: "Database error: " + err.Error(),
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	response := Response{
		Success: true,
		Message: "Satellite retrieved successfully",
		Data:    s,
	}

	json.NewEncoder(w).Encode(response)
}

func getSensors(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	rows, err := db.Query(`
		SELECT id, sat_noard_id, sat_name, name, resolution, width, 
		       right_side_angle, left_side_angle, observe_angle, hex_color, init_angle 
		FROM sensor ORDER BY sat_name, name
	`)
	if err != nil {
		response := Response{
			Success: false,
			Message: "Failed to query sensors: " + err.Error(),
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}
	defer rows.Close()

	sensors := []Sensor{}
	for rows.Next() {
		var s Sensor
		if err := rows.Scan(&s.ID, &s.SatNoardID, &s.SatName, &s.Name, &s.Resolution,
			&s.Width, &s.RightSideAngle, &s.LeftSideAngle, &s.ObserveAngle,
			&s.HexColor, &s.InitAngle); err != nil {
			log.Printf("Error scanning sensor: %v", err)
			continue
		}
		sensors = append(sensors, s)
	}

	response := Response{
		Success: true,
		Message: "Sensors retrieved successfully",
		Data:    sensors,
	}

	json.NewEncoder(w).Encode(response)
}

func getSensorByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	vars := mux.Vars(r)
	id := vars["id"]

	var s Sensor
	err := db.QueryRow(`
		SELECT id, sat_noard_id, sat_name, name, resolution, width, 
		       right_side_angle, left_side_angle, observe_angle, hex_color, init_angle 
		FROM sensor WHERE id = ?
	`, id).Scan(&s.ID, &s.SatNoardID, &s.SatName, &s.Name, &s.Resolution,
		&s.Width, &s.RightSideAngle, &s.LeftSideAngle, &s.ObserveAngle,
		&s.HexColor, &s.InitAngle)

	if err == sql.ErrNoRows {
		response := Response{
			Success: false,
			Message: "Sensor not found",
		}
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(response)
		return
	} else if err != nil {
		response := Response{
			Success: false,
			Message: "Database error: " + err.Error(),
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	response := Response{
		Success: true,
		Message: "Sensor retrieved successfully",
		Data:    s,
	}

	json.NewEncoder(w).Encode(response)
}

func getTLEs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	rows, err := db.Query("SELECT id, sat_noard_id, time, line1, line2 FROM tle ORDER BY time DESC LIMIT 100")
	if err != nil {
		response := Response{
			Success: false,
			Message: "Failed to query TLE data: " + err.Error(),
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}
	defer rows.Close()

	tles := []TLE{}
	for rows.Next() {
		var t TLE
		if err := rows.Scan(&t.ID, &t.SatNoardID, &t.Time, &t.Line1, &t.Line2); err != nil {
			log.Printf("Error scanning TLE: %v", err)
			continue
		}
		tles = append(tles, t)
	}

	response := Response{
		Success: true,
		Message: "TLE data retrieved successfully",
		Data:    tles,
	}

	json.NewEncoder(w).Encode(response)
}

func getTLEBySatellite(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	vars := mux.Vars(r)
	noradID := vars["norad_id"]

	rows, err := db.Query("SELECT id, sat_noard_id, time, line1, line2 FROM tle WHERE sat_noard_id = ? ORDER BY time DESC", noradID)
	if err != nil {
		response := Response{
			Success: false,
			Message: "Failed to query TLE data: " + err.Error(),
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}
	defer rows.Close()

	tles := []TLE{}
	for rows.Next() {
		var t TLE
		if err := rows.Scan(&t.ID, &t.SatNoardID, &t.Time, &t.Line1, &t.Line2); err != nil {
			log.Printf("Error scanning TLE: %v", err)
			continue
		}
		tles = append(tles, t)
	}

	response := Response{
		Success: true,
		Message: "TLE data retrieved successfully",
		Data:    tles,
	}

	json.NewEncoder(w).Encode(response)
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
