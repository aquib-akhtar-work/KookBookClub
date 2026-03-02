package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"strconv"
	"strings"
	"time"
)

func (s *Server) handleCookbookSearch(w http.ResponseWriter, r *http.Request, _ *User) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) < 2 {
		writeError(w, http.StatusBadRequest, "query must be at least 2 characters")
		return
	}

	limit := 8
	if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
		parsedLimit, err := strconv.Atoi(rawLimit)
		if err != nil || parsedLimit <= 0 {
			writeError(w, http.StatusBadRequest, "limit must be a positive integer")
			return
		}
		if parsedLimit > 20 {
			parsedLimit = 20
		}
		limit = parsedLimit
	}

	results, cached, err := s.searchCookbooks(query, limit)
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("openlibrary lookup failed: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"query":   query,
		"cached":  cached,
		"results": results,
	})
}

func (s *Server) searchCookbooks(query string, limit int) ([]CookbookSearchResult, bool, error) {
	cacheKey := normalizeSearchQuery(query, limit)
	now := time.Now().UTC()
	nowRFC3339 := now.Format(time.RFC3339)

	// Best-effort cleanup to avoid unbounded cache growth.
	_, _ = s.db.Exec(`DELETE FROM cookbook_search_cache WHERE expires_at <= ?`, nowRFC3339)

	var cachedResponse string
	var expiresAt string
	err := s.db.QueryRow(`
		SELECT response_json, expires_at
		FROM cookbook_search_cache
		WHERE cache_key = ?
	`, cacheKey).Scan(&cachedResponse, &expiresAt)
	if err == nil {
		expiry, parseErr := time.Parse(time.RFC3339, expiresAt)
		if parseErr == nil && now.Before(expiry) {
			var results []CookbookSearchResult
			if unmarshalErr := json.Unmarshal([]byte(cachedResponse), &results); unmarshalErr == nil {
				return results, true, nil
			}
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}

	results, err := s.fetchCookbooksFromOpenLibrary(query, limit)
	if err != nil {
		return nil, false, err
	}

	responseJSON, err := json.Marshal(results)
	if err != nil {
		return nil, false, err
	}

	fetchedAt := nowRFC3339
	expiry := now.Add(s.cookbookCacheTTL).Format(time.RFC3339)
	_, _ = s.db.Exec(`
		INSERT INTO cookbook_search_cache (cache_key, search_query, response_json, fetched_at, expires_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (cache_key)
		DO UPDATE SET response_json = excluded.response_json, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at
	`, cacheKey, strings.TrimSpace(query), string(responseJSON), fetchedAt, expiry)

	return results, false, nil
}

func (s *Server) fetchCookbooksFromOpenLibrary(query string, limit int) ([]CookbookSearchResult, error) {
	searchURL, err := neturl.Parse(s.openLibraryURL + "/search.json")
	if err != nil {
		return nil, err
	}

	params := searchURL.Query()
	params.Set("q", query)
	params.Set("limit", strconv.Itoa(limit))
	params.Set("fields", "key,title,author_name,cover_i,cover_edition_key,first_publish_year,edition_count")
	searchURL.RawQuery = params.Encode()

	req, err := http.NewRequest(http.MethodGet, searchURL.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", fmt.Sprintf("CookbookClub/1.0 (mailto:%s)", s.openLibraryEmail))

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openlibrary returned status %d", resp.StatusCode)
	}

	var payload struct {
		Docs []struct {
			Key              string   `json:"key"`
			Title            string   `json:"title"`
			AuthorName       []string `json:"author_name"`
			CoverI           int      `json:"cover_i"`
			CoverEditionKey  string   `json:"cover_edition_key"`
			FirstPublishYear int      `json:"first_publish_year"`
			EditionCount     int      `json:"edition_count"`
		} `json:"docs"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 5<<20)).Decode(&payload); err != nil {
		return nil, err
	}

	results := make([]CookbookSearchResult, 0, len(payload.Docs))
	for _, doc := range payload.Docs {
		title := strings.TrimSpace(doc.Title)
		key := strings.TrimSpace(doc.Key)
		if title == "" || key == "" {
			continue
		}

		item := CookbookSearchResult{
			Key:              key,
			Title:            title,
			Authors:          doc.AuthorName,
			FirstPublishYear: doc.FirstPublishYear,
			EditionCount:     doc.EditionCount,
			OpenLibraryURL:   s.openLibraryURL + key,
		}

		switch {
		case doc.CoverI > 0:
			item.CoverURL = fmt.Sprintf("https://covers.openlibrary.org/b/id/%d-M.jpg", doc.CoverI)
		case strings.TrimSpace(doc.CoverEditionKey) != "":
			item.CoverURL = fmt.Sprintf("https://covers.openlibrary.org/b/olid/%s-M.jpg", strings.TrimSpace(doc.CoverEditionKey))
		}

		results = append(results, item)
	}

	return results, nil
}

func normalizeSearchQuery(query string, limit int) string {
	query = strings.ToLower(strings.TrimSpace(strings.Join(strings.Fields(query), " ")))
	return fmt.Sprintf("%s|%d", query, limit)
}
