package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/figwood/satplan/auth"
	"github.com/figwood/satplan/database"
	"github.com/figwood/satplan/handlers"
	"github.com/gorilla/mux"
)

var (
	db        *sql.DB
	dataFile  = "satplan.db"
	staticDir = "static"
)

func main() {
	// Initialize database
	var err error
	dbPath := getEnvOrDefault("DB_PATH", dataFile)
	db, err = database.InitDB(dbPath)
	if err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer db.Close()

	// Create router
	r := mux.NewRouter()

	// API routes
	api := r.PathPrefix("/api/v1").Subrouter()

	// Public routes (no authentication required)
	api.HandleFunc("/health", handlers.HealthCheck(db)).Methods("GET")
	api.HandleFunc("/login", auth.LoginHandler(db)).Methods("POST")

	// Protected routes (authentication required)
	protected := api.PathPrefix("").Subrouter()
	protected.Use(auth.Middleware)
	protected.HandleFunc("/satellites", handlers.GetSatellites(db)).Methods("GET")
	protected.HandleFunc("/satellites/{id}", handlers.GetSatelliteByID(db)).Methods("GET")
	protected.HandleFunc("/sensors", handlers.GetSensors(db)).Methods("GET")
	protected.HandleFunc("/sensors/{id}", handlers.GetSensorByID(db)).Methods("GET")
	protected.HandleFunc("/tle", handlers.GetTLEs(db)).Methods("GET")
	protected.HandleFunc("/tle/satellite/{norad_id}", handlers.GetTLEBySatellite(db)).Methods("GET")

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

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
