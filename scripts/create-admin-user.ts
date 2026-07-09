/**
 * Bootstrap the first admin user + owner workspace. Idempotent.
 *
 *   ADMIN_PASSWORD='…' npm run admin:create        # or run without it to be prompted
 *
 * Config (env, all optional except the password on first creation):
 *   ADMIN_EMAIL     defaults to jay@revdevhq.com
 *   ADMIN_NAME      defaults to "Jay"
 *   ADMIN_PASSWORD  used only when the auth user does not exist yet
 *   WORKSPACE_NAME  defaults to "RevDevHQ"
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auth user)
 *           DATABASE_URL (profile/workspace rows)
 * Never prints passwords or keys.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "jay@revdevhq.com").toLowerCase();
const ADMIN_NAME = process.env.ADMIN_NAME ?? "Jay";
const WORKSPACE_NAME = process.env.WORKSPACE_NAME ?? "RevDevHQ";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}
if (!dbUrl) {
  console.error("Missing DATABASE_URL in the environment.");
  process.exit(1);
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const mutedOut = new Writable({
      write(chunk, _enc, cb) {
        if (!muted) process.stdout.write(chunk);
        cb();
      },
    });
    const rl = createInterface({ input: process.stdin, output: mutedOut, terminal: true });
    rl.question(question, (answer) => {
      muted = false;
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function getDb() {
  if (dbUrl!.startsWith("pglite://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = new PGlite(dbUrl!.replace("pglite://", ""));
    return { db: drizzle(client, { schema }), close: () => client.close() };
  }
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl!.includes("supabase.co") || dbUrl!.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

const DEFAULT_STAGES = [
  { name: "New Lead", probability: 10 },
  { name: "Contacted", probability: 25 },
  { name: "Qualified", probability: 40 },
  { name: "Proposal Sent", probability: 65 },
  { name: "Verbal Yes", probability: 85 },
  { name: "Closed Won", probability: 100, isWon: true },
  { name: "Closed Lost", probability: 0, isLost: true },
];
const DEFAULT_ONBOARDING_STEPS = [
  "Contract signed", "Payment received", "Access requested", "Assets received",
  "Kickoff scheduled", "Work started", "Client review", "Active client",
];

async function main() {
  const admin = createClient(supabaseUrl!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) find or create the auth user
  let userId: string | null = null;
  for (let page = 1; page <= 10 && !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("Could not list auth users:", error.message);
      process.exit(1);
    }
    userId = data.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL)?.id ?? null;
    if (data.users.length < 200) break;
  }

  if (userId) {
    console.log(`✓ Auth user ${ADMIN_EMAIL} already exists — password left unchanged.`);
  } else {
    let password = process.env.ADMIN_PASSWORD;
    if (!password) {
      if (!process.stdin.isTTY) {
        console.error("Auth user does not exist. Set ADMIN_PASSWORD or run interactively to be prompted.");
        process.exit(1);
      }
      password = await promptHidden(`Choose a password for ${ADMIN_EMAIL} (input hidden): `);
    }
    if (!password || password.length < 8) {
      console.error("Password must be at least 8 characters.");
      process.exit(1);
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { name: ADMIN_NAME },
    });
    if (error || !data.user) {
      console.error("Could not create auth user:", error?.message);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`✓ Created confirmed auth user ${ADMIN_EMAIL}`);
  }

  // 2) app rows: profile, workspace, owner membership (idempotent)
  const { db, close } = await getDb();
  try {
    await db
      .insert(schema.profiles)
      .values({ id: userId, name: ADMIN_NAME, email: ADMIN_EMAIL })
      .onConflictDoUpdate({ target: schema.profiles.id, set: { email: ADMIN_EMAIL } });
    console.log("✓ Profile row in place");

    const memberships = await db
      .select({ workspaceId: schema.workspaceMembers.workspaceId, role: schema.workspaceMembers.role })
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, userId));

    if (memberships.length > 0) {
      const owner = memberships.find((m) => m.role === "owner");
      if (owner) {
        console.log("✓ Already an owner of a workspace — nothing to create.");
      } else {
        await db
          .update(schema.workspaceMembers)
          .set({ role: "owner" })
          .where(and(
            eq(schema.workspaceMembers.userId, userId),
            eq(schema.workspaceMembers.workspaceId, memberships[0].workspaceId)
          ));
        console.log("✓ Promoted existing membership to owner.");
      }
    } else {
      const slug = `${WORKSPACE_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${Math.random().toString(36).slice(2, 7)}`;
      await db.transaction(async (tx) => {
        const [ws] = await tx
          .insert(schema.workspaces)
          .values({ name: WORKSPACE_NAME, slug })
          .returning();
        await tx.insert(schema.workspaceMembers).values({ workspaceId: ws.id, userId: userId!, role: "owner" });
        await tx.insert(schema.pipelineStages).values(
          DEFAULT_STAGES.map((s, i) => ({
            workspaceId: ws.id, name: s.name, probability: s.probability, position: i,
            isWon: s.isWon ?? false, isLost: s.isLost ?? false,
          }))
        );
        const [template] = await tx
          .insert(schema.onboardingTemplates)
          .values({ workspaceId: ws.id, name: "Standard agency onboarding", isDefault: true })
          .returning();
        await tx.insert(schema.onboardingSteps).values(
          DEFAULT_ONBOARDING_STEPS.map((name, i) => ({ templateId: template.id, name, position: i }))
        );
      });
      console.log(`✓ Created workspace "${WORKSPACE_NAME}" with ${ADMIN_EMAIL} as owner (default pipeline + onboarding template seeded).`);
    }
    console.log(`\nDone. Sign in at /sign-in as ${ADMIN_EMAIL}.`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
