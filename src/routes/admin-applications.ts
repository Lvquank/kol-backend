import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { schema } from "../config.js";
import { query } from "../db.js";
import { requireAdmin } from "./auth.js";

type ListQuery = { status?: string; type?: string; q?: string; page?: string; limit?: string };
type IdParams = { applicationId: string };
type StatusBody = { status?: string; note?: string };
const statuses = ["submitted", "in_review", "approved", "rejected", "withdrawn"] as const;

function positiveInteger(value: string | undefined, fallback: number, max: number) { const parsed = Number.parseInt(value ?? "", 10); return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback; }

export const adminApplicationRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: ListQuery }>("/admin/applications", { schema: { tags: ["Administration"], summary: "List registration applications for administrators" } }, async (request, reply) => {
    await requireAdmin(request);
    const page = positiveInteger(request.query.page, 1, 100_000);
    const limit = positiveInteger(request.query.limit, 20, 100);
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (statuses.includes(request.query.status as (typeof statuses)[number])) { values.push(request.query.status); conditions.push(`a.status = $${values.length}`); }
    if (["individual", "organization"].includes(request.query.type ?? "")) { values.push(request.query.type); conditions.push(`a.applicant_type = $${values.length}`); }
    if (request.query.q?.trim()) { values.push(`%${request.query.q.trim()}%`); conditions.push(`(a.display_name ILIKE $${values.length} OR a.email ILIKE $${values.length})`); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await query<{ total: string }>(`SELECT count(*)::text AS total FROM ${schema}.registration_applications a ${where}`, values);
    values.push(limit, (page - 1) * limit);
    const result = await query<{ application_id: string; applicant_type: "individual" | "organization"; status: string; display_name: string; email: string; phone: string | null; submitted_at: string | null; created_at: string; channel_count: string }>(`
      SELECT a.application_id, a.applicant_type, a.status, a.display_name, a.email, a.phone, a.submitted_at, a.created_at, count(c.channel_id)::text AS channel_count
      FROM ${schema}.registration_applications a
      LEFT JOIN ${schema}.registration_channels c ON c.application_id = a.application_id
      ${where}
      GROUP BY a.application_id
      ORDER BY COALESCE(a.submitted_at, a.created_at) DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);
    return { data: result.rows.map((row) => ({ ...row, channelCount: Number(row.channel_count) })), pagination: { page, limit, total: Number(countResult.rows[0]?.total ?? 0) } };
  });

  app.get<{ Params: IdParams }>("/admin/applications/:applicationId", { schema: { tags: ["Administration"], summary: "Get an application with review data" } }, async (request, reply) => {
    await requireAdmin(request);
    const result = await query<Record<string, unknown>>(`
      SELECT to_jsonb(a) || jsonb_build_object(
        'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', ac.category_key, 'name', c.name) ORDER BY c.sort_order) FROM ${schema}.registration_application_categories ac JOIN ${schema}.activity_categories c ON c.category_key = ac.category_key WHERE ac.application_id = a.application_id), '[]'::jsonb),
        'channels', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', rc.channel_id, 'platform', rc.platform, 'name', rc.channel_name, 'url', rc.channel_url, 'verificationStatus', rc.verification_status)) FROM ${schema}.registration_channels rc WHERE rc.application_id = a.application_id), '[]'::jsonb),
        'individual', (SELECT to_jsonb(i) - 'application_id' FROM ${schema}.registration_individual_details i WHERE i.application_id = a.application_id),
        'organization', (SELECT to_jsonb(o) - 'application_id' FROM ${schema}.registration_organization_details o WHERE o.application_id = a.application_id),
        'reviews', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.review_id, 'previousStatus', r.previous_status, 'nextStatus', r.next_status, 'reviewerId', r.reviewer_id, 'note', r.note, 'createdAt', r.created_at) ORDER BY r.created_at DESC) FROM ${schema}.registration_reviews r WHERE r.application_id = a.application_id), '[]'::jsonb)
      ) AS application
      FROM ${schema}.registration_applications a WHERE a.application_id = $1
    `, [request.params.applicationId]);
    if (!result.rows[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy hồ sơ." });
    return { data: result.rows[0].application };
  });

  app.patch<{ Params: IdParams; Body: StatusBody }>("/admin/applications/:applicationId/status", { schema: { tags: ["Administration"], summary: "Update application status and add review note" } }, async (request, reply) => {
    const admin = await requireAdmin(request);
    const nextStatus = request.body?.status;
    if (!statuses.includes(nextStatus as (typeof statuses)[number])) return reply.code(400).send({ error: "VALIDATION_ERROR", message: "Trạng thái không hợp lệ." });
    if (admin.role === "reviewer" && !["in_review", "approved", "rejected"].includes(nextStatus!)) return reply.code(403).send({ error: "FORBIDDEN", message: "Bạn không có quyền chuyển sang trạng thái này." });
    const current = await query<{ status: string }>(`SELECT status FROM ${schema}.registration_applications WHERE application_id = $1 FOR UPDATE`, [request.params.applicationId]);
    if (!current.rows[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy hồ sơ." });
    const previousStatus = current.rows[0].status;
    await query(`UPDATE ${schema}.registration_applications SET status = $2, updated_at = now() WHERE application_id = $1`, [request.params.applicationId, nextStatus]);
    await query(`INSERT INTO ${schema}.registration_reviews (review_id, application_id, previous_status, next_status, reviewer_id, note) VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), request.params.applicationId, previousStatus, nextStatus, admin.sub, request.body?.note?.trim() || null]);
    return { data: { applicationId: request.params.applicationId, previousStatus, status: nextStatus } };
  });
};
