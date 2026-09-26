/**
 * Cross-client isolation for the client portal data layer, run against an
 * embedded Postgres with the REAL migrations. Two clients (A, B) in one
 * workspace, plus a client in a second workspace. Every portal query is
 * called with client A's server-derived scope and must never surface B's
 * (or the other workspace's) rows, nor A's hidden/internal rows.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";
import {
  getPortalBilling, getPortalDashboard, getPortalProject, listPortalActivity, listPortalFiles,
  listPortalProjects, listPortalRequests,
} from "@/server/queries/portal-data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const s: Record<string, string> = {};

beforeAll(async () => {
  const pg = new PGlite();
  db = drizzle(pg, { schema });
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  }
  const [ws] = await db.insert(schema.workspaces).values({ name: "WS", slug: "ws" }).returning();
  const [ws2] = await db.insert(schema.workspaces).values({ name: "WS2", slug: "ws2" }).returning();
  const [a] = await db.insert(schema.clients).values({ workspaceId: ws.id, name: "Client A" }).returning();
  const [b] = await db.insert(schema.clients).values({ workspaceId: ws.id, name: "Client B" }).returning();
  const [c] = await db.insert(schema.clients).values({ workspaceId: ws2.id, name: "Client C" }).returning();
  Object.assign(s, { ws: ws.id, ws2: ws2.id, a: a.id, b: b.id, c: c.id });

  const mk = async (workspaceId: string, clientId: string, name: string, clientVisible: boolean) =>
    (await db.insert(schema.projects).values({ workspaceId, clientId, name, clientVisible, waitingOn: "internal secret" }).returning())[0].id;
  s.pAvisible = await mk(ws.id, a.id, "A visible", true);
  s.pAhidden = await mk(ws.id, a.id, "A hidden", false);
  s.pB = await mk(ws.id, b.id, "B visible", true);
  s.pC = await mk(ws2.id, c.id, "C visible", true);

  await db.insert(schema.tasks).values([
    { workspaceId: ws.id, clientId: a.id, projectId: s.pAvisible, title: "Shown task", clientVisible: true },
    { workspaceId: ws.id, clientId: a.id, projectId: s.pAvisible, title: "INTERNAL task", clientVisible: false },
    { workspaceId: ws.id, clientId: b.id, projectId: s.pB, title: "B task", clientVisible: true },
  ]);
  await db.insert(schema.projectUpdates).values([
    { workspaceId: ws.id, projectId: s.pAvisible, body: "public A update", clientVisible: true },
    { workspaceId: ws.id, projectId: s.pAvisible, body: "internal A note", clientVisible: false },
    { workspaceId: ws.id, projectId: s.pB, body: "B update", clientVisible: true },
  ]);
  await db.insert(schema.clientRequests).values([
    { workspaceId: ws.id, clientId: a.id, description: "A request", resolutionNotes: "internal resolution" },
    { workspaceId: ws.id, clientId: b.id, description: "B request" },
  ]);
  await db.insert(schema.clientFiles).values([
    { workspaceId: ws.id, clientId: a.id, name: "a.pdf", storagePath: `${ws.id}/${a.id}/1-a.pdf`, status: "ready" },
    { workspaceId: ws.id, clientId: a.id, name: "pending.pdf", storagePath: `${ws.id}/${a.id}/2-p.pdf`, status: "pending" },
    { workspaceId: ws.id, clientId: b.id, name: "b.pdf", storagePath: `${ws.id}/${b.id}/1-b.pdf`, status: "ready" },
  ]);
  const [svc] = await db.insert(schema.services).values({ workspaceId: ws.id, name: "SEO" }).returning();
  await db.insert(schema.subscriptions).values([
    { workspaceId: ws.id, clientId: a.id, serviceId: svc.id, amount: "100", startDate: "2026-01-01" },
    { workspaceId: ws.id, clientId: b.id, serviceId: svc.id, amount: "999", startDate: "2026-01-01" },
  ]);
  await db.insert(schema.invoices).values([
    { workspaceId: ws.id, clientId: a.id, number: "A-1", status: "open", total: "50" },
    { workspaceId: ws.id, clientId: a.id, number: "A-DRAFT", status: "draft", total: "70" },
    { workspaceId: ws.id, clientId: b.id, number: "B-1", status: "open", total: "500" },
  ]);
  await db.insert(schema.payments).values([
    { workspaceId: ws.id, clientId: a.id, amount: "100", paidAt: new Date(), reference: "SECRET-REF", note: "internal note" },
    { workspaceId: ws.id, clientId: b.id, amount: "777", paidAt: new Date() },
  ]);
  await db.insert(schema.clientLeads).values([
    { workspaceId: ws.id, clientId: a.id, name: "A lead", receivedAt: new Date() },
    { workspaceId: ws.id, clientId: b.id, name: "B lead", receivedAt: new Date() },
  ]);
});

const scopeA = () => ({ workspaceId: s.ws, clientId: s.a });
const json = (v: unknown) => JSON.stringify(v);

describe("portal data isolation", () => {
  it("projects: only A's client-visible projects", async () => {
    const rows = await listPortalProjects(db, scopeA());
    expect(rows.map((r: { name: string }) => r.name)).toEqual(["A visible"]);
  });

  it("project detail: foreign, hidden and cross-workspace ids are all null", async () => {
    expect(await getPortalProject(db, scopeA(), s.pB)).toBeNull();
    expect(await getPortalProject(db, scopeA(), s.pAhidden)).toBeNull();
    expect(await getPortalProject(db, scopeA(), s.pC)).toBeNull();
    expect(await getPortalProject(db, scopeA(), "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getPortalProject(db, scopeA(), s.pAvisible)).not.toBeNull();
  });

  it("project detail hides internal tasks/updates and internal waiting-on text", async () => {
    const p = await getPortalProject(db, scopeA(), s.pAvisible);
    const out = json(p);
    expect(out).toContain("Shown task");
    expect(out).toContain("public A update");
    expect(out).not.toContain("INTERNAL task");
    expect(out).not.toContain("internal A note");
    expect(out).not.toContain("B task");
    expect(out).not.toContain("internal secret");
  });

  it("requests: only A's, without internal resolution notes", async () => {
    const rows = await listPortalRequests(db, scopeA());
    expect(rows).toHaveLength(1);
    expect(json(rows)).not.toContain("internal resolution");
    expect(json(rows)).not.toContain("B request");
  });

  it("files: only A's ready files", async () => {
    const rows = await listPortalFiles(db, scopeA());
    expect(rows.map((r: { name: string }) => r.name)).toEqual(["a.pdf"]);
    expect(json(rows)).not.toContain("storagePath");
  });

  it("billing: A's data only, no drafts, no payment reference/note", async () => {
    const b = await getPortalBilling(db, scopeA());
    const out = json(b);
    expect(b.invoices.map((i: { number: string }) => i.number)).toEqual(["A-1"]);
    expect(out).not.toContain("B-1");
    expect(out).not.toContain("A-DRAFT");
    expect(out).not.toContain("SECRET-REF");
    expect(out).not.toContain("internal note");
    expect(out).not.toContain("777");
    expect(out).not.toContain("999");
  });

  it("activity + dashboard never contain B's data", async () => {
    const dash = await getPortalDashboard(db, scopeA(), "2026-06-01", null);
    const out = json(dash) + json(await listPortalActivity(db, scopeA(), null));
    for (const leak of ["B visible", "B request", "b.pdf", "B-1", "C visible"]) expect(out).not.toContain(leak);
  });

  it("a scope with the right client but the wrong workspace sees nothing", async () => {
    const bad = { workspaceId: s.ws2, clientId: s.a };
    expect(await listPortalProjects(db, bad)).toHaveLength(0);
    expect(await listPortalRequests(db, bad)).toHaveLength(0);
    expect(await listPortalFiles(db, bad)).toHaveLength(0);
    expect((await getPortalBilling(db, bad)).invoices).toHaveLength(0);
  });
});
