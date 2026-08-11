import type { FastifyPluginAsync } from "fastify";
import { schema } from "../config.js";
import { query } from "../db.js";
import { requireAdmin } from "./auth.js";
import { pagination, searchPattern, firstTotal, listResponse } from "../lib/http.js";

type NewsBody = { slug?: string; sourceUrl?: string; title?: string; excerpt?: string; category?: string; imageUrl?: string; bodyText?: string; publishedDate?: string };
type SlugParams = { slug: string };
type NewsQuery = { page?: string; limit?: string; search?: string };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

function validate(body: NewsBody) {
  if (!validSlug(text(body.slug))) return "Slug chỉ gồm chữ thường, số và dấu gạch ngang.";
  if (!text(body.title) || !text(body.sourceUrl)) return "Tiêu đề và đường dẫn nguồn là bắt buộc.";
  try { new URL(text(body.sourceUrl)); } catch { return "Đường dẫn nguồn không hợp lệ."; }
  return null;
}

export const adminContentRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: NewsQuery }>("/admin/news", { schema: { tags: ["Administration"], summary: "Manage news posts" } }, async (request) => {
    await requireAdmin(request);
    const pageInfo = pagination(request.query);
    const pattern = searchPattern(request.query.search);
    const values: unknown[] = [];
    if (pattern) values.push(pattern);
    values.push(pageInfo.limit, pageInfo.offset);
    const result = await query<Record<string, unknown>>(`SELECT slug, source_url AS "sourceUrl", title, excerpt, category, image_url AS "imageUrl", body_text AS "bodyText", published_date AS "publishedDate", reading_minutes AS "readingMinutes", count(*) OVER()::text AS total_count FROM ${schema}.news_posts ${pattern ? "WHERE title ILIKE $1 ESCAPE '\\' OR excerpt ILIKE $1 ESCAPE '\\'" : ""} ORDER BY published_date DESC NULLS LAST, slug LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    const total = firstTotal(result.rows[0]);
    const rows = result.rows.map(({ total_count: _total, ...row }) => row);
    return listResponse(rows, pageInfo.page, pageInfo.limit, total);
  });

  app.post<{ Body: NewsBody }>("/admin/news", { schema: { tags: ["Administration"], summary: "Create news post" } }, async (request, reply) => {
    const admin = await requireAdmin(request);
    if (admin.role !== "super_admin") return reply.code(403).send({ error: "FORBIDDEN", message: "Chỉ quản trị hệ thống được thay đổi tin tức." });
    const error = validate(request.body ?? {});
    if (error) return reply.code(400).send({ error: "VALIDATION_ERROR", message: error });
    const body = request.body;
    try {
      await query(`INSERT INTO ${schema}.news_posts (slug, source_url, category, title, excerpt, published_date, reading_minutes, image_url, body_text, body_html, tags, scraped_at) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,'[]'::jsonb,now())`, [text(body.slug), text(body.sourceUrl), text(body.category) || null, text(body.title), text(body.excerpt) || null, text(body.publishedDate) || new Date().toISOString().slice(0, 10), text(body.imageUrl) || null, text(body.bodyText) || null, text(body.bodyText) || null]);
    } catch { return reply.code(409).send({ error: "CONFLICT", message: "Slug hoặc đường dẫn nguồn đã tồn tại." }); }
    return reply.code(201).send({ data: { slug: text(body.slug) } });
  });

  app.patch<{ Params: SlugParams; Body: NewsBody }>("/admin/news/:slug", { schema: { tags: ["Administration"], summary: "Update news post" } }, async (request, reply) => {
    const admin = await requireAdmin(request);
    if (admin.role !== "super_admin") return reply.code(403).send({ error: "FORBIDDEN", message: "Chỉ quản trị hệ thống được thay đổi tin tức." });
    const body = { ...request.body, slug: request.params.slug };
    const error = validate(body);
    if (error) return reply.code(400).send({ error: "VALIDATION_ERROR", message: error });
    const result = await query(`UPDATE ${schema}.news_posts SET source_url=$2, category=$3, title=$4, excerpt=$5, published_date=$6, image_url=$7, body_text=$8, body_html=$9, scraped_at=now() WHERE slug=$1`, [request.params.slug, text(body.sourceUrl), text(body.category) || null, text(body.title), text(body.excerpt) || null, text(body.publishedDate) || new Date().toISOString().slice(0, 10), text(body.imageUrl) || null, text(body.bodyText) || null, text(body.bodyText) || null]);
    if (!result.rowCount) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy tin tức." });
    return { data: { slug: request.params.slug } };
  });

  app.delete<{ Params: SlugParams }>("/admin/news/:slug", { schema: { tags: ["Administration"], summary: "Delete news post" } }, async (request, reply) => {
    const admin = await requireAdmin(request);
    if (admin.role !== "super_admin") return reply.code(403).send({ error: "FORBIDDEN", message: "Chỉ quản trị hệ thống được thay đổi tin tức." });
    const result = await query(`DELETE FROM ${schema}.news_posts WHERE slug=$1`, [request.params.slug]);
    if (!result.rowCount) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy tin tức." });
    return reply.code(204).send();
  });
};
