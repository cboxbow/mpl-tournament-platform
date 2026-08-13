// Vercel Node.js Function entrypoint — catch-all for /api/*.
// This is an ADDITIONAL entrypoint alongside the existing FC entries
// (_core/fc-entry.ts, _core/fc-entry.web.ts); it does not replace them.
//
// IMPORTANT: this imports the pre-bundled ../dist/index.js (produced by
// `vite build` using the existing _core/fc-entry.ts SSR entry, noExternal:
// true) instead of the raw TS source tree. Vercel's Node.js Function
// bundler does not reliably trace/include this project's many relative
// imports (_core/, routes/, services/, db/, middlewares/), which caused
// ERR_MODULE_NOT_FOUND at runtime when importing "../_core/create-app"
// directly. dist/index.js is a single self-contained ESM file with zero
// local relative imports (only node: builtins), so it always resolves.
//
// Rebuild before deploying if server source changed:
//   cd apps/server && pnpm exec vite build
import { handle } from "@hono/node-server/vercel";
import app from "../dist/index.js";

export default handle(app);
