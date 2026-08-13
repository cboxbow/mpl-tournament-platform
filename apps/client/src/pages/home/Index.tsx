const Index = () => {
  return (
    <div className="mpl-page">
      <header className="mpl-topbar">
        <div className="mpl-brand"><span className="mpl-mark">MPL</span><span>TOURNAMENT PLATFORM</span></div>
        <a className="mpl-link" href="/tournaments">Tournament Hub →</a>
      </header>
      <main className="mpl-hero">
        <div className="mpl-kicker">MAURITIUS PADEL LEAGUE · OFFICIAL ENGINE</div>
        <h1>Every tournament.<br /><em>One platform.</em></h1>
        <p>Organise, run live, publish results and preserve the full history of MPL competitions.</p>
        <div className="mpl-actions"><a className="mpl-button" href="/tournaments">Explore tournaments</a><a className="mpl-button secondary" href="/tournaments/m1000-cana-2026">Open M1000 CANA 2026</a></div>
      </main>
    </div>
  );
};

export default Index;
