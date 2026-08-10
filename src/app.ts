import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyError } from "fastify";
import { config } from "./config.js";
import { closeDatabase } from "./db.js";
import { bsiRoutes } from "./routes/bsi.js";
import { channelRoutes } from "./routes/channels.js";
import { growthRoutes } from "./routes/growth.js";
import { healthRoutes } from "./routes/health.js";
import { influencerRoutes } from "./routes/influencers.js";
import { mcnRoutes } from "./routes/mcns.js";
import { metaRoutes } from "./routes/meta.js";
import { newsRoutes } from "./routes/news.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === "production" ? "info" : "debug"
    },
    trustProxy: true,
    requestIdHeader: "x-request-id"
  });

  const corsOrigin = config.corsOrigin === "*"
    ? "*"
    : config.corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean);

  await app.register(helmet, {
    contentSecurityPolicy: config.nodeEnv === "production" ? undefined : false
  });
  await app.register(cors, {
    origin: corsOrigin,
    methods: ["GET", "HEAD", "OPTIONS"]
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "KOL.GOV.VN PostgreSQL API",
        description: "Read-only REST API for the normalized kol.gov.vn dataset",
        version: "1.0.0"
      },
      servers: [{ url: `http://localhost:${config.port}`, description: "Local server" }],
      tags: [
        { name: "System" },
        { name: "Influencers" },
        { name: "Channels" },
        { name: "MCNs" },
        { name: "Growth rankings" },
        { name: "BSI rankings" },
        { name: "News" }
      ]
    }
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    staticCSP: true,
    uiConfig: {
      docExpansion: "list",
      deepLinking: true
    }
  });

  await app.register(healthRoutes);
  await app.register(metaRoutes, { prefix: "/api/v1" });
  await app.register(influencerRoutes, { prefix: "/api/v1" });
  await app.register(channelRoutes, { prefix: "/api/v1" });
  await app.register(mcnRoutes, { prefix: "/api/v1" });
  await app.register(growthRoutes, { prefix: "/api/v1" });
  await app.register(bsiRoutes, { prefix: "/api/v1" });
  await app.register(newsRoutes, { prefix: "/api/v1" });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: "ROUTE_NOT_FOUND",
      message: `Route ${request.method} ${request.url} not found`
    });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, "Request failed");
    if (error.validation) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        message: error.message,
        details: error.validation
      });
    }
    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    return reply.code(statusCode).send({
      error: statusCode === 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR",
      message: statusCode === 500 ? "An internal server error occurred" : error.message
    });
  });

  app.addHook("onClose", async () => {
    await closeDatabase();
  });

  return app;
}
