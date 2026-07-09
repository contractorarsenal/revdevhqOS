"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  workspaces, workspaceMembers, pipelineStages, onboardingTemplates, onboardingSteps,
} from "@/lib/db/schema";
import { requireUser, ACTIVE_WORKSPACE_COOKIE, assertMembership } from "@/lib/auth/session";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { workspaceSchema } from "@/lib/validation";

const DEFAULT_STAGES = [
  { name: "New Lead", probability: 10 },
  { name: "Contacted", probability: 25 },
  { name: "Qualified", probability: 40 },
  { name: "Proposal Sent", probability: 65 },
  { name: "Verbal Yes", probability: 85 },
  { name: "Closed Won", probability: 100, isWon: true },
  { name: "Closed Lost", probability: 0, isLost: true },
];

const DEFAULT_ONBOARDING_STEPS = [
  "Contract signed", "Payment received", "Access requested", "Assets received",
  "Kickoff scheduled", "Work started", "Client review", "Active client",
];

function slugify(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) ||
    "workspace"
  );
}

export async function createWorkspace(input: unknown): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const data = workspaceSchema.parse(input);
    const slug = `${slugify(data.name)}-${Math.random().toString(36).slice(2, 7)}`;

    const workspaceId = await db.transaction(async (tx) => {
      const [ws] = await tx
        .insert(workspaces)
        .values({ name: data.name, slug, timezone: data.timezone })
        .returning();
      await tx.insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: session.user.id,
        role: "owner",
      });
      await tx.insert(pipelineStages).values(
        DEFAULT_STAGES.map((s, i) => ({
          workspaceId: ws.id,
          name: s.name,
          probability: s.probability,
          position: i,
          isWon: s.isWon ?? false,
          isLost: s.isLost ?? false,
        }))
      );
      const [template] = await tx
        .insert(onboardingTemplates)
        .values({ workspaceId: ws.id, name: "Standard agency onboarding", isDefault: true })
        .returning();
      await tx.insert(onboardingSteps).values(
        DEFAULT_ONBOARDING_STEPS.map((name, i) => ({ templateId: template.id, name, position: i }))
      );
      return ws.id;
    });

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, { path: "/", httpOnly: true, sameSite: "lax" });
  } catch (err) {
    return actionError(err);
  }
  redirect("/dashboard");
}

export async function updateWorkspace(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("admin");
    const data = workspaceSchema.parse(input);
    await db
      .update(workspaces)
      .set({ name: data.name, timezone: data.timezone })
      .where(eq(workspaces.id, ctx.workspace.id));
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function setActiveWorkspace(workspaceId: string): Promise<ActionResult> {
  try {
    const session = await requireUser();
    await assertMembership(session.user.id, workspaceId);
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, { path: "/", httpOnly: true, sameSite: "lax" });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
