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

type ChannelListQuery = {
  page?: string;
  limit?: string;
  search?: string;
  platform?: string;
  source?: "all" | "social" | "ticker" | "both";
  sort?: "name" | "platform" | "followers" | "views" | "likes" | "scrapedAt";
  order?: "asc" | "desc";
};
type KeyParams = { key: string };
type DbRow = Record<string, unknown>;

const sortColumns = {
  name: "lower(ce.display_name)",
  platform: "lower(ce.platform)",
  followers: "followers_total",
  views: "views_total",
  likes: "likes_total",
  scrapedAt: "ce.scraped_at"
} as const;

export const channelRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: ChannelListQuery }>(
    "/channels",
    {
      schema: {
        tags: ["Channels"],
        summary: "List unified channel entities",
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            search: { type: "string" },
            platform: { type: "string" },
            source: { type: "string", enum: ["all", "social", "ticker", "both"], default: "all" },
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
        conditions.push(`(ce.display_name ILIKE $${values.length} ESCAPE '\\'
          OR ce.normalized_name ILIKE $${values.length} ESCAPE '\\'
          OR ce.canonical_url ILIKE $${values.length} ESCAPE '\\')`);
      }
      if (request.query.platform) {
        values.push(request.query.platform.toLowerCase());
        conditions.push(`lower(ce.platform) = $${values.length}`);
      }
      if (request.query.source === "social" || request.query.source === "both") {
        conditions.push(`EXISTS (SELECT 1 FROM ${schema}.channel_entity_social_channels s
          WHERE s.channel_entity_key = ce.channel_entity_key)`);
      }
      if (request.query.source === "ticker" || request.query.source === "both") {
        conditions.push(`EXISTS (SELECT 1 FROM ${schema}.channel_entity_ticker_channels t
          WHERE t.channel_entity_key = ce.channel_entity_key)`);
      }

      const sort = sortColumns[request.query.sort || "name"];
      const order = request.query.order === "desc" ? "DESC" : "ASC";
      values.push(pageInfo.limit, pageInfo.offset);
      const result = await query<DbRow>(`
        SELECT
          ce.*,
          EXISTS (SELECT 1 FROM ${schema}.channel_entity_social_channels s
            WHERE s.channel_entity_key = ce.channel_entity_key) AS has_social_source,
          EXISTS (SELECT 1 FROM ${schema}.channel_entity_ticker_channels t
            WHERE t.channel_entity_key = ce.channel_entity_key) AS has_ticker_source,
          (SELECT count(*)::int FROM ${schema}.channel_entity_social_channels s
            WHERE s.channel_entity_key = ce.channel_entity_key) AS social_source_count,
          (SELECT count(*)::int FROM ${schema}.channel_entity_ticker_channels t
            WHERE t.channel_entity_key = ce.channel_entity_key) AS ticker_source_count,
          GREATEST(
            COALESCE((SELECT max(c.followers) FROM ${schema}.channel_entity_social_channels link
              JOIN ${schema}.social_channels c ON c.channel_key = link.channel_key
              WHERE link.channel_entity_key = ce.channel_entity_key), 0),
            COALESCE((SELECT max(t.followers) FROM ${schema}.channel_entity_ticker_channels link
              JOIN ${schema}.ticker_channels t ON t.source_channel_id = link.source_channel_id
              WHERE link.channel_entity_key = ce.channel_entity_key), 0)
          ) AS followers_total,
          GREATEST(
            COALESCE((SELECT max(c.views) FROM ${schema}.channel_entity_social_channels link
              JOIN ${schema}.social_channels c ON c.channel_key = link.channel_key
              WHERE link.channel_entity_key = ce.channel_entity_key), 0),
            COALESCE((SELECT max(t.views) FROM ${schema}.channel_entity_ticker_channels link
              JOIN ${schema}.ticker_channels t ON t.source_channel_id = link.source_channel_id
              WHERE link.channel_entity_key = ce.channel_entity_key), 0)
          ) AS views_total,
          GREATEST(
            COALESCE((SELECT max(c.likes) FROM ${schema}.channel_entity_social_channels link
              JOIN ${schema}.social_channels c ON c.channel_key = link.channel_key
              WHERE link.channel_entity_key = ce.channel_entity_key), 0),
            COALESCE((SELECT max(t.likes) FROM ${schema}.channel_entity_ticker_channels link
              JOIN ${schema}.ticker_channels t ON t.source_channel_id = link.source_channel_id
              WHERE link.channel_entity_key = ce.channel_entity_key), 0)
          ) AS likes_total,
          count(*) OVER()::text AS total_count
        FROM ${schema}.channel_entities ce
        ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
        ORDER BY ${sort} ${order} NULLS LAST, ce.channel_entity_key ASC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `, values);
      const total = firstTotal(result.rows[0]);
      const rows = result.rows.map(({ total_count: _totalCount, ...row }) => row);
      return listResponse(rows, pageInfo.page, pageInfo.limit, total);
    }
  );

  app.get<{ Params: KeyParams }>(
    "/channels/:key",
    {
      schema: {
        tags: ["Channels"],
        summary: "Get a unified channel and all source records",
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
          ce.*,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'channelKey', c.channel_key,
            'channelType', c.channel_type,
            'channelName', c.channel_name,
            'channelUrl', c.channel_url,
            'followers', c.followers,
            'views', c.views,
            'likes', c.likes,
            'matchMethod', link.match_method,
            'influencer', jsonb_build_object(
              'influencerKey', i.influencer_key,
              'name', i.name,
              'nickName', i.nick_name,
              'identityVerified', i.identity_verified
            )
          ) ORDER BY c.channel_name)
            FROM ${schema}.channel_entity_social_channels link
            JOIN ${schema}.social_channels c ON c.channel_key = link.channel_key
            JOIN ${schema}.influencers i ON i.influencer_key = c.influencer_key
            WHERE link.channel_entity_key = ce.channel_entity_key), '[]'::jsonb) AS social_sources,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'sourceChannelId', t.source_channel_id,
            'name', t.name,
            'followers', t.followers,
            'views', t.views,
            'likes', t.likes,
            'comments', t.comments,
            'shares', t.shares,
            'matchMethod', link.match_method,
            'confidence', link.confidence
          ) ORDER BY t.name)
            FROM ${schema}.channel_entity_ticker_channels link
            JOIN ${schema}.ticker_channels t ON t.source_channel_id = link.source_channel_id
            WHERE link.channel_entity_key = ce.channel_entity_key), '[]'::jsonb) AS ticker_sources
        FROM ${schema}.channel_entities ce
        WHERE ce.channel_entity_key = $1
      `, [request.params.key]);
      return result.rows[0] || notFound(reply, "Channel");
    }
  );
};
