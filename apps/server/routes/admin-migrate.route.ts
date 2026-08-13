import { Hono } from "hono";
import { apiSuccess } from "@repo/shared/http";
import { executeMigrationScript, executeSql, isDatabaseConfigured } from "../_core/db";

// TEMPORARY bootstrap endpoint: applies all SQL migrations to whatever
// database SKYBASE_DB_ENDPOINT/TOKEN/NAMESPACE currently point at. Guarded
// by a shared-secret header (MIGRATE_ADMIN_SECRET) rather than session auth,
// since the very first run happens before any user/session tables have data.
// Remove this route once the production database has been bootstrapped.
import m000 from "../migrations/000_auth.sql?raw";
import m001 from "../migrations/001_init.sql?raw";
import m002 from "../migrations/002_storage_files.sql?raw";
import m003 from "../migrations/003_ai_business_scenes.sql?raw";
import m004 from "../migrations/004_tournaments.sql?raw";
import m005 from "../migrations/005_competition_core.sql?raw";
import m006 from "../migrations/006_cana_seed.sql?raw";
import m007 from "../migrations/007_cana_flow.sql?raw";

export const isPublic = true;

export const adminMigrateRouter = new Hono();

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  { name: "000_auth.sql", sql: m000 },
  { name: "001_init.sql", sql: m001 },
  { name: "002_storage_files.sql", sql: m002 },
  { name: "003_ai_business_scenes.sql", sql: m003 },
  { name: "004_tournaments.sql", sql: m004 },
  { name: "005_competition_core.sql", sql: m005 },
  { name: "006_cana_seed.sql", sql: m006 },
  { name: "007_cana_flow.sql", sql: m007 }
];

async function runMigrationsHandler(c: import("hono").Context) {
  const secret = process.env.MIGRATE_ADMIN_SECRET;
  if (!secret) {
    return c.json({ ok: false, error: { code: "MIGRATE_NOT_CONFIGURED", message: "MIGRATE_ADMIN_SECRET not set on server" } }, 503);
  }
  // Accept the secret via header (preferred, POST) or query param (fallback
  // for tooling that can only issue plain GET requests to this URL).
  const provided = c.req.header("x-migrate-secret") ?? c.req.query("secret");
  if (provided !== secret) {
    return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing secret" } }, 401);
  }
  if (!isDatabaseConfigured()) {
    return c.json({ ok: false, error: { code: "DATABASE_UNCONFIGURED", message: "Skybase database runtime env is not configured" } }, 503);
  }

  const results: Array<{ name: string; ok: boolean; error?: string }> = [];

  for (const migration of MIGRATIONS) {
    try {
      await executeMigrationScript(migration.sql);
      results.push({ name: migration.name, ok: true });
    } catch (error) {
      results.push({ name: migration.name, ok: false, error: error instanceof Error ? error.message : String(error) });
      return c.json({ ok: false, error: { code: "MIGRATION_FAILED", message: `Failed at ${migration.name}` }, results }, 500);
    }
  }

  const tables = await executeSql("select name from sqlite_master where type='table' order by name");
  const matchCount = await executeSql("select count(*) as c from matches");
  const tournaments = await executeSql("select id, slug, migrationStatus from tournaments");

  return c.json(
    apiSuccess({
      results,
      tableCount: tables.rows.length,
      tables: tables.rows.map((r) => (r as unknown as { name: string }).name),
      matchCount: (matchCount.rows[0] as unknown as { c: number })?.c,
      tournaments: tournaments.rows
    })
  );
}

adminMigrateRouter.post("/", runMigrationsHandler);
adminMigrateRouter.get("/", runMigrationsHandler);
