/**
 * Regression test for the CA Command Center project-stage migration
 * (drizzle/0020_project_status_backfill.sql). Runs the REAL migration
 * file's UPDATE statements against an embedded PGlite database — not a
 * reimplementation of the mapping — so a future edit to the migration file
 * itself is what this test actually protects.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

let client: PGlite;

function backfillStatements(): string[] {
  const sql = readFileSync(path.resolve(__dirname, "..", "..", "drizzle", "0020_project_status_backfill.sql"), "utf8");
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)
    // The final statement (ALTER COLUMN ... SET DEFAULT) targets the real
    // Postgres enum type and default clause — irrelevant to, and unusable
    // against, this test's plain-text status column.
    .filter((s) => !s.startsWith("ALTER TABLE"));
}

beforeAll(async () => {
  client = new PGlite();
  await client.exec(`
    CREATE TABLE clients (id uuid PRIMARY KEY, status text NOT NULL);
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id uuid,
      status text NOT NULL,
      completed_at timestamptz,
      archived_at timestamptz
    );
  `);
});

afterAll(async () => {
  await client.close();
});

async function runBackfill() {
  for (const stmt of backfillStatements()) {
    await client.exec(stmt);
  }
}

async function statusOf(id: string): Promise<string> {
  const { rows } = await client.query<{ status: string }>(`SELECT status FROM projects WHERE id = '${id}'`);
  return rows[0].status;
}

describe("project status migration: every old -> new mapping", () => {
  const ONBOARDING_CLIENT = "11111111-1111-4111-8111-111111111111";
  const ACTIVE_CLIENT = "22222222-2222-4222-8222-222222222222";

  const PLANNING_ONBOARDING = "aaaaaaaa-0000-4000-8000-000000000001";
  const PLANNING_NO_CLIENT = "aaaaaaaa-0000-4000-8000-000000000002";
  const PLANNING_ACTIVE_CLIENT = "aaaaaaaa-0000-4000-8000-000000000003";
  const ACTIVE = "aaaaaaaa-0000-4000-8000-000000000004";
  const ON_HOLD = "aaaaaaaa-0000-4000-8000-000000000005";
  const COMPLETED = "aaaaaaaa-0000-4000-8000-000000000006";
  const ARCHIVED = "aaaaaaaa-0000-4000-8000-000000000007";

  beforeAll(async () => {
    await client.exec(`
      INSERT INTO clients (id, status) VALUES
        ('${ONBOARDING_CLIENT}', 'onboarding'),
        ('${ACTIVE_CLIENT}', 'active');

      INSERT INTO projects (id, client_id, status, completed_at, archived_at) VALUES
        ('${PLANNING_ONBOARDING}', '${ONBOARDING_CLIENT}', 'planning', NULL, NULL),
        ('${PLANNING_NO_CLIENT}', NULL, 'planning', NULL, NULL),
        ('${PLANNING_ACTIVE_CLIENT}', '${ACTIVE_CLIENT}', 'planning', NULL, NULL),
        ('${ACTIVE}', NULL, 'active', NULL, NULL),
        ('${ON_HOLD}', NULL, 'on_hold', NULL, NULL),
        ('${COMPLETED}', NULL, 'completed', '2026-01-15T00:00:00Z', NULL),
        ('${ARCHIVED}', NULL, 'archived', NULL, '2026-02-01T00:00:00Z');
    `);
    await runBackfill();
  });

  it("planning + client currently onboarding -> onboarding", async () => {
    expect(await statusOf(PLANNING_ONBOARDING)).toBe("onboarding");
  });

  it("planning + no client -> ready_to_build", async () => {
    expect(await statusOf(PLANNING_NO_CLIENT)).toBe("ready_to_build");
  });

  it("planning + client past onboarding -> ready_to_build", async () => {
    expect(await statusOf(PLANNING_ACTIVE_CLIENT)).toBe("ready_to_build");
  });

  it("active -> building", async () => {
    expect(await statusOf(ACTIVE)).toBe("building");
  });

  it("on_hold -> paused", async () => {
    expect(await statusOf(ON_HOLD)).toBe("paused");
  });

  it("completed -> live, and completed_at is preserved", async () => {
    expect(await statusOf(COMPLETED)).toBe("live");
    const { rows } = await client.query<{ completed_at: string }>(`SELECT completed_at FROM projects WHERE id = '${COMPLETED}'`);
    expect(rows[0].completed_at).not.toBeNull();
  });

  it("archived -> closed, and archived_at is preserved", async () => {
    expect(await statusOf(ARCHIVED)).toBe("closed");
    const { rows } = await client.query<{ archived_at: string }>(`SELECT archived_at FROM projects WHERE id = '${ARCHIVED}'`);
    expect(rows[0].archived_at).not.toBeNull();
  });

  it("no project is ever auto-assigned to a state the old data can't justify", async () => {
    const { rows } = await client.query<{ status: string }>(
      `SELECT DISTINCT status FROM projects WHERE status IN ('client_review', 'revisions', 'ready_to_launch', 'at_risk', 'waiting_on_client')`
    );
    expect(rows).toHaveLength(0);
  });

  it("preserves every project id and client_id relationship", async () => {
    const { rows } = await client.query<{ id: string; client_id: string | null }>(`SELECT id, client_id FROM projects ORDER BY id`);
    expect(rows.map((r) => r.id)).toEqual(
      [PLANNING_ONBOARDING, PLANNING_NO_CLIENT, PLANNING_ACTIVE_CLIENT, ACTIVE, ON_HOLD, COMPLETED, ARCHIVED].sort()
    );
    expect(rows.find((r) => r.id === PLANNING_ONBOARDING)?.client_id).toBe(ONBOARDING_CLIENT);
  });
});
