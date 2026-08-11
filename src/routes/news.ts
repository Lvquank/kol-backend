import type { FastifyPluginAsync } from "fastify";
import { schema } from "../config.js";
import { query } from "../db.js";
import {
  firstTotal,
  listResponse,
  notFound,
  pagination,
  searchPattern
} from "../lib/http.js";

type NewsListQuery = {
  page?: string;
  limit?: string;
  search?: string;
  category?: string;
  tag?: string;
  from?: string;
  to?: string;
  sort?: "publishedAt" | "title";
  order?: "asc" | "desc";
};
type NewsParams = { slug: string };
type DbRow = Record<string, unknown>;

const sortColumns = {
  publishedAt: "n.published_date",
  title: "lower(n.title)"
} as const;

export const newsRoutes: FastifyPluginAsync = async (app) => {
  const fetchCategories = async () => {
    const result = await query<DbRow>(`
      SELECT c.category_key, c.name, count(link.slug)::int AS post_count
      FROM ${schema}.news_categories c
      LEFT JOIN ${schema}.news_post_categories link ON link.category_key = c.category_key
      GROUP BY c.category_key, c.name
      ORDER BY lower(c.name)
    `);
    return { data: result.rows };
  };

  app.get(
    "/news/categories",
    {
      schema: { tags: ["News"], summary: "List news categories" }
    },
    fetchCategories
  );

  app.get(
    "/categories",
    {
      schema: { tags: ["News"], summary: "List categories (alias for /news/categories)" }
    },
    fetchCategories
  );

  app.get(
    "/news/tags",
    {
      schema: { tags: ["News"], summary: "List news tags" }
    },
    async () => {
      const result = await query<DbRow>(`
        SELECT t.tag_key, t.name, count(link.slug)::int AS post_count
        FROM ${schema}.news_tags t
        LEFT JOIN ${schema}.news_post_tags link ON link.tag_key = t.tag_key
        GROUP BY t.tag_key, t.name
        ORDER BY lower(t.name)
      `);
      return { data: result.rows };
    }
  );

  app.get<{ Querystring: NewsListQuery }>(
    "/news",
    {
      schema: {
        tags: ["News"],
        summary: "List news posts",
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            search: { type: "string" },
            category: { type: "string" },
            tag: { type: "string" },
            from: { type: "string", format: "date" },
            to: { type: "string", format: "date" },
            sort: { type: "string", enum: Object.keys(sortColumns), default: "publishedAt" },
            order: { type: "string", enum: ["asc", "desc"], default: "desc" }
          }
        }
      }
    },
    async (request) => {
      const pageInfo = pagination(request.query);
      const values: unknown[] = [];
      const conditions: string[] = [];
      const pattern = searchPattern(request.query.search);
      if (pattern) {
        values.push(pattern);
        conditions.push(`(n.title ILIKE $${values.length} ESCAPE '\\'
          OR n.excerpt ILIKE $${values.length} ESCAPE '\\'
          OR n.body_text ILIKE $${values.length} ESCAPE '\\')`);
      }
      if (request.query.category) {
        values.push(request.query.category.toLowerCase());
        conditions.push(`EXISTS (
          SELECT 1 FROM ${schema}.news_post_categories pc
          JOIN ${schema}.news_categories c ON c.category_key = pc.category_key
          WHERE pc.slug = n.slug
            AND (lower(c.category_key) = $${values.length} OR lower(c.name) = $${values.length})
        )`);
      }
      if (request.query.tag) {
        values.push(request.query.tag.toLowerCase());
        conditions.push(`EXISTS (
          SELECT 1 FROM ${schema}.news_post_tags pt
          JOIN ${schema}.news_tags t ON t.tag_key = pt.tag_key
          WHERE pt.slug = n.slug
            AND (lower(t.tag_key) = $${values.length} OR lower(t.name) = $${values.length})
        )`);
      }
      if (request.query.from) {
        values.push(request.query.from);
        conditions.push(`n.published_date >= $${values.length}::date`);
      }
      if (request.query.to) {
        values.push(request.query.to);
        conditions.push(`n.published_date <= $${values.length}::date`);
      }
      const sort = sortColumns[request.query.sort || "publishedAt"];
      const order = request.query.order === "asc" ? "ASC" : "DESC";
      values.push(pageInfo.limit, pageInfo.offset);
      const result = await query<DbRow>(`
        SELECT
          n.slug,
          n.source_url,
          n.category,
          n.title,
          n.excerpt,
          n.published_date,
          n.reading_minutes,
          n.image_url,
          n.scraped_at,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'key', c.category_key, 'name', c.name) ORDER BY c.name)
            FROM ${schema}.news_post_categories pc
            JOIN ${schema}.news_categories c ON c.category_key = pc.category_key
            WHERE pc.slug = n.slug), '[]'::jsonb) AS categories,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'key', t.tag_key, 'name', t.name) ORDER BY t.name)
            FROM ${schema}.news_post_tags pt
            JOIN ${schema}.news_tags t ON t.tag_key = pt.tag_key
            WHERE pt.slug = n.slug), '[]'::jsonb) AS tags,
          count(*) OVER()::text AS total_count
        FROM ${schema}.news_posts n
        ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
        ORDER BY ${sort} ${order} NULLS LAST, n.slug ASC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `, values);
      const total = firstTotal(result.rows[0]);
      const rows = result.rows.map(({ total_count: _totalCount, ...row }) => row);
      return listResponse(rows, pageInfo.page, pageInfo.limit, total);
    }
  );

  app.get<{ Params: NewsParams }>(
    "/news/:slug",
    {
      schema: {
        tags: ["News"],
        summary: "Get a complete news post",
        params: {
          type: "object",
          required: ["slug"],
          properties: { slug: { type: "string" } }
        }
      }
    },
    async (request, reply) => {
      const result = await query<DbRow>(`
        SELECT
          n.*,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'key', c.category_key, 'name', c.name) ORDER BY c.name)
            FROM ${schema}.news_post_categories pc
            JOIN ${schema}.news_categories c ON c.category_key = pc.category_key
            WHERE pc.slug = n.slug), '[]'::jsonb) AS categories,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'key', t.tag_key, 'name', t.name) ORDER BY t.name)
            FROM ${schema}.news_post_tags pt
            JOIN ${schema}.news_tags t ON t.tag_key = pt.tag_key
            WHERE pt.slug = n.slug), '[]'::jsonb) AS normalized_tags
        FROM ${schema}.news_posts n
        WHERE n.slug = $1
      `, [request.params.slug]);
      return result.rows[0] || notFound(reply, "News post");
    }
  );
};
