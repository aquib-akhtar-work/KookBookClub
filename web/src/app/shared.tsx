import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import * as api from "../api";
import type { Club, Meeting } from "../types";

export const meetingSections = ["details", "recipes", "media", "polls", "feedback"] as const;
export type MeetingSection = (typeof meetingSections)[number];
export type NavIconName =
  | "clubs"
  | "join"
  | "account"
  | "logout"
  | "refresh"
  | "menu"
  | "members"
  | "invite"
  | "add"
  | "upcoming"
  | "finished"
  | "details"
  | "recipes"
  | "uploads"
  | "polls"
  | "feedback";

export function NavIcon(props: { name: NavIconName }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  switch (props.name) {
    case "clubs":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="4" width="8" height="7" rx="1.5" />
          <rect x="13" y="4" width="8" height="7" rx="1.5" />
          <rect x="3" y="13" width="8" height="7" rx="1.5" />
          <rect x="13" y="13" width="8" height="7" rx="1.5" />
        </svg>
      );
    case "join":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "account":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="7.5" r="3.5" />
          <path d="M4 20a8 8 0 0 1 16 0" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      );
    case "members":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="9" cy="8" r="3" />
          <path d="M3 19a6 6 0 0 1 12 0" />
          <path d="M16 8h5" />
          <path d="M16 12h5" />
        </svg>
      );
    case "invite":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="7" width="18" height="10" rx="2" />
          <path d="M7 7v10" />
          <path d="M17 7v10" />
          <path d="M10 12h4" />
        </svg>
      );
    case "add":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </svg>
      );
    case "upcoming":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <path d="M3 9h18" />
          <path d="M8 14h8" />
        </svg>
      );
    case "finished":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <path d="M3 9h18" />
          <path d="m9 15 2 2 4-4" />
        </svg>
      );
    case "details":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10v6" />
          <path d="M12 7h.01" />
        </svg>
      );
    case "recipes":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M6 4h12" />
          <path d="M6 8h12" />
          <path d="M6 12h12" />
          <path d="M6 16h8" />
          <rect x="4" y="2" width="16" height="20" rx="2" />
        </svg>
      );
    case "uploads":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <rect x="4" y="16" width="16" height="4" rx="1" />
        </svg>
      );
    case "polls":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M5 19V9" />
          <path d="M12 19V5" />
          <path d="M19 19v-7" />
        </svg>
      );
    case "feedback":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      );
    default:
      return null;
  }
}

export function NavTileContent(props: { icon: NavIconName; label: string }) {
  return (
    <>
      <span className="nav-tile-icon">
        <NavIcon name={props.icon} />
      </span>
      <span className="nav-tile-label">{props.label}</span>
    </>
  );
}

export function formatDateTime(raw: string): string {
  if (!raw) {
    return "TBD";
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleString();
}

export function formatShortDate(raw: string): string {
  if (!raw) {
    return "No deadline";
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleDateString();
}

export function toDatetimeLocal(raw: string): string {
  if (!raw) {
    return "";
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const tzOffsetMs = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 16);
}

export function pickNextMeeting(meetings: Meeting[]): Meeting | null {
  const active = meetings.filter((meeting) => !meeting.ended_at);
  if (active.length === 0) {
    return null;
  }

  const now = Date.now();
  const withDates = active.map((meeting) => ({
    meeting,
    timestamp: Date.parse(meeting.scheduled_at)
  }));

  const upcoming = withDates
    .filter((item) => !Number.isNaN(item.timestamp) && item.timestamp >= now)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (upcoming.length > 0) {
    return upcoming[0].meeting;
  }

  withDates.sort((a, b) => {
    if (Number.isNaN(a.timestamp) && Number.isNaN(b.timestamp)) {
      return 0;
    }
    if (Number.isNaN(a.timestamp)) {
      return 1;
    }
    if (Number.isNaN(b.timestamp)) {
      return -1;
    }
    return a.timestamp - b.timestamp;
  });
  return withDates[0]?.meeting ?? null;
}

export function parseClubIDFromParams(): number {
  const params = useParams();
  return Number(params.clubId);
}

export function parseMeetingIDFromParams(): number {
  const params = useParams();
  return Number(params.meetingId);
}

export function useClub(clubID: number) {
  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadClub() {
    if (!clubID || Number.isNaN(clubID)) {
      setClub(null);
      setError("Invalid club id");
      setLoading(false);
      return;
    }

    try {
      const res = await api.getClub(clubID);
      setClub(res.club);
      setError("");
    } catch (err) {
      setClub(null);
      setError(err instanceof Error ? err.message : "Could not load club");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void loadClub();
  }, [clubID]);

  return { club, loading, error, refresh: loadClub };
}
