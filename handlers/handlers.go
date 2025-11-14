package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"satplan/models"
)

// HealthCheck returns the health status of the API
func HealthCheck(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Count records
		var satCount, sensorCount, tleCount int
		db.QueryRow("SELECT COUNT(*) FROM satellite").Scan(&satCount)
		db.QueryRow("SELECT COUNT(*) FROM sensor").Scan(&sensorCount)
		db.QueryRow("SELECT COUNT(*) FROM tle").Scan(&tleCount)

		response := models.Response{
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
}
