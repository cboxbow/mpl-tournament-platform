import { Hono } from "hono";
import { cors } from "hono/cors";
import { routeEntries } from "./route-registry";
import { withSession } from "../middlewares/with-session";
import { notFound } from "../middlewares/not-found";
import { onError } from "../middlewares/on-error";
import { getAuth } from "./auth";
import { isDatabaseConfigured } from "./db";
import { apiFailure } from "@repo/shared/http";
import { env } from "./env";

const app = new Hono({ strict: false });

// The client site and this backend are deployed on different registrable
// domains by design, and auth rides the Authorization header (bearer token,
// no cookies), so an origin allow-list adds no CSRF protection on its own.
// Even so, unrestricted reflection lets ANY site read API responses (team
// rosters, player data, admin-guarded error bodies) via a logged-in admin's
// browser, which is unnecessary once real production domains are known.
// Restrict to the configured ALLOWED_ORIGINS plus any *.vercel.app preview
// deployment of this project; fall back to full reflection only when
// ALLOWED_ORIGINS is unset (local dev / a fresh template instance that
// hasn't had its production domain injected yet).
function isAllowedOrigin(origin: string): boolean {
  if (env.ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    return new URL(origin).hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      if (env.ALLOWED_ORIGINS.length === 0) return origin;
      return isAllowedOrigin(origin) ? origin : undefined;
    },
    exposeHeaders: ["set-auth-token"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  })
);

app.options("/api/auth/*", (c) => c.body(null, 204));
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  if (!isDatabaseConfigured()) {
    return c.json(apiFailure("DATABASE_UNCONFIGURED", "Skybase database runtime env is not configured"), 503);
  }

  return getAuth().handler(c.req.raw);
});
app.use("/api/*", withSession);

// Routes are auto-discovered from apps/server/routes/*.route.ts and mounted at
// /api/<name>. To add an endpoint, add a route file — no edits needed here.
for (const { path, router } of routeEntries) {
  app.route(path, router);
}

app.onError(onError);
app.notFound(notFound);

export default app;
