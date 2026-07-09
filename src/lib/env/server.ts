import "server-only";
import { z } from "zod";

/**
 * Server-side environment validation for Supabase / Vercel.
 *
 * Validation is LAZY: values are parsed on first access, not at import time,
 * so `next build` (which imports route modules to collect page data) never
 * fails on machines/CI steps that don't have runtime secrets. Missing vars
 * fail fast, with a clear message, on the first real request that needs them.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Supabase pooled connection string)"),
  DATABASE_URL_DIRECT: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

type ServerEnv = Omit<z.infer<typeof schema>, "DATABASE_URL_DIRECT" | "NEXT_PUBLIC_APP_URL"> & {
  DATABASE_URL_DIRECT: string;
  NEXT_PUBLIC_APP_URL: string;
};

let cached: ServerEnv | null = null;

function load(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment: ${issues}`);
  }
  cached = {
    ...parsed.data,
    DATABASE_URL_DIRECT: parsed.data.DATABASE_URL_DIRECT ?? parsed.data.DATABASE_URL,
    NEXT_PUBLIC_APP_URL: parsed.data.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  };
  return cached;
}

export const env: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop) {
    return load()[prop as keyof ServerEnv];
  },
});
