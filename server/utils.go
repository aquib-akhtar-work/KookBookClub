package main

import (
	"bufio"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func ensureColumn(db *sql.DB, tableName, columnName, definition string) error {
	has, err := hasColumn(db, tableName, columnName)
	if err != nil {
		return err
	}
	if has {
		return nil
	}
	_, err = db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s", tableName, definition))
	return err
}

func hasColumn(db *sql.DB, tableName, columnName string) (bool, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s)", tableName))
	if err != nil {
		return false, err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			cid       int
			name      string
			ctype     string
			notNull   int
			defaultV  sql.NullString
			primaryID int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &defaultV, &primaryID); err != nil {
			return false, err
		}
		if name == columnName {
			return true, nil
		}
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	return false, nil
}

func decodeJSON(r *http.Request, out any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(out); err != nil {
		return fmt.Errorf("invalid JSON payload: %w", err)
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("invalid JSON payload: must contain a single JSON object")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("failed writing json response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func methodNotAllowed(w http.ResponseWriter, allowed ...string) {
	w.Header().Set("Allow", strings.Join(allowed, ", "))
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
}

func splitPath(path, prefix string) []string {
	remainder := strings.TrimPrefix(path, prefix)
	remainder = strings.Trim(remainder, "/")
	if remainder == "" {
		return nil
	}
	return strings.Split(remainder, "/")
}

func parseID(raw string) (int64, error) {
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid id")
	}
	return id, nil
}

func normalizeDateTime(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errors.New("empty datetime")
	}

	// Accept RFC3339 and HTML datetime-local payloads.
	if ts, err := time.Parse(time.RFC3339, raw); err == nil {
		return ts.UTC().Format(time.RFC3339), nil
	}
	if ts, err := time.Parse("2006-01-02T15:04", raw); err == nil {
		return ts.UTC().Format(time.RFC3339), nil
	}
	if ts, err := time.Parse("2006-01-02T15:04:05", raw); err == nil {
		return ts.UTC().Format(time.RFC3339), nil
	}
	return "", errors.New("invalid datetime format")
}

func generateCode(length int) (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	if length <= 0 {
		return "", errors.New("length must be positive")
	}

	out := make([]byte, length)
	max := big.NewInt(int64(len(alphabet)))
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		out[i] = alphabet[n.Int64()]
	}
	return string(out), nil
}

func generateAuthToken(numBytes int) (string, error) {
	if numBytes <= 0 {
		return "", errors.New("numBytes must be positive")
	}
	data := make([]byte, numBytes)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func detectMediaType(filename, contentType string) string {
	contentType = strings.ToLower(strings.TrimSpace(contentType))
	ext := strings.ToLower(filepath.Ext(filename))
	if strings.HasPrefix(contentType, "video/") {
		return "video"
	}
	if strings.HasPrefix(contentType, "image/") {
		return "image"
	}
	if ext == ".mp4" || ext == ".mov" || ext == ".webm" || ext == ".mkv" {
		return "video"
	}
	return "image"
}

func extensionFromMIME(contentType string) string {
	contentType = strings.TrimSpace(strings.Split(contentType, ";")[0])
	if contentType == "" {
		return ""
	}
	extensions, _ := mime.ExtensionsByType(contentType)
	if len(extensions) == 0 {
		return ""
	}
	return extensions[0]
}

func getEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func loadDotEnvFile(path string) error {
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		value = strings.TrimSpace(value)
		if len(value) >= 2 {
			if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
				value = value[1 : len(value)-1]
			}
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		if err := os.Setenv(key, value); err != nil {
			return err
		}
	}
	return scanner.Err()
}

func parseIntEnv(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
