import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import * as api from "../api";
import type {
  BannedMember,
  Club,
  CookbookSearchResult,
  InviteCode,
  Meeting,
  Member,
  User
} from "../types";
import {
  NavIcon,
  NavTileContent,
  formatDateTime,
  parseClubIDFromParams,
  pickNextMeeting,
  useClub
} from "./shared";

export function ManageClubsPage() {
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

export function ClubsListPage() {
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

export function ClubScaffold(props: {
  clubID: number;
  title: string;
  children: ReactNode;
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

export function ClubMenuPage() {
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

export function ClubMembersPage() {
  const clubID = parseClubIDFromParams();
  const { club } = useClub(clubID);
  const isOwner = club?.role === "owner";
  const [members, setMembers] = useState<Member[]>([]);
  const [bannedMembers, setBannedMembers] = useState<BannedMember[]>([]);
  const [error, setError] = useState("");
  const [busyMemberID, setBusyMemberID] = useState<number | null>(null);
  const [busyBannedID, setBusyBannedID] = useState<number | null>(null);

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

  async function loadBannedMembers() {
    if (!clubID || Number.isNaN(clubID) || !isOwner) {
      setBannedMembers([]);
      return;
    }
    try {
      const res = await api.getBannedMembers(clubID);
      setBannedMembers(res.banned_members);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load banned members");
    }
  }

  async function handleKick(member: Member) {
    if (!isOwner || !clubID || Number.isNaN(clubID)) {
      return;
    }
    if (!window.confirm(`Remove ${member.display_name} (@${member.username}) from this club?`)) {
      return;
    }

    setBusyMemberID(member.id);
    try {
      await api.kickClubMember(clubID, member.id);
      setMembers((prev) => prev.filter((item) => item.id !== member.id));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member");
    } finally {
      setBusyMemberID(null);
    }
  }

  async function handleBan(member: Member) {
    if (!isOwner || !clubID || Number.isNaN(clubID)) {
      return;
    }
    if (!window.confirm(`Ban ${member.display_name} (@${member.username}) from this club?`)) {
      return;
    }

    setBusyMemberID(member.id);
    try {
      await api.banClubMember(clubID, member.id);
      setMembers((prev) => prev.filter((item) => item.id !== member.id));
      await loadBannedMembers();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not ban member");
    } finally {
      setBusyMemberID(null);
    }
  }

  async function handleUnban(member: BannedMember) {
    if (!isOwner || !clubID || Number.isNaN(clubID)) {
      return;
    }
    setBusyBannedID(member.id);
    try {
      await api.unbanClubMember(clubID, member.id);
      setBannedMembers((prev) => prev.filter((item) => item.id !== member.id));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unban member");
    } finally {
      setBusyBannedID(null);
    }
  }

  useEffect(() => {
    void loadMembers();
  }, [clubID]);

  useEffect(() => {
    if (isOwner) {
      void loadBannedMembers();
    } else {
      setBannedMembers([]);
    }
  }, [clubID, isOwner]);

  return (
    <ClubScaffold
      clubID={clubID}
      title="Members"
      error={error}
      onRefresh={async () => {
        await loadMembers();
        await loadBannedMembers();
      }}
    >
      <ul className="simple-list member-moderation-list">
        {members.map((member) => (
          <li key={member.id} className="member-row">
            <div className="member-row-main">
              <span>
                {member.display_name} <small>@{member.username}</small>
              </span>
              <small>{member.role}</small>
            </div>

            {isOwner && member.role !== "owner" && (
              <div className="member-actions">
                <button
                  type="button"
                  className="icon-danger-button"
                  title={`Kick @${member.username}`}
                  aria-label={`Kick @${member.username}`}
                  onClick={() => void handleKick(member)}
                  disabled={busyMemberID === member.id}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="icon-danger-button"
                  title={`Ban @${member.username}`}
                  aria-label={`Ban @${member.username}`}
                  onClick={() => void handleBan(member)}
                  disabled={busyMemberID === member.id}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14 4l6 6-2 2-6-6z" />
                    <path d="M3 21l8-8 2 2-8 8z" />
                    <path d="M7 10l7-7" />
                  </svg>
                </button>
              </div>
            )}
          </li>
        ))}
        {members.length === 0 && <li className="muted">No members found.</li>}
      </ul>

      {isOwner && (
        <>
          <h3>Banned Members</h3>
          <ul className="simple-list member-moderation-list">
            {bannedMembers.map((member) => (
              <li key={member.id} className="member-row">
                <div className="member-row-main">
                  <span>
                    {member.display_name} <small>@{member.username}</small>
                  </span>
                  <small>
                    banned {formatDateTime(member.banned_at)}
                    {member.banned_by ? ` by @${member.banned_by}` : ""}
                  </small>
                </div>
                <div className="member-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void handleUnban(member)}
                    disabled={busyBannedID === member.id}
                  >
                    {busyBannedID === member.id ? "..." : "Unban"}
                  </button>
                </div>
              </li>
            ))}
            {bannedMembers.length === 0 && <li className="muted">No banned members.</li>}
          </ul>
        </>
      )}
    </ClubScaffold>
  );
}

export function ClubInvitesPage() {
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

export function ClubAddMeetingPage(props: { currentUser: User }) {
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

export function ClubMeetingsListPage(props: { mode: "upcoming" | "finished" }) {
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

