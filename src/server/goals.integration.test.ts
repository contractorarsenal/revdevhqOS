/**
 * PGlite integration tests for the goals feature: the REAL migration SQL
 * (drizzle/0011 + 0012) runs against an embedded Postgres, then the exact
 * drizzle query builders used in production (goal-metrics) are exercised
 * against it. Prerequisite tables that earlier migrations own (workspaces,
 * profiles, payments, …) are created as minimal stubs with production
 * column names, so the new migration's FKs and ALTERs behave exactly as
 * they will on Supabase.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { and, eq, isNull, ne } from "drizzle-orm";
import { businessGoals, goalProgressUpdates } from "@/lib/db/schema";
import { metricValueInPeriod } from "@/server/queries/goal-metrics";

const TZ = "America/Los_Angeles";
let client: PGlite;
let db: PgliteDatabase;

const WS1 = "11111111-1111-1111-1111-111111111111";
const WS2 = "22222222-2222-2222-2222-222222222222";

async function runMigrationFile(file: string) {
  const sqlText = readFileSync(join(process.cwd(), "drizzle", file), "utf8");
  for (const stmt of sqlText.split("--> statement-breakpoint")) {
    const trimmed = stmt.trim();
    if (trimmed) await client.exec(trimmed);
  }
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client);

  // Minimal stubs for tables owned by earlier migrations, using production
  // column names/types so FKs and the projects ALTER apply for real.
  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY);
    CREATE TABLE profiles (id uuid PRIMARY KEY);
    CREATE TABLE payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      amount numeric(12,2) NOT NULL,
      status text NOT NULL,
      billing_month date,
      paid_at timestamptz NOT NULL
    );
    CREATE TABLE clients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      completed_at timestamptz
    );
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'planning'
    );
    INSERT INTO workspaces (id) VALUES ('${WS1}'), ('${WS2}');
  `);

  await runMigrationFile("0011_curved_redwing.sql");
  await runMigrationFile("0012_goals_rls.sql");
});

afterAll(async () => {
  await client.close();
});

function goalValues(overrides: Partial<typeof businessGoals.$inferInsert> = {}) {
  return {
    workspaceId: WS1,
    name: "Monthly Revenue",
    metricType: "revenue_collected" as const,
    periodType: "monthly" as const,
    targetValue: "10000",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    ...overrides,
  };
}

describe("migration SQL", () => {
  it("enables Row Level Security on both new tables", async () => {
    const res = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('business_goals','goal_progress_updates')`
    );
    expect(res.rows).toHaveLength(2);
    for (const row of res.rows) expect(row.relrowsecurity).toBe(true);
  });

  it("creates the required workspace indexes", async () => {
    const res = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'business_goals'`
    );
    const names = res.rows.map((r) => r.indexname);
    for (const expected of [
      "business_goals_workspace_status_idx",
      "business_goals_workspace_period_idx",
      "business_goals_workspace_created_idx",
      "business_goals_workspace_archived_idx",
      "business_goals_one_primary_per_workspace",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("adds projects.completed_at additively", async () => {
    const res = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name='completed_at'`
    );
    expect(res.rows).toHaveLength(1);
  });

  it("rejects goals for unknown workspaces (FK)", async () => {
    await expect(
      db.insert(businessGoals).values(goalValues({ workspaceId: "99999999-9999-9999-9999-999999999999" }))
    ).rejects.toThrow();
  });
});

describe("constraints", () => {
  it("rejects a non-positive target", async () => {
    await expect(db.insert(businessGoals).values(goalValues({ targetValue: "0" }))).rejects.toThrow();
    await expect(db.insert(businessGoals).values(goalValues({ targetValue: "-5" }))).rejects.toThrow();
  });

  it("rejects a negative manual value but allows values above the target", async () => {
    await expect(
      db.insert(businessGoals).values(goalValues({ metricType: "calls_completed", manualCurrentValue: "-1" }))
    ).rejects.toThrow();
    const [row] = await db
      .insert(businessGoals)
      .values(goalValues({ metricType: "calls_completed", targetValue: "300", manualCurrentValue: "320" }))
      .returning();
    expect(Number(row.manualCurrentValue)).toBe(320);
    await db.delete(businessGoals).where(eq(businessGoals.id, row.id));
  });

  it("rejects a period that ends before it starts", async () => {
    await expect(
      db.insert(businessGoals).values(goalValues({ periodStart: "2026-07-10", periodEnd: "2026-07-01" }))
    ).rejects.toThrow();
  });

  it("enforces at most one primary goal per workspace, while allowing one per workspace", async () => {
    const [a] = await db.insert(businessGoals).values(goalValues({ isPrimary: true })).returning();
    // Second primary in the same workspace → partial unique index rejects.
    await expect(db.insert(businessGoals).values(goalValues({ isPrimary: true, name: "Second" }))).rejects.toThrow();
    // A primary in a DIFFERENT workspace is fine.
    const [b] = await db.insert(businessGoals).values(goalValues({ isPrimary: true, workspaceId: WS2 })).returning();
    // The unset-then-set swap used by setGoalPrimary works transactionally.
    const [c] = await db.insert(businessGoals).values(goalValues({ name: "Next month", periodStart: "2026-08-01", periodEnd: "2026-08-31" })).returning();
    await db.transaction(async (tx) => {
      await tx.update(businessGoals).set({ isPrimary: false })
        .where(and(eq(businessGoals.workspaceId, WS1), eq(businessGoals.isPrimary, true), ne(businessGoals.id, c.id)));
      await tx.update(businessGoals).set({ isPrimary: true }).where(eq(businessGoals.id, c.id));
    });
    const primaries = await db.select().from(businessGoals)
      .where(and(eq(businessGoals.workspaceId, WS1), eq(businessGoals.isPrimary, true)));
    expect(primaries).toHaveLength(1);
    expect(primaries[0].id).toBe(c.id);
    await db.delete(businessGoals).where(eq(businessGoals.id, a.id));
    await db.delete(businessGoals).where(eq(businessGoals.id, b.id));
    await db.delete(businessGoals).where(eq(businessGoals.id, c.id));
  });
});

describe("workspace isolation and history", () => {
  it("a goal fetched with another workspace's id returns nothing (ownedGoal predicate)", async () => {
    const [g] = await db.insert(businessGoals).values(goalValues()).returning();
    const cross = await db.select().from(businessGoals)
      .where(and(eq(businessGoals.id, g.id), eq(businessGoals.workspaceId, WS2)));
    expect(cross).toHaveLength(0);
    const own = await db.select().from(businessGoals)
      .where(and(eq(businessGoals.id, g.id), eq(businessGoals.workspaceId, WS1)));
    expect(own).toHaveLength(1);
    await db.delete(businessGoals).where(eq(businessGoals.id, g.id));
  });

  it("archived goals leave the active filter but stay fully readable with final values", async () => {
    const [g] = await db.insert(businessGoals)
      .values(goalValues({ metricType: "calls_completed", targetValue: "300", manualCurrentValue: "142" }))
      .returning();
    await db.update(businessGoals)
      .set({ status: "archived", archivedAt: new Date(), isPrimary: false })
      .where(eq(businessGoals.id, g.id));

    const active = await db.select().from(businessGoals)
      .where(and(eq(businessGoals.workspaceId, WS1), eq(businessGoals.status, "active"), isNull(businessGoals.archivedAt)));
    expect(active.find((r) => r.id === g.id)).toBeUndefined();

    const [historical] = await db.select().from(businessGoals).where(eq(businessGoals.id, g.id));
    expect(historical.status).toBe("archived");
    expect(Number(historical.manualCurrentValue)).toBe(142); // final progress preserved
    expect(historical.periodStart).toBe("2026-07-01"); // period identity intact
    await db.delete(businessGoals).where(eq(businessGoals.id, g.id));
  });

  it("progress updates persist an audit trail scoped to the workspace", async () => {
    const [g] = await db.insert(businessGoals)
      .values(goalValues({ metricType: "calls_completed", targetValue: "300", manualCurrentValue: "0" }))
      .returning();
    await db.insert(goalProgressUpdates).values({ workspaceId: WS1, goalId: g.id, previousValue: "0", newValue: "142" });
    const rows = await db.select().from(goalProgressUpdates)
      .where(and(eq(goalProgressUpdates.goalId, g.id), eq(goalProgressUpdates.workspaceId, WS1)));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].newValue)).toBe(142);
    await db.delete(businessGoals).where(eq(businessGoals.id, g.id)); // cascades to updates
    const after = await db.select().from(goalProgressUpdates).where(eq(goalProgressUpdates.goalId, g.id));
    expect(after).toHaveLength(0);
  });
});

describe("automatic metrics run the production query builders", () => {
  // July 2026 in America/Los_Angeles: [Jul 1 07:00 UTC, Aug 1 07:00 UTC)
  const july = { start: "2026-07-01", end: "2026-07-31" };

  it("revenue counts only succeeded payments — voided, pending, failed, refunded never count", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, paid_at) VALUES
        ('${WS1}', 5000, 'succeeded', '2026-07-10T12:00:00Z'),
        ('${WS1}', 2400, 'succeeded', '2026-07-20T12:00:00Z'),
        ('${WS1}', 999,  'voided',    '2026-07-11T12:00:00Z'),
        ('${WS1}', 888,  'pending',   '2026-07-12T12:00:00Z'),
        ('${WS1}', 777,  'failed',    '2026-07-13T12:00:00Z'),
        ('${WS1}', 666,  'refunded',  '2026-07-14T12:00:00Z'),
        ('${WS2}', 4444, 'succeeded', '2026-07-15T12:00:00Z');
    `);
    const total = await metricValueInPeriod(db, WS1, "revenue_collected", july, TZ);
    expect(total).toBe(7400); // matches the spec example; other workspace excluded
  });

  it("respects the workspace-local period boundary, not the UTC date", async () => {
    // 06:59 UTC on Jul 1 is still June 30 in Los Angeles → outside the period.
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, paid_at) VALUES
        ('${WS1}', 100, 'succeeded', '2026-07-01T06:59:59Z'),
        ('${WS1}', 200, 'succeeded', '2026-07-01T07:00:00Z'),
        ('${WS1}', 300, 'succeeded', '2026-08-01T06:59:59Z'),
        ('${WS1}', 400, 'succeeded', '2026-08-01T07:00:00Z');
    `);
    const total = await metricValueInPeriod(db, WS1, "revenue_collected", july, TZ);
    expect(total).toBe(7400 + 200 + 300); // 100 (before) and 400 (after) excluded
  });

  it("new clients counts creations in the period — archived clients still count historically", async () => {
    await client.exec(`
      INSERT INTO clients (workspace_id, created_at, archived_at) VALUES
        ('${WS1}', '2026-07-05T12:00:00Z', NULL),
        ('${WS1}', '2026-07-06T12:00:00Z', '2026-09-01T12:00:00Z'),
        ('${WS1}', '2026-06-15T12:00:00Z', NULL),
        ('${WS2}', '2026-07-07T12:00:00Z', NULL);
    `);
    expect(await metricValueInPeriod(db, WS1, "new_clients", july, TZ)).toBe(2);
  });

  it("new leads counts creations in the period", async () => {
    await client.exec(`
      INSERT INTO leads (workspace_id, created_at) VALUES
        ('${WS1}', '2026-07-08T12:00:00Z'),
        ('${WS1}', '2026-08-02T12:00:00Z');
    `);
    expect(await metricValueInPeriod(db, WS1, "new_leads", july, TZ)).toBe(1);
  });

  it("tasks completed counts completed_at inside the period", async () => {
    await client.exec(`
      INSERT INTO tasks (workspace_id, completed_at) VALUES
        ('${WS1}', '2026-07-09T12:00:00Z'),
        ('${WS1}', '2026-07-30T12:00:00Z'),
        ('${WS1}', NULL),
        ('${WS1}', '2026-06-09T12:00:00Z');
    `);
    expect(await metricValueInPeriod(db, WS1, "tasks_completed", july, TZ)).toBe(2);
  });

  it("projects completed uses the newly-added completed_at column", async () => {
    await client.exec(`
      INSERT INTO projects (workspace_id, status, completed_at) VALUES
        ('${WS1}', 'completed', '2026-07-15T12:00:00Z'),
        ('${WS1}', 'completed', NULL),
        ('${WS1}', 'active', NULL);
    `);
    expect(await metricValueInPeriod(db, WS1, "projects_completed", july, TZ)).toBe(1);
  });
});
