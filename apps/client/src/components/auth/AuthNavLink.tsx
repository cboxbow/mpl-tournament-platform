import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";

// Small header widget so signing in and reaching the admin panel is
// discoverable from the site itself, instead of only working if you already
// know the /auth and /admin/tournaments URLs by heart. Reuses the same
// /me/profile check AdminGuard uses to decide whether to show "Admin" or
// "Sign in".
type State = "checking" | "guest" | "user" | "admin";

export function AuthNavLink() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let active = true;
    apiFetch("/me/profile", { silent: true })
      .then(async (response) => {
        if (!response.ok) return active && setState("guest");
        const body = (await response.json().catch(() => null)) as { ok?: boolean; data?: { profile?: { role?: string } } } | null;
        if (!active) return;
        setState(body?.data?.profile?.role === "admin" ? "admin" : "user");
      })
      .catch(() => active && setState("guest"));
    return () => {
      active = false;
    };
  }, []);

  if (state === "checking") return null;
  if (state === "admin") return <Link className="mpl-link" to="/admin/tournaments">Admin →</Link>;
  if (state === "user") return <span className="mpl-muted">Signed in</span>;
  return <Link className="mpl-link" to="/auth">Sign in →</Link>;
}
