import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { config, schema } from "../config.js";
import { query } from "../db.js";

export type AdminRole = "super_admin" | "reviewer";
type AdminUser = { user_id: string; email: string; password_hash: string; display_name: string; role: AdminRole; is_active: boolean };

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string; role: AdminRole; name: string };
    user: { sub: string; email: string; role: AdminRole; name: string };
  }
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function publicUser(user: AdminUser) { return { id: user.user_id, email: user.email, name: user.display_name, role: user.role }; }

async function bootstrapAdmin() {
  if (!config.auth.bootstrapEmail || !config.auth.bootstrapPassword) return;
  const email = config.auth.bootstrapEmail.trim().toLowerCase();
  const exists = await query("SELECT 1 FROM " + schema + ".admin_users WHERE email = $1", [email]);
  if (exists.rowCount) return;
  const hash = await bcrypt.hash(config.auth.bootstrapPassword, 12);
  await query(`INSERT INTO ${schema}.admin_users (user_id, email, password_hash, display_name, role) VALUES ($1,$2,$3,$4,'super_admin')`, [randomUUID(), email, hash, config.auth.bootstrapName]);
}

export async function requireAdmin(request: FastifyRequest, roles: AdminRole[] = ["super_admin", "reviewer"]) {
  await request.jwtVerify();
  if (!roles.includes(request.user.role)) {
    const error = new Error("Bạn không có quyền thực hiện thao tác này.");
    Object.assign(error, { statusCode: 403 });
    throw error;
  }
  return request.user;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  await bootstrapAdmin();

  app.post<{ Body: { email?: string; password?: string } }>("/auth/login", { schema: { tags: ["Administration"], summary: "Admin login" } }, async (request, reply) => {
    if (!config.auth.jwtSecret) return reply.code(503).send({ error: "AUTH_NOT_CONFIGURED", message: "JWT_SECRET chưa được cấu hình." });
    const email = text(request.body?.email).toLowerCase();
    const password = text(request.body?.password);
    if (!email || !password) return reply.code(400).send({ error: "VALIDATION_ERROR", message: "Vui lòng nhập email và mật khẩu." });
    const result = await query<AdminUser>(`SELECT user_id, email, password_hash, display_name, role, is_active FROM ${schema}.admin_users WHERE email = $1`, [email]);
    const user = result.rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) return reply.code(401).send({ error: "INVALID_CREDENTIALS", message: "Email hoặc mật khẩu không đúng." });
    await query(`UPDATE ${schema}.admin_users SET last_login_at = now(), updated_at = now() WHERE user_id = $1`, [user.user_id]);
    const admin = publicUser(user);
    const token = app.jwt.sign({ sub: admin.id, email: admin.email, role: admin.role, name: admin.name }, { expiresIn: "8h" });
    return { data: { token, user: admin } };
  });

  app.get("/auth/me", { schema: { tags: ["Administration"], summary: "Current admin session" } }, async (request) => {
    const session = await requireAdmin(request);
    return { data: { id: session.sub, email: session.email, name: session.name, role: session.role } };
  });
};
