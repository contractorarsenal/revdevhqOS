import "server-only";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNode, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { Pool } from "pg";
import ws from "ws";
import { env } from "@/lib/env/server";
import * as schema from "./schema";

/**
 * All drivers are exposed under the node-postgres drizzle type: the query and
 * transaction APIs are structurally identical across neon-serverless,
 * node-postgres, and pglite drivers.
 *
 * Driver selection:
 *  - neon.tech URLs → Neon serverless (WebSocket) driver; supports transactions
 *  - pglite:// URLs → embedded Postgres for local development (dev-only)
 *  - anything else → node-postgres (e.g. a local Postgres instance)
 *
 * The instance is created lazily on first query so that `next build` (which
 * imports route modules to collect page data) never opens a connection, and it
 * is cached on globalThis so dev-mode module reloads do not open extra
 * connections or PGlite file locks.
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
  if (url.includes("neon.tech")) {
    neonConfig.webSocketConstructor = ws;
    return drizzleNeon(new NeonPool({ connectionString: url }), { schema }) as unknown as Database;
  }
  return drizzleNode(new Pool({ connectionString: url }), { schema });
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
