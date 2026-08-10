import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  database: config.postgres.database,
  user: config.postgres.user,
  password: config.postgres.password,
  max: config.postgres.max,
  idleTimeoutMillis: config.postgres.idleTimeoutMillis,
  connectionTimeoutMillis: config.postgres.connectionTimeoutMillis,
  application_name: "kol-gov-api"
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error);
});

export async function query<T extends pg.QueryResultRow>(
  text: string,
  values: readonly unknown[] = []
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, [...values]);
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
