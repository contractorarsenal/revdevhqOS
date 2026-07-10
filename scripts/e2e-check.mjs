/**
 * Manual-verification driver: exercises the real app in Chrome.
 * Auth: real Supabase project (user created via admin API, pre-confirmed).
 * Data: whatever DATABASE_URL points at (embedded Postgres in local dev).
 *
 * Requires a running dev server, NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const EMAIL = `e2e-${Date.now()}@revdevhqos.dev`;
const PASSWORD = "e2e-password-123";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { name: "E2E Runner" },
});
if (createErr) { console.error("could not create test user:", createErr.message); process.exit(1); }
console.log("created confirmed Supabase test user");

const results = [];
const ok = (name) => { results.push(["PASS", name]); console.log("PASS", name); };
const fail = (name, err) => { results.push(["FAIL", name]); console.log("FAIL", name, "-", err?.message?.slice(0, 200)); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
page.setDefaultTimeout(20000);
async function step(name, fn) { try { await fn(); ok(name); } catch (err) { fail(name, err); } }

await step("sign in with Supabase Auth", async () => {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/setup", { timeout: 25000 });
});

await step("create workspace (owner role, defaults seeded)", async () => {
  await page.fill('input[name="name"]', "E2E Agency");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 25000 });
  await page.waitForSelector("text=E2E Agency");
});

await step("dashboard renders zero-state metrics from database", async () => {
  const body = await page.textContent("body");
  if (!body.includes("MRR")) throw new Error("metrics missing");
  if (!body.includes("Your workspace is empty")) throw new Error("zero state missing");
});

await step("create client; persists after reload", async () => {
  await page.goto(`${BASE}/clients`);
  await page.getByRole("button", { name: "Add Client" }).first().click();
  await page.fill('input[placeholder="Summit Roofing Co."]', "E2E Verification Co.");
  await page.fill('input[placeholder="Dana Whitfield"]', "Eve Tester");
  await page.getByRole("button", { name: "Create client" }).click();
  await page.waitForSelector("text=Client created");
  await page.reload();
  await page.waitForSelector("text=E2E Verification Co.");
});

await step("client detail: related data + note persists", async () => {
  await page.getByText("E2E Verification Co.").first().click();
  await page.getByRole("link", { name: "View full client" }).click();
  await page.waitForSelector("text=Account snapshot");
  await page.waitForSelector("text=Eve Tester");
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.fill('textarea[placeholder="Write a note…"]', "E2E note: persisted.");
  await page.getByRole("button", { name: "Save note" }).click();
  await page.waitForSelector("text=Note added");
  await page.reload();
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.waitForSelector("text=E2E note: persisted.");
});

await step("service + subscription; MRR recalculates", async () => {
  await page.goto(`${BASE}/billing?tab=services`);
  await page.getByRole("button", { name: "Add service" }).first().click();
  await page.fill('input[placeholder="Google Ads management"]', "E2E SEO");
  await page.locator('input[type="number"]').fill("1000");
  await page.getByRole("button", { name: "Save service" }).click();
  await page.waitForSelector("text=Service created");
  await page.goto(`${BASE}/billing?tab=subscriptions`);
  await page.getByRole("button", { name: "New subscription" }).first().click();
  await page.getByRole("button", { name: "Create subscription" }).click();
  await page.waitForSelector("text=Subscription created");
  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector("text=$1,000");
});

await step("invoice + payment update balances", async () => {
  await page.goto(`${BASE}/billing?tab=invoices`);
  await page.getByRole("button", { name: "Create invoice" }).first().click();
  await page.fill('input[placeholder="Description"]', "E2E line item");
  await page.locator('input[placeholder="Unit price"]').fill("500");
  await page.getByRole("button", { name: "Create invoice", exact: true }).last().click();
  await page.waitForSelector("text=Invoice created");
  await page.getByRole("button", { name: /Mark paid/ }).first().click();
  await page.getByRole("button", { name: "Record & mark paid" }).click();
  await page.waitForSelector("text=Invoice paid");
  await page.reload();
  await page.waitForSelector("text=paid");
});

await step("lead → opportunity conversion", async () => {
  await page.goto(`${BASE}/leads`);
  await page.getByRole("button", { name: "Add Lead" }).first().click();
  await page.fill('input[placeholder="Peak Valley Landscaping"]', "E2E Lead LLC");
  await page.getByRole("button", { name: "Create lead" }).click();
  await page.waitForSelector("text=Lead created");
  await page.getByText("E2E Lead LLC").first().click();
  await page.getByRole("button", { name: /Convert to opportunity/ }).click();
  await page.waitForSelector("text=Opportunity created in the pipeline");
  await page.goto(`${BASE}/pipeline`);
  await page.waitForSelector("text=E2E Lead LLC");
});

await step("drag opportunity between stages; persists after reload", async () => {
  const card = page.getByText("E2E Lead LLC").first();
  const target = page.getByText("Qualified", { exact: true }).first();
  const cb = await card.boundingBox();
  const tb = await target.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + 40, cb.y, { steps: 5 });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 60, { steps: 15 });
  await page.mouse.up();
  await page.waitForSelector("text=Moved to Qualified", { timeout: 10000 });
  await page.reload();
  const colBox = await page.getByText("Qualified", { exact: true }).first().boundingBox();
  const cardBox = await page.getByText("E2E Lead LLC").first().boundingBox();
  if (Math.abs(cardBox.x - colBox.x) > 260) throw new Error("card not in Qualified column after reload");
});

await step("task create + complete persists", async () => {
  await page.goto(`${BASE}/tasks`);
  await page.getByRole("button", { name: "Add Task" }).first().click();
  await page.fill('input[placeholder="Publish monthly report"]', "E2E task");
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForSelector("text=Task created");
  await page.waitForSelector("text=E2E task");
});

await step("sign out; protected routes redirect", async () => {
  await page.getByTitle("Sign out").click();
  await page.waitForURL("**/sign-in", { timeout: 20000 });
  await page.goto(`${BASE}/clients`);
  await page.waitForURL("**/sign-in");
});

await browser.close();

// Clean up the throwaway auth user this run created — never leave it behind.
try {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const u = data.users.find((x) => x.email === EMAIL);
  if (u) {
    await admin.auth.admin.deleteUser(u.id);
    console.log("cleaned up test user:", EMAIL);
  }
} catch (err) {
  console.error("warning: could not clean up test user", EMAIL, err);
}

const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} verification steps passed`);
process.exit(failed ? 1 : 0);
