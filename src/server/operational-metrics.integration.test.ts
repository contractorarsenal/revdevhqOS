/**
 * getOperationalMetrics() powers the dashboard's top operational row.
 * Runs against an embedded PGlite database to prove the actual SQL filters
 * — not just that the function was called — since the boundary conditions
 * here (open vs. terminal lead status, agency vs. client-generated leads,
 * "today" in the workspace timezone) are exactly what would silently drift
 * wrong in a mocked test.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, {
    get(_t, prop) {
      const target = (globalThis as Record<string, unknown>).__testDb as Record<string, unknown>;
      const value = target[prop as string];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }),
}));

import { getOperationalMetrics } from "@/server/queries/metrics";

const WS1 = "11111111-1111-4111-8111-111111111111";
const WS2 = "22222222-2222-4222-8222-222222222222";
const CLIENT1 = "33333333-3333-4333-8333-333333333333";

let client: PGlite;

beforeAll(async () => {
  client = new PGlite();
  (globalThis as Record<string, unknown>).__testDb = drizzle(client);
  await client.exec(`
    CREATE TABLE leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      client_id uuid,
      status text NOT NULL DEFAULT 'new',
      received_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE client_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      client_id uuid NOT NULL,
      name text NOT NULL DEFAULT 'Lead',
      received_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'ready_to_build'
    );
    CREATE TABLE tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'todo'
    );
  `);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await client.exec(`DELETE FROM leads; DELETE FROM client_leads; DELETE FROM projects; DELETE FROM tasks;`);
});

describe("getOperationalMetrics", () => {
  it("counts open agency leads — excludes client-generated leads and terminal statuses", async () => {
    await client.exec(`
      INSERT INTO leads (workspace_id, client_id, status) VALUES
        ('${WS1}', NULL, 'new'),
        ('${WS1}', NULL, 'contacted'),
        ('${WS1}', NULL, 'qualified'),
        ('${WS1}', NULL, 'converted'),
        ('${WS1}', NULL, 'lost'),
        ('${WS1}', '${CLIENT1}', 'new'),
        ('${WS2}', NULL, 'new');
    `);
    const result = await getOperationalMetrics(WS1, "America/Los_Angeles");
    expect(result.openLeads).toBe(3);
  });

  it("counts active projects as ready_to_build through ready_to_launch only", async () => {
    await client.exec(`
      INSERT INTO projects (workspace_id, status) VALUES
        ('${WS1}', 'ready_to_build'),
        ('${WS1}', 'building'),
        ('${WS1}', 'client_review'),
        ('${WS1}', 'revisions'),
        ('${WS1}', 'ready_to_launch'),
        ('${WS1}', 'paused'),
        ('${WS1}', 'live'),
        ('${WS1}', 'closed'),
        ('${WS1}', 'onboarding'),
        ('${WS1}', 'at_risk'),
        ('${WS2}', 'building');
    `);
    const result = await getOperationalMetrics(WS1, "America/Los_Angeles");
    expect(result.activeProjects).toBe(5);
  });

  it("counts tasks waiting on a client — the 'waiting' status only", async () => {
    await client.exec(`
      INSERT INTO tasks (workspace_id, status) VALUES
        ('${WS1}', 'waiting'),
        ('${WS1}', 'waiting'),
        ('${WS1}', 'todo'),
        ('${WS1}', 'in_progress'),
        ('${WS1}', 'completed'),
        ('${WS2}', 'waiting');
    `);
    const result = await getOperationalMetrics(WS1, "America/Los_Angeles");
    expect(result.waitingOnClient).toBe(2);
  });

  it("counts client-generated leads received today from the separate client_leads table, excluding other days and other workspaces", async () => {
    await client.exec(`
      INSERT INTO client_leads (workspace_id, client_id, received_at) VALUES
        ('${WS1}', '${CLIENT1}', now()),
        ('${WS1}', '${CLIENT1}', now() - interval '1 hour'),
        ('${WS1}', '${CLIENT1}', now() - interval '2 days'),
        ('${WS2}', '${CLIENT1}', now());
    `);
    const result = await getOperationalMetrics(WS1, "America/Los_Angeles");
    expect(result.clientLeadsToday).toBe(2);
  });
});
