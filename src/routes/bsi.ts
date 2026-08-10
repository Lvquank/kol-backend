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

type BsiListQuery = {
  page?: string;
  limit?: string;
  tab?: "campaign" | "event" | "influencer" | "show";
  year?: string;
  month?: string;
  search?: string;
};
type SubjectListQuery = {
  page?: string;
  limit?: string;
  search?: string;
  type?: string;
};
type PeriodQuery = { tab?: "campaign" | "event" | "influencer" | "show" };
type SubjectParams = { key: string };
type DbRow = Record<string, unknown>;

export const bsiRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: PeriodQuery }>(
    "/bsi/periods",
    {
      schema: {
        tags: ["BSI rankings"],
        summary: "List available BSI periods",
        querystring: {
          type: "object",
          properties: {
            tab: { type: "string", enum: ["campaign", "event", "influencer", "show"] }
          }
        }
      }
    },
    async (request) => {
      const values: unknown[] = [];
      const where = request.query.tab ? "WHERE tab = $1" : "";
      if (request.query.tab) values.push(request.query.tab);
      const result = await query<DbRow>(`
        SELECT tab, year, month, count(*)::int AS ranking_count,
          max(scraped_at) AS latest_scraped_at
        FROM ${schema}.bsi_rankings
        ${where}
        GROUP BY tab, year, month
        ORDER BY tab, year DESC, month DESC
      `, values);
      return { data: result.rows };
    }
  );

  app.get<{ Querystring: BsiListQuery }>(
    "/bsi/rankings",
    {
      schema: {
        tags: ["BSI rankings"],
        summary: "List BSI rankings; defaults to the latest period",
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            tab: { type: "string", enum: ["campaign", "event", "influencer", "show"], default: "influencer" },
            year: { type: "integer", minimum: 2000, maximum: 2100 },
            month: { type: "integer", minimum: 1, maximum: 12 },
            search: { type: "string" }
          }
        }
      }
    },
    async (request) => {
      const pageInfo = pagination(request.query);
      const values: unknown[] = [request.query.tab || "influencer"];
      const conditions = ["br.tab = $1"];
      if (request.query.year) {
        values.push(Number.parseInt(request.query.year, 10));
        conditions.push(`br.year = $${values.length}`);
      }
      if (request.query.month) {
        values.push(Number.parseInt(request.query.month, 10));
        conditions.push(`br.month = $${values.length}`);
      }
      if (!request.query.year && !request.query.month) {
        conditions.push(`(br.year, br.month) = (
          SELECT latest.year, latest.month
          FROM ${schema}.bsi_rankings latest
          WHERE latest.tab = $1
          ORDER BY latest.year DESC, latest.month DESC
          LIMIT 1
        )`);
      }
      const pattern = searchPattern(request.query.search);
      if (pattern) {
        values.push(pattern);
        conditions.push(`br.name ILIKE $${values.length} ESCAPE '\\'`);
      }
      values.push(pageInfo.limit, pageInfo.offset);
      const result = await query<DbRow>(`
        SELECT
          br.snapshot_key,
          br.tab,
          br.year,
          br.month,
          br.rank,
          br.name,
          br.score,
          br.image_url,
          br.scraped_at,
          bs.subject_key,
          bs.subject_type,
          bs.influencer_key,
          CASE WHEN i.influencer_key IS NOT NULL THEN jsonb_build_object(
            'key', i.influencer_key,
            'name', i.name,
            'nickName', i.nick_name,
            'identityVerified', i.identity_verified
          ) END AS influencer,
          count(*) OVER()::text AS total_count
        FROM ${schema}.bsi_rankings br
        JOIN ${schema}.bsi_ranking_subjects link ON link.snapshot_key = br.snapshot_key
        JOIN ${schema}.bsi_subjects bs ON bs.subject_key = link.subject_key
        LEFT JOIN ${schema}.influencers i ON i.influencer_key = bs.influencer_key
        WHERE ${conditions.join(" AND ")}
        ORDER BY br.rank ASC, br.snapshot_key ASC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `, values);
      const total = firstTotal(result.rows[0]);
      const rows = result.rows.map(({ total_count: _totalCount, ...row }) => row);
      return listResponse(rows, pageInfo.page, pageInfo.limit, total);
    }
  );

  app.get<{ Querystring: SubjectListQuery }>(
    "/bsi/subjects",
    {
      schema: {
        tags: ["BSI rankings"],
        summary: "List normalized BSI subjects",
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            search: { type: "string" },
            type: { type: "string" }
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
        conditions.push(`bs.name ILIKE $${values.length} ESCAPE '\\'`);
      }
      if (request.query.type) {
        values.push(request.query.type);
        conditions.push(`bs.subject_type = $${values.length}`);
      }
      values.push(pageInfo.limit, pageInfo.offset);
      const result = await query<DbRow>(`
        SELECT bs.*, count(*) OVER()::text AS total_count
        FROM ${schema}.bsi_subjects bs
        ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
        ORDER BY lower(bs.name), bs.subject_key
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `, values);
      const total = firstTotal(result.rows[0]);
      const rows = result.rows.map(({ total_count: _totalCount, ...row }) => row);
      return listResponse(rows, pageInfo.page, pageInfo.limit, total);
    }
  );

  app.get<{ Params: SubjectParams }>(
    "/bsi/subjects/:key",
    {
      schema: {
        tags: ["BSI rankings"],
        summary: "Get a BSI subject and ranking history",
        params: {
          type: "object",
          required: ["key"],
          properties: { key: { type: "string" } }
        }
      }
    },
    async (request, reply) => {
      const result = await query<DbRow>(`
        SELECT
          bs.*,
          CASE WHEN i.influencer_key IS NOT NULL THEN to_jsonb(i) END AS influencer,
          COALESCE((SELECT jsonb_agg(to_jsonb(br) - 'raw_json'
            ORDER BY br.year DESC, br.month DESC, br.rank)
            FROM ${schema}.bsi_ranking_subjects link
            JOIN ${schema}.bsi_rankings br ON br.snapshot_key = link.snapshot_key
            WHERE link.subject_key = bs.subject_key), '[]'::jsonb) AS rankings
        FROM ${schema}.bsi_subjects bs
        LEFT JOIN ${schema}.influencers i ON i.influencer_key = bs.influencer_key
        WHERE bs.subject_key = $1
      `, [request.params.key]);
      return result.rows[0] || notFound(reply, "BSI subject");
    }
  );
};
