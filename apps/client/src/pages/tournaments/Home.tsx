import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { apiFetch } from "@/lib/api";

type Tournament = { name: string; shortName?: string | null; level: string; status: string; startDate?: string | null; endDate?: string | null; description?: string | null; organiser?: string | null; referee?: string | null; venue?: { name: string; courts?: string[] } | null };
type Counts = { teams: number; players: number; matches: number; courts: number };

export default function TournamentHome() {
  const { slug = "m1000-cana-2026" } = useParams();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [counts, setCounts] = useState<Counts>({ teams: 0, players: 0, matches: 0, courts: 0 });
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch(`/tournaments/${slug}`, { auth: false, silent: true }).then(async (r) => {
      const body = await r.json() as { ok: boolean; data?: { tournament: Tournament; counts: Counts }; error?: { message: string } };
      if (!r.ok || !body.data) throw new Error(body.error?.message ?? "Tournament not found");
      setTournament(body.data.tournament); setCounts(body.data.counts);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Unable to load tournament"));
  }, [slug]);

  if (error) return <div className="mpl-page"><main className="mpl-content"><div className="mpl-alert">{error}</div><Link className="mpl-link" to="/tournaments">← Tournament Hub</Link></main></div>;
  if (!tournament) return <div className="mpl-page"><main className="mpl-content"><div className="mpl-loading">Loading tournament…</div></main></div>;
  return <div className="mpl-page">
    <header className="mpl-topbar"><Link className="mpl-brand" to="/tournaments"><span className="mpl-mark">MPL</span><span>{tournament.shortName ?? tournament.name}</span></Link><span className={`mpl-status ${tournament.status.toLowerCase()}`}>{tournament.status.replace("_", " ")}</span></header>
    <main className="mpl-content">
      <section className="mpl-tournament-hero"><div className="mpl-kicker">{tournament.level} · {tournament.venue?.name ?? "MPL venue"}</div><h1 className="mpl-title">{tournament.name}</h1><p className="mpl-lead">{tournament.description}</p><p className="mpl-meta">{tournament.startDate} — {tournament.endDate} · {tournament.organiser ?? "Mauritius Padel League"}</p><div className="mpl-actions"><Link className="mpl-button" to={`/tournaments/${slug}/live`}>Open live centre</Link><Link className="mpl-button secondary" to={`/tournaments/${slug}/schedule`}>View schedule</Link></div></section>
      <section className="mpl-kpis">{[["TEAMS", counts.teams], ["PLAYERS", counts.players], ["COURTS", counts.courts], ["MATCHES", counts.matches]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</section>
      <section className="mpl-section"><div className="mpl-section-head"><h2>TOURNAMENT NAVIGATION</h2><span>PHASE 1</span></div><div className="mpl-route-grid">{["live", "schedule", "draws", "groups", "teams", "players", "results", "info"].map((route) => <Link key={route} className="mpl-route-link" to={`/tournaments/${slug}/${route}`}>{route.toUpperCase()} <span>→</span></Link>)}</div></section>
    </main>
  </div>;
}
