import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { AdminGuard } from "@/components/auth/AdminGuard";

type Match = Record<string, unknown>;
type Payload = { tournament: { name: string; slug: string }; matches: Match[]; overview: { total: number; completed: number; live: number } };

export default function TournamentControl() {
  const { slug = "m1000-cana-2026" } = useParams();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<Match | null>(null);
  const [sets, setSets] = useState([{ teamAGames: 0, teamBGames: 0 }]);
  const [message, setMessage] = useState("");
  const load = () => apiFetch(`/control/${slug}`, { silent: true }).then(async (response) => {
    const body = await response.json() as { data?: Payload };
    if (response.ok && body.data) setPayload(body.data);
  });
  useEffect(() => { void load(); const id = window.setInterval(() => void load(), 15000); return () => window.clearInterval(id); }, [slug]);
  const courts = useMemo(() => Array.from(new Set((payload?.matches ?? []).map((match) => String(match.courtName ?? "Unassigned")))), [payload]);
  const submitScore = async () => {
    if (!selected) return;
    const winnerTeamId = Number(sets[0].teamAGames) > Number(sets[0].teamBGames) ? String(selected.teamAId) : String(selected.teamBId);
    const response = await apiFetch(`/control/${slug}/matches/${String(selected.id)}/score`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sets, winnerTeamId }) });
    setMessage(response.ok ? "Score saved and audited." : "Score could not be saved.");
    setSelected(null); void load();
  };
  return <AdminGuard><div className="mpl-page"><header className="mpl-topbar"><Link className="mpl-brand" to="/admin/tournaments"><span className="mpl-mark">MPL</span><span>CONTROL CENTER</span></Link><Link className="mpl-link" to={`/tournaments/${slug}`}>Public view →</Link></header><main className="mpl-content"><div className="mpl-kicker">TOURNAMENT LIVE · OPERATIONAL VIEW</div><h1 className="mpl-title">{payload?.tournament.name ?? slug}</h1><section className="mpl-kpis">{[["COMPLETED", payload?.overview.completed ?? 0], ["LIVE", payload?.overview.live ?? 0], ["REMAINING", Math.max(0, (payload?.overview.total ?? 0) - (payload?.overview.completed ?? 0))], ["COURTS", courts.length]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</section>{message && <div className="mpl-alert">{message}</div>}<div className="mpl-data-grid">{courts.map((court) => <section className="mpl-data-card" key={court}><div className="mpl-card-top"><span>{court}</span><span>COURT CONTROL</span></div>{(payload?.matches ?? []).filter((match) => String(match.courtName ?? "Unassigned") === court).slice(0, 4).map((match) => <article key={String(match.id)} className="mpl-control-match"><h3>{String(match.teamAName ?? "TBD")} <span className="mpl-vs">vs</span> {String(match.teamBName ?? "TBD")}</h3><p>{String(match.status ?? "SCHEDULED")} · {String(match.stage ?? "")} · {String(match.code ?? "")}</p><button className="mpl-button secondary" onClick={() => { setSelected(match); setSets([{ teamAGames: 0, teamBGames: 0 }]); }}>Enter score</button></article>)}</section>)}</div>{selected && <section className="mpl-section"><div className="mpl-section-head"><h2>ENTER SCORE · {String(selected.teamAName)} vs {String(selected.teamBName)}</h2><button className="mpl-link" onClick={() => setSelected(null)}>Cancel</button></div><div className="mpl-form"><label>{String(selected.teamAName)}<input type="number" min="0" value={sets[0].teamAGames} onChange={(e) => setSets([{ ...sets[0], teamAGames: Number(e.target.value) }])} /></label><label>{String(selected.teamBName)}<input type="number" min="0" value={sets[0].teamBGames} onChange={(e) => setSets([{ ...sets[0], teamBGames: Number(e.target.value) }])} /></label><button className="mpl-button" onClick={() => void submitScore()}>Save & finish</button></div></section>}</main></div></AdminGuard>;
}
