import type { FastifyPluginAsync } from "fastify";
import { schema } from "../config.js";
import { query } from "../db.js";

type KolCsvRow = {
  name: string | null;
  nick_name: string | null;
  gender: string | null;
  identity_verified: boolean;
  channel_type: string | null;
  channel_name: string | null;
  channel_url: string | null;
  followers: string | null;
  views: string | null;
  likes: string | null;
};

const columns: Array<keyof KolCsvRow> = [
  "name",
  "nick_name",
  "gender",
  "identity_verified",
  "channel_type",
  "channel_name",
  "channel_url",
  "followers",
  "views",
  "likes"
];

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export const dataRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/data/kol.csv",
    {
      schema: {
        tags: ["Data"],
        summary: "Download the public KOL and social-channel dataset as UTF-8 CSV",
        response: {
          200: { type: "string" }
        }
      }
    },
    async (_request, reply) => {
      const result = await query<KolCsvRow>(`
        SELECT
          i.name,
          i.nick_name,
          i.gender,
          i.identity_verified,
          c.channel_type,
          c.channel_name,
          c.channel_url,
          c.followers::text,
          c.views::text,
          c.likes::text
        FROM ${schema}.influencers i
        LEFT JOIN ${schema}.social_channels c
          ON c.influencer_key = i.influencer_key
        ORDER BY lower(i.name) NULLS LAST, lower(c.channel_type) NULLS LAST, lower(c.channel_name) NULLS LAST
      `);

      const rows = [
        columns.map(csvCell).join(","),
        ...result.rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))
      ];

      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", 'attachment; filename="kol-dataset.csv"')
        .header("Cache-Control", "no-store")
        .send(`\uFEFF${rows.join("\r\n")}\r\n`);
    }
  );
};
