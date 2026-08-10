import type { FastifyPluginAsync } from "fastify";
import { query } from "../db.js";
import { schema } from "../config.js";

type CountRow = { resource: string; count: string };

export const metaRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    {
      schema: {
        tags: ["System"],
        summary: "API index"
      }
    },
    async () => ({
      name: "KOL.GOV.VN PostgreSQL API",
      version: "1.0.0",
      docs: "/docs",
      endpoints: {
        stats: "/api/v1/stats",
        influencers: "/api/v1/influencers",
        channels: "/api/v1/channels",
        mcns: "/api/v1/mcns",
        growth: "/api/v1/growth/rankings",
        bsi: "/api/v1/bsi/rankings",
        news: "/api/v1/news"
      }
    })
  );

  app.get(
    "/stats",
    {
      schema: {
        tags: ["System"],
        summary: "Dataset statistics"
      }
    },
    async () => {
      const result = await query<CountRow>(`
        SELECT 'influencers' AS resource, count(*)::text AS count FROM ${schema}.influencers
        UNION ALL SELECT 'social_channels', count(*)::text FROM ${schema}.social_channels
        UNION ALL SELECT 'channel_entities', count(*)::text FROM ${schema}.channel_entities
        UNION ALL SELECT 'ticker_channels', count(*)::text FROM ${schema}.ticker_channels
        UNION ALL SELECT 'mcns', count(*)::text FROM ${schema}.mcn_owners
        UNION ALL SELECT 'mcn_influencers', count(*)::text FROM ${schema}.mcn_influencers
        UNION ALL SELECT 'growth_rankings', count(*)::text FROM ${schema}.growth_rankings
        UNION ALL SELECT 'bsi_rankings', count(*)::text FROM ${schema}.bsi_rankings
        UNION ALL SELECT 'news_posts', count(*)::text FROM ${schema}.news_posts
      `);
      return {
        data: Object.fromEntries(result.rows.map((row) => [row.resource, Number(row.count)]))
      };
    }
  );
};
