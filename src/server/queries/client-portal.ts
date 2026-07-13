import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, contacts, clientPortalInvites, clientPortalMemberships, profiles } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/portal";

export type PrimaryContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
};

export type PortalInviteRow = {
  id: string;
  email: string;
  role: "client_owner" | "client_member" | "client_read_only";
  expiresAt: Date;
  createdAt: Date;
  /** true when the invite email no longer matches the current primary contact */
  emailStale: boolean;
  expired: boolean;
};

export type PortalMembershipRow = {
  id: string;
  role: "client_owner" | "client_member" | "client_read_only";
  status: "invited" | "active" | "suspended" | "revoked";
  profileName: string;
  profileEmail: string;
  invitedAt: Date | null;
  acceptedAt: Date | null;
  suspendedAt: Date | null;
};

export type ClientPortalAccess = {
  primaryContact: PrimaryContact | null;
  pendingInvite: PortalInviteRow | null;
  lastInvitedAt: Date | null;
  membership: PortalMembershipRow | null;
};

/** Everything the client-detail "Client Portal Access" section needs, in
 * one workspace-scoped read. */
export async function getClientPortalAccess(workspaceId: string, clientId: string): Promise<ClientPortalAccess> {
  const [primaryRows, inviteRows, membershipRows] = await Promise.all([
    db
      .select({ id: contacts.id, name: contacts.name, email: contacts.email, phone: contacts.phone, title: contacts.title })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.clientId, clientId), eq(contacts.isPrimary, true)))
      .limit(1),
    db
      .select()
      .from(clientPortalInvites)
      .where(and(eq(clientPortalInvites.workspaceId, workspaceId), eq(clientPortalInvites.clientId, clientId)))
      .orderBy(desc(clientPortalInvites.createdAt))
      .limit(10),
    db
      .select({ membership: clientPortalMemberships, profile: profiles })
      .from(clientPortalMemberships)
      .innerJoin(profiles, eq(clientPortalMemberships.profileId, profiles.id))
      .where(and(eq(clientPortalMemberships.workspaceId, workspaceId), eq(clientPortalMemberships.clientId, clientId)))
      .orderBy(desc(clientPortalMemberships.createdAt))
      .limit(1),
  ]);

  const primaryContact = primaryRows[0] ?? null;
  const now = new Date();
  const pending = inviteRows.find((i) => !i.acceptedAt && !i.revokedAt) ?? null;
  const m = membershipRows[0] ?? null;

  return {
    primaryContact,
    pendingInvite: pending
      ? {
          id: pending.id,
          email: pending.email,
          role: pending.role,
          expiresAt: pending.expiresAt,
          createdAt: pending.createdAt,
          emailStale:
            !!primaryContact?.email && normalizeEmail(pending.email) !== normalizeEmail(primaryContact.email),
          expired: now > pending.expiresAt,
        }
      : null,
    lastInvitedAt: inviteRows[0]?.createdAt ?? null,
    membership: m
      ? {
          id: m.membership.id,
          role: m.membership.role,
          status: m.membership.status,
          profileName: m.profile.name,
          profileEmail: m.profile.email,
          invitedAt: m.membership.invitedAt,
          acceptedAt: m.membership.acceptedAt,
          suspendedAt: m.membership.suspendedAt,
        }
      : null,
  };
}

export type InviteLandingInfo = {
  businessName: string;
  agencyName: string;
  email: string;
  role: "client_owner" | "client_member" | "client_read_only";
  error: string | null;
};

/** Public accept-invite page data: resolved by token hash only; never
 * exposes ids or unrelated records. */
export async function getInviteLandingInfo(tokenHash: string): Promise<InviteLandingInfo | null> {
  const [row] = await db
    .select({ invite: clientPortalInvites, clientName: clients.name })
    .from(clientPortalInvites)
    .innerJoin(clients, eq(clientPortalInvites.clientId, clients.id))
    .where(eq(clientPortalInvites.tokenHash, tokenHash))
    .limit(1);
  if (!row) return null;
  const now = new Date();
  let error: string | null = null;
  if (row.invite.acceptedAt) error = "This invitation has already been used.";
  else if (row.invite.revokedAt) error = "This invitation has been revoked. Ask your agency contact for a new one.";
  else if (now > row.invite.expiresAt) error = "This invitation has expired. Ask your agency contact for a new one.";
  return {
    businessName: row.clientName,
    agencyName: "Contractor Arsenal",
    email: row.invite.email,
    role: row.invite.role,
    error,
  };
}

/** Contacts marked primary=false are historical; this returns the full
 * contact list for the Edit Primary Contact dialog. */
export async function listClientContacts(workspaceId: string, clientId: string) {
  return db
    .select()
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.clientId, clientId)))
    .orderBy(desc(contacts.isPrimary), desc(contacts.createdAt));
}
