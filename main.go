package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	"satplan/auth"
	"satplan/database"
	"satplan/handlers"

	"github.com/gorilla/mux"
)

var (
	db        *sql.DB
	dataFile  = "data/satplan.db"
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
	api.HandleFunc("/sat/tree", handlers.GetSatelliteTree(db)).Methods("GET")

	// Protected routes (authentication required)
	protected := api.PathPrefix("").Subrouter()
	protected.Use(auth.Middleware)

	// Satellite routes
	protected.HandleFunc("/sat/all", handlers.GetAllSatellites(db)).Methods("GET")
	protected.HandleFunc("/sat/add", handlers.AddSatellite(db)).Methods("POST")
	protected.HandleFunc("/sat/{id}", handlers.GetSatelliteById(db)).Methods("GET")
	protected.HandleFunc("/sat/update/{id}", handlers.UpdateSatellite(db)).Methods("PUT")
	protected.HandleFunc("/sat/{id}", handlers.DeleteSatellite(db)).Methods("DELETE")

	// TLE routes
	protected.HandleFunc("/tle/all", handlers.GetTLEs(db)).Methods("GET")
	protected.HandleFunc("/tle/sat/{norad_id}", handlers.GetTLEBySatellite(db)).Methods("GET")
	protected.HandleFunc("/tle/{id}", handlers.DeleteTLE(db)).Methods("DELETE")
	protected.HandleFunc("/sat/tle/update", handlers.UpdateTles(db)).Methods("POST")
	protected.HandleFunc("/tle/sites", handlers.GetTLESites(db)).Methods("GET")
	protected.HandleFunc("/tle/auto-update", handlers.AutoUpdateTLEs(db)).Methods("POST")

	// Sensor routes
	protected.HandleFunc("/sen/all", handlers.GetAllSensors(db)).Methods("GET")
	protected.HandleFunc("/sen/add", handlers.AddSensor(db)).Methods("POST")
	protected.HandleFunc("/sen/bysat", handlers.GetSensorBySatId(db)).Methods("GET")
	protected.HandleFunc("/sen/{id}", handlers.GetSensorById(db)).Methods("GET")
	protected.HandleFunc("/sen/update/{id}", handlers.UpdateSensor(db)).Methods("PUT")
	protected.HandleFunc("/sen/{id}", handlers.DeleteSensor(db)).Methods("DELETE")

	// User routes
	protected.HandleFunc("/user/all", handlers.GetAllUsers(db)).Methods("GET")
	protected.HandleFunc("/user/me", handlers.GetUserInfo(db)).Methods("GET")

	// Admin page route
	r.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, staticDir+"/admin.html")
	}).Methods("GET")

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
