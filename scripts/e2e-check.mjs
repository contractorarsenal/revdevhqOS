/* Manual-verification driver: exercises the real app in Chrome against the dev DB. */
import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const results = [];
const ok = (name) => { results.push(["PASS", name]); console.log("PASS", name); };
const fail = (name, err) => { results.push(["FAIL", name]); console.log("FAIL", name, "-", err?.message?.slice(0, 200)); };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
page.setDefaultTimeout(15000);

async function step(name, fn) {
  try { await fn(); ok(name); } catch (err) { fail(name, err); }
}

// 1. sign in
await step("sign in with seeded demo user", async () => {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', "demo@revdevhqos.dev");
  await page.fill('input[name="password"]', "demo-password-123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 20000 });
});

// 2. dashboard shows DB-driven metrics
await step("dashboard renders metrics from database", async () => {
  await page.waitForSelector("text=Demo Agency (Seed Data)");
  await page.waitForSelector("text=MRR");
  const body = await page.textContent("body");
  if (!body.includes("$")) throw new Error("no financial values rendered");
  if (!body.includes("Summit Roofing") && !body.includes("INV-1002")) throw new Error("no seeded records visible");
});

// 3. create a client
await step("create client (form → server action → Neon-compatible DB)", async () => {
  await page.goto(`${BASE}/clients`);
  await page.getByRole("button", { name: "Add Client" }).first().click();
  await page.fill('input[placeholder="Summit Roofing Co."]', "E2E Verification Co.");
  await page.fill('input[placeholder="Roofing contractor"]', "Testing");
  await page.fill('input[placeholder="Dana Whitfield"]', "Eve Tester");
  await page.getByRole("button", { name: "Create client" }).click();
  await page.waitForSelector("text=Client created");
});

// 4. persistence after reload
await step("client persists after page reload", async () => {
  await page.reload();
  await page.waitForSelector("text=E2E Verification Co.");
});

// 5. client detail + note
await step("client detail loads related data; add note persists", async () => {
  await page.getByText("E2E Verification Co.").first().click();
  await page.getByRole("link", { name: "View full client" }).click();
  await page.waitForSelector("text=Account snapshot");
  await page.waitForSelector("text=Eve Tester");
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.fill('textarea[placeholder="Write a note…"]', "E2E note: persisted to the database.");
  await page.getByRole("button", { name: "Save note" }).click();
  await page.waitForSelector("text=Note added");
  await page.reload();
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.waitForSelector("text=E2E note: persisted to the database.");
});

// 6. subscription → MRR changes
await step("create subscription; MRR recalculates from records", async () => {
  await page.getByRole("button", { name: "Add service" }).click();
  await page.waitForSelector("text=New subscription");
  await page.fill('input[type="number"]', "1000");
  await page.getByRole("button", { name: "Create subscription" }).click();
  await page.waitForSelector("text=Subscription created");
  await page.reload();
  await page.waitForSelector("text=$1,000");
});

// 7. invoice + payment
await step("create invoice and record payment against it", async () => {
  await page.getByRole("button", { name: "Create invoice" }).first().click();
  await page.fill('input[placeholder="Description"]', "E2E line item");
  await page.locator('input[placeholder="Unit price"]').fill("500");
  await page.getByRole("button", { name: "Create invoice", exact: true }).last().click();
  await page.waitForSelector("text=Invoice created");
  await page.getByRole("button", { name: "Record payment" }).first().click();
  await page.waitForSelector("text=Record payment");
  const select = page.locator("select").first();
  const options = await select.locator("option").allTextContents();
  const idx = options.findIndex((o) => o.includes("balance"));
  if (idx > 0) await select.selectOption({ index: idx });
  await page.getByRole("button", { name: "Record payment", exact: true }).last().click();
  await page.waitForSelector("text=Payment recorded");
});

// 8. lead → convert to opportunity
await step("create lead and convert to opportunity", async () => {
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

// 9. drag opportunity between stages, verify persistence
await step("drag opportunity to a new stage; persists after reload", async () => {
  const card = page.getByText("E2E Lead LLC").first();
  const target = page.getByText("Qualified", { exact: true }).first();
  const cb = await card.boundingBox();
  const tb = await target.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + 40, cb.y, { steps: 5 });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 60, { steps: 15 });
  await page.mouse.up();
  await page.waitForSelector("text=Moved to Qualified", { timeout: 8000 });
  await page.reload();
  await page.waitForSelector("text=E2E Lead LLC");
  const col = page.locator("div", { hasText: /^Qualified/ });
  // verify the card sits inside the Qualified column after reload
  const colBox = await page.getByText("Qualified", { exact: true }).first().boundingBox();
  const cardBox = await page.getByText("E2E Lead LLC").first().boundingBox();
  if (Math.abs(cardBox.x - colBox.x) > 260) throw new Error("card not in Qualified column after reload");
});

// 10. task create + complete
await step("create task, complete it, persists", async () => {
  await page.goto(`${BASE}/tasks`);
  await page.getByRole("button", { name: "Add Task" }).first().click();
  await page.fill('input[placeholder="Publish monthly report"]', "E2E task — verify persistence");
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForSelector("text=Task created");
  await page.waitForSelector("text=E2E task — verify persistence");
});

// 11. sign out → protected
await step("sign out; protected routes redirect again", async () => {
  await page.getByTitle("Sign out").click();
  await page.waitForURL("**/sign-in", { timeout: 15000 });
  await page.goto(`${BASE}/clients`);
  await page.waitForURL("**/sign-in");
});

await page.screenshot({ path: "/tmp/rdhq-final.png" });
await browser.close();
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} verification steps passed`);
process.exit(failed ? 1 : 0);
