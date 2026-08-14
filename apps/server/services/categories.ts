import { asc, eq } from "drizzle-orm";
import { DatabaseError, getDb } from "../_core/db";
import { tournamentCategories } from "../db/schema";

export async function listCategories(tournamentId: string) {
  return getDb()
    .select()
    .from(tournamentCategories)
    .where(eq(tournamentCategories.tournamentId, tournamentId))
    .orderBy(asc(tournamentCategories.name));
}

export async function getCategory(categoryId: string) {
  const row = (
    await getDb().select().from(tournamentCategories).where(eq(tournamentCategories.id, categoryId)).limit(1)
  )[0];
  if (!row) throw new DatabaseError("DATABASE_QUERY_FAILED", "Category not found", 404);
  return row;
}

export async function createCategory(input: { tournamentId: string; code: string; name: string; gender?: string | null }) {
  const id = crypto.randomUUID();
  const row = (
    await getDb()
      .insert(tournamentCategories)
      .values({ id, tournamentId: input.tournamentId, code: input.code, name: input.name, gender: input.gender ?? null })
      .returning()
  )[0];
  return row;
}

export async function updateCategory(categoryId: string, input: { code?: string; name?: string; gender?: string | null }) {
  const row = (
    await getDb().update(tournamentCategories).set(input).where(eq(tournamentCategories.id, categoryId)).returning()
  )[0];
  if (!row) throw new DatabaseError("DATABASE_QUERY_FAILED", "Category not found", 404);
  return row;
}

export async function deleteCategory(categoryId: string) {
  await getDb().delete(tournamentCategories).where(eq(tournamentCategories.id, categoryId));
}
