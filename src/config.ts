import "dotenv/config";

function readInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function readIdentifier(name: string, fallback: string): string {
  const value = process.env[name] || fallback;
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error(`${name} must be a valid PostgreSQL identifier`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  host: process.env.HOST || "0.0.0.0",
  port: readInteger("PORT", 4000, 1, 65535),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  cloudinary: {
    url: process.env.CLOUDINARY_URL?.trim() || "",
    folder: process.env.CLOUDINARY_FOLDER?.trim() || "kol-gov/registration-avatars"
  },
  postgres: {
    host: process.env.PGHOST || "localhost",
    port: readInteger("PGPORT", 5432, 1, 65535),
    database: process.env.PGDATABASE || "kol",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "",
    schema: readIdentifier("PGSCHEMA", "kol_gov"),
    max: readInteger("PGPOOL_MAX", 10, 1, 100),
    idleTimeoutMillis: readInteger("PGIDLE_TIMEOUT_MS", 30_000, 1_000, 600_000),
    connectionTimeoutMillis: readInteger("PGCONNECTION_TIMEOUT_MS", 5_000, 500, 60_000)
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-development-jwt-secret-change-before-deploy"),
    bootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL || "",
    bootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD || "",
    bootstrapName: process.env.ADMIN_BOOTSTRAP_NAME || "Quản trị hệ thống"
  }
} as const;

export const schema = `"${config.postgres.schema}"`;
