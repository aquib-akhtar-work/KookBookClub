import { useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import * as api from "../api";
import type { User } from "../types";
import { AccountPage, AuthPage } from "./auth";
import {
  ClubAddMeetingPage,
  ClubInvitesPage,
  ClubMeetingsListPage,
  ClubMembersPage,
  ClubMenuPage,
  ClubsListPage,
  ManageClubsPage
} from "./clubs";
import { MeetingPage } from "./meeting";
import { NavTileContent } from "./shared";

export type AppRoutesProps = {
  user: User | null;
  loading: boolean;
  onAuthSuccess: (user: User, token: string) => void;
  onUserUpdate: (user: User) => void;
  onLogout: () => Promise<void>;
};

export function AppRoutes(props: AppRoutesProps) {
  const location = useLocation();
  const authHasActionToken = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return Boolean(params.get("verify_token") || params.get("reset_token"));
  }, [location.search]);
  const showMainNav = location.pathname !== "/auth" && Boolean(props.user);
  const showAuthLogo = location.pathname === "/auth" && !props.user;
  const [verificationMessage, setVerificationMessage] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [isSendingVerification, setIsSendingVerification] = useState(false);

  async function handleResendVerification() {
    setIsSendingVerification(true);
    try {
      await api.resendVerificationEmail();
      setVerificationMessage("Verification email sent. Check your inbox.");
      setVerificationError("");
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : "Could not send verification email");
      setVerificationMessage("");
    } finally {
      setIsSendingVerification(false);
    }
  }

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
            {!props.user.email_verified && (
              <div className="unverified-banner">
                <p className="status-pill error">Verify your email before creating or joining clubs.</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleResendVerification()}
                  disabled={isSendingVerification}
                >
                  {isSendingVerification ? "Sending..." : "Resend verification email"}
                </button>
              </div>
            )}
            {verificationMessage && <p className="status-pill success">{verificationMessage}</p>}
            {verificationError && <p className="status-pill error">{verificationError}</p>}
            <div className="top-nav-links icon-grid compact-tiles">
              <Link to="/clubs" className="icon-tile">
                <NavTileContent icon="clubs" label="My Clubs" />
              </Link>
              <Link to="/clubs/manage" className="icon-tile">
                <NavTileContent icon="join" label="Create / Join" />
              </Link>
              <Link to="/account" className="icon-tile">
                <NavTileContent icon="account" label="Account" />
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
            element={props.user && !authHasActionToken ? <Navigate to="/clubs" replace /> : <AuthPage onAuthSuccess={props.onAuthSuccess} />}
          />

          <Route
            path="/account"
            element={props.user ? <AccountPage currentUser={props.user} onUserUpdate={props.onUserUpdate} /> : <Navigate to="/auth" replace />}
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
