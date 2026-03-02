import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import * as api from "./api";
import { AppRoutes } from "./app/routes";
import type { User } from "./types";

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

  function handleUserUpdate(nextUser: User) {
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
      <AppRoutes
        user={user}
        loading={loading}
        onAuthSuccess={handleAuthSuccess}
        onUserUpdate={handleUserUpdate}
        onLogout={handleLogout}
      />
    </BrowserRouter>
  );
}
