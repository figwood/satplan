package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	"github.com/figwood/satplan/models"
	"github.com/gorilla/mux"
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

// GetSatellites returns all satellites
func GetSatellites(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		rows, err := db.Query("SELECT id, noard_id, name, hex_color FROM satellite ORDER BY name")
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to query satellites: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}
		defer rows.Close()

		satellites := []models.Satellite{}
		for rows.Next() {
			var s models.Satellite
			if err := rows.Scan(&s.ID, &s.NoardID, &s.Name, &s.HexColor); err != nil {
				log.Printf("Error scanning satellite: %v", err)
				continue
			}
			satellites = append(satellites, s)
		}

		response := models.Response{
			Success: true,
			Message: "Satellites retrieved successfully",
			Data:    satellites,
		}

		json.NewEncoder(w).Encode(response)
	}
}

// GetSatelliteByID returns a single satellite by ID
func GetSatelliteByID(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		vars := mux.Vars(r)
		id := vars["id"]

		var s models.Satellite
		err := db.QueryRow("SELECT id, noard_id, name, hex_color FROM satellite WHERE id = ?", id).
			Scan(&s.ID, &s.NoardID, &s.Name, &s.HexColor)

		if err == sql.ErrNoRows {
			response := models.Response{
				Success: false,
				Message: "Satellite not found",
			}
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(response)
			return
		} else if err != nil {
			response := models.Response{
				Success: false,
				Message: "Database error: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}

		response := models.Response{
			Success: true,
			Message: "Satellite retrieved successfully",
			Data:    s,
		}

		json.NewEncoder(w).Encode(response)
	}
}

// GetSensors returns all sensors
func GetSensors(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		rows, err := db.Query(`
			SELECT id, sat_noard_id, sat_name, name, resolution, width, 
			       right_side_angle, left_side_angle, observe_angle, hex_color, init_angle 
			FROM sensor ORDER BY sat_name, name
		`)
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to query sensors: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}
		defer rows.Close()

		sensors := []models.Sensor{}
		for rows.Next() {
			var s models.Sensor
			if err := rows.Scan(&s.ID, &s.SatNoardID, &s.SatName, &s.Name, &s.Resolution,
				&s.Width, &s.RightSideAngle, &s.LeftSideAngle, &s.ObserveAngle,
				&s.HexColor, &s.InitAngle); err != nil {
				log.Printf("Error scanning sensor: %v", err)
				continue
			}
			sensors = append(sensors, s)
		}

		response := models.Response{
			Success: true,
			Message: "Sensors retrieved successfully",
			Data:    sensors,
		}

		json.NewEncoder(w).Encode(response)
	}
}

// GetSensorByID returns a single sensor by ID
func GetSensorByID(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		vars := mux.Vars(r)
		id := vars["id"]

		var s models.Sensor
		err := db.QueryRow(`
			SELECT id, sat_noard_id, sat_name, name, resolution, width, 
			       right_side_angle, left_side_angle, observe_angle, hex_color, init_angle 
			FROM sensor WHERE id = ?
		`, id).Scan(&s.ID, &s.SatNoardID, &s.SatName, &s.Name, &s.Resolution,
			&s.Width, &s.RightSideAngle, &s.LeftSideAngle, &s.ObserveAngle,
			&s.HexColor, &s.InitAngle)

		if err == sql.ErrNoRows {
			response := models.Response{
				Success: false,
				Message: "Sensor not found",
			}
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(response)
			return
		} else if err != nil {
			response := models.Response{
				Success: false,
				Message: "Database error: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}

		response := models.Response{
			Success: true,
			Message: "Sensor retrieved successfully",
			Data:    s,
		}

		json.NewEncoder(w).Encode(response)
	}
}

// GetTLEs returns recent TLE data
func GetTLEs(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		rows, err := db.Query("SELECT id, sat_noard_id, time, line1, line2 FROM tle ORDER BY time DESC LIMIT 100")
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to query TLE data: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}
		defer rows.Close()

		tles := []models.TLE{}
		for rows.Next() {
			var t models.TLE
			if err := rows.Scan(&t.ID, &t.SatNoardID, &t.Time, &t.Line1, &t.Line2); err != nil {
				log.Printf("Error scanning TLE: %v", err)
				continue
			}
			tles = append(tles, t)
		}

		response := models.Response{
			Success: true,
			Message: "TLE data retrieved successfully",
			Data:    tles,
		}

		json.NewEncoder(w).Encode(response)
	}
}

// GetTLEBySatellite returns TLE data for a specific satellite
func GetTLEBySatellite(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		vars := mux.Vars(r)
		noradID := vars["norad_id"]

		rows, err := db.Query("SELECT id, sat_noard_id, time, line1, line2 FROM tle WHERE sat_noard_id = ? ORDER BY time DESC", noradID)
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to query TLE data: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}
		defer rows.Close()

		tles := []models.TLE{}
		for rows.Next() {
			var t models.TLE
			if err := rows.Scan(&t.ID, &t.SatNoardID, &t.Time, &t.Line1, &t.Line2); err != nil {
				log.Printf("Error scanning TLE: %v", err)
				continue
			}
			tles = append(tles, t)
		}

		response := models.Response{
			Success: true,
			Message: "TLE data retrieved successfully",
			Data:    tles,
		}

		json.NewEncoder(w).Encode(response)
	}
}
