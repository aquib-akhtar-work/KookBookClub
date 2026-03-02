package main

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"
)

func (s *Server) handleClubs(w http.ResponseWriter, r *http.Request, user *User) {
	switch r.Method {
	case http.MethodGet:
		s.listClubs(w, user)
	case http.MethodPost:
		s.createClub(w, r, user)
	default:
		methodNotAllowed(w, http.MethodGet, http.MethodPost)
	}
}

func (s *Server) listClubs(w http.ResponseWriter, user *User) {
	rows, err := s.db.Query(`
		SELECT c.id, c.name, c.description, cm.role, c.created_at,
		       (SELECT COUNT(*) FROM club_members cm2 WHERE cm2.club_id = c.id) AS member_count
		FROM clubs c
		JOIN club_members cm ON cm.club_id = c.id
		WHERE cm.user_id = ?
		ORDER BY c.created_at DESC
	`, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	clubs := make([]Club, 0)
	for rows.Next() {
		var c Club
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.Role, &c.CreatedAt, &c.MemberCount); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		clubs = append(clubs, c)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"clubs": clubs})
}

func (s *Server) createClub(w http.ResponseWriter, r *http.Request, user *User) {
	if !user.EmailVerified {
		writeError(w, http.StatusForbidden, "verify your email before creating a club")
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "club name is required")
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := s.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		INSERT INTO clubs (name, description, created_by_user_id, created_at)
		VALUES (?, ?, ?, ?)
	`, req.Name, req.Description, user.ID, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	clubID, err := res.LastInsertId()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if _, err := tx.Exec(`
		INSERT INTO club_members (club_id, user_id, role, joined_at)
		VALUES (?, ?, 'owner', ?)
	`, clubID, user.ID, now); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	inviteCode, inviteErr := generateCode(8)
	if inviteErr != nil {
		writeError(w, http.StatusInternalServerError, inviteErr.Error())
		return
	}
	inviteExpires := time.Now().UTC().Add(14 * 24 * time.Hour).Format(time.RFC3339)
	if _, err := tx.Exec(`
		INSERT INTO invite_codes (club_id, code, created_by_user_id, expires_at, max_uses, used_count, created_at)
		VALUES (?, ?, ?, ?, 50, 0, ?)
	`, clubID, inviteCode, user.ID, inviteExpires, now); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"club": Club{
			ID:          clubID,
			Name:        req.Name,
			Description: req.Description,
			Role:        "owner",
			CreatedAt:   now,
			MemberCount: 1,
		},
		"invite_code": InviteCode{
			Code:      inviteCode,
			ExpiresAt: inviteExpires,
			MaxUses:   50,
			UsedCount: 0,
			CreatedAt: now,
		},
	})
}

func (s *Server) handleJoinClub(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}
	if !user.EmailVerified {
		writeError(w, http.StatusForbidden, "verify your email before joining a club")
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" {
		writeError(w, http.StatusBadRequest, "invite code is required")
		return
	}

	tx, err := s.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	var clubID int64
	var expiresAt string
	var maxUses, usedCount int
	err = tx.QueryRow(`
		SELECT club_id, expires_at, max_uses, used_count
		FROM invite_codes
		WHERE code = ?
	`, code).Scan(&clubID, &expiresAt, &maxUses, &usedCount)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "invite code not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	expiryTime, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stored invite code has invalid expiration")
		return
	}
	if time.Now().UTC().After(expiryTime) {
		writeError(w, http.StatusBadRequest, "invite code has expired")
		return
	}
	if usedCount >= maxUses {
		writeError(w, http.StatusBadRequest, "invite code has reached max uses")
		return
	}
	if banned, banErr := s.isUserBannedInClubTx(tx, clubID, user.ID); banErr != nil {
		writeError(w, http.StatusInternalServerError, banErr.Error())
		return
	} else if banned {
		writeError(w, http.StatusForbidden, "you are banned from this club")
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	res, err := tx.Exec(`
		INSERT OR IGNORE INTO club_members (club_id, user_id, role, joined_at)
		VALUES (?, ?, 'member', ?)
	`, clubID, user.ID, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if rows, _ := res.RowsAffected(); rows > 0 {
		if _, err := tx.Exec(`
			UPDATE invite_codes
			SET used_count = used_count + 1
			WHERE code = ?
		`, code); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	club, err := s.getClubForUser(clubID, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"club": club})
}

func (s *Server) handleClubSubroutes(w http.ResponseWriter, r *http.Request, user *User) {
	segments := splitPath(r.URL.Path, "/api/clubs/")
	if len(segments) == 0 {
		http.NotFound(w, r)
		return
	}

	clubID, err := parseID(segments[0])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid club id")
		return
	}

	switch {
	case len(segments) == 1:
		if r.Method != http.MethodGet {
			methodNotAllowed(w, http.MethodGet)
			return
		}
		s.getClub(w, user, clubID)
	case len(segments) == 2 && segments[1] == "members":
		if r.Method != http.MethodGet {
			methodNotAllowed(w, http.MethodGet)
			return
		}
		s.listMembers(w, user, clubID)
	case len(segments) == 4 && segments[1] == "members" && segments[3] == "kick":
		if r.Method != http.MethodPost {
			methodNotAllowed(w, http.MethodPost)
			return
		}
		memberID, parseErr := parseID(segments[2])
		if parseErr != nil {
			writeError(w, http.StatusBadRequest, "invalid member id")
			return
		}
		s.kickMember(w, user, clubID, memberID)
	case len(segments) == 4 && segments[1] == "members" && segments[3] == "ban":
		if r.Method != http.MethodPost {
			methodNotAllowed(w, http.MethodPost)
			return
		}
		memberID, parseErr := parseID(segments[2])
		if parseErr != nil {
			writeError(w, http.StatusBadRequest, "invalid member id")
			return
		}
		s.banMember(w, user, clubID, memberID)
	case len(segments) == 2 && segments[1] == "invite-codes":
		s.handleInviteCodes(w, r, user, clubID)
	case len(segments) == 2 && segments[1] == "banned":
		if r.Method != http.MethodGet {
			methodNotAllowed(w, http.MethodGet)
			return
		}
		s.listBannedMembers(w, user, clubID)
	case len(segments) == 4 && segments[1] == "banned" && segments[3] == "unban":
		if r.Method != http.MethodPost {
			methodNotAllowed(w, http.MethodPost)
			return
		}
		bannedUserID, parseErr := parseID(segments[2])
		if parseErr != nil {
			writeError(w, http.StatusBadRequest, "invalid member id")
			return
		}
		s.unbanMember(w, user, clubID, bannedUserID)
	case len(segments) == 2 && segments[1] == "meetings":
		s.handleClubMeetings(w, r, user, clubID)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) getClub(w http.ResponseWriter, user *User, clubID int64) {
	club, err := s.getClubForUser(clubID, user.ID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "club not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"club": club})
}

func (s *Server) listMembers(w http.ResponseWriter, user *User, clubID int64) {
	ok, err := s.isClubMember(clubID, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		writeError(w, http.StatusForbidden, "not a member of this club")
		return
	}

	rows, err := s.db.Query(`
		SELECT u.id, u.username, u.display_name, cm.role, cm.joined_at
		FROM club_members cm
		JOIN users u ON u.id = cm.user_id
		WHERE cm.club_id = ?
		ORDER BY cm.joined_at ASC
	`, clubID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	members := make([]Member, 0)
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.ID, &m.Username, &m.DisplayName, &m.Role, &m.JoinedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		members = append(members, m)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"members": members})
}

func (s *Server) kickMember(w http.ResponseWriter, user *User, clubID, memberID int64) {
	if err := s.ensureClubOwner(clubID, user.ID); err != nil {
		if errors.Is(err, errForbiddenClubOwner) {
			writeError(w, http.StatusForbidden, "only club owners can remove members")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if memberID == user.ID {
		writeError(w, http.StatusBadRequest, "owners cannot remove themselves")
		return
	}

	var targetRole string
	err := s.db.QueryRow(`
		SELECT role
		FROM club_members
		WHERE club_id = ? AND user_id = ?
	`, clubID, memberID).Scan(&targetRole)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if strings.EqualFold(targetRole, "owner") {
		writeError(w, http.StatusBadRequest, "cannot remove another owner")
		return
	}

	if _, err := s.db.Exec(`
		DELETE FROM club_members
		WHERE club_id = ? AND user_id = ?
	`, clubID, memberID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "member_removed"})
}

func (s *Server) banMember(w http.ResponseWriter, user *User, clubID, memberID int64) {
	if err := s.ensureClubOwner(clubID, user.ID); err != nil {
		if errors.Is(err, errForbiddenClubOwner) {
			writeError(w, http.StatusForbidden, "only club owners can ban members")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if memberID == user.ID {
		writeError(w, http.StatusBadRequest, "owners cannot ban themselves")
		return
	}

	var targetRole string
	err := s.db.QueryRow(`
		SELECT role
		FROM club_members
		WHERE club_id = ? AND user_id = ?
	`, clubID, memberID).Scan(&targetRole)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if strings.EqualFold(targetRole, "owner") {
		writeError(w, http.StatusBadRequest, "cannot ban another owner")
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
		INSERT INTO club_bans (club_id, user_id, banned_by_user_id, banned_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT (club_id, user_id)
		DO UPDATE SET banned_by_user_id = excluded.banned_by_user_id, banned_at = excluded.banned_at
	`, clubID, memberID, user.ID, now); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec(`
		DELETE FROM club_members
		WHERE club_id = ? AND user_id = ?
	`, clubID, memberID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "member_banned"})
}

func (s *Server) listBannedMembers(w http.ResponseWriter, user *User, clubID int64) {
	if err := s.ensureClubOwner(clubID, user.ID); err != nil {
		if errors.Is(err, errForbiddenClubOwner) {
			writeError(w, http.StatusForbidden, "only club owners can view banned members")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	rows, err := s.db.Query(`
		SELECT u.id, u.username, u.display_name, IFNULL(bu.username, ''), cb.banned_at
		FROM club_bans cb
		JOIN users u ON u.id = cb.user_id
		LEFT JOIN users bu ON bu.id = cb.banned_by_user_id
		WHERE cb.club_id = ?
		ORDER BY cb.banned_at DESC
	`, clubID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	banned := make([]BannedMember, 0)
	for rows.Next() {
		var item BannedMember
		if err := rows.Scan(&item.ID, &item.Username, &item.DisplayName, &item.BannedBy, &item.BannedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		banned = append(banned, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"banned_members": banned})
}

func (s *Server) unbanMember(w http.ResponseWriter, user *User, clubID, bannedUserID int64) {
	if err := s.ensureClubOwner(clubID, user.ID); err != nil {
		if errors.Is(err, errForbiddenClubOwner) {
			writeError(w, http.StatusForbidden, "only club owners can unban members")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	res, err := s.db.Exec(`
		DELETE FROM club_bans
		WHERE club_id = ? AND user_id = ?
	`, clubID, bannedUserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		writeError(w, http.StatusNotFound, "banned member not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "member_unbanned"})
}

func (s *Server) handleInviteCodes(w http.ResponseWriter, r *http.Request, user *User, clubID int64) {
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
			SELECT code, expires_at, max_uses, used_count, created_at
			FROM invite_codes
			WHERE club_id = ?
			ORDER BY created_at DESC
			LIMIT 10
		`, clubID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer rows.Close()

		codes := make([]InviteCode, 0)
		for rows.Next() {
			var c InviteCode
			if err := rows.Scan(&c.Code, &c.ExpiresAt, &c.MaxUses, &c.UsedCount, &c.CreatedAt); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			codes = append(codes, c)
		}
		if err := rows.Err(); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"invite_codes": codes})
	case http.MethodPost:
		var req struct {
			ExpiresInDays int `json:"expires_in_days"`
			MaxUses       int `json:"max_uses"`
		}
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		if req.ExpiresInDays <= 0 {
			req.ExpiresInDays = 14
		}
		if req.ExpiresInDays > 180 {
			writeError(w, http.StatusBadRequest, "expires_in_days must be <= 180")
			return
		}
		if req.MaxUses <= 0 {
			req.MaxUses = 25
		}
		if req.MaxUses > 500 {
			writeError(w, http.StatusBadRequest, "max_uses must be <= 500")
			return
		}

		code, err := generateCode(8)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		now := time.Now().UTC()
		expiresAt := now.Add(time.Duration(req.ExpiresInDays) * 24 * time.Hour)

		_, err = s.db.Exec(`
			INSERT INTO invite_codes (club_id, code, created_by_user_id, expires_at, max_uses, used_count, created_at)
			VALUES (?, ?, ?, ?, ?, 0, ?)
		`, clubID, code, user.ID, expiresAt.Format(time.RFC3339), req.MaxUses, now.Format(time.RFC3339))
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusCreated, map[string]any{
			"invite_code": InviteCode{
				Code:      code,
				ExpiresAt: expiresAt.Format(time.RFC3339),
				MaxUses:   req.MaxUses,
				UsedCount: 0,
				CreatedAt: now.Format(time.RFC3339),
			},
		})
	default:
		methodNotAllowed(w, http.MethodGet, http.MethodPost)
	}
}
