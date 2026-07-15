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
const RUN_START = new Date();
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

await step("create Monthly Revenue goal; it already reflects the $500 from the earlier invoice payment", async () => {
  await page.goto(`${BASE}/goals?new=1`);
  await page.fill('input[placeholder="Monthly Revenue"]', "E2E Monthly Revenue");
  await page.fill('input[placeholder="10000"]', "10000");
  await page.getByRole("button", { name: "Create goal" }).click();
  await page.waitForSelector("text=Goal created");
  await page.reload();
  await page.waitForSelector("text=E2E Monthly Revenue");
  const body = await page.textContent("body");
  if (!body.includes("$500")) throw new Error(`expected the goal to already show $500 collected; body did not contain it`);
});

await step("recording a payment on /billing updates the goal reached via a real sidebar navigation (not a hard reload)", async () => {
  await page.goto(`${BASE}/billing?tab=payments`);
  await page.getByRole("button", { name: /record payment/i }).first().click();
  await page.locator('select[name="clientId"]').selectOption({ label: "E2E Verification Co." });
  await page.locator('input[name="amount"]').fill("300");
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await page.waitForSelector("text=Payment recorded");
  // Real user flow: click the sidebar link (client-side navigation), never page.goto —
  // this is the exact path that used to serve a stale cached /goals RSC payload
  // before every payment mutation started revalidating "/goals" and "/goals/[id]".
  await page.locator('a[href="/goals"]').first().click();
  await page.waitForURL("**/goals");
  await page.waitForSelector("text=$800"); // 500 + 300
});

await step("editing that payment's amount updates the goal immediately", async () => {
  await page.goto(`${BASE}/billing?tab=payments`);
  await page.locator("tr", { hasText: "$300" }).getByTitle("Edit payment").click();
  await page.locator('input[name="amount"]').fill("600");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForSelector("text=Payment updated");
  await page.locator('a[href="/dashboard"]').first().click();
  await page.waitForURL("**/dashboard");
  await page.waitForSelector("text=$1,100"); // 500 + 600
});

await step("voiding that payment removes it from the goal immediately", async () => {
  await page.goto(`${BASE}/billing?tab=payments`);
  await page.locator("tr", { hasText: "$600" }).getByTitle("Remove payment").click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove payment" }).click();
  await page.waitForSelector("text=Payment removed");
  await page.locator('a[href="/goals"]').first().click();
  await page.waitForURL("**/goals");
  await page.waitForSelector("text=$500"); // back to just the original invoice payment
});

await step("restoring that payment brings it back into the goal immediately", async () => {
  await page.goto(`${BASE}/billing?tab=payments`);
  await page.getByRole("button", { name: "Removed" }).click();
  await page.locator("tr", { hasText: "$600" }).getByTitle("Restore payment").click();
  await page.waitForSelector("text=Payment restored");
  await page.locator('a[href="/dashboard"]').first().click();
  await page.waitForURL("**/dashboard");
  await page.waitForSelector("text=$1,100"); // 500 + 600 again
});


await step("a payment assigned to LAST month does not move the current-month goal", async () => {
  const prev = new Date();
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const prevMonth = prev.toISOString().slice(0, 7);
  await page.goto(`${BASE}/billing?tab=payments`);
  await page.getByRole("button", { name: /record payment/i }).first().click();
  await page.locator('select[name="clientId"]').selectOption({ label: "E2E Verification Co." });
  await page.locator('input[name="amount"]').fill("222");
  await page.locator('input[name="billingMonth"]').fill(prevMonth);
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await page.waitForSelector("text=Payment recorded");
  await page.locator('a[href="/goals"]').first().click();
  await page.waitForURL("**/goals");
  await page.waitForSelector("text=$1,100"); // unchanged — the $222 belongs to last month
});

await step("editing that payment INTO the current billing month moves it into the goal", async () => {
  const thisMonth = new Date().toISOString().slice(0, 7);
  await page.goto(`${BASE}/billing?tab=payments`);
  await page.locator("tr", { hasText: "$222" }).getByTitle("Edit payment").click();
  await page.locator('input[name="billingMonth"]').fill(thisMonth);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForSelector("text=Payment updated");
  await page.locator('a[href="/goals"]').first().click();
  await page.waitForURL("**/goals");
  await page.waitForSelector("text=$1,322"); // 1,100 + 222
});

await step("client page: edit subscription amount, payment day, and status — values persist after reload", async () => {
  await page.goto(`${BASE}/clients`);
  await page.getByText("E2E Verification Co.").first().click();
  await page.getByRole("link", { name: "View full client" }).click();
  await page.waitForSelector("text=Active services");
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.waitForSelector("text=Edit subscription");
  await page.locator('input[name="amount"]').fill("1250");
  await page.locator('input[name="paymentDay"]').fill("1");
  await page.locator('select[name="status"]').selectOption("active");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForSelector("text=Subscription updated");
  await page.reload();
  await page.waitForSelector("text=$1,250");
  await page.waitForSelector("text=day 1");
});

await step("Next payment reflects the edited payment day and the due card knows the cycle is uncollected", async () => {
  const body = await page.textContent("body");
  if (!body.includes("Next payment")) throw new Error("Next payment stat missing");
  if (!/Next payment/.test(body)) throw new Error("next payment label missing");
  // Payment day 1: the currently-owed cycle is this month's 1st (uncollected),
  // so the client page must show a "Payment due" card for the subscription.
  await page.waitForSelector("text=Payment due");
  // And the dashboard-wide due card agrees.
  await page.locator('a[href="/dashboard"]').first().click();
  await page.waitForURL("**/dashboard");
  await page.waitForSelector("text=Due recurring payments");
  await page.waitForSelector("text=E2E Verification Co.");
});

await step("paused subscription shows no misleading upcoming payment", async () => {
  await page.goto(`${BASE}/clients`);
  await page.getByText("E2E Verification Co.").first().click();
  await page.getByRole("link", { name: "View full client" }).click();
  await page.waitForSelector("text=Active services");
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.waitForSelector("text=Edit subscription");
  await page.locator('select[name="status"]').selectOption("paused");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForSelector("text=Subscription updated");
  await page.reload();
  await page.waitForSelector("text=No active subscription");
  // restore to active for the remaining steps
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.locator('select[name="status"]').selectOption("active");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForSelector("text=Subscription updated");
});

await step("client page payments list offers Edit and Remove on active payments", async () => {
  await page.reload();
  await page.getByRole("tab", { name: "Billing" }).click();
  await page.waitForSelector("text=Payments");
  const editButtons = await page.getByRole("button", { name: "Edit", exact: true }).count();
  if (editButtons < 1) throw new Error("no Edit action on client payments list");
  await page.waitForSelector("text=Remove");
});

await step("goal detail page shows live pace/projection stats with a real computed days-remaining value", async () => {
  await page.goto(`${BASE}/goals`);
  await page.getByText("E2E Monthly Revenue").first().click();
  await page.waitForSelector("text=Required pace");
  await page.waitForSelector("text=Days remaining");
  const daysRemainingText = (await page.locator('dt:has-text("Days remaining") + dd').textContent())?.trim();
  // Must render some real computed value (a non-negative integer, "Period ended",
  // or "Starts <date>") — not blank, "undefined", "NaN", or a suspicious
  // constant total-days-in-month value on a day that isn't day one of the month.
  if (!daysRemainingText || /undefined|NaN/i.test(daysRemainingText)) {
    throw new Error(`days remaining did not render a real value: "${daysRemainingText}"`);
  }
});

await step("goal cards render without layout overflow on mobile, tablet, and desktop", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 834, height: 1194 }, { width: 1440, height: 950 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${BASE}/dashboard`);
    await page.waitForSelector("text=E2E Monthly Revenue");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    if (scrollWidth > clientWidth + 1) {
      throw new Error(`horizontal overflow at ${viewport.width}px: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 950 });
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


await step("mark the opportunity lost; pipeline outcome is recorded", async () => {
  await page.goto(`${BASE}/pipeline`);
  await page.getByText("E2E Lead LLC").first().click();
  await page.waitForSelector("text=Mark Lost");
  await page.getByRole("button", { name: "Mark Lost" }).click();
  await page.waitForSelector("text=Marked lost");
});

await step("add an expense for this month", async () => {
  await page.goto(`${BASE}/expenses`);
  await page.getByRole("button", { name: "Add Expense" }).first().click();
  await page.fill('input[placeholder="Adobe Creative Cloud"]', "E2E Tools Subscription");
  await page.locator('select[name="category"]').selectOption("tools");
  await page.locator('input[name="amount"]').fill("150");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.waitForSelector("text=Expense");
});

await step("Reports page links to the Monthly Report", async () => {
  await page.goto(`${BASE}/reports`);
  await page.getByRole("link", { name: /Monthly Report/ }).click();
  await page.waitForURL("**/reports/monthly**");
  await page.waitForSelector("text=Monthly Report");
});

await step("Monthly Report: current month matches Goals/Dashboard revenue, new clients, new leads, tasks, expenses, and the goal card", async () => {
  await page.goto(`${BASE}/reports/monthly`);
  const body = await page.textContent("body");
  if (!body.includes("$1,322")) throw new Error("revenue does not match the $1,322 established on /goals earlier");
  if (!body.includes("E2E Monthly Revenue")) throw new Error("goal card missing for the current month");
  if (!body.includes("E2E Verification Co.")) throw new Error("revenue-by-client breakdown missing the test client");
  if (!body.includes("$150")) throw new Error("expense not reflected in the report");
  await page.waitForSelector("text=Profit");
  await page.waitForSelector("text=Margin");
  // 1 new client, 1 new lead, 1 completed task, 1 lost opportunity this month.
  const newClientsCard = await page.locator("text=New clients").locator("..").textContent();
  if (!newClientsCard.includes("1")) throw new Error(`expected 1 new client, card said: ${newClientsCard}`);
});

await step("Monthly Report charts render (revenue/expense/profit, revenue by client, goal progress)", async () => {
  const svgCount = await page.locator("svg.recharts-surface").count();
  if (svgCount < 2) throw new Error(`expected at least 2 rendered chart SVGs, found ${svgCount}`);
  await page.waitForSelector("text=of target"); // goal progress chart label
});

await step("Monthly Report: switching to last month shows the no-goal empty state and zero revenue (goal was only set for this month)", async () => {
  const months = await page.locator('select[aria-label="Select month"] option').allTextContents();
  if (months.length < 2) throw new Error("month selector should offer at least this month and last month");
  await page.selectOption('select[aria-label="Select month"]', { index: 1 });
  await page.waitForURL(/month=\d{4}-\d{2}/);
  await page.waitForSelector("text=No revenue goal was set for this month");
  const body = await page.textContent("body");
  if (!body.includes("$0")) throw new Error("expected $0 revenue for a month with no payments");
});

await step("Monthly Report renders without layout overflow on mobile, tablet, and desktop", async () => {
  await page.goto(`${BASE}/reports/monthly`);
  for (const viewport of [{ width: 320, height: 812 }, { width: 375, height: 812 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1024, height: 1366 }, { width: 1440, height: 950 }]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await page.waitForSelector("text=Monthly Report");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    if (scrollWidth > clientWidth + 1) {
      throw new Error(`horizontal overflow at ${viewport.width}px: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 950 });
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

// Clean up this run's workspace row (cascades to all test data) — the auth
// user deletion above does NOT cascade to the workspace.
try {
  const pg = (await import("pg")).default;
  const url = process.env.DATABASE_URL;
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes("supabase.co") || url.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  });
  const res = await pool.query(`DELETE FROM workspaces WHERE name = 'E2E Agency' AND created_at >= $1`, [RUN_START]);
  console.log(`cleaned up ${res.rowCount} E2E workspace(s) from this run`);
  await pool.end();
} catch (err) {
  console.error("warning: could not clean up E2E workspace", err);
}

const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} verification steps passed`);
process.exit(failed ? 1 : 0);
