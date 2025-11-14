package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	"satplan/models"
)

// GetAllUsers returns all users
func GetAllUsers(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		rows, err := db.Query("SELECT id, user_name, email FROM sys_user ORDER BY user_name")
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to query users: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}
		defer rows.Close()

		users := []models.User{}
		for rows.Next() {
			var u models.User
			if err := rows.Scan(&u.ID, &u.Username, &u.Email); err != nil {
				log.Printf("Error scanning user: %v", err)
				continue
			}
			users = append(users, u)
		}

		response := models.Response{
			Success: true,
			Message: "Users retrieved successfully",
			Data:    users,
		}

		json.NewEncoder(w).Encode(response)
	}
}

// GetUserInfo returns the current authenticated user's information
func GetUserInfo(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Get user ID from the auth middleware context
		userID := r.Header.Get("X-User-ID")
		if userID == "" {
			response := models.Response{
				Success: false,
				Message: "User not authenticated",
			}
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(response)
			return
		}

		var user models.User
		err := db.QueryRow("SELECT id, user_name, email FROM sys_user WHERE id = ?", userID).
			Scan(&user.ID, &user.Username, &user.Email)

		if err == sql.ErrNoRows {
			response := models.Response{
				Success: false,
				Message: "User not found",
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
			Message: "User information retrieved successfully",
			Data:    user,
		}

		json.NewEncoder(w).Encode(response)
	}
}
