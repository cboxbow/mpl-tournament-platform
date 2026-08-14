import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { apiSuccess } from "@repo/shared/http";
import { getAuth } from "../_core/auth";
import { getDb } from "../_core/db";
import { user as userTable } from "../db/schema";

// TEMPORARY bootstrap endpoint: creates (or promotes) a single admin account
// via better-auth's own signUpEmail server API — this guarantees the stored
// password hash matches whatever hashing better-auth is configured with,
// instead of hand-rolling a compatible hash here. Guarded by the same
// shared-secret env var pattern as the (now removed) admin-migrate route.
// Remove this route once the first admin account exists in production.
export const isPublic = true;

export const adminBootstrapRouter = new Hono();

adminBootstrapRouter.get("/", async (c) => {
  const secret = process.env.MIGRATE_ADMIN_SECRET;
  if (!secret) {
    return c.json({ ok: false, error: { code: "NOT_CONFIGURED", message: "MIGRATE_ADMIN_SECRET not set on server" } }, 503);
  }
  const provided = c.req.header("x-migrate-secret") ?? c.req.query("secret");
  if (provided !== secret) {
    return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing secret" } }, 401);
  }

  const email = c.req.query("email");
  const password = c.req.query("password");
  const name = c.req.query("name") ?? "Christian Bezandry";
  if (!email || !password) {
    return c.json({ ok: false, error: { code: "BAD_REQUEST", message: "email and password query params are required" } }, 400);
  }

  const db = getDb();
  const existing = await db.select().from(userTable).where(eq(userTable.email, email)).limit(1);

  if (existing.length === 0) {
    const auth = getAuth();
    await auth.api.signUpEmail({ body: { email, password, name } });
  }

  await db.update(userTable).set({ role: "admin" }).where(eq(userTable.email, email));

  const after = await db.select().from(userTable).where(eq(userTable.email, email)).limit(1);

  return c.json(apiSuccess({ created: existing.length === 0, user: after[0] ?? null }));
});
