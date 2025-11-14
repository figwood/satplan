package auth

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"satplan/models"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var jwtSecret = []byte(getEnvOrDefault("JWT_SECRET", "your-secret-key-change-in-production"))

// GenerateToken creates a new JWT token for a user
func GenerateToken(userID int, username string) (string, error) {
	claims := &models.Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// ValidateToken validates a JWT token and returns the claims
func ValidateToken(tokenString string) (*models.Claims, error) {
	claims := &models.Claims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	return claims, nil
}

// VerifyPassword compares a hashed password with a plain text password
func VerifyPassword(hashedPassword, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}

// Middleware returns an HTTP middleware that validates JWT tokens
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			response := models.Response{
				Success: false,
				Message: "Authorization header required",
			}
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(response)
			return
		}

		// Bearer token format
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			response := models.Response{
				Success: false,
				Message: "Invalid authorization header format",
			}
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(response)
			return
		}

		claims, err := ValidateToken(parts[1])
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Invalid or expired token: " + err.Error(),
			}
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(response)
			return
		}

		// Add user info to request context
		r.Header.Set("X-User-ID", fmt.Sprintf("%d", claims.UserID))
		r.Header.Set("X-Username", claims.Username)

		next.ServeHTTP(w, r)
	})
}

// LoginHandler handles user login requests
func LoginHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var loginReq models.LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&loginReq); err != nil {
			response := models.Response{
				Success: false,
				Message: "Invalid request body: " + err.Error(),
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
		}

		// Validate input
		if loginReq.Username == "" || loginReq.Password == "" {
			response := models.Response{
				Success: false,
				Message: "Username and password are required",
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
		}

		// Query user from database
		var user models.User
		err := db.QueryRow("SELECT id, user_name, password, email FROM sys_user WHERE user_name = ?", loginReq.Username).
			Scan(&user.ID, &user.Username, &user.Password, &user.Email)

		if err == sql.ErrNoRows {
			response := models.Response{
				Success: false,
				Message: "Invalid username or password",
			}
			w.WriteHeader(http.StatusUnauthorized)
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

		// Verify password
		if err := VerifyPassword(user.Password, loginReq.Password); err != nil {
			response := models.Response{
				Success: false,
				Message: "Invalid username or password",
			}
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(response)
			return
		}

		// Generate JWT token
		token, err := GenerateToken(user.ID, user.Username)
		if err != nil {
			response := models.Response{
				Success: false,
				Message: "Failed to generate token: " + err.Error(),
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}

		// Return successful login response
		loginResp := models.LoginResponse{
			Token: token,
			User:  user,
		}

		response := models.Response{
			Success: true,
			Message: "Login successful",
			Data:    loginResp,
		}

		json.NewEncoder(w).Encode(response)
	}
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
