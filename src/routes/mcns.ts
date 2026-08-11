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

type McnListQuery = {
  page?: string;
  limit?: string;
  search?: string;
  platform?: string;
  sort?: "name" | "channels" | "kols" | "scrapedAt";
  order?: "asc" | "desc";
};
type McnParams = { sourceId: string };
type DbRow = Record<string, unknown>;

const sortColumns = {
  name: "lower(m.name)",
  channels: "m.total_channels",
  kols: "m.total_kols",
  scrapedAt: "m.scraped_at"
} as const;

export const mcnRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: McnListQuery }>(
    "/mcns",
    {
      schema: {
        tags: ["MCNs"],
        summary: "List MCN owners",
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            search: { type: "string" },
            platform: { type: "string" },
            sort: { type: "string", enum: Object.keys(sortColumns), default: "name" },
            order: { type: "string", enum: ["asc", "desc"], default: "asc" }
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
        conditions.push(`(m.name ILIKE $${values.length} ESCAPE '\\'
          OR m.subtitle ILIKE $${values.length} ESCAPE '\\')`);
      }
      if (request.query.platform) {
        values.push(request.query.platform.toLowerCase());
        conditions.push(`EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(m.platforms) p(value)
          WHERE lower(p.value) = $${values.length}
        )`);
      }
      const sort = sortColumns[request.query.sort || "name"];
      const order = request.query.order === "desc" ? "DESC" : "ASC";
      values.push(pageInfo.limit, pageInfo.offset);
      const result = await query<DbRow>(`
        SELECT
          m.*,
          (SELECT count(*)::int FROM ${schema}.mcn_influencers mi
            WHERE mi.mcn_source_id = m.source_id) AS public_influencer_count,
          count(*) OVER()::text AS total_count
        FROM ${schema}.mcn_owners m
        ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
        ORDER BY ${sort} ${order} NULLS LAST, m.source_id ASC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `, values);
      const total = firstTotal(result.rows[0]);
      const rows = result.rows.map(({ total_count: _totalCount, raw_json: _rawJson, ...row }) => row);
      return listResponse(rows, pageInfo.page, pageInfo.limit, total);
    }
  );

  app.get<{ Params: McnParams }>(
    "/mcns/:sourceId",
    {
      schema: {
        tags: ["MCNs"],
        summary: "Get an MCN with featured influencers and growth",
        params: {
          type: "object",
          required: ["sourceId"],
          properties: { sourceId: { type: "string" } }
        }
      }
    },
    async (request, reply) => {
      const result = await query<DbRow>(`
        SELECT
          m.*,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'membershipKey', mi.membership_key,
            'relationshipType', mi.relationship_type,
            'sourceUrl', mi.source_url,
            'influencerSourceId', mi.influencer_source_id,
            'influencerKey', i.influencer_key,
            'name', i.name,
            'nickName', i.nick_name,
            'identityVerified', i.identity_verified
          ) ORDER BY i.name)
            FROM ${schema}.mcn_influencers mi
            JOIN ${schema}.influencers i ON i.influencer_key = mi.influencer_key
            WHERE mi.mcn_source_id = m.source_id), '[]'::jsonb) AS member_influencers,
          COALESCE((SELECT jsonb_agg(
            to_jsonb(fi) - 'featured_influencer_key' - 'mcn_source_id' - 'influencer_key'
            ORDER BY fi.rank)
            FROM ${schema}.mcn_featured_influencers fi
            WHERE fi.mcn_source_id = m.source_id), '[]'::jsonb) AS featured_influencers,
          COALESCE((SELECT jsonb_agg(
            to_jsonb(fc) - 'featured_channel_key' - 'mcn_source_id'
            ORDER BY fc.rank)
            FROM ${schema}.mcn_featured_channels fc
            WHERE fc.mcn_source_id = m.source_id), '[]'::jsonb) AS featured_channels,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'snapshotKey', gr.snapshot_key,
            'periodDays', gr.period_days,
            'rank', gr.rank,
            'metric', gr.metric,
            'growthCurrent', gr.growth_current,
            'growthPrevious', gr.growth_previous,
            'growthChange', gr.growth_change,
            'growthRate', gr.growth_rate,
            'score', gr.score,
            'avatarUrl', gr.avatar_url,
            'interactionGrowth', gr.raw_json->>'interaction_growth',
            'followersGrowth', gr.raw_json->>'followers_growth',
            'viewsGrowth', gr.raw_json->>'views_growth',
            'likesGrowth', gr.raw_json->>'likes_growth',
            'scrapedAt', gr.scraped_at
          ) ORDER BY gr.scraped_at DESC, gr.period_days, gr.rank)
            FROM ${schema}.growth_entities ge
            JOIN ${schema}.growth_ranking_entities link ON link.growth_entity_key = ge.growth_entity_key
            JOIN ${schema}.growth_rankings gr ON gr.snapshot_key = link.snapshot_key
            WHERE ge.mcn_source_id = m.source_id), '[]'::jsonb) AS growth_rankings
        FROM ${schema}.mcn_owners m
        WHERE m.source_id = $1
      `, [request.params.sourceId]);
      return result.rows[0] || notFound(reply, "MCN");
    }
  );
};
