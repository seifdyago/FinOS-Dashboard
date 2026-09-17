import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrlConfig = [
  ["DATABASE_URL", process.env.DATABASE_URL],
  ["POSTGRES_URL", process.env.POSTGRES_URL],
  ["POSTGRES_PRISMA_URL", process.env.POSTGRES_PRISMA_URL],
  ["POSTGRES_URL_NON_POOLING", process.env.POSTGRES_URL_NON_POOLING],
  ["NEON_DATABASE_URL", process.env.NEON_DATABASE_URL],
  ["DATABASE_URL_UNPOOLED", process.env.DATABASE_URL_UNPOOLED],
].find(([, value]) => Boolean(value));

const databaseUrlSource = databaseUrlConfig?.[0] ?? null;
const databaseUrl = databaseUrlConfig?.[1];

export const hasDatabaseUrl = Boolean(databaseUrl);
export { databaseUrlSource };
export const pool = new Pool({
  connectionString:
    databaseUrl ??
    "postgresql://unconfigured:unconfigured@127.0.0.1:1/unconfigured",
});
export const db = drizzle(pool, { schema });

export * from "./schema";
