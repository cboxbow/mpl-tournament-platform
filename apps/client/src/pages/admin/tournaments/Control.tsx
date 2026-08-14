import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { AdminGuard } from "@/components/auth/AdminGuard";

type Match = Record<string, unknown>;
type Payload = { tournament: { name: string; slug: string }; matches: Match[]; overview: { total: number; completed: number; live: number } };
type SetScore = { teamAGames: number; teamBGames: number; teamATiebreak?: number; teamBTiebreak?: number };
type Status = "COMPLETED" | "WALKOVER" | "RETIRED" | "ABANDONED";

const emptySet = (): SetScore => ({ teamAGames: 0, teamBGames: 0 });

export default function TournamentControl() {
  const { slug = "m1000-cana-2026" } = useParams();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<Match | null>(null);
  const [sets, setSets] = useState<SetScore[]>([emptySet()]);
  const [status, setStatus] = useState<Status>("COMPLETED");
  const [winnerTeamId, setWinnerTeamId] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => apiFetch(`/control/${slug}`, { silent: true }).then(async (response) => {
    const body = await response.json() as { data?: Payload };
    if (response.ok && body.data) setPayload(body.data);
  });
  useEffect(() => { void load(); const id = window.setInterval(() => void load(), 15000); return () => window.clearInterval(id); }, [slug]);

  const courts = useMemo(() => Array.from(new Set((payload?.matches ?? []).map((match) => String(match.courtName ?? "Unassigned")))), [payload]);

  const openMatch = (match: Match) => {
    setSelected(match);
    setSets([emptySet()]);
    setStatus("COMPLETED");
    setWinnerTeamId("");
    setMessage("");
  };

  const updateSet = (index: number, patch: Partial<SetScore>) =>
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const addSet = () => setSets((prev) => (prev.length >= 5 ? prev : [...prev, emptySet()]));
  const removeSet = (index: number) => setSets((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  const needsTiebreak = (s: SetScore) => Math.abs(s.teamAGames - s.teamBGames) <= 1 && Math.max(s.teamAGames, s.teamBGames) >= 6;

  const submitScore = async () => {
    if (!selected) return;
    if (status !== "COMPLETED" && !winnerTeamId) { setMessage("Select the winning team for a walkover / retirement / abandonment."); return; }
    setSaving(true); setMessage("");
    const body: Record<string, unknown> = {
      sets: sets.map((s) => ({
        teamAGames: s.teamAGames,
        teamBGames: s.teamBGames,
        ...(s.teamATiebreak !== undefined ? { teamATiebreak: s.teamATiebreak } : {}),
        ...(s.teamBTiebreak !== undefined ? { teamBTiebreak: s.teamBTiebreak } : {})
      })),
      status
    };
    if (winnerTeamId) body.winnerTeamId = winnerTeamId;
    const response = await apiFetch(`/control/${slug}/matches/${String(selected.id)}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const responseBody = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    setSaving(false);
    setMessage(response.ok ? "Score saved. Standings and bracket updated automatically." : `Could not save score: ${responseBody?.error?.message ?? "unknown error"}`);
    if (response.ok) { setSelected(null); void load(); }
  };

  return <AdminGuard><div className="mpl-page">
    <header className="mpl-topbar">
      <Link className="mpl-brand" to="/admin/tournaments"><span className="mpl-mark">MPL</span><span>CONTROL CENTER</span></Link>
      <div className="mpl-actions"><Link className="mpl-link" to={`/admin/tournaments/${slug}/setup`}>Setup →</Link><Link className="mpl-link" to={`/tournaments/${slug}`}>Public view →</Link></div>
    </header>
    <main className="mpl-content">
      <div className="mpl-kicker">TOURNAMENT LIVE · OPERATIONAL VIEW</div>
      <h1 className="mpl-title">{payload?.tournament.name ?? slug}</h1>
      <section className="mpl-kpis">{[["COMPLETED", payload?.overview.completed ?? 0], ["LIVE", payload?.overview.live ?? 0], ["REMAINING", Math.max(0, (payload?.overview.total ?? 0) - (payload?.overview.completed ?? 0))], ["COURTS", courts.length]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</section>
      {message && <div className="mpl-alert">{message}</div>}
      <div className="mpl-data-grid">
        {courts.map((court) => <section className="mpl-data-card" key={court}>
          <div className="mpl-card-top"><span>{court}</span><span>COURT CONTROL</span></div>
          {(payload?.matches ?? []).filter((match) => String(match.courtName ?? "Unassigned") === court).slice(0, 4).map((match) => (
            <article key={String(match.id)} className="mpl-control-match">
              <h3>{String(match.teamAName ?? "TBD")} <span className="mpl-vs">vs</span> {String(match.teamBName ?? "TBD")}</h3>
              <p>{String(match.status ?? "SCHEDULED")} · {String(match.stage ?? "")} · {String(match.code ?? "")}</p>
              <button className="mpl-button secondary" onClick={() => openMatch(match)}>Enter score</button>
            </article>
          ))}
        </section>)}
      </div>

      {selected && <section className="mpl-section">
        <div className="mpl-section-head"><h2>ENTER SCORE · {String(selected.teamAName)} vs {String(selected.teamBName)}</h2><button className="mpl-link" onClick={() => setSelected(null)}>Cancel</button></div>
        <div className="mpl-form">
          <label>Match status
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="COMPLETED">Completed (score decides winner)</option>
              <option value="WALKOVER">Walkover</option>
              <option value="RETIRED">Retired mid-match</option>
              <option value="ABANDONED">Abandoned</option>
            </select>
          </label>

          {status === "COMPLETED" ? (
            <>
              {sets.map((set, index) => (
                <div key={index} className="mpl-actions" style={{ alignItems: "flex-end" }}>
                  <label>Set {index + 1} · {String(selected.teamAName)}
                    <input type="number" min={0} max={7} value={set.teamAGames} onChange={(e) => updateSet(index, { teamAGames: Number(e.target.value) })} />
                  </label>
                  <label>{String(selected.teamBName)}
                    <input type="number" min={0} max={7} value={set.teamBGames} onChange={(e) => updateSet(index, { teamBGames: Number(e.target.value) })} />
                  </label>
                  {needsTiebreak(set) && <>
                    <label>TB A<input type="number" min={0} value={set.teamATiebreak ?? ""} onChange={(e) => updateSet(index, { teamATiebreak: e.target.value ? Number(e.target.value) : undefined })} /></label>
                    <label>TB B<input type="number" min={0} value={set.teamBTiebreak ?? ""} onChange={(e) => updateSet(index, { teamBTiebreak: e.target.value ? Number(e.target.value) : undefined })} /></label>
                  </>}
                  {sets.length > 1 && <button className="mpl-link" type="button" onClick={() => removeSet(index)}>Remove set</button>}
                </div>
              ))}
              <div className="mpl-actions">
                <button className="mpl-button secondary" type="button" onClick={addSet} disabled={sets.length >= 5}>+ Add set</button>
              </div>
            </>
          ) : (
            <label>Winning team
              <select value={winnerTeamId} onChange={(e) => setWinnerTeamId(e.target.value)}>
                <option value="">Select winner</option>
                <option value={String(selected.teamAId)}>{String(selected.teamAName)}</option>
                <option value={String(selected.teamBId)}>{String(selected.teamBName)}</option>
              </select>
            </label>
          )}

          <button className="mpl-button" onClick={() => void submitScore()} disabled={saving}>{saving ? "Saving…" : "Save & finish"}</button>
        </div>
      </section>}
    </main>
  </div></AdminGuard>;
}
