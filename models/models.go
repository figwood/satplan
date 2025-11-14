package models

import (
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Satellite represents a satellite entity
type Satellite struct {
	ID       int    `json:"id"`
	NoardID  string `json:"noard_id"`
	Name     string `json:"name"`
	HexColor string `json:"hex_color"`
}

// Sensor represents a satellite sensor
type Sensor struct {
	ID             int     `json:"id"`
	SatID          int     `json:"sat_id"`
	SatNoardID     string  `json:"sat_noard_id"`
	SatName        string  `json:"sat_name"`
	Name           string  `json:"name"`
	Resolution     float64 `json:"resolution"`
	Width          float64 `json:"width"`
	RightSideAngle float64 `json:"right_side_angle"`
	LeftSideAngle  float64 `json:"left_side_angle"`
	ObserveAngle   float64 `json:"observe_angle"`
	HexColor       string  `json:"hex_color"`
	InitAngle      float64 `json:"init_angle"`
}

// TreeNode represents a node in the satellite tree
type TreeNode struct {
	ID       int        `json:"id"`
	Type     string     `json:"type"` // "root", "satellite", "sensor"
	Name     string     `json:"name"`
	HexColor string     `json:"hex_color,omitempty"`
	Children []TreeNode `json:"children,omitempty"`
	// Satellite-specific fields
	SatNoradID string `json:"sat_norad_id,omitempty"`
	TLE1       string `json:"tle1,omitempty"`
	TLE2       string `json:"tle2,omitempty"`
	// Sensor-specific fields
	SatNoardID    string  `json:"sat_noard_id,omitempty"`
	SatName       string  `json:"sat_name,omitempty"`
	InitAngle     float64 `json:"init_angle,omitempty"`
	LeftSideAngle float64 `json:"left_side_angle,omitempty"`
	CurSideAngle  float64 `json:"cur_side_angle,omitempty"`
	ObserveAngle  float64 `json:"observe_angle,omitempty"`
}

// SatelliteWithSensors represents a satellite with its sensors
type SatelliteWithSensors struct {
	Satellite
	Sensors []Sensor `json:"sensors"`
}

// TLE represents Two-Line Element orbital data
type TLE struct {
	ID         int    `json:"id"`
	SatNoardID string `json:"sat_noard_id"`
	Time       int64  `json:"time"`
	Line1      string `json:"line1"`
	Line2      string `json:"line2"`
}

// User represents a system user
type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Password string `json:"-"` // Never send password in JSON
	Email    string `json:"email"`
}

// LoginRequest contains login credentials
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse contains JWT token and user info
type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// Claims represents JWT token claims
type Claims struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// Response is a generic API response wrapper
type Response struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// HashPassword encrypts a plain text password using bcrypt
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

// CheckPassword verifies if the provided password matches the hashed password
func CheckPassword(hashedPassword, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}
