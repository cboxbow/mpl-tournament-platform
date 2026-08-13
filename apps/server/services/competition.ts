import { DatabaseError, executeSql } from "../_core/db";
import { getTournamentBySlug } from "./tournaments";
import {
  DEFAULT_FORMAT_SETTINGS,
  resolveMatchWinner,
  ScoreValidationError,
  type MatchStatus,
  type SetScoreInput
} from "./score-engine";

type SqlRow = Record<string, unknown>;

export function normalizePlayerName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function calculateTeamWeight(rankA?: number | null, rankB?: number | null, override?: number | null) {
  if (override != null) return { weight: override, mode: "OVERRIDE" as const };
  if (rankA == null || rankB == null) return { weight: null, mode: "REVIEW_REQUIRED" as const };
  return { weight: rankA + rankB, mode: "AUTOMATIC" as const };
}

async function tournamentId(slug: string) {
  return (await getTournamentBySlug(slug)).id;
}

export async function competitionOverview(slug: string) {
  const id = await tournamentId(slug);
  const [teams, players, matches, courts, live, completed] = await Promise.all([
    executeSql("SELECT COUNT(*) AS count FROM teams WHERE tournamentId = ?", [id]),
    executeSql("SELECT COUNT(DISTINCT playerId) AS count FROM tournament_players WHERE tournamentId = ?", [id]),
    executeSql("SELECT COUNT(*) AS count FROM matches WHERE tournamentId = ?", [id]),
    executeSql("SELECT COUNT(*) AS count FROM courts c JOIN venues v ON v.id = c.venueId JOIN tournaments t ON t.venueId = v.id WHERE t.id = ?", [id]),
    executeSql("SELECT COUNT(*) AS count FROM matches WHERE tournamentId = ? AND status = 'LIVE'", [id]),
    executeSql("SELECT COUNT(*) AS count FROM matches WHERE tournamentId = ? AND status = 'COMPLETED'", [id])
  ]);
  const number = (r: { rows: unknown[] }) => Number((r.rows[0] as { count?: number })?.count ?? 0);
  return { teams: number(teams), players: number(players), matches: number(matches), courts: number(courts), live: number(live), completed: number(completed), remaining: Math.max(0, number(matches) - number(completed)) };
}

export async function competitionData(slug: string, section: string) {
  const id = await tournamentId(slug);
  switch (section) {
    case "teams":
      return (await executeSql(`SELECT t.*, c.name AS categoryName,
        (SELECT group_concat(p.displayName, ' · ') FROM team_members tm JOIN players p ON p.id = tm.playerId WHERE tm.teamId = t.id) AS players
        FROM teams t JOIN tournament_categories c ON c.id=t.categoryId WHERE t.tournamentId=? ORDER BY c.name, t.teamWeight`, [id])).rows;
    case "players":
      return (await executeSql(`SELECT DISTINCT p.*, tp.tournamentRanking, tp.isAssimilated, tp.eligibilityStatus
        FROM players p JOIN tournament_players tp ON tp.playerId=p.id WHERE tp.tournamentId=? ORDER BY tp.tournamentRanking`, [id])).rows;
    case "groups":
      return (await executeSql(`SELECT g.id, g.name, c.name AS categoryName, gt.seedPosition, t.id AS teamId, t.name AS teamName,
        (SELECT count(*) FROM matches m WHERE m.groupId=g.id) AS matchCount
        FROM groups g JOIN tournament_categories c ON c.id=g.categoryId JOIN group_teams gt ON gt.groupId=g.id JOIN teams t ON t.id=gt.teamId
        WHERE g.tournamentId=? ORDER BY c.name,g.sortOrder,gt.seedPosition`, [id])).rows;
    case "schedule":
      return (await executeSql(`SELECT m.*, c.name AS courtName, ca.name AS categoryName, ta.name AS teamAName, tb.name AS teamBName
        FROM matches m JOIN tournament_categories ca ON ca.id=m.categoryId
        LEFT JOIN courts c ON c.id=m.courtId LEFT JOIN teams ta ON ta.id=m.teamAId LEFT JOIN teams tb ON tb.id=m.teamBId
        WHERE m.tournamentId=? ORDER BY COALESCE(m.scheduledAt,m.notBefore), m.code`, [id])).rows;
    case "live":
      return (await executeSql(`SELECT m.*, c.name AS courtName, ca.name AS categoryName, ta.name AS teamAName, tb.name AS teamBName
        FROM matches m JOIN tournament_categories ca ON ca.id=m.categoryId LEFT JOIN courts c ON c.id=m.courtId
        LEFT JOIN teams ta ON ta.id=m.teamAId LEFT JOIN teams tb ON tb.id=m.teamBId
        WHERE m.tournamentId=? AND m.status IN ('LIVE','CALLED','WARMING_UP','DELAYED') ORDER BY c.sortOrder`, [id])).rows;
    case "results":
      return (await executeSql(`SELECT r.*, c.name AS categoryName, t.name AS teamName,
        (SELECT group_concat(p.displayName, ' · ') FROM team_members tm JOIN players p ON p.id=tm.playerId WHERE tm.teamId=t.id) AS players
        FROM tournament_results r JOIN tournament_categories c ON c.id=r.categoryId LEFT JOIN teams t ON t.id=r.teamId
        WHERE r.tournamentId=? ORDER BY c.name, COALESCE(r.position,r.positionMin), t.name`, [id])).rows;
    case "draws":
    case "classification":
      return (await executeSql(`SELECT m.*, c.name AS categoryName, ta.name AS teamAName, tb.name AS teamBName
        FROM matches m JOIN tournament_categories c ON c.id=m.categoryId LEFT JOIN teams ta ON ta.id=m.teamAId LEFT JOIN teams tb ON tb.id=m.teamBId
        WHERE m.tournamentId=? AND m.stage=? ORDER BY c.name,m.round,m.code`, [id, section === "classification" ? "CLASSIFICATION" : "MAIN_DRAW"])).rows;
    default:
      return [];
  }
}

const COMPLETED_STATUSES = ["COMPLETED", "WALKOVER", "RETIRED", "ABANDONED"];

async function getTiebreakMetrics(tournamentId: string, categoryId: string): Promise<string[]> {
  const rows = (
    await executeSql(
      "SELECT metric FROM group_tiebreak_rules WHERE tournamentId=? AND (categoryId=? OR categoryId IS NULL) ORDER BY priority",
      [tournamentId, categoryId]
    )
  ).rows as SqlRow[];
  const metrics = rows.map((r) => String(r.metric));
  return metrics.length ? metrics : ["wins", "gameDifference"];
}

type StandingRow = {
  teamId: string;
  teamName: string;
  categoryId: string;
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  gameDifference: number;
};

function compareByMetrics(a: StandingRow, b: StandingRow, metrics: string[]) {
  for (const metric of metrics) {
    let diff = 0;
    if (metric === "wins") diff = b.won - a.won;
    else if (metric === "gameDifference") diff = b.gameDifference - a.gameDifference;
    else if (metric === "gamesWon") diff = b.gamesWon - a.gamesWon;
    if (diff !== 0) return diff;
  }
  return a.teamName.localeCompare(b.teamName);
}

/** Compute ranked standings for a single group: played/won/lost, games won/lost, game difference, position. */
export async function computeGroupStandings(tournamentId: string, groupId: string): Promise<StandingRow[]> {
  const teamsRows = (
    await executeSql(`SELECT t.id AS teamId, t.name AS teamName, t.categoryId AS categoryId FROM group_teams gt JOIN teams t ON t.id=gt.teamId WHERE gt.groupId=?`, [groupId])
  ).rows as SqlRow[];
  if (!teamsRows.length) return [];
  const categoryId = String(teamsRows[0].categoryId);

  const matchRows = (
    await executeSql(`SELECT id, teamAId, teamBId, winnerTeamId, status FROM matches WHERE groupId=?`, [groupId])
  ).rows as SqlRow[];
  const setsRows = (
    await executeSql(
      `SELECT ms.matchId, ms.teamAGames, ms.teamBGames, m.teamAId, m.teamBId FROM match_sets ms JOIN matches m ON m.id=ms.matchId WHERE m.groupId=?`,
      [groupId]
    )
  ).rows as SqlRow[];

  const stats = new Map<string, StandingRow>();
  for (const t of teamsRows) {
    stats.set(String(t.teamId), {
      teamId: String(t.teamId),
      teamName: String(t.teamName),
      categoryId: String(t.categoryId),
      played: 0,
      won: 0,
      lost: 0,
      gamesWon: 0,
      gamesLost: 0,
      gameDifference: 0
    });
  }
  for (const m of matchRows) {
    if (!COMPLETED_STATUSES.includes(String(m.status))) continue;
    for (const side of ["teamAId", "teamBId"] as const) {
      const teamId = m[side] ? String(m[side]) : null;
      if (!teamId) continue;
      const row = stats.get(teamId);
      if (!row) continue;
      row.played += 1;
      if (m.winnerTeamId === teamId) row.won += 1;
      else if (m.winnerTeamId) row.lost += 1;
    }
  }
  for (const s of setsRows) {
    const a = s.teamAId ? stats.get(String(s.teamAId)) : undefined;
    const b = s.teamBId ? stats.get(String(s.teamBId)) : undefined;
    const gamesA = Number(s.teamAGames ?? 0);
    const gamesB = Number(s.teamBGames ?? 0);
    if (a) { a.gamesWon += gamesA; a.gamesLost += gamesB; }
    if (b) { b.gamesWon += gamesB; b.gamesLost += gamesA; }
  }
  for (const row of stats.values()) row.gameDifference = row.gamesWon - row.gamesLost;

  const metrics = await getTiebreakMetrics(tournamentId, categoryId);
  return Array.from(stats.values()).sort((a, b) => compareByMetrics(a, b, metrics));
}

export async function calculateGroupStandings(slug: string) {
  const id = await tournamentId(slug);
  const groups = (
    await executeSql(`SELECT g.id, g.name AS groupName, c.name AS categoryName FROM groups g JOIN tournament_categories c ON c.id=g.categoryId WHERE g.tournamentId=? ORDER BY c.name, g.sortOrder`, [id])
  ).rows as SqlRow[];
  const out: SqlRow[] = [];
  for (const g of groups) {
    const rows = await computeGroupStandings(id, String(g.id));
    rows.forEach((row, index) => {
      out.push({ groupName: g.groupName, categoryName: g.categoryName, position: index + 1, ...row });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Automatic result propagation (score -> standings -> qualification -> bracket
// -> classification -> results -> points -> audit), per M1000 CANA flow spec.
// ---------------------------------------------------------------------------

async function resolveGroupIfComplete(tournamentId: string, groupId: string) {
  const marker = (
    await executeSql("SELECT COUNT(*) AS c FROM audit_logs WHERE entityType='GROUP' AND entityId=? AND action='GROUP_QUALIFICATION_RESOLVED'", [groupId])
  ).rows[0] as SqlRow;
  if (Number(marker.c) > 0) return { resolved: true, alreadyResolved: true };

  const totalRow = (
    await executeSql(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('COMPLETED','WALKOVER','RETIRED','ABANDONED') THEN 1 ELSE 0 END) AS done FROM matches WHERE groupId=?`,
      [groupId]
    )
  ).rows[0] as SqlRow;
  if (Number(totalRow.total) === 0 || Number(totalRow.done) < Number(totalRow.total)) return { resolved: false };

  const standings = await computeGroupStandings(tournamentId, groupId);
  const rules = (await executeSql("SELECT * FROM group_qualification_rules WHERE groupId=? ORDER BY position", [groupId])).rows as SqlRow[];
  const ruleByPosition = new Map(rules.map((r) => [Number(r.position), r]));

  const outcomes: SqlRow[] = [];
  for (const [index, team] of standings.entries()) {
    const position = index + 1;
    const rule = ruleByPosition.get(position);
    if (rule && rule.targetMatchId && (rule.targetSlot === "A" || rule.targetSlot === "B")) {
      const column = rule.targetSlot === "A" ? "teamAId" : "teamBId";
      const targetMatchId = String(rule.targetMatchId);
      await executeSql(`UPDATE matches SET ${column}=? WHERE id=?`, [team.teamId, targetMatchId]);
      outcomes.push({ teamId: team.teamId, position, qualified: true, targetMatchId, targetSlot: rule.targetSlot });
    } else {
      await executeSql(
        `INSERT INTO tournament_results (id,tournamentId,categoryId,teamId,position,positionMin,positionMax,status,points)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(tournamentId,categoryId,teamId) DO UPDATE SET status=excluded.status`,
        [crypto.randomUUID(), tournamentId, team.categoryId, team.teamId, null, null, null, "ELIMINATED_IN_QUALIFYING", null]
      );
      outcomes.push({ teamId: team.teamId, position, qualified: false });
    }
  }

  await executeSql(
    "INSERT INTO audit_logs (id,tournamentId,actorUserId,action,entityType,entityId,afterState,severity) VALUES (?,?,?,?,?,?,?,?)",
    [crypto.randomUUID(), tournamentId, null, "GROUP_QUALIFICATION_RESOLVED", "GROUP", groupId, JSON.stringify({ standings, outcomes }), "INFO"]
  );

  return { resolved: true, standings, outcomes };
}

async function propagateMatchOutcome(matchId: string, winnerTeamId: string, loserTeamId: string) {
  const deps = (await executeSql("SELECT * FROM match_dependencies WHERE sourceMatchId=?", [matchId])).rows as SqlRow[];
  const updates: SqlRow[] = [];
  for (const dep of deps) {
    if (dep.targetSlot !== "A" && dep.targetSlot !== "B") continue;
    const teamId = dep.outcome === "WINNER" ? winnerTeamId : loserTeamId;
    const column = dep.targetSlot === "A" ? "teamAId" : "teamBId";
    const targetMatchId = String(dep.targetMatchId);
    await executeSql(`UPDATE matches SET ${column}=? WHERE id=?`, [teamId, targetMatchId]);
    updates.push({ targetMatchId, targetSlot: dep.targetSlot, teamId, outcome: dep.outcome });
  }
  return updates;
}

async function lookupPoints(tournamentId: string, categoryId: string, teamCount: number, position: number): Promise<number | null> {
  const rows = (
    await executeSql(
      `SELECT points FROM points_rules WHERE tournamentId=? AND (categoryId=? OR categoryId IS NULL) AND finalPosition=?
       AND (teamsMin IS NULL OR teamsMin<=?) AND (teamsMax IS NULL OR teamsMax>=?)
       ORDER BY (categoryId IS NULL) LIMIT 1`,
      [tournamentId, categoryId, position, teamCount, teamCount]
    )
  ).rows as SqlRow[];
  return rows.length ? Number(rows[0].points) : null;
}

async function resolvePlacementBindings(tournamentId: string, categoryId: string, matchId: string, winnerTeamId: string, loserTeamId: string) {
  const bindings = (await executeSql("SELECT * FROM match_result_bindings WHERE matchId=?", [matchId])).rows as SqlRow[];
  if (!bindings.length) return null;
  const teamCountRow = (await executeSql("SELECT COUNT(*) AS c FROM teams WHERE tournamentId=? AND categoryId=?", [tournamentId, categoryId])).rows[0] as SqlRow;
  const teamCount = Number(teamCountRow.c ?? 0);
  const results: SqlRow[] = [];
  for (const b of bindings) {
    const teamId = b.outcome === "WINNER" ? winnerTeamId : loserTeamId;
    const positionMin = Number(b.positionMin);
    const positionMax = Number(b.positionMax);
    const position = positionMin === positionMax ? positionMin : null;
    const points = await lookupPoints(tournamentId, categoryId, teamCount, positionMin);
    await executeSql(
      `INSERT INTO tournament_results (id,tournamentId,categoryId,teamId,position,positionMin,positionMax,status,points)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(tournamentId,categoryId,teamId) DO UPDATE SET position=excluded.position, positionMin=excluded.positionMin, positionMax=excluded.positionMax, status=excluded.status, points=excluded.points`,
      [crypto.randomUUID(), tournamentId, categoryId, teamId, position, positionMin, positionMax, "FINAL", points]
    );
    results.push({ teamId, positionMin, positionMax, points });
  }
  return results;
}

export interface FinalizeMatchInput {
  sets: SetScoreInput[];
  status: MatchStatus;
  winnerTeamId?: string;
  actorUserId?: string | null;
}

/**
 * The full automatic-propagation transaction: validate score -> save sets -> determine
 * winner/loser -> mark completed -> recalc group standings -> resolve qualification ->
 * propagate winner/loser into dependent matches -> resolve final placement + points ->
 * audit. This is the single entry point score entry should call — nothing downstream
 * is ever typed in manually.
 */
export async function finalizeMatchResult(slug: string, matchId: string, input: FinalizeMatchInput) {
  const tournament = await getTournamentBySlug(slug);
  const tid = tournament.id;

  const match = (await executeSql("SELECT * FROM matches WHERE id=? AND tournamentId=?", [matchId, tid])).rows[0] as SqlRow | undefined;
  if (!match) throw new DatabaseError("DATABASE_QUERY_FAILED", "Match not found", 404);
  if (!match.teamAId || !match.teamBId) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "Match is missing one or both teams — upstream result not yet propagated", 409);
  }

  let resolved;
  try {
    resolved = resolveMatchWinner({
      status: input.status,
      sets: input.sets,
      teamAId: String(match.teamAId),
      teamBId: String(match.teamBId),
      declaredWinnerId: input.winnerTeamId,
      format: DEFAULT_FORMAT_SETTINGS
    });
  } catch (error) {
    if (error instanceof ScoreValidationError) throw new DatabaseError("DATABASE_QUERY_FAILED", error.message, 400);
    throw error;
  }

  const now = new Date().toISOString();
  await executeSql("DELETE FROM match_sets WHERE matchId=?", [matchId]);
  for (const [index, set] of input.sets.entries()) {
    await executeSql(
      "INSERT INTO match_sets (id,matchId,setNumber,teamAGames,teamBGames,teamATiebreak,teamBTiebreak) VALUES (?,?,?,?,?,?,?)",
      [`${matchId}-set-${index + 1}`, matchId, index + 1, set.teamAGames, set.teamBGames, set.teamATiebreak ?? null, set.teamBTiebreak ?? null]
    );
  }

  await executeSql("UPDATE matches SET winnerTeamId=?, loserTeamId=?, status=?, scoreStatus=?, updatedAt=? WHERE id=?", [
    resolved.winnerTeamId,
    resolved.loserTeamId,
    input.status,
    JSON.stringify({ sets: input.sets, setsWonA: resolved.setsWonA, setsWonB: resolved.setsWonB }),
    now,
    matchId
  ]);

  const groupResolution = match.groupId ? await resolveGroupIfComplete(tid, String(match.groupId)) : null;
  const propagated = await propagateMatchOutcome(matchId, resolved.winnerTeamId, resolved.loserTeamId);
  const placement = await resolvePlacementBindings(tid, String(match.categoryId), matchId, resolved.winnerTeamId, resolved.loserTeamId);

  await executeSql(
    "INSERT INTO audit_logs (id,tournamentId,actorUserId,action,entityType,entityId,afterState,severity) VALUES (?,?,?,?,?,?,?,?)",
    [
      crypto.randomUUID(),
      tid,
      input.actorUserId ?? null,
      "MATCH_RESULT_PROPAGATED",
      "MATCH",
      matchId,
      JSON.stringify({ winnerTeamId: resolved.winnerTeamId, loserTeamId: resolved.loserTeamId, status: input.status, propagated, groupResolution, placement }),
      "INFO"
    ]
  );

  return { matchId, winnerTeamId: resolved.winnerTeamId, loserTeamId: resolved.loserTeamId, propagated, groupResolution, placement };
}
