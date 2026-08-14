import { Hono } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { adminRoute } from "../_core/route-helpers";
import { DatabaseError } from "../_core/db";
import { getTournamentBySlug } from "../services/tournaments";
import { createPlayer, deleteTeam, listTeamsForCategory, registerTeam, searchPlayers } from "../services/entries";

export const entriesRouter = new Hono();

entriesRouter.get("/players/search", adminRoute, async (c) => {
  const q = c.req.query("q") ?? "";
  return c.json(apiSuccess({ players: await searchPlayers(q) }), 200);
});

const CreatePlayerSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  gender: z.enum(["MEN", "WOMEN"]).optional(),
  currentRanking: z.number().int().positive().optional()
});
entriesRouter.post("/players", adminRoute, async (c) => {
  const parsed = CreatePlayerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Invalid player payload"), 400);
  const player = await createPlayer(parsed.data);
  return c.json(apiSuccess({ player }), 201);
});

entriesRouter.get("/teams", adminRoute, async (c) => {
  const categoryId = c.req.query("categoryId");
  if (!categoryId) return c.json(apiFailure("MISSING_CATEGORY", "categoryId query param is required"), 400);
  return c.json(apiSuccess({ teams: await listTeamsForCategory(categoryId) }), 200);
});

const RegisterTeamSchema = z.object({
  tournamentSlug: z.string().min(1),
  categoryId: z.string().min(1),
  playerIds: z.array(z.string().min(1)).length(2),
  name: z.string().trim().optional(),
  weightOverride: z.number().int().positive().optional()
});
entriesRouter.post("/teams", adminRoute, async (c) => {
  const parsed = RegisterTeamSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Invalid team payload"), 400);
  try {
    const tournament = await getTournamentBySlug(parsed.data.tournamentSlug);
    const team = await registerTeam({
      tournamentId: tournament.id,
      categoryId: parsed.data.categoryId,
      playerIds: parsed.data.playerIds,
      name: parsed.data.name,
      weightOverride: parsed.data.weightOverride ?? null
    });
    return c.json(apiSuccess({ team }), 201);
  } catch (error) {
    if (error instanceof DatabaseError) return c.json(apiFailure(error.code, error.message), error.status === 404 ? 404 : error.status === 400 ? 400 : 500);
    return c.json(apiFailure("TEAM_REGISTER_FAILED", "Could not register team"), 500);
  }
});

entriesRouter.delete("/teams/:teamId", adminRoute, async (c) => {
  await deleteTeam(c.req.param("teamId"));
  return c.json(apiSuccess({ deleted: true }), 200);
});
