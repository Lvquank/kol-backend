import type { FastifyPluginAsync } from "fastify";
import { schema } from "../config.js";
import { query } from "../db.js";
import { requireAdmin } from "./auth.js";
import { pagination, searchPattern, firstTotal, listResponse } from "../lib/http.js";

type NewsBody = {
  slug?: string;
  sourceUrl?: string;
  title?: string;
  excerpt?: string;
  category?: string;
  imageUrl?: string;
  bodyText?: string;
  publishedDate?: string;
  isPublished?: boolean;
};
type SlugParams = { slug: string };
type NewsQuery = { page?: string; limit?: string; search?: string };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

async function ensureNewsPublishedColumn() {
  try {
    await query(`ALTER TABLE ${schema}.news_posts ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true`);
  } catch {
    // Ignore schema update errors if table doesn't exist yet
  }
}

function validate(body: NewsBody) {
  if (!validSlug(text(body.slug))) return "Slug chỉ gồm chữ thường, số và dấu gạch ngang.";
  if (!text(body.title) || !text(body.sourceUrl)) return "Tiêu đề và đường dẫn nguồn là bắt buộc.";
  try { new URL(text(body.sourceUrl)); } catch { return "Đường dẫn nguồn không hợp lệ."; }
  return null;
}

export const adminContentRoutes: FastifyPluginAsync = async (app) => {
  await ensureNewsPublishedColumn();

  app.get<{ Querystring: NewsQuery }>("/admin/news", { schema: { tags: ["Administration"], summary: "Manage news posts" } }, async (request) => {
    await requireAdmin(request);
    await ensureNewsPublishedColumn();
    const pageInfo = pagination(request.query);
    const pattern = searchPattern(request.query.search);
    const values: unknown[] = [];
    if (pattern) values.push(pattern);
    values.push(pageInfo.limit, pageInfo.offset);
    const result = await query<Record<string, unknown>>(
      `SELECT n.slug, n.source_url AS "sourceUrl", n.title, n.excerpt, n.category, n.image_url AS "imageUrl", n.body_text AS "bodyText", n.published_date AS "publishedDate", n.reading_minutes AS "readingMinutes", COALESCE((to_jsonb(n)->>'is_published')::boolean, true) AS "isPublished", count(*) OVER()::text AS total_count FROM ${schema}.news_posts n ${pattern ? "WHERE n.title ILIKE $1 ESCAPE '\\' OR n.excerpt ILIKE $1 ESCAPE '\\'" : ""} ORDER BY n.published_date DESC NULLS LAST, n.slug LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    const total = firstTotal(result.rows[0]);
    const rows = result.rows.map(({ total_count: _total, ...row }) => row);
    return listResponse(rows, pageInfo.page, pageInfo.limit, total);
  });

  app.post<{ Body: NewsBody }>("/admin/news", { schema: { tags: ["Administration"], summary: "Create news post" } }, async (request, reply) => {
    const admin = await requireAdmin(request);
    if (admin.role !== "super_admin") return reply.code(403).send({ error: "FORBIDDEN", message: "Chỉ quản trị hệ thống được thay đổi tin tức." });
    const error = validate(request.body ?? {});
    if (error) return reply.code(400).send({ error: "VALIDATION_ERROR", message: error });
    await ensureNewsPublishedColumn();
    const body = request.body;
    const isPublished = body.isPublished !== false;
    try {
      await query(
        `INSERT INTO ${schema}.news_posts (slug, source_url, category, title, excerpt, published_date, reading_minutes, image_url, body_text, body_html, tags, scraped_at, is_published) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,'[]'::jsonb,now(),$10)`,
        [text(body.slug), text(body.sourceUrl), text(body.category) || null, text(body.title), text(body.excerpt) || null, text(body.publishedDate) || new Date().toISOString().slice(0, 10), text(body.imageUrl) || null, text(body.bodyText) || null, text(body.bodyText) || null, isPublished]
      );
    } catch { return reply.code(409).send({ error: "CONFLICT", message: "Slug hoặc đường dẫn nguồn đã tồn tại." }); }
    return reply.code(201).send({ data: { slug: text(body.slug), isPublished } });
  });

  app.patch<{ Params: SlugParams; Body: NewsBody }>("/admin/news/:slug", { schema: { tags: ["Administration"], summary: "Update news post" } }, async (request, reply) => {
    await requireAdmin(request);
    const body = { ...request.body, slug: request.params.slug };
    const error = validate(body);
    if (error) return reply.code(400).send({ error: "VALIDATION_ERROR", message: error });
    await ensureNewsPublishedColumn();
    const isPublishedParam = body.isPublished !== undefined ? body.isPublished : null;
    const result = await query(
      `UPDATE ${schema}.news_posts SET source_url=$2, category=$3, title=$4, excerpt=$5, published_date=$6, image_url=$7, body_text=$8, body_html=$9, is_published=CASE WHEN $10::boolean IS NOT NULL THEN $10 ELSE COALESCE(is_published, true) END, scraped_at=now() WHERE slug=$1`,
      [request.params.slug, text(body.sourceUrl), text(body.category) || null, text(body.title), text(body.excerpt) || null, text(body.publishedDate) || new Date().toISOString().slice(0, 10), text(body.imageUrl) || null, text(body.bodyText) || null, text(body.bodyText) || null, isPublishedParam]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy tin tức." });
    return { data: { slug: request.params.slug, isPublished: body.isPublished } };
  });

  app.post<{ Params: SlugParams }>("/admin/news/:slug/toggle-visibility", { schema: { tags: ["Administration"], summary: "Toggle news post visibility (soft delete/restore)" } }, async (request, reply) => {
    const admin = await requireAdmin(request);
    if (admin.role !== "super_admin") return reply.code(403).send({ error: "FORBIDDEN", message: "Chỉ quản trị hệ thống được thay đổi tin tức." });
    await ensureNewsPublishedColumn();
    const result = await query<{ slug: string; is_published: boolean }>(
      `UPDATE ${schema}.news_posts
          SET is_published = NOT COALESCE(is_published, true)
        WHERE slug = $1
        RETURNING slug, COALESCE(is_published, true) AS is_published`,
      [request.params.slug]
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy tin tức." });
    return { data: { slug: result.rows[0].slug, isPublished: result.rows[0].is_published } };
  });

  app.delete<{ Params: SlugParams }>("/admin/news/:slug", { schema: { tags: ["Administration"], summary: "Soft delete (hide) news post" } }, async (request, reply) => {
    const admin = await requireAdmin(request);
    if (admin.role !== "super_admin") return reply.code(403).send({ error: "FORBIDDEN", message: "Chỉ quản trị hệ thống được thay đổi tin tức." });
    await ensureNewsPublishedColumn();
    const result = await query(
      `UPDATE ${schema}.news_posts SET is_published = false WHERE slug=$1`,
      [request.params.slug]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy tin tức." });
    return { data: { slug: request.params.slug, isPublished: false, message: "Tin tức đã được chuyển sang trạng thái ẩn." } };
  });
};
