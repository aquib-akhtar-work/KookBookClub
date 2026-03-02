package main

import (
	"database/sql"
	"errors"
	"strings"
)

func (s *Server) getClubForUser(clubID, userID int64) (*Club, error) {
	var club Club
	err := s.db.QueryRow(`
		SELECT c.id, c.name, c.description, cm.role, c.created_at,
		       (SELECT COUNT(*) FROM club_members cm2 WHERE cm2.club_id = c.id) AS member_count
		FROM clubs c
		JOIN club_members cm ON cm.club_id = c.id
		WHERE c.id = ? AND cm.user_id = ?
	`, clubID, userID).Scan(&club.ID, &club.Name, &club.Description, &club.Role, &club.CreatedAt, &club.MemberCount)
	if err != nil {
		return nil, err
	}
	return &club, nil
}

func (s *Server) getMeetingForUser(meetingID, userID int64) (*Meeting, error) {
	var m Meeting
	err := s.db.QueryRow(`
		SELECT m.id, m.club_id, m.title, m.address, m.scheduled_at, m.cookbook,
		       m.cookbook_key, m.cookbook_author, m.cookbook_cover_url, m.cookbook_first_publish_year,
		       m.created_by_user_id, m.ended_at, m.ended_by_user_id,
		       m.host_user_id, hu.display_name, m.notes, m.created_at
		FROM meetings m
		JOIN users hu ON hu.id = m.host_user_id
		JOIN club_members cm ON cm.club_id = m.club_id
		WHERE m.id = ? AND cm.user_id = ?
	`, meetingID, userID).Scan(
		&m.ID, &m.ClubID, &m.Title, &m.Address, &m.ScheduledAt, &m.Cookbook,
		&m.CookbookKey, &m.CookbookAuthor, &m.CookbookCoverURL, &m.CookbookFirstPublishYear,
		&m.CreatedByUserID, &m.EndedAt, &m.EndedByUserID,
		&m.HostUserID, &m.HostName, &m.Notes, &m.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *Server) isClubMember(clubID, userID int64) (bool, error) {
	var exists int
	err := s.db.QueryRow(`
		SELECT 1
		FROM club_members
		WHERE club_id = ? AND user_id = ?
	`, clubID, userID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (s *Server) getClubRole(clubID, userID int64) (string, error) {
	var role string
	err := s.db.QueryRow(`
		SELECT role
		FROM club_members
		WHERE club_id = ? AND user_id = ?
	`, clubID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errForbiddenClubOwner
	}
	if err != nil {
		return "", err
	}
	return role, nil
}

func (s *Server) ensureClubOwner(clubID, userID int64) error {
	role, err := s.getClubRole(clubID, userID)
	if err != nil {
		return err
	}
	if !strings.EqualFold(role, "owner") {
		return errForbiddenClubOwner
	}
	return nil
}

func (s *Server) isUserBannedInClubTx(tx *sql.Tx, clubID, userID int64) (bool, error) {
	var exists int
	err := tx.QueryRow(`
		SELECT 1
		FROM club_bans
		WHERE club_id = ? AND user_id = ?
	`, clubID, userID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (s *Server) ensureMeetingMembership(meetingID, userID int64) (int64, error) {
	var clubID int64
	err := s.db.QueryRow(`
		SELECT m.club_id
		FROM meetings m
		JOIN club_members cm ON cm.club_id = m.club_id
		WHERE m.id = ? AND cm.user_id = ?
	`, meetingID, userID).Scan(&clubID)
	if err != nil {
		return 0, err
	}
	return clubID, nil
}
