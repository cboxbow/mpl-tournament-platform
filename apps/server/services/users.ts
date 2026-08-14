import { eq, and } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { getDb, DatabaseError } from "../_core/db";
import { user, account, session } from "../db/schema";

export async function listUsers() {
  return getDb()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt
    })
    .from(user)
    .orderBy(user.createdAt);
}

export async function setUserRole(userId: string, role: "user" | "admin", actorUserId: string) {
  if (userId === actorUserId && role === "user") {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "You can't remove your own admin access — have another admin do it.", 400);
  }
  const rows = await getDb().update(user).set({ role }).where(eq(user.id, userId)).returning();
  if (!rows.length) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "User not found", 404);
  }
  return rows[0];
}


/**
 * Admin-initiated password reset: sets a new password for a user's
 * credential account directly (hashed with better-auth's own hashPassword so
 * it verifies identically to a normal sign-up/sign-in), then revokes their
 * existing sessions so a possibly-compromised session can't outlive the
 * reset. There is no outbound email configured for this project yet (see
 * the TODO in _core/auth.ts), so there is no working self-serve "forgot
 * password" link — an admin sets a temporary password here and shares it
 * with the user directly instead.
 */
export async function adminSetUserPassword(userId: string, newPassword: string) {
  const db = getDb();
  const accountRow = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  if (!accountRow.length) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "This user has no email/password login to reset (they may only use Google sign-in)", 400);
  }
  const hash = await hashPassword(newPassword);
  await db.update(account).set({ password: hash }).where(eq(account.id, accountRow[0].id));
  await db.delete(session).where(eq(session.userId, userId));
}
