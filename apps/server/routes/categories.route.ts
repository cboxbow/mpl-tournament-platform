import { Hono } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { adminRoute, publicRoute } from "../_core/route-helpers";
import { DatabaseError } from "../_core/db";
import { getTournamentBySlug } from "../services/tournaments";
import { createCategory, deleteCategory, listCategories, updateCategory } from "../services/categories";

export const categoriesRouter = new Hono();

const CreateSchema = z.object({
  tournamentSlug: z.string().min(1),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  gender: z.enum(["MEN", "WOMEN", "MIXED"]).optional()
});
const UpdateSchema = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  gender: z.enum(["MEN", "WOMEN", "MIXED"]).optional()
});

categoriesRouter.get("/", publicRoute, async (c) => {
  const slug = c.req.query("tournamentSlug");
  if (!slug) return c.json(apiFailure("MISSING_TOURNAMENT", "tournamentSlug query param is required"), 400);
  try {
    const tournament = await getTournamentBySlug(slug);
    return c.json(apiSuccess({ categories: await listCategories(tournament.id) }), 200);
  } catch (error) {
    return c.json(apiFailure("TOURNAMENT_NOT_FOUND", error instanceof Error ? error.message : "Not found"), 404);
  }
});

categoriesRouter.post("/", adminRoute, async (c) => {
  const parsed = CreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Invalid category payload"), 400);
  try {
    const tournament = await getTournamentBySlug(parsed.data.tournamentSlug);
    const category = await createCategory({
      tournamentId: tournament.id,
      code: parsed.data.code,
      name: parsed.data.name,
      gender: parsed.data.gender
    });
    return c.json(apiSuccess({ category }), 201);
  } catch (error) {
    return c.json(apiFailure("CATEGORY_CREATE_FAILED", error instanceof Error ? error.message : "Could not create category"), 409);
  }
});

categoriesRouter.patch("/:categoryId", adminRoute, async (c) => {
  const parsed = UpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Invalid category payload"), 400);
  try {
    const category = await updateCategory(c.req.param("categoryId"), parsed.data);
    return c.json(apiSuccess({ category }), 200);
  } catch (error) {
    if (error instanceof DatabaseError) return c.json(apiFailure(error.code, error.message), error.status === 404 ? 404 : 500);
    return c.json(apiFailure("CATEGORY_UPDATE_FAILED", "Could not update category"), 500);
  }
});

categoriesRouter.delete("/:categoryId", adminRoute, async (c) => {
  await deleteCategory(c.req.param("categoryId"));
  return c.json(apiSuccess({ deleted: true }), 200);
});
