import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "";

export default defineConfig(
  url.startsWith("pglite://")
    ? {
        dialect: "postgresql",
        driver: "pglite",
        schema: "./src/lib/db/schema.ts",
        out: "./drizzle",
        dbCredentials: { url: url.replace("pglite://", "") },
      }
    : {
        dialect: "postgresql",
        schema: "./src/lib/db/schema.ts",
        out: "./drizzle",
        dbCredentials: { url },
      }
);
