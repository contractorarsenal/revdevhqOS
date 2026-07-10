import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";
import {
  guardDeps, assertWorkspaceClient, assertWorkspaceLead, assertWorkspaceOpportunity,
  assertWorkspaceTask, assertWorkspacePipelineStage, assertWorkspaceInvoice, assertWorkspaceProject,
  assertWorkspaceMember, assertWorkspaceRelations,
} from "./workspace-guards";

/**
 * Integration test against an embedded Postgres with the real migrations:
 * two workspaces are seeded, and every guard must reject IDs that belong to
 * the other workspace while accepting same-workspace and null IDs.
 */
const ids = {
  wsA: "", wsB: "",
  userA: "11111111-1111-4111-8111-111111111111",
  userB: "22222222-2222-4222-8222-222222222222",
  clientB: "", leadB: "", oppB: "", taskB: "", stageB: "", invoiceB: "", projectB: "",
  clientA: "",
};

beforeAll(async () => {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  guardDeps.db = db as any;

  await db.insert(schema.profiles).values([
    { id: ids.userA, name: "User A", email: "a@test.dev" },
    { id: ids.userB, name: "User B", email: "b@test.dev" },
  ]);
  const [wsA] = await db.insert(schema.workspaces).values({ name: "WS A", slug: "ws-a" }).returning();
  const [wsB] = await db.insert(schema.workspaces).values({ name: "WS B", slug: "ws-b" }).returning();
  ids.wsA = wsA.id;
  ids.wsB = wsB.id;
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: wsA.id, userId: ids.userA, role: "owner" },
    { workspaceId: wsB.id, userId: ids.userB, role: "owner" },
  ]);
  const [clientA] = await db.insert(schema.clients).values({ workspaceId: wsA.id, name: "Client A" }).returning();
  const [clientB] = await db.insert(schema.clients).values({ workspaceId: wsB.id, name: "Client B" }).returning();
  ids.clientA = clientA.id;
  ids.clientB = clientB.id;
  const [leadB] = await db.insert(schema.leads).values({ workspaceId: wsB.id, company: "Lead B" }).returning();
  ids.leadB = leadB.id;
  const [stageB] = await db.insert(schema.pipelineStages).values({ workspaceId: wsB.id, name: "Stage B", position: 0 }).returning();
  ids.stageB = stageB.id;
  const [oppB] = await db.insert(schema.opportunities).values({ workspaceId: wsB.id, stageId: stageB.id, name: "Opp B" }).returning();
  ids.oppB = oppB.id;
  const [taskB] = await db.insert(schema.tasks).values({ workspaceId: wsB.id, title: "Task B" }).returning();
  ids.taskB = taskB.id;
  const [invoiceB] = await db.insert(schema.invoices).values({ workspaceId: wsB.id, clientId: clientB.id, number: "INV-B1" }).returning();
  ids.invoiceB = invoiceB.id;
  const [projectB] = await db.insert(schema.projects).values({ workspaceId: wsB.id, name: "Project B" }).returning();
  ids.projectB = projectB.id;
});

describe("workspace relationship guards", () => {
  it("reject cross-workspace client / lead / opportunity / task / stage / invoice / project", async () => {
    await expect(assertWorkspaceClient(ids.wsA, ids.clientB)).rejects.toThrow("Client not found");
    await expect(assertWorkspaceLead(ids.wsA, ids.leadB)).rejects.toThrow("Lead not found");
    await expect(assertWorkspaceOpportunity(ids.wsA, ids.oppB)).rejects.toThrow("Opportunity not found");
    await expect(assertWorkspaceTask(ids.wsA, ids.taskB)).rejects.toThrow("Task not found");
    await expect(assertWorkspacePipelineStage(ids.wsA, ids.stageB)).rejects.toThrow("Stage not found");
    await expect(assertWorkspaceInvoice(ids.wsA, ids.invoiceB)).rejects.toThrow("Invoice not found");
    await expect(assertWorkspaceProject(ids.wsA, ids.projectB)).rejects.toThrow("Project not found");
  });

  it("a task cannot reference another workspace's project (assertWorkspaceRelations)", async () => {
    await expect(assertWorkspaceRelations(ids.wsA, { projectId: ids.projectB })).rejects.toThrow("Project not found");
  });

  it("reject assigning owner/assignee who is not a member of the workspace", async () => {
    await expect(assertWorkspaceMember(ids.wsA, ids.userB)).rejects.toThrow("not a member");
    await expect(
      assertWorkspaceRelations(ids.wsA, { assigneeId: ids.userB })
    ).rejects.toThrow("not a member");
  });

  it("accept same-workspace IDs and null/undefined IDs", async () => {
    await expect(assertWorkspaceClient(ids.wsA, ids.clientA)).resolves.toBeUndefined();
    await expect(assertWorkspaceMember(ids.wsA, ids.userA)).resolves.toBeUndefined();
    await expect(
      assertWorkspaceRelations(ids.wsA, { clientId: ids.clientA, ownerId: ids.userA, leadId: null, taskId: undefined })
    ).resolves.toBeUndefined();
  });

  it("guarded note relations block a cross-workspace clientId (addNote path)", async () => {
    await expect(assertWorkspaceRelations(ids.wsA, { clientId: ids.clientB })).rejects.toThrow("Client not found");
  });

  it("guarded opportunity relations block cross-workspace stage/client/lead/owner (createOpportunity path)", async () => {
    await expect(assertWorkspacePipelineStage(ids.wsA, ids.stageB)).rejects.toThrow();
    await expect(
      assertWorkspaceRelations(ids.wsA, { clientId: ids.clientB, leadId: ids.leadB, ownerId: ids.userB })
    ).rejects.toThrow();
  });
});
