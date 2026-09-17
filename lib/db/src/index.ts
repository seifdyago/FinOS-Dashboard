import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.DATABASE_URL_UNPOOLED;

if (!databaseUrl) {
  throw new Error(
    "A PostgreSQL connection URL must be set (DATABASE_URL, POSTGRES_URL, POSTGRES_PRISMA_URL, or DATABASE_URL_UNPOOLED).",
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });

export * from "./schema";
