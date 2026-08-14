import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { AdminGuard } from "@/components/auth/AdminGuard";

type User = { id: string; name: string; email: string; role: "user" | "admin"; emailVerified: boolean; createdAt: string };

function json<T>(response: Response) {
  return response.json().then((body: { data?: T }) => body.data as T);
}

function AdminUsersInner() {
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"user" | "admin">("admin");
  const [me, setMe] = useState<string>("");
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const load = () => apiFetch("/users", { silent: true }).then((r) => json<{ users: User[] }>(r)).then((data) => setUsers(data?.users ?? []));

  useEffect(() => {
    void load();
    void apiFetch("/me/profile", { silent: true })
      .then((r) => r.json())
      .then((body: { data?: { profile?: { id?: string } } }) => setMe(body?.data?.profile?.id ?? ""));
  }, []);

  const invite = async (event: FormEvent) => {
    event.preventDefault(); setMessage("");
    const response = await apiFetch("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, role })
    });
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    if (!response.ok) { setMessage(`Could not create account: ${body?.error?.message ?? "unknown error"}`); return; }
    setMessage(`Account created for ${email}. Share the password with them directly — there is no email invite yet.`);
    setEmail(""); setPassword(""); setName(""); setShowInvite(false);
    void load();
  };

  const toggleRole = async (targetUser: User) => {
    const nextRole = targetUser.role === "admin" ? "user" : "admin";
    const response = await apiFetch(`/users/${targetUser.id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole })
    });
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    setMessage(response.ok ? `${targetUser.email} is now ${nextRole}.` : `Could not update role: ${body?.error?.message ?? "unknown error"}`);
    if (response.ok) void load();
  };

  const submitReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetTarget) return;
    const response = await apiFetch(`/users/${resetTarget.id}/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword })
    });
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    setMessage(response.ok
      ? `Password reset for ${resetTarget.email}. Share "${newPassword}" with them directly — they should change it after signing in.`
      : `Could not reset password: ${body?.error?.message ?? "unknown error"}`);
    if (response.ok) { setResetTarget(null); setNewPassword(""); }
  };

  return (
    <div className="mpl-page">
      <header className="mpl-topbar">
        <Link className="mpl-brand" to="/admin/tournaments"><span className="mpl-mark">MPL</span><span>ADMIN · ACCESS</span></Link>
        <Link className="mpl-link" to="/admin/tournaments">Tournaments →</Link>
      </header>
      <main className="mpl-content">
        <div className="mpl-kicker">ADMIN ACCESS CONTROL</div>
        <h1 className="mpl-title">Team access</h1>
        <div className="mpl-actions"><button className="mpl-button" onClick={() => setShowInvite((v) => !v)}>Add account</button></div>
        {message && <div className="mpl-alert">{message}</div>}
        {showInvite && (
          <form className="mpl-form" onSubmit={invite}>
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Temporary password (min 8 chars)<input type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label>
            <label>Role
              <select value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
                <option value="admin">Admin</option>
                <option value="user">User (no admin access)</option>
              </select>
            </label>
            <button className="mpl-button" type="submit">Create account</button>
          </form>
        )}
        <section className="mpl-section">
          <div className="mpl-section-head"><h2>ALL ACCOUNTS</h2><span>{users.length.toString().padStart(2, "0")}</span></div>
          <div className="mpl-tournament-list">
            {users.map((u) => (
              <div className="mpl-tournament-row" key={u.id}>
                <div><span className={`mpl-status ${u.role}`}>{u.role.toUpperCase()}</span><h3>{u.name}</h3><p>{u.email}</p></div>
                <div className="mpl-actions">
                  <button
                    className="mpl-button secondary"
                    onClick={() => void toggleRole(u)}
                    disabled={u.id === me && u.role === "admin"}
                    title={u.id === me && u.role === "admin" ? "Have another admin remove your own access" : undefined}
                  >
                    {u.role === "admin" ? "Remove admin" : "Make admin"}
                  </button>
                  <button className="mpl-link" onClick={() => { setResetTarget(u); setNewPassword(""); }}>Reset password</button>
                </div>
              </div>
            ))}
          </div>
        </section>
        {resetTarget && (
          <section className="mpl-section">
            <div className="mpl-section-head"><h2>RESET PASSWORD · {resetTarget.email}</h2><button className="mpl-link" onClick={() => setResetTarget(null)}>Cancel</button></div>
            <form className="mpl-form" onSubmit={submitReset}>
              <label>New temporary password (min 8 chars)<input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required /></label>
              <button className="mpl-button" type="submit">Set password</button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

export default function AdminUsers() {
  return <AdminGuard><AdminUsersInner /></AdminGuard>;
}
