import { Hono } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { adminRoute } from "../_core/route-helpers";
import { DatabaseError } from "../_core/db";
import { getAuth } from "../_core/auth";
import { adminSetUserPassword, listUsers, setUserRole } from "../services/users";

export const usersRouter = new Hono();

// Admin-only account management. There is no self-serve signup surface for
// admin accounts — new admins/staff logins are created here by an existing
// admin, matching how the very first admin account was bootstrapped
// (better-auth's own signUpEmail API, so the stored password hash always
// matches whatever hashing better-auth is configured with).
usersRouter.get("/", adminRoute, async (c) => {
  return c.json(apiSuccess({ users: await listUsers() }), 200);
});

const CreateUserSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1),
  role: z.enum(["user", "admin"]).default("user")
});
usersRouter.post("/", adminRoute, async (c) => {
  const parsed = CreateUserSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "email, password (min 8 chars) and name are required"), 400);
  try {
    const auth = getAuth();
    await auth.api.signUpEmail({ body: { email: parsed.data.email, password: parsed.data.password, name: parsed.data.name } });
    const created = await setUserRole(
      (await listUsers()).find((u) => u.email === parsed.data.email)?.id ?? "",
      parsed.data.role,
      c.var.currentUser.id
    );
    return c.json(apiSuccess({ user: created }), 201);
  } catch (error) {
    if (error instanceof DatabaseError) return c.json(apiFailure(error.code, error.message), error.status === 404 ? 404 : error.status === 400 ? 400 : 500);
    const message = error instanceof Error ? error.message : "Could not create user";
    return c.json(apiFailure("USER_CREATE_FAILED", message), 409);
  }
});

const RoleSchema = z.object({ role: z.enum(["user", "admin"]) });
usersRouter.patch("/:userId/role", adminRoute, async (c) => {
  const parsed = RoleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "role must be 'user' or 'admin'"), 400);
  try {
    const updated = await setUserRole(c.req.param("userId"), parsed.data.role, c.var.currentUser.id);
    return c.json(apiSuccess({ user: updated }), 200);
  } catch (error) {
    if (error instanceof DatabaseError) return c.json(apiFailure(error.code, error.message), error.status === 404 ? 404 : error.status === 400 ? 400 : 500);
    return c.json(apiFailure("ROLE_UPDATE_FAILED", "Could not update role"), 500);
  }
});

const PasswordSchema = z.object({ password: z.string().min(8) });
usersRouter.patch("/:userId/password", adminRoute, async (c) => {
  const parsed = PasswordSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "password must be at least 8 characters"), 400);
  try {
    await adminSetUserPassword(c.req.param("userId"), parsed.data.password);
    return c.json(apiSuccess({ reset: true }), 200);
  } catch (error) {
    if (error instanceof DatabaseError) return c.json(apiFailure(error.code, error.message), error.status === 404 ? 404 : error.status === 400 ? 400 : 500);
    return c.json(apiFailure("PASSWORD_RESET_FAILED", "Could not reset password"), 500);
  }
});
