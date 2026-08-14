import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";

type Row = Record<string, unknown>;
const titles: Record<string, string> = {
  live: "Live Centre",
  schedule: "Schedule",
  groups: "Groups & standings",
  draws: "Main draws",
  classification: "Classification",
  teams: "Teams",
  players: "Players",
  results: "Results",
  info: "Tournament information",
  my: "My Tournament"
};

function text(row: Row, key: string) {
  const value = row[key];
  return value == null || value === "" ? "—" : String(value);
}

// Match-shaped sections (live, schedule, draws, classification, results) all
// return rows with teamAName/teamBName/status/courtName. groups, teams and
// players return differently-shaped, section-appropriate rows — see
// apps/server/routes/tournament-data.route.ts for the exact row shapes.
function renderCard(section: string, row: Row) {
  if (section === "groups") {
    return (
      <>
        <div className="mpl-card-top"><span className="mpl-status live">{text(row, "categoryName")}</span><span>Group {text(row, "name")}</span></div>
        <h3>{text(row, "teamName")}</h3>
        <p>Seed {text(row, "seedPosition")} · {text(row, "matchCount")} matches</p>
      </>
    );
  }
  if (section === "teams") {
    return (
      <>
        <div className="mpl-card-top"><span className="mpl-status live">{text(row, "categoryName")}</span><span>{text(row, "entryType")}</span></div>
        <h3>{text(row, "name")}</h3>
        <p>{text(row, "status")} · Weight {text(row, "teamWeight")}{row.seed != null ? ` · Seed ${text(row, "seed")}` : ""}</p>
      </>
    );
  }
  if (section === "players") {
    return (
      <>
        <div className="mpl-card-top"><span className="mpl-status live">{text(row, "gender")}</span><span>Rank #{text(row, "tournamentRanking")}</span></div>
        <h3>{text(row, "displayName")}</h3>
        <p>{text(row, "eligibilityStatus")}{row.currentRanking != null ? ` · MPL #${text(row, "currentRanking")}` : ""}</p>
      </>
    );
  }
  return (
    <>
      <div className="mpl-card-top"><span className="mpl-status live">{text(row, "status")}</span><span>{text(row, "courtName")}</span></div>
      <h3>{text(row, "teamAName")} <span className="mpl-vs">vs</span> {text(row, "teamBName")}</h3>
      <p>{text(row, "categoryName")} · {text(row, "stage")} · {text(row, "round")}</p>
      {section === "results" && <p>Position {text(row, "position") || text(row, "positionMin")} · {text(row, "points")} MPL points</p>}
      {section === "schedule" && <p>{text(row, "scheduledAt")} · {text(row, "scheduleType")}</p>}
    </>
  );
}

export default function TournamentSection() {
  const { slug = "m1000-cana-2026", section = "live" } = useParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [favorite, setFavorite] = useState(localStorage.getItem("mpl.favoritePlayer") ?? "");
  const endpoint = section === "info" || section === "my" ? null : `/tournament-data/${slug}/${section}`;

  useEffect(() => {
    if (!endpoint) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch(endpoint, { auth: false, silent: true })
      .then(async (response) => {
        const body = (await response.json()) as { ok: boolean; data?: { rows: Row[] }; error?: { message?: string } };
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Données indisponibles");
        setRows(body.data.rows ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Données indisponibles"))
      .finally(() => setLoading(false));
  }, [endpoint]);

  const nav = ["live", "schedule", "groups", "draws", "classification", "teams", "players", "results", "info", "my"];
  const liveRows = useMemo(() => rows.filter((row) => ["LIVE", "CALLED", "WARMING_UP", "DELAYED"].includes(text(row, "status"))), [rows]);
  const visibleRows = section === "live" ? liveRows : rows;

  return (
    <div className="mpl-page">
      <header className="mpl-topbar">
        <Link className="mpl-brand" to={`/tournaments/${slug}`}><span className="mpl-mark">MPL</span><span>{titles[section] ?? "Tournament"}</span></Link>
        <Link className="mpl-link" to="/tournaments">Hub →</Link>
      </header>
      <main className="mpl-content">
        <div className="mpl-kicker">MPL TOURNAMENT PLATFORM · {slug}</div>
        <h1 className="mpl-title">{titles[section] ?? "Tournament"}</h1>
        <nav className="mpl-route-grid">
          {nav.map((item) => <Link className="mpl-route-link" key={item} to={`/tournaments/${slug}/${item}`}>{item.toUpperCase()} <span>→</span></Link>)}
        </nav>
        {section === "my" && (
          <section className="mpl-section">
            <div className="mpl-section-head"><h2>MY PLAYER</h2><span>LOCAL PREFERENCE</span></div>
            <div className="mpl-form"><label>Search your name<input value={favorite} onChange={(event) => { setFavorite(event.target.value); localStorage.setItem("mpl.favoritePlayer", event.target.value); }} placeholder="Mathieu Vallet" /></label></div>
            <p className="mpl-lead">{favorite ? `Following ${favorite}. Select your player from the MPL player database in the next iteration.` : "Choose a player to keep their next match close at hand."}</p>
          </section>
        )}
        {section === "info" && <section className="mpl-section"><p className="mpl-lead">Official tournament information, venue access, officials and regulations will be published from the tournament settings.</p></section>}
        {error && <div className="mpl-alert">{error}</div>}
        {loading ? <div className="mpl-loading">Loading live data…</div> : (
          <section className="mpl-section">
            <div className="mpl-section-head"><h2>{section === "live" ? "LIVE NOW · POLLING READY" : "OFFICIAL DATA"}</h2><span>{visibleRows.length.toString().padStart(2, "0")}</span></div>
            {visibleRows.length === 0 ? <p className="mpl-empty">{section === "live" ? "No match is live right now." : "No published rows yet."}</p> : (
              <div className="mpl-data-grid">
                {visibleRows.map((row, index) => (
                  <article className={`mpl-data-card ${section === "live" ? "is-live" : ""}`} key={String(row.id ?? row.code ?? index)}>
                    {renderCard(section, row)}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
