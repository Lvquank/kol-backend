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

type InfluencerListQuery = {
  page?: string;
  limit?: string;
  search?: string;
  verified?: "true" | "false" | "all";
  platform?: string;
  hasSourceId?: "true" | "false";
  sort?: "name" | "followers" | "channels" | "scrapedAt";
  order?: "asc" | "desc";
};

type KeyParams = { key: string };
type SourceParams = { sourceId: string };
type DbRow = Record<string, unknown>;

const sortColumns = {
  name: "lower(name)",
  followers: "followers_total",
  channels: "channel_count",
  scrapedAt: "scraped_at"
} as const;

export const influencerRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: InfluencerListQuery }>(
    "/influencers",
    {
      schema: {
        tags: ["Influencers"],
        summary: "List influencers",
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            search: { type: "string" },
            verified: { type: "string", enum: ["true", "false", "all"] },
            platform: { type: "string" },
            hasSourceId: { type: "string", enum: ["true", "false"] },
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
        conditions.push(
          `(i.name ILIKE $${values.length} ESCAPE '\\' OR i.nick_name ILIKE $${values.length} ESCAPE '\\')`
        );
      }
      if (request.query.verified === "false") {
        conditions.push(`COALESCE(i.identity_verified, false) = false`);
      } else if (request.query.verified !== "all") {
        conditions.push(`i.identity_verified = true`);
      }
      if (request.query.platform) {
        values.push(request.query.platform.toLowerCase());
        conditions.push(`EXISTS (
          SELECT 1 FROM ${schema}.social_channels filter_channel
          WHERE filter_channel.influencer_key = i.influencer_key
            AND lower(filter_channel.channel_type) = $${values.length}
        )`);
      }
      if (request.query.hasSourceId) {
        const operator = request.query.hasSourceId === "true" ? "EXISTS" : "NOT EXISTS";
        conditions.push(`${operator} (
          SELECT 1 FROM ${schema}.influencer_source_ids source_filter
          WHERE source_filter.influencer_key = i.influencer_key
        )`);
      }

      const sort = sortColumns[request.query.sort || "name"];
      const order = request.query.order === "desc" ? "DESC" : "ASC";
      values.push(pageInfo.limit, pageInfo.offset);
      const limitIndex = values.length - 1;
      const offsetIndex = values.length;
      const result = await query<DbRow>(`
        WITH filtered AS (
          SELECT
            i.*,
            COALESCE(
              i.avatar_url,
              (SELECT gr.avatar_url FROM ${schema}.growth_rankings gr
               JOIN ${schema}.influencer_source_ids s ON s.source_id = gr.source_id
               WHERE s.influencer_key = i.influencer_key AND gr.avatar_url IS NOT NULL AND gr.avatar_url != '' LIMIT 1),
              (SELECT bs.image_url FROM ${schema}.bsi_subjects bs
               WHERE bs.influencer_key = i.influencer_key AND bs.image_url IS NOT NULL AND bs.image_url != '' LIMIT 1)
            ) AS avatar_url,
            (SELECT count(*)::int FROM ${schema}.social_channels c
              WHERE c.influencer_key = i.influencer_key) AS channel_count,
            COALESCE((SELECT sum(c.followers) FROM ${schema}.social_channels c
              WHERE c.influencer_key = i.influencer_key), 0)::text AS followers_total,
            COALESCE((SELECT sum(c.views) FROM ${schema}.social_channels c
              WHERE c.influencer_key = i.influencer_key), 0)::text AS views_total,
            COALESCE((SELECT sum(c.likes) FROM ${schema}.social_channels c
              WHERE c.influencer_key = i.influencer_key), 0)::text AS likes_total,
            COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'sourceId', s.source_id,
              'sourceSystem', s.source_system,
              'matchMethod', s.match_method,
              'confidence', s.confidence,
              'detailUrl', s.detail_url
            ) ORDER BY s.source_id) FROM ${schema}.influencer_source_ids s
              WHERE s.influencer_key = i.influencer_key), '[]'::jsonb) AS source_ids
          FROM ${schema}.influencers i
          ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
        )
        SELECT filtered.*, count(*) OVER()::text AS total_count
        FROM filtered
        ORDER BY ${sort} ${order} NULLS LAST, influencer_key ASC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `, values);

      const total = firstTotal(result.rows[0]);
      const rows = result.rows.map(({ total_count: _totalCount, ...row }) => row);
      return listResponse(rows, pageInfo.page, pageInfo.limit, total);
    }
  );

  app.get<{ Params: SourceParams }>(
    "/influencers/source/:sourceId",
    {
      schema: {
        tags: ["Influencers"],
        summary: "Resolve a kol.gov.vn source ID",
        params: {
          type: "object",
          required: ["sourceId"],
          properties: { sourceId: { type: "string" } }
        }
      }
    },
    async (request, reply) => {
      const result = await query<DbRow>(`
        SELECT s.*, to_jsonb(i) || jsonb_build_object(
          'avatar_url', (SELECT bs.image_url FROM ${schema}.bsi_subjects bs
            WHERE bs.influencer_key = i.influencer_key AND bs.image_url IS NOT NULL AND bs.image_url != '' LIMIT 1)
        ) AS influencer
        FROM ${schema}.influencer_source_ids s
        JOIN ${schema}.influencers i ON i.influencer_key = s.influencer_key
        WHERE s.source_id = $1
      `, [request.params.sourceId]);
      return result.rows[0] || notFound(reply, "Influencer source ID");
    }
  );

  app.get<{ Params: KeyParams }>(
    "/influencers/:key",
    {
      schema: {
        tags: ["Influencers"],
        summary: "Get influencer details and relationships",
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
          i.*,
          COALESCE(
            i.avatar_url,
            (SELECT gr.avatar_url FROM ${schema}.growth_rankings gr
             JOIN ${schema}.influencer_source_ids s ON s.source_id = gr.source_id
             WHERE s.influencer_key = i.influencer_key AND gr.avatar_url IS NOT NULL AND gr.avatar_url != '' LIMIT 1),
            (SELECT bs.image_url FROM ${schema}.bsi_subjects bs
             WHERE bs.influencer_key = i.influencer_key AND bs.image_url IS NOT NULL AND bs.image_url != '' LIMIT 1)
          ) AS avatar_url,
          COALESCE((SELECT sum(c.followers) FROM ${schema}.social_channels c WHERE c.influencer_key = i.influencer_key), 0)::text AS followers_total,
          COALESCE((SELECT sum(c.views) FROM ${schema}.social_channels c WHERE c.influencer_key = i.influencer_key), 0)::text AS views_total,
          COALESCE((SELECT sum(c.likes) FROM ${schema}.social_channels c WHERE c.influencer_key = i.influencer_key), 0)::text AS likes_total,
          COALESCE((SELECT sum(c.views + c.likes) FROM ${schema}.social_channels c WHERE c.influencer_key = i.influencer_key), 0)::text AS interactions_total,
          COALESCE((SELECT jsonb_agg(to_jsonb(s) - 'scraped_at' ORDER BY s.source_id)
            FROM ${schema}.influencer_source_ids s
            WHERE s.influencer_key = i.influencer_key), '[]'::jsonb) AS source_ids,
          COALESCE((SELECT jsonb_agg(
            (to_jsonb(c) - 'scraped_at') || jsonb_build_object('channelEntityKey', link.channel_entity_key)
            ORDER BY c.channel_type, c.channel_name)
            FROM ${schema}.social_channels c
            LEFT JOIN ${schema}.channel_entity_social_channels link ON link.channel_key = c.channel_key
            WHERE c.influencer_key = i.influencer_key), '[]'::jsonb) AS channels,
          CASE
            WHEN to_regclass('${schema}.influencer_posts') IS NOT NULL THEN
              COALESCE((SELECT jsonb_agg(to_jsonb(p) - 'influencer_key' ORDER BY p.display_order, p.post_key)
                FROM ${schema}.influencer_posts p
                WHERE p.influencer_key = i.influencer_key), '[]'::jsonb)
            ELSE '[]'::jsonb
          END AS recent_posts,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'sourceId', m.source_id,
            'name', m.name,
            'subtitle', m.subtitle,
            'avatarUrl', m.avatar_url,
            'relationshipType', mi.relationship_type
          ) ORDER BY m.name)
            FROM ${schema}.mcn_influencers mi
            JOIN ${schema}.mcn_owners m ON m.source_id = mi.mcn_source_id
            WHERE mi.influencer_key = i.influencer_key), '[]'::jsonb) AS mcns,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'snapshotKey', gr.snapshot_key,
            'periodDays', gr.period_days,
            'rank', gr.rank,
            'metric', gr.metric,
            'growthCurrent', gr.growth_current,
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
            JOIN ${schema}.growth_ranking_entities gre ON gre.growth_entity_key = ge.growth_entity_key
            JOIN ${schema}.growth_rankings gr ON gr.snapshot_key = gre.snapshot_key
            WHERE ge.influencer_key = i.influencer_key), '[]'::jsonb) AS growth_rankings,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'subjectKey', bs.subject_key,
            'year', br.year,
            'month', br.month,
            'rank', br.rank,
            'score', br.score,
            'imageUrl', br.image_url
          ) ORDER BY br.year DESC, br.month DESC, br.rank)
            FROM ${schema}.bsi_subjects bs
            JOIN ${schema}.bsi_ranking_subjects link ON link.subject_key = bs.subject_key
            JOIN ${schema}.bsi_rankings br ON br.snapshot_key = link.snapshot_key
            WHERE bs.influencer_key = i.influencer_key), '[]'::jsonb) AS bsi_rankings
        FROM ${schema}.influencers i
        WHERE i.influencer_key = $1
      `, [request.params.key]);
      return result.rows[0] || notFound(reply, "Influencer");
    }
  );
};
