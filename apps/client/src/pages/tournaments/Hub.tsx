import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { AuthNavLink } from "@/components/auth/AuthNavLink";

type Tournament = { id: string; slug: string; name: string; shortName?: string | null; level: string; status: string; startDate?: string | null; endDate?: string | null; venue?: { name: string } | null };

const groups = [
  ["LIVE NOW", "LIVE"],
  ["UPCOMING", "UPCOMING"],
  ["RECENT RESULTS", "COMPLETED"],
  ["ARCHIVE", "ARCHIVED"]
] as const;

function statusClass(status: string) { return status.toLowerCase().replace("_", "-"); }

// A tournament's `status` field is set manually (REGISTRATION → DRAW_PENDING →
// PUBLISHED → ... → COMPLETED/ARCHIVED) and nothing today flips it to LIVE
// automatically. Derive it from startDate/endDate instead: any tournament
// still in its pre-live statuses (REGISTRATION/DRAW_PENDING/PUBLISHED) whose
// dates bracket today is treated as LIVE for display purposes, without
// touching the underlying DB value. COMPLETED/ARCHIVED stay authoritative —
// those are explicit operator decisions, not date-derived.
const PRE_LIVE_STATUSES = ["REGISTRATION", "DRAW_PENDING", "PUBLISHED"];
function todayISO() { return new Date().toISOString().slice(0, 10); }
function effectiveStatus(item: Tournament): string {
  if (PRE_LIVE_STATUSES.includes(item.status) && item.startDate && item.endDate) {
    const today = todayISO();
    if (item.startDate <= today && today <= item.endDate) return "LIVE";
  }
  return item.status;
}

export default function TournamentHub() {
  const [items, setItems] = useState<Tournament[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch("/tournaments", { auth: false, silent: true }).then(async (r) => {
      if (!r.ok) throw new Error("Tournament Hub unavailable");
      const body = await r.json() as { data: { tournaments: Tournament[] } };
      setItems(body.data.tournaments);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Unable to load tournaments"));
  }, []);

  const visible = (group: typeof groups[number][1]) => group === "UPCOMING"
    ? items.filter((item) => PRE_LIVE_STATUSES.includes(item.status) && effectiveStatus(item) !== "LIVE")
    : items.filter((item) => effectiveStatus(item) === group);

  return <div className="mpl-page">
    <header className="mpl-topbar"><Link className="mpl-brand" to="/"><span className="mpl-mark">MPL</span><span>TOURNAMENT HUB</span></Link><div style={{ display: "flex", gap: "1rem", alignItems: "center" }}><span className="mpl-muted">2026 SEASON</span><AuthNavLink /></div></header>
    <main className="mpl-content">
      <div className="mpl-kicker">THE OFFICIAL MPL CALENDAR</div><h1 className="mpl-title">Tournament Hub</h1>
      {error && <div className="mpl-alert">{error}</div>}
      {groups.map(([label, key]) => <section className="mpl-section" key={label}><div className="mpl-section-head"><h2>{label}</h2><span>{visible(key).length.toString().padStart(2, "0")}</span></div>
        <div className="mpl-tournament-list">{visible(key).map((tournament) => <Link className="mpl-tournament-row" to={`/tournaments/${tournament.slug}`} key={tournament.id}>
          <div><span className={`mpl-status ${statusClass(effectiveStatus(tournament))}`}>{effectiveStatus(tournament).replace("_", " ")}</span><h3>{tournament.name}</h3><p>{tournament.venue?.name ?? "MPL venue"} · {tournament.startDate ?? "Date TBC"}{tournament.endDate ? ` — ${tournament.endDate}` : ""}</p></div><strong>{tournament.level} ↗</strong>
        </Link>)}</div>
        {visible(key).length === 0 && <p className="mpl-empty">No tournaments in this section yet.</p>}
      </section>)}
    </main>
  </div>;
}
