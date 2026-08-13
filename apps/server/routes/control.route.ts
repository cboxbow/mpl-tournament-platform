import { Hono } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { adminRoute } from "../_core/route-helpers";
import { DatabaseError, executeSql } from "../_core/db";
import { getTournamentBySlug } from "../services/tournaments";
import { finalizeMatchResult } from "../services/competition";

export const controlRouter = new Hono();
const ScoreSchema = z.object({
  sets: z.array(z.object({
    teamAGames: z.number().int().min(0),
    teamBGames: z.number().int().min(0),
    teamATiebreak: z.number().int().min(0).optional(),
    teamBTiebreak: z.number().int().min(0).optional()
  })).min(1),
  // Required for WALKOVER/RETIRED/ABANDONED (no set count to derive it from); optional
  // for COMPLETED, where the score engine derives the winner from sets won and will
  // reject a mismatched value if one is still supplied.
  winnerTeamId: z.string().min(1).optional(),
  status: z.enum(["COMPLETED", "WALKOVER", "RETIRED", "ABANDONED"]).default("COMPLETED")
});

controlRouter.get("/:slug", adminRoute, async (c) => {
  try {
    const tournament = await getTournamentBySlug(c.req.param("slug"));
    const rows = await executeSql(`SELECT m.*, c.name AS courtName, ca.name AS categoryName, ta.name AS teamAName, tb.name AS teamBName
      FROM matches m JOIN tournament_categories ca ON ca.id=m.categoryId LEFT JOIN courts c ON c.id=m.courtId
      LEFT JOIN teams ta ON ta.id=m.teamAId LEFT JOIN teams tb ON tb.id=m.teamBId
      WHERE m.tournamentId=? ORDER BY c.sortOrder, COALESCE(m.scheduledAt,m.notBefore), m.code`, [tournament.id]);
    const overview = await executeSql(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status='LIVE' THEN 1 ELSE 0 END) AS live
      FROM matches WHERE tournamentId=?`, [tournament.id]);
    return c.json(apiSuccess({ tournament, matches: rows.rows, overview: overview.rows[0] }), 200);
  } catch (error) {
    return c.json(apiFailure("CONTROL_LOAD_FAILED", error instanceof Error ? error.message : "Unable to load control center"), 404);
  }
});

controlRouter.post("/:slug/matches/:matchId/score", adminRoute, async (c) => {
  const parsed = ScoreSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_SCORE", "Score payload is invalid"), 400);
  const slug = c.req.param("slug");
  const matchId = c.req.param("matchId");
  try {
    // Score entry is the only manual step: finalizeMatchResult runs the full
    // validate -> save -> winner/loser -> standings -> qualification -> propagate
    // -> placement -> points -> audit transaction. Nothing downstream is ever
    // typed in manually.
    const result = await finalizeMatchResult(slug, matchId, {
      sets: parsed.data.sets,
      status: parsed.data.status,
      winnerTeamId: parsed.data.winnerTeamId,
      actorUserId: c.var.currentUser.id
    });
    return c.json(apiSuccess(result), 200);
  } catch (error) {
    if (error instanceof DatabaseError) {
      return c.json(apiFailure(error.code, error.message), error.status === 404 ? 404 : error.status === 409 ? 409 : error.status === 400 ? 400 : 500);
    }
    return c.json(apiFailure("SCORE_SAVE_FAILED", error instanceof Error ? error.message : "Unable to save score"), 500);
  }
});
