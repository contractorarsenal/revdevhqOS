import "server-only";
import { drizzle as drizzleNode, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env/server";
import * as schema from "./schema";

/**
 * Drizzle over Supabase Postgres.
 *
 * Driver selection:
 *  - pglite:// URLs → embedded Postgres for local development (dev-only)
 *  - anything else → node-postgres against DATABASE_URL (Supabase pooled
 *    connection string; use the session/transaction pooler URL from the
 *    Supabase dashboard — transactions are supported)
 *
 * The instance is created lazily on first query so `next build` never opens
 * a connection, and cached on globalThis so dev-mode module reloads don't
 * open extra connections or PGlite file locks. This connection uses the
 * postgres role and is server-only; RLS locks the tables away from the
 * anon/authenticated PostgREST roles.
 */
export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __rdhqDb?: Database };

function createDb(): Database {
  const url = env.DATABASE_URL;
  if (url.startsWith("pglite://")) {
    if (env.NODE_ENV === "production") {
      throw new Error("PGlite is a development-only database driver");
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PGlite } = require("@electric-sql/pglite");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/pglite");
    return drizzle(new PGlite(url.replace("pglite://", "")), { schema }) as unknown as Database;
  }
  return drizzleNode(
    new Pool({
      connectionString: url,
      ssl: url.includes("supabase.co") || url.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
    }),
    { schema }
  );
}

function getDb(): Database {
  if (!globalForDb.__rdhqDb) globalForDb.__rdhqDb = createDb();
  return globalForDb.__rdhqDb;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const instance = getDb();
    const value = instance[prop as keyof Database];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
  },
});

export { schema };
