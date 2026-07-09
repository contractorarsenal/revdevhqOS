/**
 * Development-only demo seed. Never runs in production.
 * Creates one clearly-labeled demo workspace with sample records, owned by a
 * demo Supabase Auth user (created via the service-role admin API).
 *
 * Requires: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 *   npm run db:seed
 *
 * Demo sign-in: demo@revdevhqos.dev / demo-password-123
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { createClient } from "@supabase/supabase-js";
import * as schema from "../src/lib/db/schema";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV is production.");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (url.startsWith("pglite://")) {
  console.error(
    "Seeding requires the real Supabase database (auth users live in Supabase).\n" +
      "Point DATABASE_URL at your Supabase project and set SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}
if (!supabaseUrl || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to create the demo auth user.");
  process.exit(1);
}

async function getDb() {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({
    connectionString: url,
    ssl: url!.includes("supabase.co") || url!.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
};
const dateStr = (offset: number) => day(offset).toISOString().slice(0, 10);

async function main() {
  const admin = createClient(supabaseUrl!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { db, close } = await getDb();
  const { eq } = await import("drizzle-orm");

  const existing = await db.select().from(schema.profiles).where(eq(schema.profiles.email, "demo@revdevhqos.dev"));
  if (existing.length > 0) {
    console.log("Demo profile already exists — skipping seed. Delete the demo workspace/user to reseed.");
    await close();
    return;
  }

  console.log("Creating demo auth user…");
  const { data: created, error } = await admin.auth.admin.createUser({
    email: "demo@revdevhqos.dev",
    password: "demo-password-123",
    email_confirm: true,
    user_metadata: { name: "Demo Owner" },
  });
  if (error || !created.user) {
    console.error("Could not create demo auth user:", error?.message);
    await close();
    process.exit(1);
  }
  const userId = created.user.id;
  const now = new Date();

  console.log("Seeding demo data…");
  await db.insert(schema.profiles).values({ id: userId, name: "Demo Owner", email: "demo@revdevhqos.dev" });

  const [ws] = await db.insert(schema.workspaces).values({
    name: "Demo Agency (Seed Data)", slug: `demo-agency-${Math.random().toString(36).slice(2, 7)}`,
    timezone: "America/Phoenix",
  }).returning();
  await db.insert(schema.workspaceMembers).values({ workspaceId: ws.id, userId, role: "owner" });

  const stageDefs = [
    { name: "New Lead", probability: 10 }, { name: "Contacted", probability: 25 },
    { name: "Qualified", probability: 40 }, { name: "Proposal Sent", probability: 65 },
    { name: "Verbal Yes", probability: 85 },
    { name: "Closed Won", probability: 100, isWon: true },
    { name: "Closed Lost", probability: 0, isLost: true },
  ];
  const stages = await db.insert(schema.pipelineStages).values(
    stageDefs.map((s, i) => ({ workspaceId: ws.id, position: i, isWon: false, isLost: false, ...s }))
  ).returning();

  const [template] = await db.insert(schema.onboardingTemplates).values({
    workspaceId: ws.id, name: "Standard agency onboarding", isDefault: true,
  }).returning();
  const stepNames = ["Contract signed", "Payment received", "Access requested", "Assets received", "Kickoff scheduled", "Work started", "Client review", "Active client"];
  await db.insert(schema.onboardingSteps).values(stepNames.map((name, i) => ({ templateId: template.id, name, position: i })));

  const serviceDefs: [string, string, string][] = [
    ["Google Ads management", "1400", "monthly"], ["Meta Ads management", "1200", "monthly"],
    ["SEO", "1300", "monthly"], ["Website management", "600", "monthly"],
    ["Website design", "6500", "one_time"], ["Reputation management", "600", "monthly"],
  ];
  const services = await db.insert(schema.services).values(
    serviceDefs.map(([name, defaultPrice, defaultFrequency]) => ({
      workspaceId: ws.id, name: `${name} (demo)`, defaultPrice,
      defaultFrequency: defaultFrequency as (typeof schema.billingFrequency.enumValues)[number],
    }))
  ).returning();

  const clientDefs = [
    { name: "Summit Roofing Co. (demo)", industry: "Roofing contractor", status: "active", contact: ["Dana Whitfield", "dana@summitroofing.example"], subs: [[0, "2200"], [2, "1400"], [3, "600"]] },
    { name: "Desert Air HVAC (demo)", industry: "HVAC", status: "active", contact: ["Rob Castillo", "rob@desertair.example"], subs: [[0, "1800"], [1, "1200"]] },
    { name: "BrightPath Plumbing (demo)", industry: "Plumbing", status: "past_due", contact: ["Alicia Grant", "alicia@brightpath.example"], subs: [[1, "1400"], [5, "600"]] },
    { name: "Vantage Law Group (demo)", industry: "Legal", status: "active", contact: ["Priya Nair", "priya@vantagelaw.example"], subs: [[2, "1900"], [3, "600"]] },
    { name: "Ironwood Fence & Gate (demo)", industry: "Fencing", status: "onboarding", contact: ["Sam Otero", "sam@ironwood.example"], subs: [[2, "1100"]] },
    { name: "Lakeside Dental (demo)", industry: "Dental", status: "paused", contact: ["Mia Song", "mia@lakeside.example"], subs: [] },
  ] as const;

  const clients: (typeof schema.clients.$inferSelect)[] = [];
  for (const def of clientDefs) {
    const [client] = await db.insert(schema.clients).values({
      workspaceId: ws.id, name: def.name, industry: def.industry,
      status: def.status as (typeof schema.clientStatus.enumValues)[number],
      ownerId: userId, startDate: dateStr(-200 - clients.length * 40),
    }).returning();
    clients.push(client);
    await db.insert(schema.contacts).values({
      workspaceId: ws.id, clientId: client.id, name: def.contact[0], email: def.contact[1], isPrimary: true,
    });
    for (const [svcIdx, amount] of def.subs) {
      await db.insert(schema.subscriptions).values({
        workspaceId: ws.id, clientId: client.id, serviceId: services[svcIdx].id,
        amount, frequency: "monthly", status: def.status === "paused" ? "paused" : "active",
        startDate: dateStr(-180), nextBillingDate: dateStr(24),
      });
    }
  }

  await db.insert(schema.clientOnboarding).values(
    stepNames.map((name, i) => ({
      workspaceId: ws.id, clientId: clients[4].id, templateId: template.id,
      stepName: name, position: i, completedAt: i < 3 ? day(-4) : null,
    }))
  );

  const [invPaid] = await db.insert(schema.invoices).values({
    workspaceId: ws.id, clientId: clients[0].id, number: "INV-1001 (demo)", status: "paid",
    issueDate: dateStr(-8), dueDate: dateStr(-1), total: "4200", amountPaid: "4200",
  }).returning();
  await db.insert(schema.invoices).values([
    { workspaceId: ws.id, clientId: clients[2].id, number: "INV-1002 (demo)", status: "open", issueDate: dateStr(-25), dueDate: dateStr(-12), total: "2400", amountPaid: "0" },
    { workspaceId: ws.id, clientId: clients[1].id, number: "INV-1003 (demo)", status: "open", issueDate: dateStr(-3), dueDate: dateStr(12), total: "3000", amountPaid: "0" },
    { workspaceId: ws.id, clientId: clients[3].id, number: "INV-1004 (demo)", status: "draft", total: "2500", amountPaid: "0" },
  ]);
  await db.insert(schema.payments).values([
    { workspaceId: ws.id, clientId: invPaid.clientId, invoiceId: invPaid.id, amount: "4200", status: "succeeded", method: "ACH", paidAt: day(-1) },
    { workspaceId: ws.id, clientId: clients[1].id, amount: "3000", status: "succeeded", method: "Card", paidAt: now },
    { workspaceId: ws.id, clientId: clients[3].id, amount: "2500", status: "succeeded", method: "ACH", paidAt: day(-40) },
    { workspaceId: ws.id, clientId: clients[0].id, amount: "4200", status: "succeeded", method: "ACH", paidAt: day(-35) },
    { workspaceId: ws.id, clientId: clients[2].id, amount: "2000", status: "failed", method: "Card", reference: "card declined", paidAt: day(-5) },
  ]);

  const leadDefs = [
    ["Peak Valley Landscaping (demo)", "Nora Diaz", "new", "1600", null, "Referral"],
    ["Oak & Iron Custom Homes (demo)", "Ted Alvarez", "contacted", "4000", "12000", "Google Ads"],
    ["Blue Sky Painting (demo)", "Angela Reyes", "qualified", "1200", null, "Website form"],
    ["Anchor Concrete (demo)", "Doug Pratt", "new", "1500", null, "Cold outreach"],
    ["Renew Med Spa (demo)", "Chloe Bennett", "lost", "2000", "1500", "Facebook"],
  ] as const;
  const leads = [];
  for (const [company, contactName, status, mrr, oneTime, source] of leadDefs) {
    const [lead] = await db.insert(schema.leads).values({
      workspaceId: ws.id, company, contactName, source,
      status: status as (typeof schema.leadStatus.enumValues)[number],
      estimatedMrr: mrr, estimatedValue: oneTime, ownerId: userId,
      nextFollowUpAt: status === "new" ? day(1) : status === "contacted" ? day(-2) : null,
    }).returning();
    leads.push(lead);
  }

  const oppDefs: [string, number, string, string][] = [
    ["Oak & Iron Custom Homes (demo)", 3, "60000", "4000"],
    ["Blue Sky Painting (demo)", 2, "14400", "1200"],
    ["Silver Peak Property Mgmt (demo)", 1, "38400", "3200"],
    ["Titan Garage Floors (demo)", 4, "25100", "1800"],
    ["Prime Towing (demo)", 6, "14400", "1200"],
  ];
  for (const [name, stageIdx, value, mrr] of oppDefs) {
    await db.insert(schema.opportunities).values({
      workspaceId: ws.id, stageId: stages[stageIdx].id, name, value, mrr,
      status: stages[stageIdx].isLost ? "lost" : stages[stageIdx].isWon ? "won" : "open",
      ownerId: userId, expectedCloseDate: dateStr(20),
      leadId: name.startsWith("Oak") ? leads[1].id : name.startsWith("Blue") ? leads[2].id : null,
    });
  }

  await db.insert(schema.tasks).values([
    { workspaceId: ws.id, title: "Chase overdue invoice INV-1002 (demo)", priority: "urgent", assigneeId: userId, clientId: clients[2].id, dueDate: day(-2) },
    { workspaceId: ws.id, title: "Publish monthly report — Summit Roofing (demo)", priority: "medium", assigneeId: userId, clientId: clients[0].id, dueDate: day(0) },
    { workspaceId: ws.id, title: "Kickoff call — Ironwood (demo)", priority: "high", assigneeId: userId, clientId: clients[4].id, dueDate: day(1) },
    { workspaceId: ws.id, title: "Send revised proposal — Oak & Iron (demo)", priority: "high", assigneeId: userId, leadId: leads[1].id, dueDate: day(2) },
    { workspaceId: ws.id, title: "Update service pricing sheet (demo)", priority: "low", assigneeId: userId },
    { workspaceId: ws.id, title: "Launch Google Ads — Desert Air (demo)", priority: "high", status: "completed", completedAt: day(-3), assigneeId: userId, clientId: clients[1].id, dueDate: day(-3) },
  ]);

  await db.insert(schema.notes).values({
    workspaceId: ws.id, body: "Demo note: Dana prefers reporting calls on the last Thursday of the month.",
    authorId: userId, clientId: clients[0].id, pinned: true,
  });

  await db.insert(schema.activityLogs).values([
    { workspaceId: ws.id, actorId: userId, action: "client.created", entityType: "client", entityId: clients[0].id, clientId: clients[0].id, metadata: { name: clients[0].name } },
    { workspaceId: ws.id, actorId: userId, action: "payment.recorded", entityType: "payment", clientId: clients[1].id, metadata: { amount: 3000 } },
    { workspaceId: ws.id, actorId: userId, action: "invoice.created", entityType: "invoice", clientId: clients[2].id, metadata: { number: "INV-1002 (demo)", total: 2400 } },
  ]);

  console.log("✓ Seeded demo workspace:", ws.name);
  console.log("  Sign in with demo@revdevhqos.dev / demo-password-123");
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
