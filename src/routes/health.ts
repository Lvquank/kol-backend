import type { FastifyPluginAsync } from "fastify";
import { query } from "../db.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["System"],
        summary: "Liveness check"
      }
    },
    async () => ({ status: "ok", timestamp: new Date().toISOString() })
  );

  app.get(
    "/ready",
    {
      schema: {
        tags: ["System"],
        summary: "Database readiness check"
      }
    },
    async () => {
      const result = await query<{ database: string; server_time: string }>(
        "SELECT current_database() AS database, now()::text AS server_time"
      );
      return { status: "ready", database: result.rows[0] };
    }
  );
};
