import { and, eq, like, sql as drizzleSql } from "drizzle-orm";
import { DatabaseError, executeSql, getDb } from "../_core/db";
import { players, teamMembers, teams, tournamentPlayers } from "../db/schema";
import { calculateTeamWeight, normalizePlayerName } from "./competition";

function slugify(value: string) {
  return normalizePlayerName(value).replace(/\s+/g, "-");
}

export async function searchPlayers(query: string) {
  if (!query.trim()) return [];
  return getDb()
    .select()
    .from(players)
    .where(like(players.displayName, `%${query.trim()}%`))
    .limit(20);
}

export async function createPlayer(input: { firstName: string; lastName: string; gender?: string | null; currentRanking?: number | null }) {
  const displayName = `${input.firstName} ${input.lastName}`.trim().toUpperCase();
  const slug = slugify(displayName) || crypto.randomUUID();
  const id = crypto.randomUUID();
  const row = (
    await getDb()
      .insert(players)
      .values({
        id,
        mplPlayerId: `MPL-${slug}`,
        firstName: input.firstName.trim().toUpperCase(),
        lastName: input.lastName.trim().toUpperCase(),
        displayName,
        slug,
        gender: input.gender ?? null,
        currentRanking: input.currentRanking ?? null
      })
      .returning()
  )[0];
  return row;
}

export async function listTeamsForCategory(categoryId: string) {
  const rows = await executeSql(
    `SELECT t.*, (SELECT group_concat(p.displayName, ' / ') FROM team_members tm JOIN players p ON p.id=tm.playerId WHERE tm.teamId=t.id ORDER BY tm.slot) AS players
     FROM teams t WHERE t.categoryId=? ORDER BY t.teamWeight IS NULL, t.teamWeight`,
    [categoryId]
  );
  return rows.rows;
}

export interface RegisterTeamInput {
  tournamentId: string;
  categoryId: string;
  playerIds: string[];
  name?: string;
  weightOverride?: number | null;
}

/**
 * Registers a team (1-2 players, singles or doubles) into a category: creates
 * the team row (auto-computed weight = sum of currentRanking, lower is
 * stronger — same convention as the CANA seed data), team_members, and a
 * tournament_players row per player so they show up in the public Players
 * list and are eligible for seeding.
 */
export async function registerTeam(input: RegisterTeamInput) {
  // Padel is always doubles — two players per team, no singles format.
  if (input.playerIds.length !== 2) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "A padel team needs exactly 2 players", 400);
  }
  const db = getDb();
  const playerRows = await db.select().from(players).where(drizzleSql`${players.id} IN ${input.playerIds}`);
  if (playerRows.length !== input.playerIds.length) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "One or more players not found", 404);
  }

  const name = input.name?.trim() || playerRows.map((p) => p.displayName).join(" / ");
  const { weight, mode } = calculateTeamWeight(playerRows[0]?.currentRanking, playerRows[1]?.currentRanking, input.weightOverride ?? null);

  const teamId = crypto.randomUUID();
  const team = (
    await db
      .insert(teams)
      .values({
        id: teamId,
        tournamentId: input.tournamentId,
        categoryId: input.categoryId,
        name,
        teamWeight: weight,
        weightMode: mode,
        weightOverride: input.weightOverride ?? null,
        status: "CONFIRMED"
      })
      .returning()
  )[0];

  for (const [index, player] of playerRows.entries()) {
    await db.insert(teamMembers).values({
      id: crypto.randomUUID(),
      teamId,
      playerId: player.id,
      slot: index + 1,
      tournamentRanking: player.currentRanking
    });
    const existing = await db
      .select()
      .from(tournamentPlayers)
      .where(and(eq(tournamentPlayers.tournamentId, input.tournamentId), eq(tournamentPlayers.playerId, player.id), eq(tournamentPlayers.categoryId, input.categoryId)))
      .limit(1);
    if (!existing.length) {
      await db.insert(tournamentPlayers).values({
        id: crypto.randomUUID(),
        tournamentId: input.tournamentId,
        playerId: player.id,
        categoryId: input.categoryId,
        officialRanking: player.currentRanking,
        tournamentRanking: player.currentRanking,
        eligibilityStatus: "CONFIRMED"
      });
    }
  }

  return team;
}

export async function deleteTeam(teamId: string) {
  await getDb().delete(teams).where(eq(teams.id, teamId));
}
