import { Hono } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { adminRoute } from "../_core/route-helpers";
import { DatabaseError, executeSql } from "../_core/db";
import { getCategory } from "../services/categories";
import { generateGroupStage, generateKnockoutBracket } from "../services/draw-generator";

export const drawsRouter = new Hono();

const GenerateSchema = z.object({
  format: z.enum(["KNOCKOUT", "GROUPS", "GROUPS_PLUS_KNOCKOUT"]),
  groupSize: z.number().int().min(3).max(8).optional(),
  advancePerGroup: z.number().int().min(1).max(4).optional()
});

drawsRouter.post("/:categoryId/generate", adminRoute, async (c) => {
  const parsed = GenerateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Invalid draw generation payload"), 400);
  const categoryId = c.req.param("categoryId");

  try {
    const category = await getCategory(categoryId);

    const existing = await executeSql("SELECT COUNT(*) AS c FROM matches WHERE categoryId=?", [categoryId]);
    const existingCount = Number((existing.rows[0] as { c?: number })?.c ?? 0);
    if (existingCount > 0) {
      return c.json(apiFailure("DRAW_ALREADY_EXISTS", "This category already has a generated draw — delete its matches first if you need to regenerate."), 409);
    }

    const teamsResult = await executeSql("SELECT id, name, teamWeight FROM teams WHERE categoryId=?", [categoryId]);
    const teams = teamsResult.rows as unknown as Array<{ id: string; name: string; teamWeight: number | null }>;
    if (teams.length < 2) {
      return c.json(apiFailure("NOT_ENOUGH_TEAMS", "Register at least 2 teams before generating a draw"), 400);
    }

    if (parsed.data.format === "KNOCKOUT") {
      const result = await generateKnockoutBracket({ tournamentId: category.tournamentId, categoryId, teams });
      return c.json(apiSuccess({ format: "KNOCKOUT", ...result }), 201);
    }

    const groupSize = parsed.data.groupSize ?? 4;
    const advancePerGroup = parsed.data.format === "GROUPS_PLUS_KNOCKOUT" ? (parsed.data.advancePerGroup ?? 2) : 0;
    const result = await generateGroupStage({ tournamentId: category.tournamentId, categoryId, teams, groupSize, advancePerGroup });
    return c.json(apiSuccess({ format: parsed.data.format, ...result }), 201);
  } catch (error) {
    if (error instanceof DatabaseError) return c.json(apiFailure(error.code, error.message), error.status === 404 ? 404 : error.status === 400 ? 400 : error.status === 409 ? 409 : 500);
    return c.json(apiFailure("DRAW_GENERATE_FAILED", error instanceof Error ? error.message : "Could not generate draw"), 500);
  }
});
