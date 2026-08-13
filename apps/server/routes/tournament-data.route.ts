import { Hono } from "hono";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { publicRoute } from "../_core/route-helpers";
import { competitionData, competitionOverview, calculateGroupStandings } from "../services/competition";

export const isPublic = true;
export const tournamentDataRouter = new Hono();

tournamentDataRouter.get("/:slug/overview", publicRoute, async (c) => {
  try {
    return c.json(apiSuccess({ overview: await competitionOverview(c.req.param("slug")) }), 200);
  } catch (error) {
    return c.json(apiFailure("TOURNAMENT_DATA_FAILED", error instanceof Error ? error.message : "Unable to load tournament"), 404);
  }
});

tournamentDataRouter.get("/:slug/:section", publicRoute, async (c) => {
  const section = c.req.param("section");
  if (section === "standings") {
    try {
      return c.json(apiSuccess({ rows: await calculateGroupStandings(c.req.param("slug")) }), 200);
    } catch (error) {
      return c.json(apiFailure("STANDINGS_FAILED", error instanceof Error ? error.message : "Unable to load standings"), 404);
    }
  }
  const allowed = ["live", "schedule", "groups", "draws", "classification", "teams", "players", "results"];
  if (!allowed.includes(section)) return c.json(apiFailure("INVALID_SECTION", "Unknown tournament data section"), 400);
  try {
    return c.json(apiSuccess({ rows: await competitionData(c.req.param("slug"), section) }), 200);
  } catch (error) {
    return c.json(apiFailure("TOURNAMENT_DATA_FAILED", error instanceof Error ? error.message : "Unable to load tournament data"), 404);
  }
});
