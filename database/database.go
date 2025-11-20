package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// InitDB initializes the database connection and creates tables if needed
func InitDB(dbPath string) (*sql.DB, error) {
	// Check if database exists
	dbExists := fileExists(dbPath)

	// Ensure the directory exists before opening the database
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %v", err)
	}

	database, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	// If database doesn't exist, initialize it with init.sql
	if !dbExists {
		log.Println("Database not found, initializing from init.sql...")
		initSQL, err := os.ReadFile("init.sql")
		if err != nil {
			return nil, fmt.Errorf("failed to read init.sql: %v", err)
		}

		_, err = database.Exec(string(initSQL))
		if err != nil {
			return nil, fmt.Errorf("failed to execute init.sql: %v", err)
		}
		log.Println("Database initialized successfully")
	}

	return database, nil
}

func fileExists(filename string) bool {
	info, err := os.Stat(filename)
	if os.IsNotExist(err) {
		return false
	}
	return !info.IsDir()
}
