import { Hono } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { adminRoute, publicRoute } from "../_core/route-helpers";
import {
  createTournament,
  getTournamentBySlug,
  listTournaments,
  TOURNAMENT_LEVELS,
  TOURNAMENT_STATUSES,
  tournamentCounts
} from "../services/tournaments";

const CreateTournamentSchema = z.object({
  slug: z.string().trim().min(3).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(3),
  shortName: z.string().trim().optional(),
  season: z.number().int().min(2020).max(2100),
  level: z.enum(TOURNAMENT_LEVELS),
  venueId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(TOURNAMENT_STATUSES).default("DRAFT"),
  description: z.string().optional(),
  organiser: z.string().optional(),
  referee: z.string().optional(),
  logo: z.string().optional(),
  coverImage: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional()
});

export const tournamentsRouter = new Hono();

tournamentsRouter.get("", publicRoute, async (c) => {
  const status = c.req.query("status");
  if (status && !TOURNAMENT_STATUSES.includes(status as (typeof TOURNAMENT_STATUSES)[number])) {
    return c.json(apiFailure("INVALID_STATUS", "Unknown tournament status"), 400);
  }
  return c.json(apiSuccess({ tournaments: await listTournaments(status) }), 200);
});
tournamentsRouter.get("/", publicRoute, async (c) => {
  const status = c.req.query("status");
  return c.json(apiSuccess({ tournaments: await listTournaments(status) }), 200);
});

tournamentsRouter.get("/:slug", publicRoute, async (c) => {
  try {
    const tournament = await getTournamentBySlug(c.req.param("slug"));
    return c.json(apiSuccess({ tournament, counts: await tournamentCounts(tournament.id) }), 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tournament not found";
    return c.json(apiFailure("TOURNAMENT_NOT_FOUND", message), 404);
  }
});

tournamentsRouter.post("", adminRoute, async (c) => {
  const parsed = CreateTournamentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Invalid tournament payload"), 400);
  try {
    const tournament = await createTournament(parsed.data);
    return c.json(apiSuccess({ tournament }), 201);
  } catch {
    return c.json(apiFailure("TOURNAMENT_CREATE_FAILED", "Could not create tournament"), 409);
  }
});
tournamentsRouter.post("/", adminRoute, async (c) => {
  const parsed = CreateTournamentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Invalid tournament payload"), 400);
  try {
    const tournament = await createTournament(parsed.data);
    return c.json(apiSuccess({ tournament }), 201);
  } catch {
    return c.json(apiFailure("TOURNAMENT_CREATE_FAILED", "Could not create tournament"), 409);
  }
});
