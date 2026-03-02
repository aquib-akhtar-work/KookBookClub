package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (s *Server) registerRoutes(mux *http.ServeMux, webDist string) {
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w, http.MethodGet)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(s.uploadDir))))

	mux.HandleFunc("/api/auth/register", s.handleRegister)
	mux.HandleFunc("/api/auth/login", s.handleLogin)
	mux.HandleFunc("/api/auth/logout", s.withAuth(s.handleLogout))
	mux.HandleFunc("/api/auth/verify-email", s.handleVerifyEmail)
	mux.HandleFunc("/api/auth/verify-email/resend", s.withAuth(s.handleResendVerificationEmail))
	mux.HandleFunc("/api/auth/password/forgot", s.handleForgotPassword)
	mux.HandleFunc("/api/auth/password/reset", s.handleResetPassword)
	mux.HandleFunc("/api/account/email", s.withAuth(s.handleAccountUpdateEmail))
	mux.HandleFunc("/api/account/password/send-code", s.withAuth(s.handleAccountSendPasswordCode))
	mux.HandleFunc("/api/account/password/update", s.withAuth(s.handleAccountUpdatePassword))
	mux.HandleFunc("/api/me", s.withAuth(s.handleMe))
	mux.HandleFunc("/api/auth/me", s.withAuth(s.handleMe))
	mux.HandleFunc("/api/cookbooks/search", s.withAuth(s.handleCookbookSearch))
	mux.HandleFunc("/api/clubs", s.withAuth(s.handleClubs))
	mux.HandleFunc("/api/clubs/join", s.withAuth(s.handleJoinClub))
	mux.HandleFunc("/api/clubs/", s.withAuth(s.handleClubSubroutes))
	mux.HandleFunc("/api/meetings/", s.withAuth(s.handleMeetingSubroutes))
	mux.HandleFunc("/api/polls/", s.withAuth(s.handlePollSubroutes))

	if stat, err := os.Stat(webDist); err == nil && stat.IsDir() {
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/uploads/") {
				http.NotFound(w, r)
				return
			}

			cleanPath := filepath.Clean(r.URL.Path)
			if cleanPath == "/" {
				http.ServeFile(w, r, filepath.Join(webDist, "index.html"))
				return
			}

			target := filepath.Join(webDist, strings.TrimPrefix(cleanPath, "/"))
			if info, err := os.Stat(target); err == nil && !info.IsDir() {
				http.ServeFile(w, r, target)
				return
			}

			http.ServeFile(w, r, filepath.Join(webDist, "index.html"))
		})
		return
	}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{
			"message": "Cookbook Club API is running. Build web app under ../web for UI.",
		})
	})
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", s.frontendOrigin)
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s (%s)", r.Method, r.URL.Path, time.Since(started).Round(time.Millisecond))
	})
}

func (s *Server) withAuth(next func(http.ResponseWriter, *http.Request, *User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := s.currentUser(r)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "missing or invalid bearer token")
			return
		}
		next(w, r, user)
	}
}
