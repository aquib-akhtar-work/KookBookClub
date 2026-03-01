import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams
} from "react-router-dom";
import * as api from "./api";
import type {
  Club,
  CookbookSearchResult,
  Feedback,
  InviteCode,
  MediaPost,
  Meeting,
  Member,
  Poll,
  Recipe,
  User
} from "./types";

const meetingSections = ["details", "recipes", "media", "polls", "feedback"] as const;
type MeetingSection = (typeof meetingSections)[number];
type NavIconName =
  | "clubs"
  | "join"
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

function NavIcon(props: { name: NavIconName }) {
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

function NavTileContent(props: { icon: NavIconName; label: string }) {
  return (
    <>
      <span className="nav-tile-icon">
        <NavIcon name={props.icon} />
      </span>
      <span className="nav-tile-label">{props.label}</span>
    </>
  );
}

function formatDateTime(raw: string): string {
  if (!raw) {
    return "TBD";
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleString();
}

function formatShortDate(raw: string): string {
  if (!raw) {
    return "No deadline";
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleDateString();
}

function toDatetimeLocal(raw: string): string {
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

function pickNextMeeting(meetings: Meeting[]): Meeting | null {
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

function parseClubIDFromParams(): number {
  const params = useParams();
  return Number(params.clubId);
}

function parseMeetingIDFromParams(): number {
  const params = useParams();
  return Number(params.meetingId);
}

function useClub(clubID: number) {
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      const token = api.getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.getMe();
        setUser(res.user);
      } catch (err) {
        if (err instanceof api.ApiError && err.status === 401) {
          api.clearToken();
        }
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    void bootstrap();
  }, []);

  function handleAuthSuccess(nextUser: User, token: string) {
    api.setToken(token);
    setUser(nextUser);
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // Ignore already-invalid tokens.
    }
    api.clearToken();
    setUser(null);
  }

  return (
    <BrowserRouter>
      <AppRoutes user={user} loading={loading} onAuthSuccess={handleAuthSuccess} onLogout={handleLogout} />
    </BrowserRouter>
  );
}

function AppRoutes(props: {
  user: User | null;
  loading: boolean;
  onAuthSuccess: (user: User, token: string) => void;
  onLogout: () => Promise<void>;
}) {
  const location = useLocation();
  const showMainNav = location.pathname !== "/auth" && Boolean(props.user);
  const showAuthLogo = location.pathname === "/auth" && !props.user;

  if (props.loading) {
    return (
      <div className="page-shell">
        <header className="top-bar">
          <div>
            <p className="eyebrow">KookBook Club</p>
            <h1>Plan. Cook. Share.</h1>
          </div>
        </header>
        <div className="status-row">
          <p className="status-pill">Loading your account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="top-bar">
        <div>
          {showAuthLogo && (
            <div className="auth-logo-banner">
              <img src="/favicon.png" alt="KookBook.Club logo" className="auth-logo-image" />
            </div>
          )}
          {!showAuthLogo && (
            <>
              <p className="eyebrow">KookBook Club</p>
              <h1>Plan. Cook. Share.</h1>
            </>
          )}
        </div>

        {showMainNav && props.user && (
          <div className="nav-block">
            <p className="muted">
              Signed in as <strong>@{props.user.username}</strong> ({props.user.display_name})
            </p>
            <div className="top-nav-links icon-grid compact-tiles">
              <Link to="/clubs" className="icon-tile">
                <NavTileContent icon="clubs" label="My Clubs" />
              </Link>
              <Link to="/clubs/manage" className="icon-tile">
                <NavTileContent icon="join" label="Create / Join" />
              </Link>
              <button type="button" className="icon-tile danger" onClick={() => void props.onLogout()}>
                <NavTileContent icon="logout" label="Logout" />
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="page-stack">
        <Routes>
          <Route
            path="/auth"
            element={props.user ? <Navigate to="/clubs" replace /> : <AuthPage onAuthSuccess={props.onAuthSuccess} />}
          />

          <Route path="/clubs/manage" element={props.user ? <ManageClubsPage /> : <Navigate to="/auth" replace />} />
          <Route path="/clubs" element={props.user ? <ClubsListPage /> : <Navigate to="/auth" replace />} />

          <Route path="/club/:clubId" element={props.user ? <Navigate to="menu" replace /> : <Navigate to="/auth" replace />} />
          <Route path="/club/:clubId/menu" element={props.user ? <ClubMenuPage /> : <Navigate to="/auth" replace />} />
          <Route path="/club/:clubId/members" element={props.user ? <ClubMembersPage /> : <Navigate to="/auth" replace />} />
          <Route path="/club/:clubId/invites" element={props.user ? <ClubInvitesPage /> : <Navigate to="/auth" replace />} />
          <Route path="/club/:clubId/meetings/new" element={props.user ? <ClubAddMeetingPage currentUser={props.user} /> : <Navigate to="/auth" replace />} />
          <Route
            path="/club/:clubId/meetings/upcoming"
            element={props.user ? <ClubMeetingsListPage mode="upcoming" /> : <Navigate to="/auth" replace />}
          />
          <Route
            path="/club/:clubId/meetings/finished"
            element={props.user ? <ClubMeetingsListPage mode="finished" /> : <Navigate to="/auth" replace />}
          />

          <Route
            path="/club/:clubId/meeting/:meetingId"
            element={props.user ? <Navigate to="details" replace /> : <Navigate to="/auth" replace />}
          />
          <Route
            path="/club/:clubId/meeting/:meetingId/:section"
            element={props.user ? <MeetingPage currentUser={props.user} /> : <Navigate to="/auth" replace />}
          />

          <Route path="*" element={<Navigate to={props.user ? "/clubs" : "/auth"} replace />} />
        </Routes>
      </main>
    </div>
  );
}

function AuthPage(props: { onAuthSuccess: (user: User, token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");

  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const res = await api.login({ identity, password });
      props.onAuthSuccess(res.user, res.token);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const res = await api.register({
        email,
        username,
        display_name: displayName,
        password: registerPassword
      });
      props.onAuthSuccess(res.user, res.token);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  return (
    <section className="panel auth-panel">
      <div className="panel-section">
        <h2>Account</h2>
        <p className="muted">Create an account with email + password, then join or create clubs.</p>

        <div className="tab-row">
          <button type="button" className={mode === "login" ? "tab active" : "tab"} onClick={() => setMode("login")}>
            Login
          </button>
          <button
            type="button"
            className={mode === "register" ? "tab active" : "tab"}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        {error && <p className="status-pill error">{error}</p>}

        {mode === "login" ? (
          <form className="stack-form" onSubmit={handleLogin}>
            <input
              value={identity}
              onChange={(event) => setIdentity(event.target.value)}
              placeholder="Email or username"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              required
            />
            <button type="submit">Login</button>
          </form>
        ) : (
          <form className="stack-form" onSubmit={handleRegister}>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required />
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Unique username"
              required
            />
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Display name (optional)"
            />
            <input
              type="password"
              value={registerPassword}
              onChange={(event) => setRegisterPassword(event.target.value)}
              placeholder="Password (8+ chars)"
              required
            />
            <button type="submit">Create account</button>
          </form>
        )}
      </div>
    </section>
  );
}

function ManageClubsPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const [clubName, setClubName] = useState("");
  const [clubDescription, setClubDescription] = useState("");
  const [joinCode, setJoinCode] = useState("");

  async function handleCreateClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const res = await api.createClub({ name: clubName, description: clubDescription });
      setError("");
      setClubName("");
      setClubDescription("");
      navigate(`/club/${res.club.id}/menu`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create club");
    }
  }

  async function handleJoinClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const res = await api.joinClub({ code: joinCode });
      setError("");
      setJoinCode("");
      navigate(`/club/${res.club.id}/menu`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join club");
    }
  }

  return (
    <section className="layout-grid">
      <div className="panel club-panel">
        <section className="panel-section">
          <h2>Create A Club</h2>
          <form className="stack-form" onSubmit={handleCreateClub}>
            <input
              value={clubName}
              onChange={(event) => setClubName(event.target.value)}
              placeholder="Club name"
              required
            />
            <textarea
              value={clubDescription}
              onChange={(event) => setClubDescription(event.target.value)}
              placeholder="What kind of cooking is this club about?"
              rows={4}
            />
            <button type="submit">Create Club</button>
          </form>
        </section>
      </div>

      <div className="panel club-panel">
        <section className="panel-section">
          <h2>Join A Club</h2>
          <form className="stack-form" onSubmit={handleJoinClub}>
            <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Invite code" required />
            <button type="submit">Join Club</button>
          </form>

          <div className="top-nav-links icon-grid compact-tiles single-tile-row">
            <Link to="/clubs" className="icon-tile all-clubs-tile">
              <NavTileContent icon="clubs" label="All Clubs" />
            </Link>
          </div>
        </section>

        {error && (
          <section className="panel-section">
            {error && <p className="status-pill error">{error}</p>}
          </section>
        )}
      </div>
    </section>
  );
}

function ClubsListPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadClubs() {
      try {
        const res = await api.getClubs();
        setClubs(res.clubs);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load clubs");
      } finally {
        setIsLoading(false);
      }
    }
    void loadClubs();
  }, []);

  return (
    <section className="panel meeting-panel">
      <section className="panel-section">
        <h2>My Clubs</h2>

        <div className="top-nav-links icon-grid compact-tiles single-tile-row">
          <Link to="/clubs/manage" className="icon-tile">
            <NavTileContent icon="join" label="Create / Join Club" />
          </Link>
        </div>

        {isLoading && <p className="status-pill">Loading clubs...</p>}
        {error && <p className="status-pill error">{error}</p>}

        <div className="club-list">
          {clubs.map((club) => (
            <Link key={club.id} to={`/club/${club.id}/menu`} className="club-link-card">
              <strong>{club.name}</strong>
              {club.description && <span className="muted">{club.description}</span>}
              <small>
                {club.member_count ?? 0} members · your role: {club.role}
              </small>
            </Link>
          ))}

          {!isLoading && clubs.length === 0 && (
            <p className="empty-state">You are not in any clubs yet. Create or join one to get started.</p>
          )}
        </div>
      </section>
    </section>
  );
}

function ClubScaffold(props: {
  clubID: number;
  title: string;
  children: React.ReactNode;
  error?: string;
  onRefresh?: () => Promise<void> | void;
  showClubNav?: boolean;
  showBackToClubAction?: boolean;
}) {
  const location = useLocation();
  const { club, loading, error: clubError, refresh: refreshClub } = useClub(props.clubID);
  const [nextMeeting, setNextMeeting] = useState<Meeting | null>(null);
  const showClubNav = props.showClubNav ?? true;
  const [isClubNavOpen, setIsClubNavOpen] = useState(false);

  async function loadNextMeeting() {
    if (!props.clubID || Number.isNaN(props.clubID)) {
      setNextMeeting(null);
      return;
    }

    try {
      const res = await api.getMeetings(props.clubID);
      setNextMeeting(pickNextMeeting(res.meetings));
    } catch {
      setNextMeeting(null);
    }
  }

  async function handleRefresh() {
    await Promise.all([
      refreshClub(),
      loadNextMeeting(),
      props.onRefresh ? Promise.resolve(props.onRefresh()) : Promise.resolve()
    ]);
  }

  useEffect(() => {
    void loadNextMeeting();
  }, [props.clubID]);

  useEffect(() => {
    if (!showClubNav) {
      setIsClubNavOpen(false);
      return;
    }

    const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
    setIsClubNavOpen(!mobile);
  }, [props.clubID, location.pathname, showClubNav]);

  if (!props.clubID || Number.isNaN(props.clubID)) {
    return <p className="status-pill error">Invalid club id.</p>;
  }

  return (
    <section className="panel meeting-panel">
      <section className="panel-section">
        <div className="page-title-row">
          <div>
            <h2>{club?.name ?? "Club"}</h2>
            {club?.description && <p className="muted">{club.description}</p>}
          </div>
          <div className="top-nav-links compact-tiles club-action-grid">
            {props.onRefresh && (
              <button type="button" className="icon-tile" onClick={() => void handleRefresh()}>
                <NavTileContent icon="refresh" label="Refresh" />
              </button>
            )}
            {props.showBackToClubAction && (
              <Link to={`/club/${props.clubID}/menu`} className="icon-tile">
                <NavTileContent icon="menu" label="Back To Club" />
              </Link>
            )}
            <div className="club-primary-actions">
              <Link to="/clubs" className="icon-tile all-clubs-tile">
                <NavTileContent icon="clubs" label="All Clubs" />
              </Link>
              <Link
                to={
                  nextMeeting
                    ? `/club/${props.clubID}/meeting/${nextMeeting.id}/details`
                    : `/club/${props.clubID}/meetings/upcoming`
                }
                className={nextMeeting ? "icon-tile quick-meeting-tile" : "icon-tile quick-meeting-tile muted-tile"}
              >
                <span className="nav-tile-icon">
                  <NavIcon name="upcoming" />
                </span>
                <span className="quick-meeting-title">{nextMeeting ? `Next: ${nextMeeting.title}` : "Next Meeting"}</span>
                <span className="quick-meeting-meta">
                  {nextMeeting ? formatDateTime(nextMeeting.scheduled_at) : "No active meeting yet"}
                </span>
              </Link>
            </div>
          </div>
        </div>

        {showClubNav && (
          <>
            <button
              type="button"
              className={isClubNavOpen ? "club-nav-toggle open" : "club-nav-toggle"}
              onClick={() => setIsClubNavOpen((value) => !value)}
            >
              <span className="nav-tile-icon">
                <NavIcon name="menu" />
              </span>
              <span>{isClubNavOpen ? "Hide Club Menu" : "Open Club Menu"}</span>
            </button>

            {isClubNavOpen && (
              <nav className="club-subnav">
                <NavLink to={`/club/${props.clubID}/menu`}>
                  <NavTileContent icon="menu" label="Main Menu" />
                </NavLink>
                <NavLink to={`/club/${props.clubID}/members`}>
                  <NavTileContent icon="members" label="Members" />
                </NavLink>
                <NavLink to={`/club/${props.clubID}/invites`}>
                  <NavTileContent icon="invite" label="Invites" />
                </NavLink>
                <NavLink to={`/club/${props.clubID}/meetings/new`}>
                  <NavTileContent icon="add" label="Add Meeting" />
                </NavLink>
                <NavLink to={`/club/${props.clubID}/meetings/upcoming`}>
                  <NavTileContent icon="upcoming" label="Upcoming" />
                </NavLink>
                <NavLink to={`/club/${props.clubID}/meetings/finished`}>
                  <NavTileContent icon="finished" label="Finished" />
                </NavLink>
              </nav>
            )}
          </>
        )}

        <h3>{props.title}</h3>
        {loading && <p className="status-pill">Loading club...</p>}
        {clubError && <p className="status-pill error">{clubError}</p>}
        {props.error && <p className="status-pill error">{props.error}</p>}

        {props.children}
      </section>
    </section>
  );
}

function ClubMenuPage() {
  const clubID = parseClubIDFromParams();

  return (
    <ClubScaffold
      clubID={clubID}
      title="Club Main Menu"
      showClubNav={false}
    >
      <div className="menu-grid">
        <NavLink className="menu-button" to={`/club/${clubID}/members`}>
          <NavTileContent icon="members" label="Members" />
        </NavLink>
        <NavLink className="menu-button" to={`/club/${clubID}/invites`}>
          <NavTileContent icon="invite" label="Invite Codes" />
        </NavLink>
        <NavLink className="menu-button" to={`/club/${clubID}/meetings/new`}>
          <NavTileContent icon="add" label="Add Meeting" />
        </NavLink>
        <NavLink className="menu-button" to={`/club/${clubID}/meetings/upcoming`}>
          <NavTileContent icon="upcoming" label="Upcoming Meetings" />
        </NavLink>
        <NavLink className="menu-button" to={`/club/${clubID}/meetings/finished`}>
          <NavTileContent icon="finished" label="Finished Meetings" />
        </NavLink>
      </div>
    </ClubScaffold>
  );
}

function ClubMembersPage() {
  const clubID = parseClubIDFromParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");

  async function loadMembers() {
    if (!clubID || Number.isNaN(clubID)) {
      return;
    }
    try {
      const res = await api.getClubMembers(clubID);
      setMembers(res.members);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load members");
    }
  }

  useEffect(() => {
    void loadMembers();
  }, [clubID]);

  return (
    <ClubScaffold
      clubID={clubID}
      title="Members"
      error={error}
      onRefresh={loadMembers}
    >
      <ul className="simple-list">
        {members.map((member) => (
          <li key={member.id}>
            <span>
              {member.display_name} <small>@{member.username}</small>
            </span>
            <small>{member.role}</small>
          </li>
        ))}
        {members.length === 0 && <li className="muted">No members found.</li>}
      </ul>
    </ClubScaffold>
  );
}

function ClubInvitesPage() {
  const clubID = parseClubIDFromParams();
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [newInviteDays, setNewInviteDays] = useState(14);
  const [newInviteMaxUses, setNewInviteMaxUses] = useState(25);
  const [error, setError] = useState("");

  async function loadInviteCodes() {
    if (!clubID || Number.isNaN(clubID)) {
      return;
    }
    try {
      const res = await api.getInviteCodes(clubID);
      setInviteCodes(res.invite_codes);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load invite codes");
    }
  }

  useEffect(() => {
    void loadInviteCodes();
  }, [clubID]);

  async function handleCreateInviteCode() {
    if (!clubID || Number.isNaN(clubID)) {
      return;
    }
    try {
      const res = await api.createInviteCode(clubID, {
        expires_in_days: newInviteDays,
        max_uses: newInviteMaxUses
      });
      setInviteCodes((prev) => [res.invite_code, ...prev]);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invite code");
    }
  }

  async function handleCopyInviteCode(code: string) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const input = document.createElement("input");
        input.value = code;
        input.setAttribute("readonly", "");
        input.style.position = "absolute";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(input);
        if (!copied) {
          throw new Error("Clipboard copy was blocked");
        }
      }
      setError("");
    } catch {
      setError("Could not copy invite code. Please copy it manually.");
    }
  }

  return (
    <ClubScaffold
      clubID={clubID}
      title="Invite Codes"
      error={error}
      onRefresh={loadInviteCodes}
    >
      <div className="inline-controls">
        <label>
          Days
          <input
            type="number"
            min={1}
            max={180}
            value={newInviteDays}
            onChange={(event) => setNewInviteDays(Number(event.target.value))}
          />
        </label>
        <label>
          Max Uses
          <input
            type="number"
            min={1}
            max={500}
            value={newInviteMaxUses}
            onChange={(event) => setNewInviteMaxUses(Number(event.target.value))}
          />
        </label>
        <button type="button" onClick={handleCreateInviteCode}>
          New Code
        </button>
      </div>

      <div className="chips-wrap">
        {inviteCodes.map((code) => (
          <button
            key={code.code}
            type="button"
            className="chip chip-button"
            onClick={() => void handleCopyInviteCode(code.code)}
            title="Click to copy invite code"
            aria-label={`Copy invite code ${code.code}`}
          >
            {code.code} ({code.used_count}/{code.max_uses})
          </button>
        ))}
        {inviteCodes.length === 0 && <p className="muted">No invite codes yet.</p>}
      </div>
    </ClubScaffold>
  );
}

function ClubAddMeetingPage(props: { currentUser: User }) {
  const clubID = parseClubIDFromParams();
  const navigate = useNavigate();

  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");

  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingAddress, setMeetingAddress] = useState("");
  const [meetingWhen, setMeetingWhen] = useState("");
  const [meetingCookbook, setMeetingCookbook] = useState("");
  const [meetingHostUserID, setMeetingHostUserID] = useState<number>(props.currentUser.id);
  const [meetingNotes, setMeetingNotes] = useState("");

  const [cookbookQuery, setCookbookQuery] = useState("");
  const [cookbookResults, setCookbookResults] = useState<CookbookSearchResult[]>([]);
  const [cookbookSearching, setCookbookSearching] = useState(false);
  const [selectedCookbook, setSelectedCookbook] = useState<CookbookSearchResult | null>(null);

  async function loadMembers() {
    if (!clubID || Number.isNaN(clubID)) {
      return;
    }
    try {
      const res = await api.getClubMembers(clubID);
      setMembers(res.members);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load members for host selection");
    }
  }

  useEffect(() => {
    void loadMembers();
  }, [clubID]);

  async function handleCookbookSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = cookbookQuery.trim();
    if (query.length < 2) {
      setError("Cookbook search needs at least 2 characters.");
      return;
    }

    setCookbookSearching(true);
    try {
      const res = await api.searchCookbooks(query, 8);
      setCookbookResults(res.results);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search cookbooks");
      setCookbookResults([]);
    } finally {
      setCookbookSearching(false);
    }
  }

  function handleSelectCookbook(result: CookbookSearchResult) {
    setSelectedCookbook(result);
    setMeetingCookbook(result.title);
    setError("");
  }

  async function handleCreateMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clubID || Number.isNaN(clubID)) {
      return;
    }

    try {
      const res = await api.createMeeting(clubID, {
        title: meetingTitle,
        address: meetingAddress,
        scheduled_at: meetingWhen,
        cookbook: meetingCookbook,
        cookbook_key: selectedCookbook?.key ?? "",
        cookbook_author: selectedCookbook?.authors?.join(", ") ?? "",
        cookbook_cover_url: selectedCookbook?.cover_url ?? "",
        cookbook_first_publish_year: selectedCookbook?.first_publish_year ?? 0,
        host_user_id: meetingHostUserID,
        notes: meetingNotes
      });

      setMeetingTitle("");
      setMeetingAddress("");
      setMeetingWhen("");
      setMeetingCookbook("");
      setMeetingNotes("");
      setCookbookQuery("");
      setCookbookResults([]);
      setSelectedCookbook(null);

      setError("");
      navigate(`/club/${clubID}/meeting/${res.meeting.id}/details`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create meeting");
    }
  }

  return (
    <ClubScaffold
      clubID={clubID}
      title="Add Meeting"
      error={error}
      onRefresh={loadMembers}
    >
      <form className="inline-form cookbook-search-form" onSubmit={handleCookbookSearch}>
        <input
          value={cookbookQuery}
          onChange={(event) => setCookbookQuery(event.target.value)}
          placeholder="Search OpenLibrary for a cookbook"
        />
        <button type="submit" disabled={cookbookSearching}>
          {cookbookSearching ? "Searching..." : "Search"}
        </button>
      </form>

      {cookbookResults.length > 0 && (
        <div className="cookbook-results">
          {cookbookResults.map((result) => (
            <button
              key={result.key}
              type="button"
              className={selectedCookbook?.key === result.key ? "cookbook-result selected" : "cookbook-result"}
              onClick={() => handleSelectCookbook(result)}
            >
              <div className="cookbook-result-cover">
                {result.cover_url ? <img src={api.mediaUrl(result.cover_url)} alt={result.title} /> : <span>No Cover</span>}
              </div>
              <div className="cookbook-result-meta">
                <strong>{result.title}</strong>
                <small>{result.authors?.join(", ") || "Unknown author"}</small>
                <small>
                  {result.first_publish_year ? `First published ${result.first_publish_year}` : "No year"} · {result.edition_count ?? 0} editions
                </small>
              </div>
            </button>
          ))}
        </div>
      )}

      <form className="stack-form" onSubmit={handleCreateMeeting}>
        <input value={meetingTitle} onChange={(event) => setMeetingTitle(event.target.value)} placeholder="Meeting title" required />
        <input value={meetingAddress} onChange={(event) => setMeetingAddress(event.target.value)} placeholder="Address" required />
        <input type="datetime-local" value={meetingWhen} onChange={(event) => setMeetingWhen(event.target.value)} required />
        <input
          value={meetingCookbook}
          onChange={(event) => {
            setMeetingCookbook(event.target.value);
            setSelectedCookbook(null);
          }}
          placeholder="Cookbook"
          required
        />

        <label>
          Host
          <select value={meetingHostUserID} onChange={(event) => setMeetingHostUserID(Number(event.target.value))}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.display_name} (@{member.username})
              </option>
            ))}
          </select>
        </label>

        <textarea value={meetingNotes} onChange={(event) => setMeetingNotes(event.target.value)} placeholder="Notes" rows={3} />
        <button type="submit">Save Meeting</button>
      </form>
    </ClubScaffold>
  );
}

function ClubMeetingsListPage(props: { mode: "upcoming" | "finished" }) {
  const clubID = parseClubIDFromParams();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState("");

  async function loadMeetings() {
    if (!clubID || Number.isNaN(clubID)) {
      return;
    }
    try {
      const res = await api.getMeetings(clubID);
      setMeetings(res.meetings);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load meetings");
    }
  }

  useEffect(() => {
    void loadMeetings();
  }, [clubID]);

  const filteredMeetings = useMemo(() => {
    const list = meetings.filter((meeting) => (props.mode === "finished" ? Boolean(meeting.ended_at) : !meeting.ended_at));
    if (props.mode === "finished") {
      return list.sort((a, b) => b.ended_at.localeCompare(a.ended_at));
    }
    return list.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }, [meetings, props.mode]);

  return (
    <ClubScaffold
      clubID={clubID}
      title={props.mode === "finished" ? "Finished Meetings" : "Upcoming Meetings"}
      error={error}
      onRefresh={loadMeetings}
    >
      <div className="meeting-list">
        {filteredMeetings.map((meeting) => (
          <Link key={meeting.id} className="meeting-link-card" to={`/club/${clubID}/meeting/${meeting.id}/details`}>
            <strong>{meeting.title}</strong>
            <span>{formatDateTime(meeting.scheduled_at)}</span>
            <small>
              Host: {meeting.host_name} · {meeting.cookbook}
              {meeting.ended_at ? ` · Ended ${formatDateTime(meeting.ended_at)}` : ""}
            </small>
          </Link>
        ))}

        {filteredMeetings.length === 0 && (
          <p className="empty-state">
            {props.mode === "finished" ? "No finished meetings yet." : "No upcoming meetings yet."}
          </p>
        )}
      </div>
    </ClubScaffold>
  );
}

function MeetingPage(props: { currentUser: User }) {
  const clubID = parseClubIDFromParams();
  const meetingID = parseMeetingIDFromParams();
  const location = useLocation();
  const params = useParams();
  const sectionRaw = params.section ?? "details";

  if (!meetingSections.includes(sectionRaw as MeetingSection)) {
    return <Navigate to="details" replace />;
  }
  const section = sectionRaw as MeetingSection;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");

  const [editTitle, setEditTitle] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editWhen, setEditWhen] = useState("");
  const [editCookbook, setEditCookbook] = useState("");
  const [editHostUserID, setEditHostUserID] = useState<number>(props.currentUser.id);
  const [editNotes, setEditNotes] = useState("");

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeTitle, setRecipeTitle] = useState("");
  const [recipeNotes, setRecipeNotes] = useState("");
  const [recipeSourceURL, setRecipeSourceURL] = useState("");

  const [media, setMedia] = useState<MediaPost[]>([]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPickerKey, setMediaPickerKey] = useState(0);
  const [mediaCaption, setMediaCaption] = useState("");

  const [polls, setPolls] = useState<Poll[]>([]);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptionsRaw, setPollOptionsRaw] = useState("");
  const [pollClosesAt, setPollClosesAt] = useState("");

  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [isMeetingNavOpen, setIsMeetingNavOpen] = useState(false);

  const canManageMeeting = meeting?.created_by_user_id === props.currentUser.id;

  async function loadMeetingBase() {
    if (!meetingID || Number.isNaN(meetingID) || !clubID || Number.isNaN(clubID)) {
      setError("Invalid meeting or club id");
      return;
    }

    try {
      const [meetingRes, membersRes] = await Promise.all([api.getMeeting(meetingID), api.getClubMembers(clubID)]);
      setMeeting(meetingRes.meeting);
      setMembers(membersRes.members);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load meeting");
    }
  }

  useEffect(() => {
    void loadMeetingBase();
  }, [clubID, meetingID]);

  useEffect(() => {
    if (!meeting) {
      setEditTitle("");
      setEditAddress("");
      setEditWhen("");
      setEditCookbook("");
      setEditHostUserID(props.currentUser.id);
      setEditNotes("");
      return;
    }

    setEditTitle(meeting.title);
    setEditAddress(meeting.address);
    setEditWhen(toDatetimeLocal(meeting.scheduled_at));
    setEditCookbook(meeting.cookbook);
    setEditHostUserID(meeting.host_user_id);
    setEditNotes(meeting.notes);
  }, [meeting, props.currentUser.id]);

  useEffect(() => {
    async function loadSectionData() {
      if (!meetingID || Number.isNaN(meetingID)) {
        return;
      }

      try {
        if (section === "recipes") {
          const res = await api.getRecipes(meetingID);
          setRecipes(res.recipes);
        }
        if (section === "media") {
          const res = await api.getMedia(meetingID);
          setMedia(res.media);
        }
        if (section === "polls") {
          const res = await api.getPolls(meetingID);
          setPolls(res.polls);
        }
        if (section === "feedback") {
          const res = await api.getFeedback(meetingID);
          setFeedback(res.feedback);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load section data");
      }
    }
    void loadSectionData();
  }, [meetingID, section]);

  useEffect(() => {
    const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
    setIsMeetingNavOpen(!mobile);
  }, [clubID, meetingID, location.pathname]);

  async function handleSaveMeetingDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meeting || !canManageMeeting) {
      return;
    }

    try {
      const res = await api.updateMeeting(meeting.id, {
        title: editTitle,
        address: editAddress,
        scheduled_at: editWhen,
        cookbook: editCookbook,
        cookbook_key: meeting.cookbook_key,
        cookbook_author: meeting.cookbook_author,
        cookbook_cover_url: meeting.cookbook_cover_url,
        cookbook_first_publish_year: meeting.cookbook_first_publish_year,
        host_user_id: editHostUserID,
        notes: editNotes
      });
      setMeeting(res.meeting);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update meeting details");
    }
  }

  async function handleEndMeeting() {
    if (!meeting || !canManageMeeting) {
      return;
    }

    try {
      const res = await api.endMeeting(meeting.id);
      setMeeting(res.meeting);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not end meeting");
    }
  }

  async function handleAddRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meeting) {
      return;
    }

    try {
      const res = await api.addRecipe(meeting.id, {
        title: recipeTitle,
        notes: recipeNotes,
        source_url: recipeSourceURL
      });
      setRecipes((prev) => [res.recipe, ...prev]);
      setRecipeTitle("");
      setRecipeNotes("");
      setRecipeSourceURL("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save recipe");
    }
  }

  async function handleAddMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meeting) {
      return;
    }
    if (!mediaFile) {
      setError("Please choose an image or video file.");
      return;
    }

    const detectedType: "image" | "video" = mediaFile.type.startsWith("video/") ? "video" : "image";

    try {
      const res = await api.addMediaFile(meeting.id, {
        file: mediaFile,
        media_type: detectedType,
        caption: mediaCaption
      });
      setMedia((prev) => [res.media, ...prev]);
      setMediaFile(null);
      setMediaPickerKey((prev) => prev + 1);
      setMediaCaption("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post media");
    }
  }

  async function handleCreatePoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meeting) {
      return;
    }

    const options = pollOptionsRaw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    try {
      const res = await api.createPoll(meeting.id, {
        question: pollQuestion,
        options,
        closes_at: pollClosesAt
      });
      setPolls((prev) => [res.poll, ...prev]);
      setPollQuestion("");
      setPollOptionsRaw("");
      setPollClosesAt("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create poll");
    }
  }

  async function handleVote(pollID: number, optionID: number) {
    try {
      const res = await api.voteOnPoll(pollID, optionID);
      setPolls((prev) => prev.map((poll) => (poll.id === pollID ? res.poll : poll)));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save vote");
    }
  }

  async function handleFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meeting) {
      return;
    }

    try {
      await api.saveFeedback(meeting.id, { rating: feedbackRating, comment: feedbackComment });
      const res = await api.getFeedback(meeting.id);
      setFeedback(res.feedback);
      setFeedbackComment("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save feedback");
    }
  }

  return (
    <ClubScaffold
      clubID={clubID}
      title={meeting ? `Meeting: ${meeting.title}` : "Meeting"}
      error={error}
      onRefresh={loadMeetingBase}
      showClubNav={false}
      showBackToClubAction
    >
      {!meeting && <p className="empty-state">Meeting not found or you do not have access.</p>}

      {meeting && (
        <>
          <button
            type="button"
            className={isMeetingNavOpen ? "meeting-nav-toggle open" : "meeting-nav-toggle"}
            onClick={() => setIsMeetingNavOpen((value) => !value)}
          >
            <span className="nav-tile-icon">
              <NavIcon name="menu" />
            </span>
            <span>{isMeetingNavOpen ? "Hide Meeting Menu" : "Open Meeting Menu"}</span>
          </button>

          {isMeetingNavOpen && (
            <nav className="meeting-section-nav">
              <NavLink to={`/club/${clubID}/meeting/${meeting.id}/details`}>
                <NavTileContent icon="details" label="Details" />
              </NavLink>
              <NavLink to={`/club/${clubID}/meeting/${meeting.id}/recipes`}>
                <NavTileContent icon="recipes" label="Recipes" />
              </NavLink>
              <NavLink to={`/club/${clubID}/meeting/${meeting.id}/media`}>
                <NavTileContent icon="uploads" label="Uploads" />
              </NavLink>
              <NavLink to={`/club/${clubID}/meeting/${meeting.id}/polls`}>
                <NavTileContent icon="polls" label="Polls" />
              </NavLink>
              <NavLink to={`/club/${clubID}/meeting/${meeting.id}/feedback`}>
                <NavTileContent icon="feedback" label="Feedback" />
              </NavLink>
            </nav>
          )}

          {section === "details" && (
            <section className="panel-section highlight">
              <h3>{meeting.title}</h3>
              <p className="muted">Status: {meeting.ended_at ? `Ended on ${formatDateTime(meeting.ended_at)}` : "Active"}</p>
              <p>
                <strong>Where:</strong> {meeting.address}
              </p>
              <p>
                <strong>When:</strong> {formatDateTime(meeting.scheduled_at)}
              </p>
              <p>
                <strong>Cookbook:</strong> {meeting.cookbook}
              </p>
              {(meeting.cookbook_author || meeting.cookbook_first_publish_year > 0) && (
                <p className="muted">
                  {meeting.cookbook_author || "Unknown author"}
                  {meeting.cookbook_first_publish_year > 0 ? ` · First published ${meeting.cookbook_first_publish_year}` : ""}
                </p>
              )}
              {meeting.cookbook_cover_url && (
                <img className="cookbook-selected-cover" src={api.mediaUrl(meeting.cookbook_cover_url)} alt={meeting.cookbook} />
              )}
              {meeting.notes && <p className="muted">{meeting.notes}</p>}

              {canManageMeeting && !meeting.ended_at && (
                <div className="meeting-actions">
                  <button type="button" className="danger-button" onClick={() => void handleEndMeeting()}>
                    End Meeting Now
                  </button>
                </div>
              )}

              {canManageMeeting && (
                <section className="panel-section">
                  <h3>Edit Meeting Details</h3>
                  <form className="stack-form" onSubmit={handleSaveMeetingDetails}>
                    <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="Meeting title" required />
                    <input
                      value={editAddress}
                      onChange={(event) => setEditAddress(event.target.value)}
                      placeholder="Address"
                      required
                    />
                    <input
                      type="datetime-local"
                      value={editWhen}
                      onChange={(event) => setEditWhen(event.target.value)}
                      required
                    />
                    <input
                      value={editCookbook}
                      onChange={(event) => setEditCookbook(event.target.value)}
                      placeholder="Cookbook"
                      required
                    />
                    <label>
                      Host
                      <select value={editHostUserID} onChange={(event) => setEditHostUserID(Number(event.target.value))}>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.display_name} (@{member.username})
                          </option>
                        ))}
                      </select>
                    </label>
                    <textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="Notes" rows={3} />
                    <button type="submit">Save Changes</button>
                  </form>
                </section>
              )}
            </section>
          )}

          {section === "recipes" && (
            <section className="panel-section">
              <h3>Choose Recipe</h3>
              <form className="stack-form" onSubmit={handleAddRecipe}>
                <input value={recipeTitle} onChange={(event) => setRecipeTitle(event.target.value)} placeholder="Recipe name" required />
                <textarea
                  value={recipeNotes}
                  onChange={(event) => setRecipeNotes(event.target.value)}
                  placeholder="What are you making?"
                  rows={3}
                />
                <input
                  value={recipeSourceURL}
                  onChange={(event) => setRecipeSourceURL(event.target.value)}
                  placeholder="Optional source URL"
                />
                <button type="submit">Save Recipe</button>
              </form>

              <ul className="simple-list">
                {recipes.map((recipe) => (
                  <li key={recipe.id}>
                    <span>
                      <strong>{recipe.title}</strong> by {recipe.user_name}
                    </span>
                    <small>{recipe.notes}</small>
                  </li>
                ))}
                {recipes.length === 0 && <li className="muted">No recipes yet.</li>}
              </ul>
            </section>
          )}

          {section === "media" && (
            <section className="panel-section">
              <h3>Uploads</h3>
              <form className="stack-form upload-form" onSubmit={handleAddMedia}>
                <label className={mediaFile ? "upload-picker selected" : "upload-picker"}>
                  <input
                    key={mediaPickerKey}
                    type="file"
                    accept="image/*,video/*"
                    onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)}
                    required
                  />
                  <span className="upload-picker-icon">
                    <NavIcon name="uploads" />
                  </span>
                  <span className="upload-picker-title">{mediaFile ? "File selected" : "Upload image or video"}</span>
                  <span className="upload-picker-meta">{mediaFile ? mediaFile.name : "Tap to choose from your device"}</span>
                </label>
                <input value={mediaCaption} onChange={(event) => setMediaCaption(event.target.value)} placeholder="Caption" />
                <button type="submit" disabled={!mediaFile}>
                  Post Upload
                </button>
              </form>

              <div className="gallery-grid">
                {media.map((item) => (
                  <article key={item.id} className="gallery-item">
                    {item.media_type === "video" ? (
                      <video controls src={api.mediaUrl(item.media_url)} />
                    ) : (
                      <img src={api.mediaUrl(item.media_url)} alt={item.caption || "Meeting media"} />
                    )}
                    <p>{item.caption || "Shared without caption"}</p>
                    <small>by {item.user_name}</small>
                  </article>
                ))}
                {media.length === 0 && <p className="muted">No uploads yet.</p>}
              </div>
            </section>
          )}

          {section === "polls" && (
            <section className="panel-section">
              <h3>Polls</h3>
              <form className="stack-form" onSubmit={handleCreatePoll}>
                <input value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Poll question" required />
                <textarea
                  value={pollOptionsRaw}
                  onChange={(event) => setPollOptionsRaw(event.target.value)}
                  placeholder="One option per line"
                  rows={4}
                  required
                />
                <label>
                  Close date (optional)
                  <input type="datetime-local" value={pollClosesAt} onChange={(event) => setPollClosesAt(event.target.value)} />
                </label>
                <button type="submit">Create Poll</button>
              </form>

              <div className="poll-list">
                {polls.map((poll) => (
                  <article key={poll.id} className="poll-card">
                    <h3>{poll.question}</h3>
                    <p className="muted">
                      by {poll.creator} · closes {formatShortDate(poll.closes_at)}
                    </p>
                    <div className="poll-options">
                      {poll.options.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={option.voted_by_me ? "poll-option voted" : "poll-option"}
                          onClick={() => void handleVote(poll.id, option.id)}
                        >
                          <span>{option.option}</span>
                          <strong>{option.vote_count}</strong>
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
                {polls.length === 0 && <p className="muted">No polls yet.</p>}
              </div>
            </section>
          )}

          {section === "feedback" && (
            <section className="panel-section">
              <h3>Post-Meeting Feedback</h3>
              <form className="stack-form" onSubmit={handleFeedback}>
                <label>
                  Rating
                  <select value={feedbackRating} onChange={(event) => setFeedbackRating(Number(event.target.value))}>
                    <option value={5}>5 - Excellent</option>
                    <option value={4}>4 - Great</option>
                    <option value={3}>3 - Good</option>
                    <option value={2}>2 - Needs work</option>
                    <option value={1}>1 - Poor</option>
                  </select>
                </label>
                <textarea
                  value={feedbackComment}
                  onChange={(event) => setFeedbackComment(event.target.value)}
                  placeholder="What worked and what should change next time?"
                  rows={3}
                />
                <button type="submit">Save Feedback</button>
              </form>

              <ul className="simple-list">
                {feedback.map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{item.user_name}</strong> rated {item.rating}/5
                    </span>
                    <small>{item.comment}</small>
                  </li>
                ))}
                {feedback.length === 0 && <li className="muted">No feedback yet.</li>}
              </ul>
            </section>
          )}
        </>
      )}
    </ClubScaffold>
  );
}
