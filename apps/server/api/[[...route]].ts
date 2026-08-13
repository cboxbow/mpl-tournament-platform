// Vercel Node.js Function entrypoint — catch-all for /api/*.
// This is an ADDITIONAL entrypoint alongside the existing FC entries
// (_core/fc-entry.ts, _core/fc-entry.web.ts); it does not replace them.
// Reuses the same Hono app instance, so every route file under
// apps/server/routes/*.route.ts is served identically on Vercel.
import { handle } from "@hono/node-server/vercel";
import app from "../_core/create-app";

export default handle(app);
