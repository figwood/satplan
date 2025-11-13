package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	"github.com/figwood/satplan/models"
	"github.com/gorilla/mux"
)

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

// GetAllSatellites returns all satellites (alias for GetSatellites)
func GetAllSatellites(db *sql.DB) http.HandlerFunc {
	return GetSatellites(db)
}

// AddSatellite adds a new satellite
func AddSatellite(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var sat models.Satellite
		if err := json.NewDecoder(r.Body).Decode(&sat); err != nil {
			response := models.Response{
				Success: false,
				Message: "Invalid request body: " + err.Error(),
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
		}

		// Validate required fields
		if sat.NoardID == "" || sat.Name == "" {
			response := models.Response{
				Success: false,
				Message: "noard_id and name are required",
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
		}

		result, err := db.Exec("INSERT INTO satellite (noard_id, name, hex_color) VALUES (?, ?, ?)",
			sat.NoardID, sat.Name, sat.HexColor)
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to insert satellite: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}

		id, _ := result.LastInsertId()
		sat.ID = int(id)

		response := models.Response{
			Success: true,
			Message: "Satellite added successfully",
			Data:    sat,
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(response)
	}
}

// GetSatelliteById returns a single satellite by ID (alias for GetSatelliteByID)
func GetSatelliteById(db *sql.DB) http.HandlerFunc {
	return GetSatelliteByID(db)
}

// UpdateSatellite updates an existing satellite
func UpdateSatellite(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		vars := mux.Vars(r)
		id := vars["id"]

		var sat models.Satellite
		if err := json.NewDecoder(r.Body).Decode(&sat); err != nil {
			response := models.Response{
				Success: false,
				Message: "Invalid request body: " + err.Error(),
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
		}

		// Check if satellite exists
		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM satellite WHERE id = ?)", id).Scan(&exists)
		if err != nil || !exists {
			response := models.Response{
				Success: false,
				Message: "Satellite not found",
			}
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(response)
			return
		}

		_, err = db.Exec("UPDATE satellite SET noard_id = ?, name = ?, hex_color = ? WHERE id = ?",
			sat.NoardID, sat.Name, sat.HexColor, id)
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to update satellite: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}

		response := models.Response{
			Success: true,
			Message: "Satellite updated successfully",
		}

		json.NewEncoder(w).Encode(response)
	}
}

// DeleteSatellite deletes a satellite by ID
func DeleteSatellite(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		vars := mux.Vars(r)
		id := vars["id"]

		// Check if satellite exists
		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM satellite WHERE id = ?)", id).Scan(&exists)
		if err != nil || !exists {
			response := models.Response{
				Success: false,
				Message: "Satellite not found",
			}
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(response)
			return
		}

		_, err = db.Exec("DELETE FROM satellite WHERE id = ?", id)
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to delete satellite: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}

		response := models.Response{
			Success: true,
			Message: "Satellite deleted successfully",
		}

		json.NewEncoder(w).Encode(response)
	}
}

// GetSatelliteTree returns a hierarchical tree structure of satellites and sensors
func GetSatelliteTree(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Query all satellites
		satRows, err := db.Query("SELECT id, noard_id, name, hex_color FROM satellite ORDER BY name")
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to query satellites: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}
		defer satRows.Close()

		// Build satellite nodes
		satelliteNodes := []models.TreeNode{}
		for satRows.Next() {
			var sat models.Satellite
			if err := satRows.Scan(&sat.ID, &sat.NoardID, &sat.Name, &sat.HexColor); err != nil {
				log.Printf("Error scanning satellite: %v", err)
				continue
			}

			// Query sensors for this satellite using noard_id
			sensorRows, err := db.Query(`
				SELECT s.id, s.name, s.resolution, s.width, s.observe_angle, s.hex_color
				FROM sensor s
				WHERE s.sat_noard_id = ?
				ORDER BY s.name
			`, sat.NoardID)
			if err != nil {
				log.Printf("Error querying sensors for satellite %s: %v", sat.NoardID, err)
				continue
			}

			// Build sensor nodes
			sensorNodes := []models.TreeNode{}
			for sensorRows.Next() {
				var sensor models.Sensor
				if err := sensorRows.Scan(&sensor.ID, &sensor.Name, &sensor.Resolution,
					&sensor.Width, &sensor.ObserveAngle, &sensor.HexColor); err != nil {
					log.Printf("Error scanning sensor: %v", err)
					continue
				}

				sensorNode := models.TreeNode{
					ID:       sensor.ID,
					Type:     "sensor",
					Name:     sensor.Name,
					HexColor: sensor.HexColor,
				}
				sensorNodes = append(sensorNodes, sensorNode)
			}
			sensorRows.Close()

			// Create satellite node with sensors as children
			satNode := models.TreeNode{
				ID:       sat.ID,
				Type:     "satellite",
				Name:     sat.Name,
				HexColor: sat.HexColor,
				Children: sensorNodes,
			}
			satelliteNodes = append(satelliteNodes, satNode)
		}

		// Create root node
		rootNode := models.TreeNode{
			ID:       0,
			Type:     "root",
			Name:     "Satellites",
			Children: satelliteNodes,
		}

		response := models.Response{
			Success: true,
			Message: "Satellite tree retrieved successfully",
			Data:    rootNode,
		}

		json.NewEncoder(w).Encode(response)
	}
}
