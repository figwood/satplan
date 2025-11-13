package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/figwood/satplan/models"
	"github.com/gorilla/mux"
)

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

// UpdateTles updates TLE data (batch update from external source)
func UpdateTles(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var tles []models.TLE
		if err := json.NewDecoder(r.Body).Decode(&tles); err != nil {
			response := models.Response{
				Success: false,
				Message: "Invalid request body: " + err.Error(),
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
		}

		// Begin transaction
		tx, err := db.Begin()
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to begin transaction: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}
		defer tx.Rollback()

		// Insert TLEs
		inserted := 0
		for _, tle := range tles {
			_, err := tx.Exec("INSERT INTO tle (sat_noard_id, time, line1, line2) VALUES (?, ?, ?, ?)",
				tle.SatNoardID, tle.Time, tle.Line1, tle.Line2)
			if err != nil {
				log.Printf("Failed to insert TLE for satellite %s: %v", tle.SatNoardID, err)
				continue
			}
			inserted++
		}

		if err := tx.Commit(); err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to commit transaction: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}

		response := models.Response{
			Success: true,
			Message: fmt.Sprintf("Successfully updated %d TLEs", inserted),
			Data: map[string]interface{}{
				"inserted": inserted,
				"total":    len(tles),
			},
		}

		json.NewEncoder(w).Encode(response)
	}
}

// DeleteTLE deletes a TLE record by ID
func DeleteTLE(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		vars := mux.Vars(r)
		id := vars["id"]

		// Check if TLE exists
		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM tle WHERE id = ?)", id).Scan(&exists)
		if err != nil || !exists {
			response := models.Response{
				Success: false,
				Message: "TLE not found",
			}
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(response)
			return
		}

		_, err = db.Exec("DELETE FROM tle WHERE id = ?", id)
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to delete TLE: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}

		response := models.Response{
			Success: true,
			Message: "TLE deleted successfully",
		}

		json.NewEncoder(w).Encode(response)
	}
}
