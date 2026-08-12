import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { schema } from "../config.js";
import { query } from "../db.js";
import { requireAdmin } from "./auth.js";

type ReportBody = { name?: string; phone?: string; email?: string; group?: string; content?: string };
type AdminQuery = { status?: string; q?: string; limit?: string };
type IdParams = { reportId: string };
type StatusBody = { status?: string; note?: string };
const statuses = ["submitted", "in_review", "resolved", "rejected"] as const;

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validPhone = (value: unknown) => /^0\d{9}$/.test(clean(value));
const validEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean(value));

function validate(body: ReportBody) {
  if (!clean(body.name) || !validPhone(body.phone) || !clean(body.group) || !clean(body.content)) return "Vui lòng điền đầy đủ họ tên, số điện thoại, nhóm và nội dung phản ánh.";
  if (clean(body.email) && !validEmail(body.email)) return "Email không đúng định dạng.";
  if (clean(body.content).length > 2000) return "Nội dung phản ánh tối đa 2.000 ký tự.";
  return null;
}

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: ReportBody }>("/reports", { schema: { tags: ["Reports"], summary: "Submit a violation report" } }, async (request, reply) => {
    const error = validate(request.body ?? {});
    if (error) return reply.code(400).send({ error: "VALIDATION_ERROR", message: error });
    const reportId = randomUUID();
    await query(`INSERT INTO ${schema}.violation_reports (report_id, reporter_name, reporter_phone, reporter_email, report_group, content) VALUES ($1,$2,$3,$4,$5,$6)`, [reportId, clean(request.body.name), clean(request.body.phone), clean(request.body.email).toLowerCase() || null, clean(request.body.group), clean(request.body.content)]);
    return reply.code(201).send({ data: { reportId, status: "submitted", message: "Phản ánh đã được tiếp nhận." } });
  });

  app.get<{ Querystring: AdminQuery }>("/admin/reports", { schema: { tags: ["Reports"], summary: "List violation reports" } }, async (request) => {
    await requireAdmin(request);
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (statuses.includes(request.query.status as (typeof statuses)[number])) { values.push(request.query.status); conditions.push(`status = $${values.length}`); }
    if (clean(request.query.q)) { values.push(`%${clean(request.query.q)}%`); conditions.push(`(reporter_name ILIKE $${values.length} OR reporter_phone ILIKE $${values.length} OR reporter_email ILIKE $${values.length} OR content ILIKE $${values.length})`); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(Math.max(Number.parseInt(request.query.limit ?? "20", 10) || 20, 1), 100);
    const result = await query<Record<string, unknown>>(`SELECT report_id, reporter_name, reporter_phone, reporter_email, report_group, content, status, assigned_to, assigned_at, created_at FROM ${schema}.violation_reports ${where} ORDER BY created_at DESC LIMIT $${values.length + 1}`, [...values, limit]);
    return { data: result.rows };
  });

  app.patch<{ Params: IdParams; Body: StatusBody }>("/admin/reports/:reportId/status", { schema: { tags: ["Reports"], summary: "Assign or update a violation report" } }, async (request, reply) => {
    const admin = await requireAdmin(request);
    const nextStatus = request.body?.status;
    if (!statuses.includes(nextStatus as (typeof statuses)[number])) return reply.code(400).send({ error: "VALIDATION_ERROR", message: "Trạng thái không hợp lệ." });
    const current = await query<{ status: string }>(`SELECT status FROM ${schema}.violation_reports WHERE report_id = $1`, [request.params.reportId]);
    if (!current.rows[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy phản ánh." });
    await query(`UPDATE ${schema}.violation_reports SET status = $2, assigned_to = $3, assigned_at = CASE WHEN $2 = 'in_review' THEN now() ELSE assigned_at END, updated_at = now() WHERE report_id = $1`, [request.params.reportId, nextStatus, admin.sub]);
    await query(`INSERT INTO ${schema}.violation_report_reviews (review_id, report_id, reviewer_id, previous_status, next_status, note) VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), request.params.reportId, admin.sub, current.rows[0].status, nextStatus, clean(request.body?.note) || null]);
    return { data: { reportId: request.params.reportId, status: nextStatus } };
  });
};
