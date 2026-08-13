import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";

type Tournament = { id: string; slug: string; name: string; shortName?: string | null; level: string; status: string; startDate?: string | null; endDate?: string | null; venue?: { name: string } | null };

const groups = [
  ["LIVE NOW", "LIVE"],
  ["UPCOMING", "UPCOMING"],
  ["RECENT RESULTS", "COMPLETED"],
  ["ARCHIVE", "ARCHIVED"]
] as const;

function statusClass(status: string) { return status.toLowerCase().replace("_", "-"); }

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
    ? items.filter((item) => ["REGISTRATION", "DRAW_PENDING", "PUBLISHED"].includes(item.status))
    : items.filter((item) => item.status === group);

  return <div className="mpl-page">
    <header className="mpl-topbar"><Link className="mpl-brand" to="/"><span className="mpl-mark">MPL</span><span>TOURNAMENT HUB</span></Link><span className="mpl-muted">2026 SEASON</span></header>
    <main className="mpl-content">
      <div className="mpl-kicker">THE OFFICIAL MPL CALENDAR</div><h1 className="mpl-title">Tournament Hub</h1>
      {error && <div className="mpl-alert">{error}</div>}
      {groups.map(([label, key]) => <section className="mpl-section" key={label}><div className="mpl-section-head"><h2>{label}</h2><span>{visible(key).length.toString().padStart(2, "0")}</span></div>
        <div className="mpl-tournament-list">{visible(key).map((tournament) => <Link className="mpl-tournament-row" to={`/tournaments/${tournament.slug}`} key={tournament.id}>
          <div><span className={`mpl-status ${statusClass(tournament.status)}`}>{tournament.status.replace("_", " ")}</span><h3>{tournament.name}</h3><p>{tournament.venue?.name ?? "MPL venue"} · {tournament.startDate ?? "Date TBC"}{tournament.endDate ? ` — ${tournament.endDate}` : ""}</p></div><strong>{tournament.level} ↗</strong>
        </Link>)}</div>
        {visible(key).length === 0 && <p className="mpl-empty">No tournaments in this section yet.</p>}
      </section>)}
    </main>
  </div>;
}
