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

type GrowthListQuery = {
  page?: string;
  limit?: string;
  entityType?: "influencer" | "owner";
  periodDays?: string;
  metric?: string;
  search?: string;
  sort?: "rank" | "growthCurrent" | "growthRate" | "score";
  order?: "asc" | "desc";
};
type EntityParams = { key: string };
type DbRow = Record<string, unknown>;

const sortColumns = {
  rank: "gr.rank",
  growthCurrent: "gr.growth_current",
  growthRate: "gr.growth_rate",
  score: "gr.score"
} as const;

export const growthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/growth/periods",
    {
      schema: {
        tags: ["Growth rankings"],
        summary: "List available growth ranking combinations"
      }
    },
    async () => {
      const result = await query<DbRow>(`
        SELECT entity_type, period_days, metric, count(*)::int AS ranking_count,
          max(scraped_at) AS latest_scraped_at
        FROM ${schema}.growth_rankings
        GROUP BY entity_type, period_days, metric
        ORDER BY entity_type, period_days, metric
      `);
      return { data: result.rows };
    }
  );

  app.get<{ Querystring: GrowthListQuery }>(
    "/growth/rankings",
    {
      schema: {
        tags: ["Growth rankings"],
        summary: "List KOL or MCN growth rankings",
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            entityType: { type: "string", enum: ["influencer", "owner"], default: "influencer" },
            periodDays: { type: "integer", enum: [7, 28], default: 7 },
            metric: { type: "string", default: "total" },
            search: { type: "string" },
            sort: { type: "string", enum: Object.keys(sortColumns), default: "rank" },
            order: { type: "string", enum: ["asc", "desc"], default: "asc" }
          }
        }
      }
    },
    async (request) => {
      const pageInfo = pagination(request.query);
      const values: unknown[] = [
        request.query.entityType || "influencer",
        Number.parseInt(request.query.periodDays || "7", 10),
        request.query.metric || "total"
      ];
      const conditions = [
        "gr.entity_type = $1",
        "gr.period_days = $2",
        "gr.metric = $3"
      ];
      const pattern = searchPattern(request.query.search);
      if (pattern) {
        values.push(pattern);
        conditions.push(`(gr.name ILIKE $${values.length} ESCAPE '\\'
          OR gr.subtitle ILIKE $${values.length} ESCAPE '\\')`);
      }

      const sort = sortColumns[request.query.sort || "rank"];
      const order = request.query.order === "desc" ? "DESC" : "ASC";
      values.push(pageInfo.limit, pageInfo.offset);
      const result = await query<DbRow>(`
        SELECT
          gr.snapshot_key,
          gr.entity_type,
          gr.metric,
          gr.period_days,
          gr.rank,
          gr.name,
          gr.subtitle,
          gr.avatar_url,
          gr.snap_end_now,
          gr.growth_current,
          gr.growth_previous,
          gr.growth_change,
          gr.growth_rate,
          gr.score,
          gr.scraped_at,
          ge.growth_entity_key,
          ge.influencer_key,
          ge.mcn_source_id,
          CASE
            WHEN ge.influencer_key IS NOT NULL THEN jsonb_build_object(
              'type', 'influencer',
              'key', i.influencer_key,
              'name', i.name,
              'nickName', i.nick_name,
              'identityVerified', i.identity_verified,
              'platforms', COALESCE((
                SELECT jsonb_agg(channel_platform ORDER BY channel_platform)
                FROM (
                  SELECT DISTINCT lower(c.channel_type) AS channel_platform
                  FROM ${schema}.social_channels c
                  WHERE c.influencer_key = i.influencer_key
                ) influencer_platforms
              ), '[]'::jsonb),
              'channelsByType', COALESCE((
                SELECT jsonb_object_agg(channel_platform, channel_count)
                FROM (
                  SELECT lower(c.channel_type) AS channel_platform, count(*)::int AS channel_count
                  FROM ${schema}.social_channels c
                  WHERE c.influencer_key = i.influencer_key
                  GROUP BY lower(c.channel_type)
                ) influencer_channel_counts
              ), '{}'::jsonb)
            )
            WHEN ge.mcn_source_id IS NOT NULL THEN jsonb_build_object(
              'type', 'owner',
              'sourceId', m.source_id,
              'name', m.name,
              'subtitle', m.subtitle,
              'totalChannels', m.total_channels,
              'totalKols', m.total_kols,
              'platforms', m.platforms,
              'channelsByType', m.channels_by_type
            )
          END AS entity,
          count(*) OVER()::text AS total_count
        FROM ${schema}.growth_rankings gr
        JOIN ${schema}.growth_ranking_entities link ON link.snapshot_key = gr.snapshot_key
        JOIN ${schema}.growth_entities ge ON ge.growth_entity_key = link.growth_entity_key
        LEFT JOIN ${schema}.influencers i ON i.influencer_key = ge.influencer_key
        LEFT JOIN ${schema}.mcn_owners m ON m.source_id = ge.mcn_source_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY ${sort} ${order} NULLS LAST, gr.snapshot_key ASC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `, values);
      const total = firstTotal(result.rows[0]);
      const rows = result.rows.map(({ total_count: _totalCount, ...row }) => row);
      return listResponse(rows, pageInfo.page, pageInfo.limit, total);
    }
  );

  app.get<{ Params: EntityParams }>(
    "/growth/entities/:key",
    {
      schema: {
        tags: ["Growth rankings"],
        summary: "Get a growth entity and all its ranking snapshots",
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
          ge.*,
          CASE
            WHEN ge.influencer_key IS NOT NULL THEN to_jsonb(i)
            WHEN ge.mcn_source_id IS NOT NULL THEN to_jsonb(m) - 'raw_json'
          END AS entity,
          COALESCE((SELECT jsonb_agg(to_jsonb(gr) - 'raw_json'
            ORDER BY gr.scraped_at DESC, gr.period_days, gr.rank)
            FROM ${schema}.growth_ranking_entities link
            JOIN ${schema}.growth_rankings gr ON gr.snapshot_key = link.snapshot_key
            WHERE link.growth_entity_key = ge.growth_entity_key), '[]'::jsonb) AS rankings
        FROM ${schema}.growth_entities ge
        LEFT JOIN ${schema}.influencers i ON i.influencer_key = ge.influencer_key
        LEFT JOIN ${schema}.mcn_owners m ON m.source_id = ge.mcn_source_id
        WHERE ge.growth_entity_key = $1
      `, [request.params.key]);
      return result.rows[0] || notFound(reply, "Growth entity");
    }
  );
};
