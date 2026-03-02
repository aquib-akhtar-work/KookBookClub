package main

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/mail"
	"net/http"
	neturl "net/url"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func (s *Server) currentUser(r *http.Request) (*User, error) {
	token, err := parseBearerToken(r)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	var user User
	var emailVerified int
	err = s.db.QueryRow(`
		SELECT u.id, u.email, u.username, u.display_name,
		       CASE WHEN u.email_verified_at <> '' THEN 1 ELSE 0 END
		FROM auth_sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ? AND s.expires_at > ?
	`, hashToken(token), now).Scan(&user.ID, &user.Email, &user.Username, &user.DisplayName, &emailVerified)
	if err != nil {
		return nil, err
	}
	user.EmailVerified = emailVerified == 1
	return &user, nil
}

func (s *Server) getUserByID(userID int64) (*User, error) {
	var user User
	var emailVerified int
	err := s.db.QueryRow(`
		SELECT id, email, username, display_name,
		       CASE WHEN email_verified_at <> '' THEN 1 ELSE 0 END
		FROM users
		WHERE id = ?
		LIMIT 1
	`, userID).Scan(&user.ID, &user.Email, &user.Username, &user.DisplayName, &emailVerified)
	if err != nil {
		return nil, err
	}
	user.EmailVerified = emailVerified == 1
	return &user, nil
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}

	var req struct {
		Email       string `json:"email"`
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		Password    string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !isValidEmail(email) {
		writeError(w, http.StatusBadRequest, "valid email is required")
		return
	}

	username, ok := normalizeUsername(req.Username)
	if !ok {
		writeError(w, http.StatusBadRequest, "username must be 3-24 chars: lowercase letters, numbers, '.', '_' or '-'")
		return
	}

	displayName := strings.TrimSpace(req.DisplayName)
	if displayName == "" {
		displayName = username
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to hash password")
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(`
		INSERT INTO users (email, username, display_name, password_hash, handle, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, email, username, displayName, string(passwordHash), username, now)
	if err != nil {
		s.handleRegistrationConflict(w, err)
		return
	}

	userID, err := res.LastInsertId()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	verifyToken, verifyExpiresAt, err := s.createEmailVerificationToken(userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to create email verification token")
		return
	}
	verificationEmailSent := true
	if err := s.sendEmailVerificationEmail(r, email, username, displayName, verifyToken, verifyExpiresAt); err != nil {
		verificationEmailSent = false
		log.Printf("failed sending verification email to %s: %v", email, err)
	}

	token, expiresAt, err := s.createSession(userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to create session")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"user": User{
			ID:            userID,
			Email:         email,
			Username:      username,
			DisplayName:   displayName,
			EmailVerified: false,
		},
		"token":                       token,
		"expires_at":                  expiresAt,
		"email_verification_required": true,
		"verification_email_sent":     verificationEmailSent,
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}

	var req struct {
		Identity string `json:"identity"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	identity := strings.ToLower(strings.TrimSpace(req.Identity))
	if identity == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "identity and password are required")
		return
	}

	var user User
	var passwordHash string
	var emailVerified int
	err := s.db.QueryRow(`
		SELECT id, email, username, display_name, password_hash,
		       CASE WHEN email_verified_at <> '' THEN 1 ELSE 0 END
		FROM users
		WHERE lower(email) = ? OR lower(username) = ?
		LIMIT 1
	`, identity, identity).Scan(&user.ID, &user.Email, &user.Username, &user.DisplayName, &passwordHash, &emailVerified)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if passwordHash == "" || bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)) != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	user.EmailVerified = emailVerified == 1

	token, expiresAt, err := s.createSession(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to create session")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"user":       user,
		"token":      token,
		"expires_at": expiresAt,
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request, _ *User) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}

	token, err := parseBearerToken(r)
	if err == nil {
		_, _ = s.db.Exec(`DELETE FROM auth_sessions WHERE token_hash = ?`, hashToken(token))
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

func (s *Server) handleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}

	var req struct {
		Token string `json:"token"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	token := strings.TrimSpace(req.Token)
	if token == "" {
		writeError(w, http.StatusBadRequest, "verification token is required")
		return
	}

	var tokenID int64
	var userID int64
	var expiresAt string
	var consumedAt string
	err := s.db.QueryRow(`
		SELECT id, user_id, expires_at, consumed_at
		FROM email_verification_tokens
		WHERE token_hash = ?
		LIMIT 1
	`, hashToken(token)).Scan(&tokenID, &userID, &expiresAt, &consumedAt)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusBadRequest, "invalid or expired verification link")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if consumedAt != "" {
		writeError(w, http.StatusBadRequest, "verification link has already been used")
		return
	}

	expiry, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stored verification token has invalid expiration")
		return
	}
	if time.Now().UTC().After(expiry) {
		writeError(w, http.StatusBadRequest, "verification link has expired")
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := s.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		UPDATE users
		SET email_verified_at = CASE WHEN email_verified_at = '' THEN ? ELSE email_verified_at END
		WHERE id = ?
	`, now, userID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec(`
		UPDATE email_verification_tokens
		SET consumed_at = ?
		WHERE id = ? AND consumed_at = ''
	`, now, tokenID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec(`
		DELETE FROM email_verification_tokens
		WHERE user_id = ? AND id <> ?
	`, userID, tokenID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": "email_verified",
	})
}

func (s *Server) handleResendVerificationEmail(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}
	if user.EmailVerified {
		writeJSON(w, http.StatusOK, map[string]string{"status": "already_verified"})
		return
	}

	token, expiresAt, err := s.createEmailVerificationToken(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to create email verification token")
		return
	}
	if err := s.sendEmailVerificationEmail(r, user.Email, user.Username, user.DisplayName, token, expiresAt); err != nil {
		writeError(w, http.StatusBadGateway, "unable to send verification email")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status":     "verification_email_sent",
		"expires_at": expiresAt,
	})
}

func (s *Server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}

	var req struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !isValidEmail(email) {
		writeError(w, http.StatusBadRequest, "valid email is required")
		return
	}

	var userID int64
	var username string
	var displayName string
	err := s.db.QueryRow(`
		SELECT id, username, display_name
		FROM users
		WHERE lower(email) = ?
		LIMIT 1
	`, email).Scan(&userID, &username, &displayName)
	if err == nil {
		token, expiresAt, tokenErr := s.createPasswordResetToken(userID)
		if tokenErr != nil {
			log.Printf("failed creating password reset token for %s: %v", email, tokenErr)
		} else if sendErr := s.sendPasswordResetEmail(r, email, username, displayName, token, expiresAt); sendErr != nil {
			log.Printf("failed sending password reset email to %s: %v", email, sendErr)
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": "if_account_exists_email_sent",
	})
}

func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}

	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	token := strings.TrimSpace(req.Token)
	if token == "" {
		writeError(w, http.StatusBadRequest, "reset token is required")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	var tokenID int64
	var userID int64
	var expiresAt string
	var consumedAt string
	err := s.db.QueryRow(`
		SELECT id, user_id, expires_at, consumed_at
		FROM password_reset_tokens
		WHERE token_hash = ?
		LIMIT 1
	`, hashToken(token)).Scan(&tokenID, &userID, &expiresAt, &consumedAt)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusBadRequest, "invalid or expired reset link")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if consumedAt != "" {
		writeError(w, http.StatusBadRequest, "reset link has already been used")
		return
	}

	expiry, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stored reset token has invalid expiration")
		return
	}
	if time.Now().UTC().After(expiry) {
		writeError(w, http.StatusBadRequest, "reset link has expired")
		return
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to hash password")
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := s.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		UPDATE users
		SET password_hash = ?
		WHERE id = ?
	`, string(passwordHash), userID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec(`
		UPDATE password_reset_tokens
		SET consumed_at = ?
		WHERE id = ? AND consumed_at = ''
	`, now, tokenID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec(`
		DELETE FROM password_reset_tokens
		WHERE user_id = ? AND id <> ?
	`, userID, tokenID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec(`DELETE FROM auth_sessions WHERE user_id = ?`, userID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": "password_reset",
	})
}

func (s *Server) handleAccountUpdateEmail(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}

	var req struct {
		NewEmail        string `json:"new_email"`
		CurrentPassword string `json:"current_password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	newEmail := strings.ToLower(strings.TrimSpace(req.NewEmail))
	if !isValidEmail(newEmail) {
		writeError(w, http.StatusBadRequest, "valid new_email is required")
		return
	}
	if req.CurrentPassword == "" {
		writeError(w, http.StatusBadRequest, "current_password is required")
		return
	}
	if strings.EqualFold(newEmail, user.Email) {
		writeError(w, http.StatusBadRequest, "new email must be different")
		return
	}

	var passwordHash string
	err := s.db.QueryRow(`SELECT password_hash FROM users WHERE id = ?`, user.ID).Scan(&passwordHash)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusUnauthorized, "user not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if passwordHash == "" || bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.CurrentPassword)) != nil {
		writeError(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}

	_, err = s.db.Exec(`
		UPDATE users
		SET email = ?, email_verified_at = ''
		WHERE id = ?
	`, newEmail, user.ID)
	if err != nil {
		lower := strings.ToLower(err.Error())
		if strings.Contains(lower, "idx_users_email_unique") || strings.Contains(lower, "users.email") {
			writeError(w, http.StatusConflict, "email is already registered")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	token, expiresAt, err := s.createEmailVerificationToken(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to create email verification token")
		return
	}
	verificationEmailSent := true
	if err := s.sendEmailVerificationEmail(r, newEmail, user.Username, user.DisplayName, token, expiresAt); err != nil {
		verificationEmailSent = false
		log.Printf("failed sending verification email to updated address %s: %v", newEmail, err)
	}

	updatedUser, err := s.getUserByID(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"user":                        updatedUser,
		"email_verification_required": true,
		"verification_email_sent":     verificationEmailSent,
	})
}

func (s *Server) handleAccountSendPasswordCode(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}

	code, expiresAt, err := s.createPasswordChangeCode(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to create password change code")
		return
	}
	if err := s.sendPasswordChangeCodeEmail(user.Email, user.Username, user.DisplayName, code, expiresAt); err != nil {
		writeError(w, http.StatusBadGateway, "unable to send password change code")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status":     "password_change_code_sent",
		"expires_at": expiresAt,
	})
}

func (s *Server) handleAccountUpdatePassword(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}

	var req struct {
		Code     string `json:"code"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" {
		writeError(w, http.StatusBadRequest, "code is required")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	var codeID int64
	var expiresAt string
	var consumedAt string
	err := s.db.QueryRow(`
		SELECT id, expires_at, consumed_at
		FROM password_change_codes
		WHERE user_id = ? AND code_hash = ?
		ORDER BY created_at DESC
		LIMIT 1
	`, user.ID, hashToken(code)).Scan(&codeID, &expiresAt, &consumedAt)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusBadRequest, "invalid or expired password change code")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if consumedAt != "" {
		writeError(w, http.StatusBadRequest, "password change code has already been used")
		return
	}

	expiry, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stored password change code has invalid expiration")
		return
	}
	if time.Now().UTC().After(expiry) {
		writeError(w, http.StatusBadRequest, "password change code has expired")
		return
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to hash password")
		return
	}

	currentToken := ""
	if token, tokenErr := parseBearerToken(r); tokenErr == nil {
		currentToken = hashToken(token)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := s.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		UPDATE users
		SET password_hash = ?
		WHERE id = ?
	`, string(passwordHash), user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec(`
		UPDATE password_change_codes
		SET consumed_at = ?
		WHERE id = ? AND consumed_at = ''
	`, now, codeID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec(`
		DELETE FROM password_change_codes
		WHERE user_id = ? AND id <> ?
	`, user.ID, codeID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if currentToken != "" {
		if _, err := tx.Exec(`
			DELETE FROM auth_sessions
			WHERE user_id = ? AND token_hash <> ?
		`, user.ID, currentToken); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	} else {
		if _, err := tx.Exec(`DELETE FROM auth_sessions WHERE user_id = ?`, user.ID); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": "password_updated",
	})
}

func (s *Server) handleRegistrationConflict(w http.ResponseWriter, err error) {
	lower := strings.ToLower(err.Error())
	switch {
	case strings.Contains(lower, "idx_users_email_unique"), strings.Contains(lower, "users.email"):
		writeError(w, http.StatusConflict, "email is already registered")
	case strings.Contains(lower, "idx_users_username_unique"), strings.Contains(lower, "users.username"), strings.Contains(lower, "users.handle"), strings.Contains(lower, "idx_users_handle_unique"):
		writeError(w, http.StatusConflict, "username is already taken")
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}

func (s *Server) createSession(userID int64) (token string, expiresAt string, err error) {
	token, err = generateAuthToken(32)
	if err != nil {
		return "", "", err
	}

	expiresAt = time.Now().UTC().Add(30 * 24 * time.Hour).Format(time.RFC3339)
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec(`
		INSERT INTO auth_sessions (user_id, token_hash, expires_at, created_at)
		VALUES (?, ?, ?, ?)
	`, userID, hashToken(token), expiresAt, now)
	if err != nil {
		return "", "", err
	}
	return token, expiresAt, nil
}

func (s *Server) createEmailVerificationToken(userID int64) (string, string, error) {
	return s.createOneTimeToken("email_verification_tokens", userID, 48*time.Hour)
}

func (s *Server) createPasswordResetToken(userID int64) (string, string, error) {
	return s.createOneTimeToken("password_reset_tokens", userID, 2*time.Hour)
}

func (s *Server) createPasswordChangeCode(userID int64) (string, string, error) {
	code, err := generateCode(8)
	if err != nil {
		return "", "", err
	}

	now := time.Now().UTC()
	expiresAt := now.Add(15 * time.Minute).Format(time.RFC3339)
	nowRaw := now.Format(time.RFC3339)

	tx, err := s.db.Begin()
	if err != nil {
		return "", "", err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM password_change_codes WHERE user_id = ?`, userID); err != nil {
		return "", "", err
	}
	if _, err := tx.Exec(`
		INSERT INTO password_change_codes (user_id, code_hash, expires_at, created_at)
		VALUES (?, ?, ?, ?)
	`, userID, hashToken(code), expiresAt, nowRaw); err != nil {
		return "", "", err
	}
	if _, err := tx.Exec(`
		DELETE FROM password_change_codes
		WHERE expires_at <= ? OR consumed_at <> ''
	`, nowRaw); err != nil {
		return "", "", err
	}
	if err := tx.Commit(); err != nil {
		return "", "", err
	}
	return code, expiresAt, nil
}

func (s *Server) createOneTimeToken(table string, userID int64, ttl time.Duration) (token string, expiresAt string, err error) {
	token, err = generateAuthToken(32)
	if err != nil {
		return "", "", err
	}

	now := time.Now().UTC()
	expiresAt = now.Add(ttl).Format(time.RFC3339)
	nowRaw := now.Format(time.RFC3339)

	tx, err := s.db.Begin()
	if err != nil {
		return "", "", err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(fmt.Sprintf("DELETE FROM %s WHERE user_id = ?", table), userID); err != nil {
		return "", "", err
	}
	if _, err := tx.Exec(fmt.Sprintf(`
		INSERT INTO %s (user_id, token_hash, expires_at, created_at)
		VALUES (?, ?, ?, ?)
	`, table), userID, hashToken(token), expiresAt, nowRaw); err != nil {
		return "", "", err
	}
	if _, err := tx.Exec(fmt.Sprintf(`
		DELETE FROM %s
		WHERE expires_at <= ? OR consumed_at <> ''
	`, table), nowRaw); err != nil {
		return "", "", err
	}
	if err := tx.Commit(); err != nil {
		return "", "", err
	}
	return token, expiresAt, nil
}

func (s *Server) sendEmailVerificationEmail(
	r *http.Request,
	toEmail,
	username,
	displayName,
	token,
	expiresAt string,
) error {
	link := s.buildAuthLink(r, "verify_token", token)
	if link == "" {
		return errors.New("unable to build verification link; set APP_BASE_URL")
	}
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = strings.TrimSpace(username)
	}
	if name == "" {
		name = "there"
	}

	expiresLabel := formatExpiryLabel(expiresAt)
	subject := "Confirm your email for KookBook Club"
	htmlBody := fmt.Sprintf(`
		<p>Hi %s,</p>
		<p>Thanks for signing up for KookBook Club. Confirm your email by clicking the link below:</p>
		<p><a href="%s">Confirm email</a></p>
		<p>This link expires %s.</p>
		<p>If you did not create this account, you can ignore this email.</p>
	`, html.EscapeString(name), html.EscapeString(link), html.EscapeString(expiresLabel))
	textBody := fmt.Sprintf(
		"Hi %s,\n\nThanks for signing up for KookBook Club. Confirm your email by opening this link:\n%s\n\nThis link expires %s.\n\nIf you did not create this account, you can ignore this email.\n",
		name,
		link,
		expiresLabel,
	)

	return s.sendEmail(toEmail, subject, htmlBody, textBody)
}

func (s *Server) sendPasswordResetEmail(
	r *http.Request,
	toEmail,
	username,
	displayName,
	token,
	expiresAt string,
) error {
	link := s.buildAuthLink(r, "reset_token", token)
	if link == "" {
		return errors.New("unable to build reset link; set APP_BASE_URL")
	}
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = strings.TrimSpace(username)
	}
	if name == "" {
		name = "there"
	}

	expiresLabel := formatExpiryLabel(expiresAt)
	subject := "Reset your KookBook Club password"
	htmlBody := fmt.Sprintf(`
		<p>Hi %s,</p>
		<p>Use the link below to reset your KookBook Club password:</p>
		<p><a href="%s">Reset password</a></p>
		<p>This link expires %s.</p>
		<p>If you did not request this, you can ignore this email.</p>
	`, html.EscapeString(name), html.EscapeString(link), html.EscapeString(expiresLabel))
	textBody := fmt.Sprintf(
		"Hi %s,\n\nUse this link to reset your KookBook Club password:\n%s\n\nThis link expires %s.\n\nIf you did not request this, you can ignore this email.\n",
		name,
		link,
		expiresLabel,
	)

	return s.sendEmail(toEmail, subject, htmlBody, textBody)
}

func (s *Server) sendPasswordChangeCodeEmail(
	toEmail,
	username,
	displayName,
	code,
	expiresAt string,
) error {
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = strings.TrimSpace(username)
	}
	if name == "" {
		name = "there"
	}

	expiresLabel := formatExpiryLabel(expiresAt)
	subject := "Your KookBook Club password change code"
	htmlBody := fmt.Sprintf(`
		<p>Hi %s,</p>
		<p>Use this code to change your KookBook Club password:</p>
		<p style="font-size: 1.3rem; font-weight: 700; letter-spacing: 0.08em;">%s</p>
		<p>This code expires %s.</p>
		<p>If you did not request this, you can ignore this email.</p>
	`, html.EscapeString(name), html.EscapeString(code), html.EscapeString(expiresLabel))
	textBody := fmt.Sprintf(
		"Hi %s,\n\nUse this code to change your KookBook Club password:\n%s\n\nThis code expires %s.\n\nIf you did not request this, you can ignore this email.\n",
		name,
		code,
		expiresLabel,
	)

	return s.sendEmail(toEmail, subject, htmlBody, textBody)
}

func (s *Server) sendEmail(toEmail, subject, htmlBody, textBody string) error {
	if strings.TrimSpace(s.resendAPIKey) == "" {
		return errors.New("RESEND_API_KEY is not configured")
	}
	from := strings.TrimSpace(s.resendFromEmail)
	if from == "" {
		return errors.New("RESEND_FROM_EMAIL is not configured")
	}

	payload := map[string]any{
		"from":    from,
		"to":      []string{toEmail},
		"subject": subject,
		"html":    htmlBody,
		"text":    textBody,
	}
	rawPayload, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(rawPayload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.resendAPIKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= http.StatusMultipleChoices {
		var failure struct {
			Message string `json:"message"`
			Error   string `json:"error"`
		}
		_ = json.Unmarshal(body, &failure)
		message := strings.TrimSpace(failure.Message)
		if message == "" {
			message = strings.TrimSpace(failure.Error)
		}
		if message == "" {
			message = strings.TrimSpace(string(body))
		}
		if message == "" {
			message = res.Status
		}
		return fmt.Errorf("resend error: %s", message)
	}

	return nil
}

func (s *Server) buildAuthLink(r *http.Request, tokenKey, token string) string {
	baseURL := s.resolveAppBaseURL(r)
	if baseURL == "" {
		return ""
	}
	parsed, err := neturl.Parse(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	parsed.Path = "/auth"
	query := parsed.Query()
	query.Set(tokenKey, token)
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func (s *Server) resolveAppBaseURL(r *http.Request) string {
	if s.appBaseURL != "" {
		return s.appBaseURL
	}
	if strings.HasPrefix(s.frontendOrigin, "http://") || strings.HasPrefix(s.frontendOrigin, "https://") {
		return strings.TrimSpace(strings.TrimSuffix(s.frontendOrigin, "/"))
	}
	if r == nil {
		return ""
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if rawProto := firstCSVHeaderValue(r.Header.Get("X-Forwarded-Proto")); rawProto != "" {
		scheme = rawProto
	}

	host := firstCSVHeaderValue(r.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = strings.TrimSpace(r.Host)
	}
	if host == "" {
		return ""
	}
	return fmt.Sprintf("%s://%s", scheme, host)
}

func firstCSVHeaderValue(raw string) string {
	if raw == "" {
		return ""
	}
	chunk := strings.TrimSpace(strings.Split(raw, ",")[0])
	return chunk
}

func formatExpiryLabel(raw string) string {
	ts, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return raw
	}
	return ts.UTC().Format("January 2, 2006 at 15:04 UTC")
}

func parseBearerToken(r *http.Request) (string, error) {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if authHeader == "" {
		return "", errors.New("missing authorization")
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", errors.New("invalid authorization scheme")
	}
	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", errors.New("missing bearer token")
	}
	return token, nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func normalizeUsername(raw string) (string, bool) {
	username := strings.ToLower(strings.TrimSpace(raw))
	if len(username) < 3 || len(username) > 24 {
		return "", false
	}
	for _, r := range username {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-' {
			continue
		}
		return "", false
	}
	return username, true
}

func isValidEmail(email string) bool {
	addr, err := mail.ParseAddress(email)
	return err == nil && strings.EqualFold(addr.Address, email)
}
