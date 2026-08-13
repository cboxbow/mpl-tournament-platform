import { asc, desc, eq, sql } from "drizzle-orm";
import { DatabaseError, getDb } from "../_core/db";
import { tournaments, venues, type NewTournament } from "../db/schema";

export const TOURNAMENT_LEVELS = ["M25", "M50", "M100", "M250", "M500", "M1000"] as const;
export const TOURNAMENT_STATUSES = [
  "DRAFT",
  "REGISTRATION",
  "DRAW_PENDING",
  "PUBLISHED",
  "LIVE",
  "COMPLETED",
  "ARCHIVED"
] as const;

function parseJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapTournament(row: typeof tournaments.$inferSelect, venue?: typeof venues.$inferSelect | null) {
  return {
    ...row,
    settings: parseJson(row.settings),
    venue: venue
      ? { ...venue, courts: JSON.parse(venue.courts || "[]") as string[], contact: parseJson(venue.contact) }
      : null
  };
}

export async function listTournaments(status?: string) {
  const db = getDb();
  const rows = status
    ? await db.select().from(tournaments).where(eq(tournaments.status, status)).orderBy(asc(tournaments.startDate))
    : await db.select().from(tournaments).orderBy(desc(tournaments.startDate));

  return Promise.all(
    rows.map(async (row) => {
      const venue = row.venueId
        ? (await db.select().from(venues).where(eq(venues.id, row.venueId)).limit(1))[0]
        : null;
      return mapTournament(row, venue);
    })
  );
}

export async function getTournamentBySlug(slug: string) {
  const db = getDb();
  const row = (await db.select().from(tournaments).where(eq(tournaments.slug, slug)).limit(1))[0];
  if (!row) throw new DatabaseError("DATABASE_QUERY_FAILED", "Tournament not found", 404);
  const venue = row.venueId
    ? (await db.select().from(venues).where(eq(venues.id, row.venueId)).limit(1))[0]
    : null;
  return mapTournament(row, venue);
}

export async function createTournament(input: Omit<NewTournament, "id" | "settings"> & { settings?: Record<string, unknown> }) {
  const db = getDb();
  const id = crypto.randomUUID();
  const row = (
    await db
      .insert(tournaments)
      .values({
        ...input,
        id,
        settings: JSON.stringify(input.settings ?? {})
      })
      .returning()
  )[0];
  return mapTournament(row);
}

export async function tournamentCounts(tournamentId: string) {
  const row = await getDb().get<{ teams: number; players: number; matches: number; courts: number }>(
    sql`select
      json_extract(settings, '$.stats.teams') as teams,
      json_extract(settings, '$.stats.players') as players,
      json_extract(settings, '$.stats.matches') as matches,
      json_extract(settings, '$.stats.courts') as courts
      from tournaments where id = ${tournamentId}`
  );
  return {
    teams: Number(row?.teams ?? 0),
    players: Number(row?.players ?? 0),
    matches: Number(row?.matches ?? 0),
    courts: Number(row?.courts ?? 0)
  };
}
