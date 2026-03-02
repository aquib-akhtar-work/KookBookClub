import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as api from "../api";
import type { User } from "../types";

export function AuthPage(props: { onAuthSuccess: (user: User, token: string) => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const verifyToken = params.get("verify_token")?.trim();
    const resetTokenParam = params.get("reset_token")?.trim();

    if (verifyToken) {
      setNotice("Verifying your email...");
      setError("");
      void (async () => {
        try {
          await api.verifyEmail({ token: verifyToken });
          setNotice("Email verified. You can now create and join clubs.");
          setError("");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not verify email");
          setNotice("");
        } finally {
          params.delete("verify_token");
          const nextSearch = params.toString();
          navigate(
            {
              pathname: "/auth",
              search: nextSearch ? `?${nextSearch}` : ""
            },
            { replace: true }
          );
        }
      })();
      return;
    }

    if (resetTokenParam) {
      setMode("reset");
      setResetToken(resetTokenParam);
      setNotice("Choose a new password for your account.");
      setError("");
    }
  }, [location.search, navigate]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const res = await api.login({ identity, password });
      props.onAuthSuccess(res.user, res.token);
      setError("");
      setNotice("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setNotice("");
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

      setMode("login");
      setIdentity(email);
      setPassword("");
      setRegisterPassword("");
      setUsername("");
      setDisplayName("");
      setEmail("");
      setError("");
      setNotice(
        res.verification_email_sent
          ? "Account created. Check your inbox for a verification email before creating or joining clubs."
          : "Account created, but we could not send the verification email. Log in and use \"Resend verification email\"."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setNotice("");
    }
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.forgotPassword({ email: forgotEmail });
      setError("");
      setNotice("If an account exists for that email, a password reset link has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
      setNotice("");
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      setNotice("");
      return;
    }
    try {
      await api.resetPassword({ token: resetToken, password: newPassword });
      setError("");
      setNotice("Password reset successful. You can now log in.");
      setMode("login");
      setResetToken("");
      setNewPassword("");
      setConfirmPassword("");
      navigate("/auth", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
      setNotice("");
    }
  }

  return (
    <section className="panel auth-panel">
      <div className="panel-section">
        <h2>Account</h2>

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

        {notice && <p className="status-pill success">{notice}</p>}
        {error && <p className="status-pill error">{error}</p>}

        {mode === "login" && (
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
            <button type="button" className="text-button" onClick={() => setMode("forgot")}>
              Forgot password?
            </button>
          </form>
        )}

        {mode === "register" && (
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

        {mode === "forgot" && (
          <form className="stack-form" onSubmit={handleForgotPassword}>
            <input
              type="email"
              value={forgotEmail}
              onChange={(event) => setForgotEmail(event.target.value)}
              placeholder="Your account email"
              required
            />
            <button type="submit">Send reset link</button>
          </form>
        )}

        {mode === "reset" && (
          <form className="stack-form" onSubmit={handleResetPassword}>
            <input
              value={resetToken}
              onChange={(event) => setResetToken(event.target.value)}
              placeholder="Reset token"
              required
            />
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password (8+ chars)"
              minLength={8}
              required
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
              minLength={8}
              required
            />
            <button type="submit">Reset password</button>
          </form>
        )}
      </div>
    </section>
  );
}

export function AccountPage(props: { currentUser: User; onUserUpdate: (user: User) => void }) {
  const [newEmail, setNewEmail] = useState(props.currentUser.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  const [passwordCode, setPasswordCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    setNewEmail(props.currentUser.email);
  }, [props.currentUser.email]);

  async function handleUpdateEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUpdatingEmail(true);
    try {
      const res = await api.updateAccountEmail({
        new_email: newEmail,
        current_password: currentPassword
      });
      props.onUserUpdate(res.user);
      setCurrentPassword("");
      setEmailError("");
      setEmailMessage(
        res.verification_email_sent
          ? "Email updated. Verify your new email from the link we sent."
          : "Email updated, but verification email failed to send. Use resend verification in the header."
      );
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Could not update email");
      setEmailMessage("");
    } finally {
      setIsUpdatingEmail(false);
    }
  }

  async function handleSendPasswordCode() {
    setIsSendingCode(true);
    try {
      await api.sendAccountPasswordCode();
      setPasswordError("");
      setPasswordMessage("Password code sent to your account email.");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Could not send password code");
      setPasswordMessage("");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      setPasswordMessage("");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await api.updateAccountPassword({
        code: passwordCode,
        password: newPassword
      });
      setPasswordCode("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError("");
      setPasswordMessage("Password updated. Other active sessions were signed out.");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Could not update password");
      setPasswordMessage("");
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  return (
    <section className="layout-grid">
      <div className="panel club-panel">
        <section className="panel-section">
          <h2>Account Details</h2>
          <p className="muted">Username: @{props.currentUser.username}</p>
          <p className="muted">Current email: {props.currentUser.email}</p>
          <p className={props.currentUser.email_verified ? "status-pill success" : "status-pill error"}>
            {props.currentUser.email_verified ? "Email verified" : "Email not verified"}
          </p>
        </section>

        <section className="panel-section">
          <h3>Change Email</h3>
          {emailMessage && <p className="status-pill success">{emailMessage}</p>}
          {emailError && <p className="status-pill error">{emailError}</p>}
          <form className="stack-form" onSubmit={handleUpdateEmail}>
            <input
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="New email"
              required
            />
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Current password"
              required
            />
            <button type="submit" disabled={isUpdatingEmail}>
              {isUpdatingEmail ? "Updating..." : "Update email"}
            </button>
          </form>
        </section>
      </div>

      <div className="panel club-panel">
        <section className="panel-section">
          <h3>Change Password</h3>
          <button type="button" className="secondary-button" onClick={() => void handleSendPasswordCode()} disabled={isSendingCode}>
            {isSendingCode ? "Sending..." : "Email me a password code"}
          </button>
          {passwordMessage && <p className="status-pill success">{passwordMessage}</p>}
          {passwordError && <p className="status-pill error">{passwordError}</p>}
          <form className="stack-form" onSubmit={handleUpdatePassword}>
            <input
              value={passwordCode}
              onChange={(event) => setPasswordCode(event.target.value.toUpperCase())}
              placeholder="Email code"
              required
            />
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password (8+ chars)"
              minLength={8}
              required
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
              minLength={8}
              required
            />
            <button type="submit" disabled={isUpdatingPassword}>
              {isUpdatingPassword ? "Updating..." : "Update password"}
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}
