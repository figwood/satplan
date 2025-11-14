package handlers

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"satplan/models"

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
// Only updates TLEs for satellites that exist in the satellite table
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

		if len(tles) == 0 {
			response := models.Response{
				Success: false,
				Message: "No TLE data provided",
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

		// Insert TLEs only for satellites that exist in the satellite table
		inserted := 0
		skipped := 0
		notFound := []string{}

		for _, tle := range tles {
			// Check if satellite exists in satellite table
			var exists bool
			err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM satellite WHERE noard_id = ?)", tle.SatNoardID).Scan(&exists)
			if err != nil {
				log.Printf("Failed to check satellite existence for %s: %v", tle.SatNoardID, err)
				skipped++
				continue
			}

			if !exists {
				log.Printf("Satellite with NORAD ID %s not found in satellite table, skipping", tle.SatNoardID)
				notFound = append(notFound, tle.SatNoardID)
				skipped++
				continue
			}

			// Insert TLE for existing satellite
			_, err = tx.Exec("INSERT INTO tle (sat_noard_id, time, line1, line2) VALUES (?, ?, ?, ?)",
				tle.SatNoardID, tle.Time, tle.Line1, tle.Line2)
			if err != nil {
				log.Printf("Failed to insert TLE for satellite %s: %v", tle.SatNoardID, err)
				skipped++
				continue
			}
			inserted++
		}

		if inserted == 0 {
			message := fmt.Sprintf("Failed to insert any TLE records. All %d records were skipped.", skipped)
			if len(notFound) > 0 {
				message += fmt.Sprintf(" Satellites not found: %v", notFound)
			}
			response := models.Response{
				Success: false,
				Message: message,
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
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

		message := fmt.Sprintf("Successfully updated %d TLE record(s)", inserted)
		if skipped > 0 {
			message += fmt.Sprintf(" (%d skipped)", skipped)
		}

		responseData := map[string]interface{}{
			"inserted": inserted,
			"skipped":  skipped,
			"total":    len(tles),
		}
		if len(notFound) > 0 {
			responseData["not_found"] = notFound
		}

		response := models.Response{
			Success: true,
			Message: message,
			Data:    responseData,
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

// GetTLESites returns all TLE data sources
func GetTLESites(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		rows, err := db.Query("SELECT id, site, url, description FROM tle_site")
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to query TLE sites: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}
		defer rows.Close()

		sites := []models.TLESite{}
		for rows.Next() {
			var site models.TLESite
			if err := rows.Scan(&site.ID, &site.Site, &site.URL, &site.Description); err != nil {
				log.Printf("Error scanning TLE site: %v", err)
				continue
			}
			sites = append(sites, site)
		}

		response := models.Response{
			Success: true,
			Message: "TLE sites retrieved successfully",
			Data:    sites,
		}

		json.NewEncoder(w).Encode(response)
	}
}

// AutoUpdateTLEs fetches TLE data from all sites in tle_site table and updates the database
func AutoUpdateTLEs(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Get all TLE sites
		rows, err := db.Query("SELECT id, site, url, description FROM tle_site")
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to query TLE sites: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}
		defer rows.Close()

		sites := []models.TLESite{}
		for rows.Next() {
			var site models.TLESite
			if err := rows.Scan(&site.ID, &site.Site, &site.URL, &site.Description); err != nil {
				log.Printf("Error scanning TLE site: %v", err)
				continue
			}
			sites = append(sites, site)
		}

		if len(sites) == 0 {
			response := models.Response{
				Success: false,
				Message: "No TLE sites configured",
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
		}

		// Fetch and parse TLE data from each site
		allTLEs := []models.TLE{}
		failedSites := []string{}

		for _, site := range sites {
			tles, err := fetchTLEFromURL(site.URL)
			if err != nil {
				log.Printf("Failed to fetch TLE from %s: %v", site.Site, err)
				failedSites = append(failedSites, site.Site)
				continue
			}
			allTLEs = append(allTLEs, tles...)
		}

		if len(allTLEs) == 0 {
			message := "No TLE data fetched from any site"
			if len(failedSites) > 0 {
				message += fmt.Sprintf(". Failed sites: %v", failedSites)
			}
			response := models.Response{
				Success: false,
				Message: message,
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
		}

		// Begin transaction to insert TLEs
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

		// Insert TLEs only for satellites that exist in the satellite table
		inserted := 0
		skipped := 0
		notFound := []string{}

		for _, tle := range allTLEs {
			// Check if satellite exists in satellite table
			var exists bool
			err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM satellite WHERE noard_id = ?)", tle.SatNoardID).Scan(&exists)
			if err != nil {
				log.Printf("Failed to check satellite existence for %s: %v", tle.SatNoardID, err)
				skipped++
				continue
			}

			if !exists {
				notFound = append(notFound, tle.SatNoardID)
				skipped++
				continue
			}

			// Insert TLE for existing satellite
			_, err = tx.Exec("INSERT INTO tle (sat_noard_id, time, line1, line2) VALUES (?, ?, ?, ?)",
				tle.SatNoardID, tle.Time, tle.Line1, tle.Line2)
			if err != nil {
				log.Printf("Failed to insert TLE for satellite %s: %v", tle.SatNoardID, err)
				skipped++
				continue
			}
			inserted++
		}

		if inserted == 0 {
			message := fmt.Sprintf("Failed to insert any TLE records. All %d records were skipped.", skipped)
			if len(notFound) > 0 {
				message += fmt.Sprintf(" Satellites not in database: %v", notFound)
			}
			response := models.Response{
				Success: false,
				Message: message,
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
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

		message := fmt.Sprintf("Successfully updated %d TLE record(s) from %d site(s)", inserted, len(sites)-len(failedSites))
		if skipped > 0 {
			message += fmt.Sprintf(" (%d skipped)", skipped)
		}

		responseData := map[string]interface{}{
			"inserted":    inserted,
			"skipped":     skipped,
			"total":       len(allTLEs),
			"sites_count": len(sites) - len(failedSites),
		}
		if len(failedSites) > 0 {
			responseData["failed_sites"] = failedSites
		}
		if len(notFound) > 0 {
			responseData["not_found"] = notFound
		}

		response := models.Response{
			Success: true,
			Message: message,
			Data:    responseData,
		}

		json.NewEncoder(w).Encode(response)
	}
}

// fetchTLEFromURL fetches and parses TLE data from a URL
func fetchTLEFromURL(url string) ([]models.TLE, error) {
	// Fetch the TLE data from URL
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch URL: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP error: %d", resp.StatusCode)
	}

	// Parse TLE data
	tles := []models.TLE{}
	scanner := bufio.NewScanner(resp.Body)

	var line1 string
	lineCount := 0

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Skip empty lines
		if line == "" {
			continue
		}

		if lineCount == 0 {
			// First line is the satellite name (just skip it, we use NORAD ID)
			lineCount++
		} else if lineCount == 1 {
			// Second line is TLE line 1
			if strings.HasPrefix(line, "1 ") {
				line1 = line
				lineCount++
			} else {
				// Invalid format, reset
				lineCount = 0
			}
		} else if lineCount == 2 {
			// Third line is TLE line 2
			if strings.HasPrefix(line, "2 ") {
				// Extract NORAD ID from line 1
				noradID := extractNoradID(line1)
				if noradID != "" {
					tle := models.TLE{
						SatNoardID: noradID,
						Time:       time.Now().Unix(),
						Line1:      line1,
						Line2:      line,
					}
					tles = append(tles, tle)
				}
				lineCount = 0
			} else {
				// Invalid format, reset
				lineCount = 0
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading response: %v", err)
	}

	return tles, nil
}

// extractNoradID extracts the NORAD catalog number from a TLE line 1
func extractNoradID(line1 string) string {
	// TLE Line 1 format: 1 NNNNNC NNNNNAAA NNNNN.NNNNNNNN ...
	// NORAD ID is at positions 2-7 (0-indexed)
	re := regexp.MustCompile(`^1\s+(\d+)`)
	matches := re.FindStringSubmatch(line1)
	if len(matches) > 1 {
		// Remove leading zeros and convert to string
		noradIDInt, err := strconv.Atoi(matches[1])
		if err == nil {
			return strconv.Itoa(noradIDInt)
		}
	}
	return ""
}
