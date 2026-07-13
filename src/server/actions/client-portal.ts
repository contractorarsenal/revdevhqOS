"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, contacts, clientPortalInvites, clientPortalMemberships, profiles } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env/server";
import {
  primaryContactSchema, portalInviteSchema, acceptInviteSchema, clientPortalSettingsSchema,
} from "@/lib/validation";
import { normalizeEmail, validateInviteForAcceptance } from "@/lib/portal";
import { generateInviteToken, hashInviteToken } from "@/server/portal-tokens";
import { logActivity } from "@/server/activity";

const INVITE_TTL_DAYS = 7;

/** Portal access is managed by internal owners/admins only. */
const MANAGE_ROLE = "admin" as const;

async function ownedClient(workspaceId: string, clientId: string) {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Client not found in this workspace.");
  return row;
}

function revalidateClient(clientId: string) {
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

/* ========== primary contact ========== */

/** Creates or edits the client's single primary contact. Email is
 * normalized to lowercase — it is the authoritative portal invite email.
 * Changing it never silently transfers an accepted membership. */
export async function setPrimaryContact(clientId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize(MANAGE_ROLE);
    await ownedClient(ctx.workspace.id, clientId);
    const data = primaryContactSchema.parse(input);
    const email = normalizeEmail(data.email);

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.workspaceId, ctx.workspace.id), eq(contacts.clientId, clientId), eq(contacts.isPrimary, true)))
        .limit(1);
      if (existing) {
        await tx
          .update(contacts)
          .set({ name: data.name, email, phone: data.phone ?? null, title: data.title ?? null })
          .where(eq(contacts.id, existing.id));
      } else {
        await tx.insert(contacts).values({
          workspaceId: ctx.workspace.id,
          clientId,
          name: data.name,
          email,
          phone: data.phone ?? null,
          title: data.title ?? null,
          isPrimary: true,
        });
      }
    });

    revalidateClient(clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/* ========== invitations ========== */

/**
 * Issues a portal invitation to the client's primary contact email. Any
 * previous pending invite is revoked first — one live invite per client.
 * Returns the plaintext link exactly once; only the hash is stored, and
 * the token never reaches the activity log.
 */
export async function inviteClientToPortal(clientId: string, input: unknown): Promise<ActionResult<{ link: string; email: string }>> {
  try {
    const ctx = await authorize(MANAGE_ROLE);
    await ownedClient(ctx.workspace.id, clientId);
    const data = portalInviteSchema.parse(input);

    const [primary] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.workspaceId, ctx.workspace.id), eq(contacts.clientId, clientId), eq(contacts.isPrimary, true)))
      .limit(1);
    if (!primary?.email) {
      throw new Error("A primary contact email is required before inviting this client to the portal.");
    }

    const email = normalizeEmail(primary.email);
    const { token, tokenHash } = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000);

    await db.transaction(async (tx) => {
      await tx
        .update(clientPortalInvites)
        .set({ revokedAt: new Date() })
        .where(and(
          eq(clientPortalInvites.workspaceId, ctx.workspace.id),
          eq(clientPortalInvites.clientId, clientId),
          isNull(clientPortalInvites.acceptedAt),
          isNull(clientPortalInvites.revokedAt)
        ));
      await tx.insert(clientPortalInvites).values({
        workspaceId: ctx.workspace.id,
        clientId,
        email,
        role: data.role,
        tokenHash,
        expiresAt,
        invitedBy: ctx.user.id,
      });
    });

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "portal.invited", entityType: "client", entityId: clientId, clientId,
      metadata: { email, role: data.role },
    });
    revalidateClient(clientId);
    return { ok: true, data: { link: `${env.NEXT_PUBLIC_APP_URL}/portal/accept-invite?token=${token}`, email } };
  } catch (err) {
    return actionError(err);
  }
}

/** Re-issues the pending invite with a fresh token (the old one stops
 * working) so the owner can copy the link again later without email. */
export async function regeneratePortalInviteLink(inviteId: string): Promise<ActionResult<{ link: string }>> {
  try {
    const ctx = await authorize(MANAGE_ROLE);
    const [invite] = await db
      .select()
      .from(clientPortalInvites)
      .where(and(eq(clientPortalInvites.id, inviteId), eq(clientPortalInvites.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!invite) throw new Error("Invitation not found in this workspace.");
    if (invite.acceptedAt) throw new Error("This invitation was already used.");
    if (invite.revokedAt) throw new Error("This invitation was revoked.");

    const { token, tokenHash } = generateInviteToken();
    await db
      .update(clientPortalInvites)
      .set({ tokenHash, expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400000) })
      .where(eq(clientPortalInvites.id, inviteId));

    revalidateClient(invite.clientId);
    return { ok: true, data: { link: `${env.NEXT_PUBLIC_APP_URL}/portal/accept-invite?token=${token}` } };
  } catch (err) {
    return actionError(err);
  }
}

export async function revokePortalInvite(inviteId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize(MANAGE_ROLE);
    const [invite] = await db
      .select()
      .from(clientPortalInvites)
      .where(and(eq(clientPortalInvites.id, inviteId), eq(clientPortalInvites.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!invite) throw new Error("Invitation not found in this workspace.");
    if (invite.acceptedAt) throw new Error("This invitation was already used and cannot be revoked.");

    await db.update(clientPortalInvites).set({ revokedAt: new Date() }).where(eq(clientPortalInvites.id, inviteId));
    revalidateClient(invite.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/* ========== membership management ========== */

async function ownedMembership(workspaceId: string, membershipId: string) {
  const [m] = await db
    .select()
    .from(clientPortalMemberships)
    .where(and(eq(clientPortalMemberships.id, membershipId), eq(clientPortalMemberships.workspaceId, workspaceId)))
    .limit(1);
  if (!m) throw new Error("Portal membership not found in this workspace.");
  return m;
}

export async function suspendPortalAccess(membershipId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize(MANAGE_ROLE);
    const m = await ownedMembership(ctx.workspace.id, membershipId);
    await db
      .update(clientPortalMemberships)
      .set({ status: "suspended", suspendedAt: new Date() })
      .where(eq(clientPortalMemberships.id, membershipId));
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "portal.suspended", entityType: "client", entityId: m.clientId, clientId: m.clientId,
    });
    revalidateClient(m.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function restorePortalAccess(membershipId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize(MANAGE_ROLE);
    const m = await ownedMembership(ctx.workspace.id, membershipId);
    await db
      .update(clientPortalMemberships)
      .set({ status: "active", suspendedAt: null })
      .where(eq(clientPortalMemberships.id, membershipId));
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "portal.restored", entityType: "client", entityId: m.clientId, clientId: m.clientId,
    });
    revalidateClient(m.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/* ========== portal settings (industry / accent) ========== */

export async function updateClientPortalSettings(clientId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize(MANAGE_ROLE);
    await ownedClient(ctx.workspace.id, clientId);
    const data = clientPortalSettingsSchema.parse(input);
    await db
      .update(clients)
      .set({ industry: data.industry ?? null, portalAccentColor: data.portalAccentColor ?? null })
      .where(eq(clients.id, clientId));
    revalidateClient(clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/* ========== invite acceptance (the client's side) ========== */

/**
 * Accepts an invitation for the SIGNED-IN user. Not admin-gated — but every
 * security property is enforced here, server-side:
 * - token resolved by hash; single-use claimed with a conditional UPDATE
 * - expiry / revocation / email match via validateInviteForAcceptance
 * - role and client come from the invite row, never from the browser
 * - exactly one membership per (client, profile), created transactionally
 */
export async function acceptClientInvite(input: unknown): Promise<ActionResult<{ destination: string }>> {
  try {
    const user = await requireUser();
    const data = acceptInviteSchema.parse(input);
    const tokenHash = hashInviteToken(data.token);

    const [invite] = await db
      .select()
      .from(clientPortalInvites)
      .where(eq(clientPortalInvites.tokenHash, tokenHash))
      .limit(1);
    if (!invite) throw new Error("This invitation link is not valid.");

    const check = validateInviteForAcceptance(invite, { now: new Date(), userEmail: user.email });
    if (!check.ok) throw new Error(check.message);

    await db.transaction(async (tx) => {
      // One-time use: claim the invite only if still unclaimed.
      const claimed = await tx
        .update(clientPortalInvites)
        .set({ acceptedAt: new Date() })
        .where(and(eq(clientPortalInvites.id, invite.id), isNull(clientPortalInvites.acceptedAt), isNull(clientPortalInvites.revokedAt)))
        .returning({ id: clientPortalInvites.id });
      if (claimed.length === 0) throw new Error("This invitation has already been used.");

      const [existing] = await tx
        .select()
        .from(clientPortalMemberships)
        .where(and(
          eq(clientPortalMemberships.clientId, invite.clientId),
          eq(clientPortalMemberships.profileId, user.id)
        ))
        .limit(1);
      if (existing?.status === "active") {
        throw new Error("You already have active access to this portal.");
      }
      if (existing) {
        // Re-invite after revoke/suspend: reactivate the same membership row.
        await tx
          .update(clientPortalMemberships)
          .set({ status: "active", role: invite.role, acceptedAt: new Date(), suspendedAt: null, invitedBy: invite.invitedBy, invitedAt: invite.createdAt })
          .where(eq(clientPortalMemberships.id, existing.id));
      } else {
        await tx.insert(clientPortalMemberships).values({
          workspaceId: invite.workspaceId,
          clientId: invite.clientId,
          profileId: user.id,
          role: invite.role,
          status: "active",
          invitedBy: invite.invitedBy,
          invitedAt: invite.createdAt,
          acceptedAt: new Date(),
        });
      }

      // The person confirmed their own details — reflect them on the
      // profile and, when the email matches, on the client's contact card.
      await tx.update(profiles).set({ name: data.fullName }).where(eq(profiles.id, user.id));
      await tx
        .update(contacts)
        .set({ name: data.fullName, phone: data.phone ?? null, title: data.title ?? null })
        .where(and(
          eq(contacts.clientId, invite.clientId),
          eq(contacts.isPrimary, true),
          eq(contacts.email, normalizeEmail(invite.email))
        ));
    });

    await logActivity({
      workspaceId: invite.workspaceId, actorId: user.id,
      action: "portal.accepted", entityType: "client", entityId: invite.clientId, clientId: invite.clientId,
      metadata: { role: invite.role, emailNotifications: data.emailNotifications },
    });
    return { ok: true, data: { destination: "/portal" } };
  } catch (err) {
    return actionError(err);
  }
}
