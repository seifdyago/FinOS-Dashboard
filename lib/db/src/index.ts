import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.NEON_DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED;

export const hasDatabaseUrl = Boolean(databaseUrl);
export const pool = new Pool({
  connectionString:
    databaseUrl ??
    "postgresql://unconfigured:unconfigured@127.0.0.1:1/unconfigured",
});
export const db = drizzle(pool, { schema });

export * from "./schema";
