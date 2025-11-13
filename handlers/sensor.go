package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	"github.com/figwood/satplan/models"
	"github.com/gorilla/mux"
)

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

// GetAllSensors returns all sensors (alias for GetSensors)
func GetAllSensors(db *sql.DB) http.HandlerFunc {
	return GetSensors(db)
}

// AddSensor adds a new sensor
func AddSensor(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var sensor models.Sensor
		if err := json.NewDecoder(r.Body).Decode(&sensor); err != nil {
			response := models.Response{
				Success: false,
				Message: "Invalid request body: " + err.Error(),
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
		}

		// Validate required fields
		if sensor.SatNoardID == "" || sensor.Name == "" {
			response := models.Response{
				Success: false,
				Message: "sat_noard_id and name are required",
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
		}

		result, err := db.Exec(`INSERT INTO sensor (sat_noard_id, sat_name, name, resolution, width, 
			right_side_angle, left_side_angle, observe_angle, hex_color, init_angle) 
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			sensor.SatNoardID, sensor.SatName, sensor.Name, sensor.Resolution, sensor.Width,
			sensor.RightSideAngle, sensor.LeftSideAngle, sensor.ObserveAngle,
			sensor.HexColor, sensor.InitAngle)
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to insert sensor: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}

		id, _ := result.LastInsertId()
		sensor.ID = int(id)

		response := models.Response{
			Success: true,
			Message: "Sensor added successfully",
			Data:    sensor,
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(response)
	}
}

// GetSensorBySatId returns all sensors for a specific satellite
func GetSensorBySatId(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		satID := r.URL.Query().Get("sat_id")
		if satID == "" {
			response := models.Response{
				Success: false,
				Message: "sat_id query parameter is required",
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
		}

		rows, err := db.Query(`
			SELECT id, sat_noard_id, sat_name, name, resolution, width, 
			       right_side_angle, left_side_angle, observe_angle, hex_color, init_angle 
			FROM sensor WHERE sat_noard_id = ? ORDER BY name
		`, satID)
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

// GetSensorById returns a single sensor by ID (alias for GetSensorByID)
func GetSensorById(db *sql.DB) http.HandlerFunc {
	return GetSensorByID(db)
}

// UpdateSensor updates an existing sensor
func UpdateSensor(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		vars := mux.Vars(r)
		id := vars["id"]

		var sensor models.Sensor
		if err := json.NewDecoder(r.Body).Decode(&sensor); err != nil {
			response := models.Response{
				Success: false,
				Message: "Invalid request body: " + err.Error(),
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
		}

		// Check if sensor exists
		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM sensor WHERE id = ?)", id).Scan(&exists)
		if err != nil || !exists {
			response := models.Response{
				Success: false,
				Message: "Sensor not found",
			}
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(response)
			return
		}

		_, err = db.Exec(`UPDATE sensor SET sat_noard_id = ?, sat_name = ?, name = ?, resolution = ?, 
			width = ?, right_side_angle = ?, left_side_angle = ?, observe_angle = ?, 
			hex_color = ?, init_angle = ? WHERE id = ?`,
			sensor.SatNoardID, sensor.SatName, sensor.Name, sensor.Resolution, sensor.Width,
			sensor.RightSideAngle, sensor.LeftSideAngle, sensor.ObserveAngle,
			sensor.HexColor, sensor.InitAngle, id)
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to update sensor: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}

		response := models.Response{
			Success: true,
			Message: "Sensor updated successfully",
		}

		json.NewEncoder(w).Encode(response)
	}
}

// DeleteSensor deletes a sensor by ID
func DeleteSensor(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		vars := mux.Vars(r)
		id := vars["id"]

		// Check if sensor exists
		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM sensor WHERE id = ?)", id).Scan(&exists)
		if err != nil || !exists {
			response := models.Response{
				Success: false,
				Message: "Sensor not found",
			}
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(response)
			return
		}

		_, err = db.Exec("DELETE FROM sensor WHERE id = ?", id)
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to delete sensor: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}

		response := models.Response{
			Success: true,
			Message: "Sensor deleted successfully",
		}

		json.NewEncoder(w).Encode(response)
	}
}
