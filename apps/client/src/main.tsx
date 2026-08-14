import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { syncAuthTokenFromUrl } from "@/lib/api";

// Prerender (scripts/prerender.mjs) bakes the HOME route into #root at build
// time so crawlers see real content on "/". We deliberately do NOT hydrate
// that markup back in: this SPA-fallback setup serves the same prerendered
// index.html for every route (see apps/client/vercel.json's catch-all
// rewrite), so hydrateRoot() was being asked to reconcile home-page markup
// against whatever route actually matched (e.g. /auth) — a guaranteed
// mismatch that threw React error #418 on every non-home load, and once
// even froze the tab entirely mid-render. A prerendered snapshot can also go
// stale relative to the current bundle (e.g. header links added later never
// showed up until a full client re-render happened to recover). A plain
// client render sidesteps both failure modes: crawlers still get the
// prerendered content on "/", real browsers always get a correct render.
const rootEl = document.getElementById("root")!;

async function bootstrap() {
  await syncAuthTokenFromUrl();
  rootEl.replaceChildren();
  createRoot(rootEl).render(<App />);
}

void bootstrap();
