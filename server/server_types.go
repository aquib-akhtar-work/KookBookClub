package main

import (
	"database/sql"
	"errors"
	"net/http"
	"time"
)

type Server struct {
	db               *sql.DB
	uploadDir        string
	frontendOrigin   string
	appBaseURL       string
	openLibraryURL   string
	openLibraryEmail string
	resendAPIKey     string
	resendFromEmail  string
	cookbookCacheTTL time.Duration
	httpClient       *http.Client
}

type User struct {
	ID            int64  `json:"id"`
	Email         string `json:"email"`
	Username      string `json:"username"`
	DisplayName   string `json:"display_name"`
	EmailVerified bool   `json:"email_verified"`
}

type Club struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Role        string `json:"role,omitempty"`
	MemberCount int64  `json:"member_count,omitempty"`
	CreatedAt   string `json:"created_at"`
}

type Member struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	JoinedAt    string `json:"joined_at"`
}

type BannedMember struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	BannedBy    string `json:"banned_by"`
	BannedAt    string `json:"banned_at"`
}

type InviteCode struct {
	Code      string `json:"code"`
	ExpiresAt string `json:"expires_at"`
	MaxUses   int    `json:"max_uses"`
	UsedCount int    `json:"used_count"`
	CreatedAt string `json:"created_at"`
}

type Meeting struct {
	ID                       int64  `json:"id"`
	ClubID                   int64  `json:"club_id"`
	Title                    string `json:"title"`
	Address                  string `json:"address"`
	ScheduledAt              string `json:"scheduled_at"`
	Cookbook                 string `json:"cookbook"`
	CookbookKey              string `json:"cookbook_key"`
	CookbookAuthor           string `json:"cookbook_author"`
	CookbookCoverURL         string `json:"cookbook_cover_url"`
	CookbookFirstPublishYear int    `json:"cookbook_first_publish_year"`
	CreatedByUserID          int64  `json:"created_by_user_id"`
	EndedAt                  string `json:"ended_at"`
	EndedByUserID            int64  `json:"ended_by_user_id"`
	HostUserID               int64  `json:"host_user_id"`
	HostName                 string `json:"host_name"`
	Notes                    string `json:"notes"`
	CreatedAt                string `json:"created_at"`
}

type CookbookSearchResult struct {
	Key              string   `json:"key"`
	Title            string   `json:"title"`
	Authors          []string `json:"authors"`
	FirstPublishYear int      `json:"first_publish_year,omitempty"`
	EditionCount     int      `json:"edition_count,omitempty"`
	CoverURL         string   `json:"cover_url,omitempty"`
	OpenLibraryURL   string   `json:"openlibrary_url"`
}

type Recipe struct {
	ID        int64  `json:"id"`
	MeetingID int64  `json:"meeting_id"`
	UserID    int64  `json:"user_id"`
	UserName  string `json:"user_name"`
	Title     string `json:"title"`
	Notes     string `json:"notes"`
	SourceURL string `json:"source_url"`
	CreatedAt string `json:"created_at"`
}

type MediaPost struct {
	ID        int64  `json:"id"`
	MeetingID int64  `json:"meeting_id"`
	UserID    int64  `json:"user_id"`
	UserName  string `json:"user_name"`
	MediaType string `json:"media_type"`
	MediaURL  string `json:"media_url"`
	Caption   string `json:"caption"`
	CreatedAt string `json:"created_at"`
}

type PollOption struct {
	ID        int64  `json:"id"`
	Option    string `json:"option"`
	VoteCount int64  `json:"vote_count"`
	VotedByMe bool   `json:"voted_by_me"`
}

type Poll struct {
	ID        int64        `json:"id"`
	MeetingID int64        `json:"meeting_id"`
	Question  string       `json:"question"`
	Creator   string       `json:"creator"`
	ClosesAt  string       `json:"closes_at"`
	CreatedAt string       `json:"created_at"`
	Options   []PollOption `json:"options"`
}

type Feedback struct {
	ID        int64  `json:"id"`
	MeetingID int64  `json:"meeting_id"`
	UserID    int64  `json:"user_id"`
	UserName  string `json:"user_name"`
	Rating    int    `json:"rating"`
	Comment   string `json:"comment"`
	CreatedAt string `json:"created_at"`
}

var errForbiddenMeetingManager = errors.New("forbidden meeting manager")
var errForbiddenClubOwner = errors.New("forbidden club owner")
