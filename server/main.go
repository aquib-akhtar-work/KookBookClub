package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

func main() {
	if err := loadDotEnvFile(".env"); err != nil {
		log.Printf("warning: failed to load .env: %v", err)
	}
	if err := loadDotEnvFile("server/.env"); err != nil {
		log.Printf("warning: failed to load server/.env: %v", err)
	}

	dbPath := getEnv("DB_PATH", "./cookbookclub.db")
	uploadDir := getEnv("UPLOAD_DIR", "./uploads")
	frontendOrigin := getEnv("FRONTEND_ORIGIN", "*")
	port := getEnv("PORT", "8080")
	webDist := getEnv("WEB_DIST", "../web/dist")
	openLibraryURL := getEnv("OPENLIBRARY_BASE_URL", "https://openlibrary.org")
	openLibraryEmail := getEnv("OPENLIBRARY_CONTACT_EMAIL", "cookbookclub@example.com")
	appBaseURL := strings.TrimSpace(strings.TrimSuffix(getEnv("APP_BASE_URL", ""), "/"))
	if appBaseURL == "" {
		trimmedOrigin := strings.TrimSpace(strings.TrimSuffix(frontendOrigin, "/"))
		if strings.HasPrefix(trimmedOrigin, "http://") || strings.HasPrefix(trimmedOrigin, "https://") {
			appBaseURL = trimmedOrigin
		}
	}
	resendAPIKey := strings.TrimSpace(os.Getenv("RESEND_API_KEY"))
	resendFromEmail := getEnv("RESEND_FROM_EMAIL", "KookBook Club <no-reply@kookbook.club>")
	cacheTTLHours := parseIntEnv("COOKBOOK_CACHE_TTL_HOURS", 72)
	if cacheTTLHours < 1 {
		cacheTTLHours = 72
	}

	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		log.Fatalf("failed to create upload dir: %v", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("failed to open sqlite db: %v", err)
	}
	defer db.Close()

	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA foreign_keys = ON;"); err != nil {
		log.Fatalf("failed enabling foreign keys: %v", err)
	}

	if err := initSchema(db); err != nil {
		log.Fatalf("failed creating schema: %v", err)
	}
	if err := migrateSchema(db); err != nil {
		log.Fatalf("failed migrating schema: %v", err)
	}

	s := &Server{
		db:               db,
		uploadDir:        uploadDir,
		frontendOrigin:   frontendOrigin,
		appBaseURL:       appBaseURL,
		openLibraryURL:   strings.TrimSuffix(openLibraryURL, "/"),
		openLibraryEmail: openLibraryEmail,
		resendAPIKey:     resendAPIKey,
		resendFromEmail:  resendFromEmail,
		cookbookCacheTTL: time.Duration(cacheTTLHours) * time.Hour,
		httpClient: &http.Client{
			Timeout: 8 * time.Second,
		},
	}

	mux := http.NewServeMux()
	s.registerRoutes(mux, webDist)

	addr := ":" + port
	log.Printf("Cookbook Club API listening on %s", addr)
	if err := http.ListenAndServe(addr, s.withCORS(withLogging(mux))); err != nil {
		log.Fatalf("server exited with error: %v", err)
	}
}
