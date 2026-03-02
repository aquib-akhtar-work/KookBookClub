package main

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (s *Server) handleClubMeetings(w http.ResponseWriter, r *http.Request, user *User, clubID int64) {
	ok, err := s.isClubMember(clubID, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		writeError(w, http.StatusForbidden, "not a member of this club")
		return
	}

	switch r.Method {
	case http.MethodGet:
		rows, err := s.db.Query(`
			SELECT m.id, m.club_id, m.title, m.address, m.scheduled_at, m.cookbook,
			       m.cookbook_key, m.cookbook_author, m.cookbook_cover_url, m.cookbook_first_publish_year,
			       m.created_by_user_id, m.ended_at, m.ended_by_user_id,
			       m.host_user_id, u.display_name, m.notes, m.created_at
			FROM meetings m
			JOIN users u ON u.id = m.host_user_id
			WHERE m.club_id = ?
			ORDER BY m.scheduled_at ASC
		`, clubID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer rows.Close()

		meetings := make([]Meeting, 0)
		for rows.Next() {
			var m Meeting
			if err := rows.Scan(
				&m.ID, &m.ClubID, &m.Title, &m.Address, &m.ScheduledAt, &m.Cookbook,
				&m.CookbookKey, &m.CookbookAuthor, &m.CookbookCoverURL, &m.CookbookFirstPublishYear,
				&m.CreatedByUserID, &m.EndedAt, &m.EndedByUserID,
				&m.HostUserID, &m.HostName, &m.Notes, &m.CreatedAt,
			); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			meetings = append(meetings, m)
		}
		if err := rows.Err(); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"meetings": meetings})
	case http.MethodPost:
		var req struct {
			Title                    string `json:"title"`
			Address                  string `json:"address"`
			ScheduledAt              string `json:"scheduled_at"`
			Cookbook                 string `json:"cookbook"`
			CookbookKey              string `json:"cookbook_key"`
			CookbookAuthor           string `json:"cookbook_author"`
			CookbookCoverURL         string `json:"cookbook_cover_url"`
			CookbookFirstPublishYear int    `json:"cookbook_first_publish_year"`
			HostUserID               int64  `json:"host_user_id"`
			Notes                    string `json:"notes"`
		}
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		req.Title = strings.TrimSpace(req.Title)
		req.Address = strings.TrimSpace(req.Address)
		req.Cookbook = strings.TrimSpace(req.Cookbook)
		req.CookbookKey = strings.TrimSpace(req.CookbookKey)
		req.CookbookAuthor = strings.TrimSpace(req.CookbookAuthor)
		req.CookbookCoverURL = strings.TrimSpace(req.CookbookCoverURL)
		req.Notes = strings.TrimSpace(req.Notes)
		if req.Title == "" || req.Address == "" || req.Cookbook == "" {
			writeError(w, http.StatusBadRequest, "title, address, and cookbook are required")
			return
		}
		if req.CookbookFirstPublishYear < 0 {
			req.CookbookFirstPublishYear = 0
		}

		scheduledAt, err := normalizeDateTime(req.ScheduledAt)
		if err != nil {
			writeError(w, http.StatusBadRequest, "scheduled_at must be RFC3339 or datetime-local")
			return
		}

		hostID := req.HostUserID
		if hostID == 0 {
			hostID = user.ID
		}
		hostInClub, err := s.isClubMember(clubID, hostID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !hostInClub {
			writeError(w, http.StatusBadRequest, "host_user_id must belong to the club")
			return
		}

		now := time.Now().UTC().Format(time.RFC3339)
		res, err := s.db.Exec(`
			INSERT INTO meetings (
				club_id, title, address, scheduled_at, cookbook, cookbook_key, cookbook_author,
				cookbook_cover_url, cookbook_first_publish_year,
				created_by_user_id, ended_at, ended_by_user_id,
				host_user_id, notes, created_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, ?)
		`,
			clubID, req.Title, req.Address, scheduledAt, req.Cookbook, req.CookbookKey, req.CookbookAuthor,
			req.CookbookCoverURL, req.CookbookFirstPublishYear, user.ID, hostID, req.Notes, now,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		meetingID, err := res.LastInsertId()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		meeting, err := s.getMeetingForUser(meetingID, user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"meeting": meeting})
	default:
		methodNotAllowed(w, http.MethodGet, http.MethodPost)
	}
}

func (s *Server) handleMeetingSubroutes(w http.ResponseWriter, r *http.Request, user *User) {
	segments := splitPath(r.URL.Path, "/api/meetings/")
	if len(segments) == 0 {
		http.NotFound(w, r)
		return
	}

	meetingID, err := parseID(segments[0])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid meeting id")
		return
	}

	switch {
	case len(segments) == 1:
		if r.Method != http.MethodGet {
			methodNotAllowed(w, http.MethodGet)
			return
		}
		meeting, err := s.getMeetingForUser(meetingID, user.ID)
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "meeting not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"meeting": meeting})
	case len(segments) == 2 && segments[1] == "update":
		s.handleUpdateMeeting(w, r, user, meetingID)
	case len(segments) == 2 && segments[1] == "end":
		s.handleEndMeeting(w, r, user, meetingID)
	case len(segments) == 2 && segments[1] == "recipes":
		s.handleRecipes(w, r, user, meetingID)
	case len(segments) == 2 && segments[1] == "media":
		s.handleMedia(w, r, user, meetingID)
	case len(segments) == 2 && segments[1] == "polls":
		s.handlePolls(w, r, user, meetingID)
	case len(segments) == 2 && segments[1] == "feedback":
		s.handleFeedback(w, r, user, meetingID)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) handleUpdateMeeting(w http.ResponseWriter, r *http.Request, user *User, meetingID int64) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}

	clubID, err := s.authorizeMeetingManager(meetingID, user.ID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "meeting not found")
		return
	}
	if errors.Is(err, errForbiddenMeetingManager) {
		writeError(w, http.StatusForbidden, "only the meeting creator can edit meeting details")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var req struct {
		Title                    string `json:"title"`
		Address                  string `json:"address"`
		ScheduledAt              string `json:"scheduled_at"`
		Cookbook                 string `json:"cookbook"`
		CookbookKey              string `json:"cookbook_key"`
		CookbookAuthor           string `json:"cookbook_author"`
		CookbookCoverURL         string `json:"cookbook_cover_url"`
		CookbookFirstPublishYear int    `json:"cookbook_first_publish_year"`
		HostUserID               int64  `json:"host_user_id"`
		Notes                    string `json:"notes"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Address = strings.TrimSpace(req.Address)
	req.Cookbook = strings.TrimSpace(req.Cookbook)
	req.CookbookKey = strings.TrimSpace(req.CookbookKey)
	req.CookbookAuthor = strings.TrimSpace(req.CookbookAuthor)
	req.CookbookCoverURL = strings.TrimSpace(req.CookbookCoverURL)
	req.Notes = strings.TrimSpace(req.Notes)
	if req.Title == "" || req.Address == "" || req.Cookbook == "" {
		writeError(w, http.StatusBadRequest, "title, address, and cookbook are required")
		return
	}
	if req.CookbookFirstPublishYear < 0 {
		req.CookbookFirstPublishYear = 0
	}

	scheduledAt, err := normalizeDateTime(req.ScheduledAt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "scheduled_at must be RFC3339 or datetime-local")
		return
	}

	hostID := req.HostUserID
	if hostID == 0 {
		hostID = user.ID
	}
	hostInClub, err := s.isClubMember(clubID, hostID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !hostInClub {
		writeError(w, http.StatusBadRequest, "host_user_id must belong to the club")
		return
	}

	_, err = s.db.Exec(`
		UPDATE meetings
		SET title = ?, address = ?, scheduled_at = ?, cookbook = ?, cookbook_key = ?, cookbook_author = ?,
		    cookbook_cover_url = ?, cookbook_first_publish_year = ?, host_user_id = ?, notes = ?
		WHERE id = ?
	`, req.Title, req.Address, scheduledAt, req.Cookbook, req.CookbookKey, req.CookbookAuthor,
		req.CookbookCoverURL, req.CookbookFirstPublishYear, hostID, req.Notes, meetingID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	meeting, err := s.getMeetingForUser(meetingID, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"meeting": meeting})
}

func (s *Server) handleEndMeeting(w http.ResponseWriter, r *http.Request, user *User, meetingID int64) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}

	_, err := s.authorizeMeetingManager(meetingID, user.ID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "meeting not found")
		return
	}
	if errors.Is(err, errForbiddenMeetingManager) {
		writeError(w, http.StatusForbidden, "only the meeting creator can end this meeting")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var existingEndedAt string
	if err := s.db.QueryRow(`SELECT ended_at FROM meetings WHERE id = ?`, meetingID).Scan(&existingEndedAt); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	alreadyEnded := strings.TrimSpace(existingEndedAt) != ""
	if !alreadyEnded {
		now := time.Now().UTC().Format(time.RFC3339)
		if _, err := s.db.Exec(`UPDATE meetings SET ended_at = ?, ended_by_user_id = ? WHERE id = ?`, now, user.ID, meetingID); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	meeting, err := s.getMeetingForUser(meetingID, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"meeting":       meeting,
		"already_ended": alreadyEnded,
	})
}

func (s *Server) authorizeMeetingManager(meetingID, userID int64) (int64, error) {
	var clubID int64
	var creatorID int64
	err := s.db.QueryRow(`
		SELECT club_id, created_by_user_id
		FROM meetings
		WHERE id = ?
	`, meetingID).Scan(&clubID, &creatorID)
	if err != nil {
		return 0, err
	}

	isMember, err := s.isClubMember(clubID, userID)
	if err != nil {
		return 0, err
	}
	if !isMember || creatorID != userID {
		return 0, errForbiddenMeetingManager
	}
	return clubID, nil
}

func (s *Server) handleRecipes(w http.ResponseWriter, r *http.Request, user *User, meetingID int64) {
	if _, err := s.ensureMeetingMembership(meetingID, user.ID); err != nil {
		s.handleMembershipErr(w, err)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rows, err := s.db.Query(`
			SELECT r.id, r.meeting_id, r.user_id, u.display_name, r.title, r.notes, r.source_url, r.created_at
			FROM recipes r
			JOIN users u ON u.id = r.user_id
			WHERE r.meeting_id = ?
			ORDER BY r.created_at DESC
		`, meetingID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer rows.Close()

		recipes := make([]Recipe, 0)
		for rows.Next() {
			var rc Recipe
			if err := rows.Scan(&rc.ID, &rc.MeetingID, &rc.UserID, &rc.UserName, &rc.Title, &rc.Notes, &rc.SourceURL, &rc.CreatedAt); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			recipes = append(recipes, rc)
		}
		if err := rows.Err(); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"recipes": recipes})
	case http.MethodPost:
		var req struct {
			Title     string `json:"title"`
			Notes     string `json:"notes"`
			SourceURL string `json:"source_url"`
		}
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		req.Title = strings.TrimSpace(req.Title)
		req.Notes = strings.TrimSpace(req.Notes)
		req.SourceURL = strings.TrimSpace(req.SourceURL)
		if req.Title == "" {
			writeError(w, http.StatusBadRequest, "recipe title is required")
			return
		}

		now := time.Now().UTC().Format(time.RFC3339)
		res, err := s.db.Exec(`
			INSERT INTO recipes (meeting_id, user_id, title, notes, source_url, created_at)
			VALUES (?, ?, ?, ?, ?, ?)
		`, meetingID, user.ID, req.Title, req.Notes, req.SourceURL, now)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		id, err := res.LastInsertId()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusCreated, map[string]any{
			"recipe": Recipe{
				ID:        id,
				MeetingID: meetingID,
				UserID:    user.ID,
				UserName:  user.DisplayName,
				Title:     req.Title,
				Notes:     req.Notes,
				SourceURL: req.SourceURL,
				CreatedAt: now,
			},
		})
	default:
		methodNotAllowed(w, http.MethodGet, http.MethodPost)
	}
}

func (s *Server) handleMedia(w http.ResponseWriter, r *http.Request, user *User, meetingID int64) {
	if _, err := s.ensureMeetingMembership(meetingID, user.ID); err != nil {
		s.handleMembershipErr(w, err)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rows, err := s.db.Query(`
			SELECT mp.id, mp.meeting_id, mp.user_id, u.display_name, mp.media_type, mp.media_url, mp.caption, mp.created_at
			FROM media_posts mp
			JOIN users u ON u.id = mp.user_id
			WHERE mp.meeting_id = ?
			ORDER BY mp.created_at DESC
		`, meetingID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer rows.Close()

		items := make([]MediaPost, 0)
		for rows.Next() {
			var item MediaPost
			if err := rows.Scan(&item.ID, &item.MeetingID, &item.UserID, &item.UserName, &item.MediaType, &item.MediaURL, &item.Caption, &item.CreatedAt); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"media": items})
	case http.MethodPost:
		contentType := r.Header.Get("Content-Type")
		if strings.HasPrefix(contentType, "multipart/form-data") {
			s.uploadMediaFile(w, r, user, meetingID)
			return
		}

		var req struct {
			MediaType string `json:"media_type"`
			MediaURL  string `json:"media_url"`
			Caption   string `json:"caption"`
		}
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		req.MediaType = strings.ToLower(strings.TrimSpace(req.MediaType))
		req.MediaURL = strings.TrimSpace(req.MediaURL)
		req.Caption = strings.TrimSpace(req.Caption)
		if req.MediaURL == "" {
			writeError(w, http.StatusBadRequest, "media_url is required")
			return
		}
		if req.MediaType != "image" && req.MediaType != "video" {
			req.MediaType = "image"
		}

		now := time.Now().UTC().Format(time.RFC3339)
		res, err := s.db.Exec(`
			INSERT INTO media_posts (meeting_id, user_id, media_type, file_path, media_url, caption, created_at)
			VALUES (?, ?, ?, '', ?, ?, ?)
		`, meetingID, user.ID, req.MediaType, req.MediaURL, req.Caption, now)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		id, err := res.LastInsertId()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusCreated, map[string]any{
			"media": MediaPost{
				ID:        id,
				MeetingID: meetingID,
				UserID:    user.ID,
				UserName:  user.DisplayName,
				MediaType: req.MediaType,
				MediaURL:  req.MediaURL,
				Caption:   req.Caption,
				CreatedAt: now,
			},
		})
	default:
		methodNotAllowed(w, http.MethodGet, http.MethodPost)
	}
}

func (s *Server) uploadMediaFile(w http.ResponseWriter, r *http.Request, user *User, meetingID int64) {
	if err := r.ParseMultipartForm(30 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "unable to parse multipart form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "form field 'file' is required")
		return
	}
	defer file.Close()

	caption := strings.TrimSpace(r.FormValue("caption"))
	mediaType := strings.ToLower(strings.TrimSpace(r.FormValue("media_type")))
	if mediaType != "image" && mediaType != "video" {
		mediaType = detectMediaType(header.Filename, header.Header.Get("Content-Type"))
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		ext = extensionFromMIME(header.Header.Get("Content-Type"))
	}
	if ext == "" {
		ext = ".bin"
	}

	suffix, err := generateCode(6)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	filename := fmt.Sprintf("%d_%s%s", time.Now().UnixNano(), strings.ToLower(suffix), ext)
	diskPath := filepath.Join(s.uploadDir, filename)
	dst, err := os.Create(diskPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to persist upload")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		writeError(w, http.StatusInternalServerError, "unable to save uploaded file")
		return
	}

	mediaURL := "/uploads/" + filename
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(`
		INSERT INTO media_posts (meeting_id, user_id, media_type, file_path, media_url, caption, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, meetingID, user.ID, mediaType, diskPath, mediaURL, caption, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	id, err := res.LastInsertId()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"media": MediaPost{
			ID:        id,
			MeetingID: meetingID,
			UserID:    user.ID,
			UserName:  user.DisplayName,
			MediaType: mediaType,
			MediaURL:  mediaURL,
			Caption:   caption,
			CreatedAt: now,
		},
	})
}

func (s *Server) handlePolls(w http.ResponseWriter, r *http.Request, user *User, meetingID int64) {
	if _, err := s.ensureMeetingMembership(meetingID, user.ID); err != nil {
		s.handleMembershipErr(w, err)
		return
	}

	switch r.Method {
	case http.MethodGet:
		polls, err := s.listPolls(meetingID, user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"polls": polls})
	case http.MethodPost:
		var req struct {
			Question string   `json:"question"`
			Options  []string `json:"options"`
			ClosesAt string   `json:"closes_at"`
		}
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		req.Question = strings.TrimSpace(req.Question)
		if req.Question == "" {
			writeError(w, http.StatusBadRequest, "question is required")
			return
		}

		cleanOptions := make([]string, 0, len(req.Options))
		for _, option := range req.Options {
			option = strings.TrimSpace(option)
			if option != "" {
				cleanOptions = append(cleanOptions, option)
			}
		}
		if len(cleanOptions) < 2 {
			writeError(w, http.StatusBadRequest, "at least 2 options are required")
			return
		}
		if len(cleanOptions) > 10 {
			writeError(w, http.StatusBadRequest, "max 10 options")
			return
		}

		closesAt := ""
		if strings.TrimSpace(req.ClosesAt) != "" {
			normalized, err := normalizeDateTime(req.ClosesAt)
			if err != nil {
				writeError(w, http.StatusBadRequest, "closes_at must be RFC3339 or datetime-local")
				return
			}
			closesAt = normalized
		}

		now := time.Now().UTC().Format(time.RFC3339)
		tx, err := s.db.Begin()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer tx.Rollback()

		res, err := tx.Exec(`
			INSERT INTO polls (meeting_id, creator_user_id, question, closes_at, created_at)
			VALUES (?, ?, ?, ?, ?)
		`, meetingID, user.ID, req.Question, closesAt, now)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		pollID, err := res.LastInsertId()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		for _, option := range cleanOptions {
			if _, err := tx.Exec(`INSERT INTO poll_options (poll_id, option_text) VALUES (?, ?)`, pollID, option); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}

		if err := tx.Commit(); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		polls, err := s.listPolls(meetingID, user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		for _, poll := range polls {
			if poll.ID == pollID {
				writeJSON(w, http.StatusCreated, map[string]any{"poll": poll})
				return
			}
		}
		writeError(w, http.StatusInternalServerError, "poll was created but could not be loaded")
	default:
		methodNotAllowed(w, http.MethodGet, http.MethodPost)
	}
}

func (s *Server) listPolls(meetingID, userID int64) ([]Poll, error) {
	rows, err := s.db.Query(`
		SELECT p.id, p.meeting_id, p.question, p.closes_at, p.created_at, u.display_name
		FROM polls p
		JOIN users u ON u.id = p.creator_user_id
		WHERE p.meeting_id = ?
		ORDER BY p.created_at DESC
	`, meetingID)
	if err != nil {
		return nil, err
	}

	polls := make([]Poll, 0)
	for rows.Next() {
		var poll Poll
		if err := rows.Scan(&poll.ID, &poll.MeetingID, &poll.Question, &poll.ClosesAt, &poll.CreatedAt, &poll.Creator); err != nil {
			_ = rows.Close()
			return nil, err
		}
		polls = append(polls, poll)
	}

	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	// Load options after the base rows are closed to avoid deadlocks with single-connection SQLite.
	for i := range polls {
		optionRows, err := s.db.Query(`
			SELECT po.id, po.option_text,
			       COUNT(pv.id) AS vote_count,
			       MAX(CASE WHEN pv.user_id = ? THEN 1 ELSE 0 END) AS voted_by_me
			FROM poll_options po
			LEFT JOIN poll_votes pv ON pv.option_id = po.id
			WHERE po.poll_id = ?
			GROUP BY po.id
			ORDER BY po.id ASC
		`, userID, polls[i].ID)
		if err != nil {
			return nil, err
		}

		options := make([]PollOption, 0)
		for optionRows.Next() {
			var opt PollOption
			var votedByMe int
			if err := optionRows.Scan(&opt.ID, &opt.Option, &opt.VoteCount, &votedByMe); err != nil {
				optionRows.Close()
				return nil, err
			}
			opt.VotedByMe = votedByMe == 1
			options = append(options, opt)
		}
		if err := optionRows.Err(); err != nil {
			optionRows.Close()
			return nil, err
		}
		if err := optionRows.Close(); err != nil {
			return nil, err
		}
		polls[i].Options = options
	}

	return polls, nil
}

func (s *Server) handlePollSubroutes(w http.ResponseWriter, r *http.Request, user *User) {
	segments := splitPath(r.URL.Path, "/api/polls/")
	if len(segments) != 2 || segments[1] != "vote" {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}

	pollID, err := parseID(segments[0])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid poll id")
		return
	}

	var req struct {
		OptionID int64 `json:"option_id"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.OptionID == 0 {
		writeError(w, http.StatusBadRequest, "option_id is required")
		return
	}

	var meetingID int64
	err = s.db.QueryRow(`
		SELECT p.meeting_id
		FROM polls p
		WHERE p.id = ?
	`, pollID).Scan(&meetingID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "poll not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if _, err := s.ensureMeetingMembership(meetingID, user.ID); err != nil {
		s.handleMembershipErr(w, err)
		return
	}

	var exists int
	err = s.db.QueryRow(`
		SELECT 1
		FROM poll_options
		WHERE id = ? AND poll_id = ?
	`, req.OptionID, pollID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusBadRequest, "option does not belong to poll")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec(`
		INSERT INTO poll_votes (poll_id, option_id, user_id, created_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT (poll_id, user_id)
		DO UPDATE SET option_id = excluded.option_id, created_at = excluded.created_at
	`, pollID, req.OptionID, user.ID, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	polls, err := s.listPolls(meetingID, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, poll := range polls {
		if poll.ID == pollID {
			writeJSON(w, http.StatusOK, map[string]any{"poll": poll})
			return
		}
	}

	writeError(w, http.StatusInternalServerError, "vote saved but poll could not be loaded")
}

func (s *Server) handleFeedback(w http.ResponseWriter, r *http.Request, user *User, meetingID int64) {
	if _, err := s.ensureMeetingMembership(meetingID, user.ID); err != nil {
		s.handleMembershipErr(w, err)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rows, err := s.db.Query(`
			SELECT mf.id, mf.meeting_id, mf.user_id, u.display_name, mf.rating, mf.comment, mf.created_at
			FROM meeting_feedback mf
			JOIN users u ON u.id = mf.user_id
			WHERE mf.meeting_id = ?
			ORDER BY mf.created_at DESC
		`, meetingID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer rows.Close()

		feedback := make([]Feedback, 0)
		for rows.Next() {
			var f Feedback
			if err := rows.Scan(&f.ID, &f.MeetingID, &f.UserID, &f.UserName, &f.Rating, &f.Comment, &f.CreatedAt); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			feedback = append(feedback, f)
		}
		if err := rows.Err(); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"feedback": feedback})
	case http.MethodPost:
		var req struct {
			Rating  int    `json:"rating"`
			Comment string `json:"comment"`
		}
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		req.Comment = strings.TrimSpace(req.Comment)
		if req.Rating < 1 || req.Rating > 5 {
			writeError(w, http.StatusBadRequest, "rating must be between 1 and 5")
			return
		}

		now := time.Now().UTC().Format(time.RFC3339)
		_, err := s.db.Exec(`
			INSERT INTO meeting_feedback (meeting_id, user_id, rating, comment, created_at)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT (meeting_id, user_id)
			DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = excluded.created_at
		`, meetingID, user.ID, req.Rating, req.Comment, now)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusCreated, map[string]any{"status": "saved"})
	default:
		methodNotAllowed(w, http.MethodGet, http.MethodPost)
	}
}

func (s *Server) handleMembershipErr(w http.ResponseWriter, err error) {
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusForbidden, "not a member of this meeting's club")
		return
	}
	writeError(w, http.StatusInternalServerError, err.Error())
}
