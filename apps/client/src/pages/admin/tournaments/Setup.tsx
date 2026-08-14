import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { AdminGuard } from "@/components/auth/AdminGuard";

type Category = { id: string; code: string; name: string; gender: string | null };
type Player = { id: string; displayName: string; currentRanking: number | null };
type Team = { id: string; name: string; teamWeight: number | null; players?: string };

function json<T>(response: Response) {
  return response.json().then((body: { data?: T }) => body.data as T);
}

function SetupInner() {
  const { slug = "" } = useParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [message, setMessage] = useState("");

  // Create category form
  const [catCode, setCatCode] = useState("");
  const [catName, setCatName] = useState("");
  const [catGender, setCatGender] = useState("MEN");

  // Player search / register team form
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [picked, setPicked] = useState<Player[]>([]);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newRanking, setNewRanking] = useState("");

  // Generate draw form
  const [format, setFormat] = useState<"KNOCKOUT" | "GROUPS" | "GROUPS_PLUS_KNOCKOUT">("KNOCKOUT");
  const [groupSize, setGroupSize] = useState(4);
  const [advancePerGroup, setAdvancePerGroup] = useState(2);

  const loadCategories = () =>
    apiFetch(`/categories?tournamentSlug=${encodeURIComponent(slug)}`, { silent: true })
      .then((r) => json<{ categories: Category[] }>(r))
      .then((data) => {
        setCategories(data?.categories ?? []);
        if (data?.categories?.length && !selectedCategory) setSelectedCategory(data.categories[0].id);
      });

  const loadTeams = (categoryId: string) =>
    apiFetch(`/entries/teams?categoryId=${categoryId}`, { silent: true })
      .then((r) => json<{ teams: Team[] }>(r))
      .then((data) => setTeams(data?.teams ?? []));

  useEffect(() => { void loadCategories(); }, [slug]);
  useEffect(() => { if (selectedCategory) void loadTeams(selectedCategory); }, [selectedCategory]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let stale = false;
    const id = window.setTimeout(() => {
      void apiFetch(`/entries/players/search?q=${encodeURIComponent(query)}`, { silent: true })
        .then((r) => json<{ players: Player[] }>(r))
        .then((data) => { if (!stale) setResults(data?.players ?? []); });
    }, 250);
    return () => { stale = true; window.clearTimeout(id); };
  }, [query]);

  const createCategory = async (event: FormEvent) => {
    event.preventDefault(); setMessage("");
    const response = await apiFetch("/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentSlug: slug, code: catCode, name: catName, gender: catGender })
    });
    if (!response.ok) { setMessage("Category creation failed."); return; }
    setCatCode(""); setCatName(""); setMessage("Category created.");
    void loadCategories();
  };

  const createPlayer = async () => {
    if (!newFirst.trim() || !newLast.trim()) return;
    const response = await apiFetch("/entries/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: newFirst, lastName: newLast, currentRanking: newRanking ? Number(newRanking) : undefined })
    });
    const data = await json<{ player: Player }>(response);
    if (data?.player) { setPicked((p) => [...p, data.player].slice(-2)); setNewFirst(""); setNewLast(""); setNewRanking(""); }
  };

  const registerTeam = async () => {
    if (picked.length !== 2 || !selectedCategory) { setMessage("Pick exactly 2 players first."); return; }
    const response = await apiFetch("/entries/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentSlug: slug, categoryId: selectedCategory, playerIds: picked.map((p) => p.id) })
    });
    setMessage(response.ok ? "Team registered." : "Team registration failed.");
    if (response.ok) { setPicked([]); setQuery(""); setResults([]); void loadTeams(selectedCategory); }
  };

  const generateDraw = async () => {
    if (!selectedCategory) return;
    setMessage("");
    const response = await apiFetch(`/draws/${selectedCategory}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, groupSize, advancePerGroup })
    });
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    setMessage(response.ok ? "Draw generated." : `Draw generation failed: ${body?.error?.message ?? "unknown error"}`);
  };

  return (
    <div className="mpl-page">
      <header className="mpl-topbar">
        <Link className="mpl-brand" to="/admin/tournaments"><span className="mpl-mark">MPL</span><span>TOURNAMENT SETUP</span></Link>
        <div className="mpl-actions"><Link className="mpl-link" to={`/admin/tournaments/${slug}/control`}>Control →</Link><Link className="mpl-link" to={`/tournaments/${slug}`}>Public view →</Link></div>
      </header>
      <main className="mpl-content">
        <div className="mpl-kicker">TOURNAMENT SETUP · {slug}</div>
        <h1 className="mpl-title">Categories & entries</h1>
        {message && <div className="mpl-alert">{message}</div>}

        <section className="mpl-section">
          <div className="mpl-section-head"><h2>CATEGORIES</h2><span>{categories.length.toString().padStart(2, "0")}</span></div>
          <div className="mpl-tournament-list">
            {categories.map((cat) => (
              <button
                key={cat.id}
                className="mpl-tournament-row"
                style={{ textAlign: "left", cursor: "pointer", border: cat.id === selectedCategory ? "1px solid var(--mpl-accent, #2dd4ff)" : undefined }}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <div><span className="mpl-status">{cat.gender ?? "—"}</span><h3>{cat.name}</h3><p>{cat.code}</p></div>
              </button>
            ))}
          </div>
          <form className="mpl-form" onSubmit={createCategory}>
            <label>Code<input value={catCode} onChange={(e) => setCatCode(e.target.value)} placeholder="MEN" required /></label>
            <label>Name<input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Men's Main Draw" required /></label>
            <label>Gender<select value={catGender} onChange={(e) => setCatGender(e.target.value)}>{["MEN", "WOMEN", "MIXED"].map((g) => <option key={g}>{g}</option>)}</select></label>
            <button className="mpl-button" type="submit">Add category</button>
          </form>
        </section>

        {selectedCategory && (
          <>
            <section className="mpl-section">
              <div className="mpl-section-head"><h2>REGISTER A TEAM</h2><span>{teams.length.toString().padStart(2, "0")} registered</span></div>
              <div className="mpl-form">
                <label>Search existing player<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mathieu Vallet" /></label>
                {results.length > 0 && (
                  <div className="mpl-tournament-list">
                    {results.map((p) => (
                      <button key={p.id} className="mpl-button secondary" style={{ margin: "2px" }} onClick={() => { setPicked((prev) => [...prev, p].slice(-2)); setQuery(""); setResults([]); }}>
                        {p.displayName} {p.currentRanking != null ? `· #${p.currentRanking}` : ""}
                      </button>
                    ))}
                  </div>
                )}
                <p className="mpl-muted">Or create a new player —</p>
                <div className="mpl-actions">
                  <input value={newFirst} onChange={(e) => setNewFirst(e.target.value)} placeholder="First name" />
                  <input value={newLast} onChange={(e) => setNewLast(e.target.value)} placeholder="Last name" />
                  <input value={newRanking} onChange={(e) => setNewRanking(e.target.value)} placeholder="Ranking (optional)" type="number" />
                  <button className="mpl-button secondary" type="button" onClick={() => void createPlayer()}>Add & pick</button>
                </div>
                <p><strong>Picked:</strong> {picked.length ? picked.map((p) => p.displayName).join(" / ") : "none yet — pick 2 players"}</p>
                <button className="mpl-button" type="button" onClick={() => void registerTeam()} disabled={picked.length !== 2}>Register team</button>
              </div>
              <div className="mpl-data-grid">
                {teams.map((t) => (
                  <article className="mpl-data-card" key={t.id}>
                    <h3>{t.name}</h3>
                    <p>{t.players ?? ""} · weight {t.teamWeight ?? "—"}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="mpl-section">
              <div className="mpl-section-head"><h2>GENERATE DRAW</h2></div>
              <div className="mpl-form">
                <label>Format
                  <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
                    <option value="KNOCKOUT">Knockout only</option>
                    <option value="GROUPS">Groups only (round robin)</option>
                    <option value="GROUPS_PLUS_KNOCKOUT">Groups → knockout</option>
                  </select>
                </label>
                {format !== "KNOCKOUT" && (
                  <label>Group size<input type="number" min={3} max={8} value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))} /></label>
                )}
                {format === "GROUPS_PLUS_KNOCKOUT" && (
                  <label>Advance per group<input type="number" min={1} max={4} value={advancePerGroup} onChange={(e) => setAdvancePerGroup(Number(e.target.value))} /></label>
                )}
                <button className="mpl-button" type="button" onClick={() => void generateDraw()}>Generate draw ({teams.length} teams)</button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function TournamentSetup() {
  return <AdminGuard><SetupInner /></AdminGuard>;
}
