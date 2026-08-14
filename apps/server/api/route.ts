// Vercel Node.js Function — single entrypoint for ALL /api/* requests.
// See ../vercel.json: a rewrite maps "/api/:path*" to this function while
// preserving the original request path/URL, which @hono/node-server/vercel's
// handle() reconstructs into a Fetch Request for Hono's own internal router
// to match. This sidesteps Vercel's filename-based dynamic route conventions
// entirely (both [...route].ts and [[...route]].ts turned out unreliable
// here — see git history on this file for the two prior failed attempts).
//
// IMPORTANT: imports the pre-bundled ../dist/index.js (produced by
// `vite build` using the existing _core/fc-entry.ts SSR entry, noExternal:
// true) instead of the raw TS source tree, because Vercel's own build step
// does not reliably resolve this project's many relative imports.
//
// Rebuild before deploying if server source changed:
//   cd apps/server && pnpm exec vite build
import { handle } from "@hono/node-server/vercel";
// @ts-expect-error -- dist/index.js is a built JS bundle with no .d.ts; the
// runtime export (a Hono app instance) is correct, only the type is unknown.
import app from "../dist/index.js";

export default handle(app);
