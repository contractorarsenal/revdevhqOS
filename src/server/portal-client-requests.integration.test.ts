/**
 * submitClientRequest() must derive clientId/workspaceId from the caller's
 * own verified portal session — never from the browser — and must not
 * accept a clientId in its input at all (see portalClientRequestSchema).
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const revalidatePath = vi.fn();
const logActivity = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/server/activity", () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, {
    get(_t, prop) {
      const target = (globalThis as Record<string, unknown>).__testDb as Record<string, unknown>;
      const value = target[prop as string];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }),
}));
vi.mock("@/server/portal-authorize", async () => {
  const { actionError } = await import("@/server/action-error");
  return {
    actionError,
    authorizePortal: async () => (globalThis as Record<string, unknown>).__testPortalCtx,
  };
});

import { submitClientRequest } from "@/server/actions/portal-client-requests";

const WS1 = "11111111-1111-4111-8111-111111111111";
const CLIENT1 = "33333333-3333-4333-8333-333333333333";
const PORTAL_USER = "99999999-9999-4999-8999-999999999999";

let client: PGlite;

beforeAll(async () => {
  client = new PGlite();
  (globalThis as Record<string, unknown>).__testDb = drizzle(client);
  await client.exec(`
    CREATE TABLE client_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      client_id uuid NOT NULL,
      type text NOT NULL DEFAULT 'other',
      status text NOT NULL DEFAULT 'new',
      description text NOT NULL,
      priority text NOT NULL DEFAULT 'medium',
      submitted_by uuid,
      task_id uuid,
      resolution_notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  revalidatePath.mockClear();
  logActivity.mockClear();
  await client.exec(`DELETE FROM client_requests;`);
  (globalThis as Record<string, unknown>).__testPortalCtx = {
    user: { id: PORTAL_USER, name: "Client User" },
    membership: { workspaceId: WS1, clientId: CLIENT1 },
  };
});

describe("submitClientRequest", () => {
  it("creates a request scoped to the caller's own session workspace/client, never the browser", async () => {
    const result = await submitClientRequest({ type: "photo_change", description: "Swap the header photo" });
    expect(result.ok).toBe(true);
    const { rows } = await client.query<{ workspace_id: string; client_id: string; submitted_by: string; status: string }>(
      `SELECT workspace_id, client_id, submitted_by, status FROM client_requests`
    );
    expect(rows[0].workspace_id).toBe(WS1);
    expect(rows[0].client_id).toBe(CLIENT1);
    expect(rows[0].submitted_by).toBe(PORTAL_USER);
    expect(rows[0].status).toBe("new");
  });

  it("ignores any clientId smuggled into the input — the schema doesn't even accept one", async () => {
    const result = await submitClientRequest({
      type: "bug",
      description: "x",
      clientId: "00000000-0000-4000-8000-000000000000",
    } as unknown);
    expect(result.ok).toBe(true);
    const { rows } = await client.query<{ client_id: string }>(`SELECT client_id FROM client_requests`);
    expect(rows[0].client_id).toBe(CLIENT1);
  });
});
