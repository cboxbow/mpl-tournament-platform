import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { AdminGuard } from "@/components/auth/AdminGuard";

type Tournament = { id: string; slug: string; name: string; level: string; status: string; startDate?: string | null };

export default function AdminTournaments() {
  const [items, setItems] = useState<Tournament[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [level, setLevel] = useState("M500");
  const [message, setMessage] = useState("");
  const load = () => apiFetch("/tournaments", { auth: false, silent: true }).then((r) => r.json()).then((body: { data: { tournaments: Tournament[] } }) => setItems(body.data.tournaments)).catch(() => undefined);
  useEffect(() => { void load(); }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage("");
    const response = await apiFetch("/tournaments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, slug, level, season: 2026, status: "DRAFT" }) });
    if (!response.ok) { setMessage("Creation failed. An MPL admin session is required."); return; }
    setMessage("Tournament created."); setName(""); setSlug(""); setShowCreate(false); void load();
  };
  return <AdminGuard><div className="mpl-page"><header className="mpl-topbar"><Link className="mpl-brand" to="/"><span className="mpl-mark">MPL</span><span>ADMIN · TOURNAMENTS</span></Link><Link className="mpl-link" to="/tournaments">Public Hub →</Link><Link className="mpl-link" to="/admin/users" style={{ marginLeft: "1rem" }}>Team access →</Link></header><main className="mpl-content"><div className="mpl-kicker">TOURNAMENT CONTROL PLANE</div><h1 className="mpl-title">Manage tournaments</h1><div className="mpl-actions"><button className="mpl-button" onClick={() => setShowCreate((value) => !value)}>Create tournament</button></div>{message && <div className="mpl-alert">{message}</div>}{showCreate && <form className="mpl-form" onSubmit={submit}><label>Tournament name<input value={name} onChange={(e) => setName(e.target.value)} required /></label><label>Slug<input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="m500-forbach-2026" required /></label><label>Level<select value={level} onChange={(e) => setLevel(e.target.value)}>{["M25","M50","M100","M250","M500","M1000"].map((item) => <option key={item}>{item}</option>)}</select></label><button className="mpl-button" type="submit">Create draft</button></form>}<section className="mpl-section"><div className="mpl-section-head"><h2>ALL TOURNAMENTS</h2><span>{items.length.toString().padStart(2, "0")}</span></div><div className="mpl-tournament-list">{items.map((item) => <div className="mpl-tournament-row" key={item.id}><Link to={`/tournaments/${item.slug}`}><div><span className="mpl-status">{item.status.replace("_", " ")}</span><h3>{item.name}</h3><p>{item.startDate ?? "Date TBC"}</p></div></Link><div className="mpl-actions"><strong>{item.level}</strong><Link className="mpl-link" to={`/admin/tournaments/${item.slug}/setup`}>Setup →</Link><Link className="mpl-link" to={`/admin/tournaments/${item.slug}/control`}>Control →</Link></div></div>)}</div></section></main></div></AdminGuard>;
}
