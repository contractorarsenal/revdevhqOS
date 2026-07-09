import {
  pgTable, pgEnum, text, boolean, timestamp, uuid, integer, numeric, date,
  jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

/* ========== enums ========== */
export const workspaceRole = pgEnum("workspace_role", ["owner", "admin", "manager", "member", "viewer"]);
export const clientStatus = pgEnum("client_status", ["onboarding", "active", "past_due", "paused", "canceled", "archived"]);
export const leadStatus = pgEnum("lead_status", ["new", "contacted", "qualified", "unqualified", "converted", "lost"]);
export const opportunityStatus = pgEnum("opportunity_status", ["open", "won", "lost"]);
export const subscriptionStatus = pgEnum("subscription_status", ["trial", "active", "past_due", "paused", "canceled", "completed"]);
export const billingFrequency = pgEnum("billing_frequency", ["one_time", "weekly", "monthly", "quarterly", "yearly"]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "open", "paid", "past_due", "void"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded"]);
export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "completed", "canceled"]);
export const taskPriority = pgEnum("task_priority", ["low", "medium", "high", "urgent"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

/* ========== authentication (Better Auth) ========== */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("accounts_user_idx").on(t.userId)]);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ========== workspaces ========== */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("UTC"),
  currency: text("currency").notNull().default("USD"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: workspaceRole("role").notNull().default("member"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("workspace_members_unique").on(t.workspaceId, t.userId),
  index("workspace_members_user_idx").on(t.userId),
]);

/* ========== CRM ========== */
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  website: text("website"),
  email: text("email"),
  phone: text("phone"),
  industry: text("industry"),
  address: text("address"),
  status: clientStatus("status").notNull().default("onboarding"),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
  startDate: date("start_date"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("clients_workspace_idx").on(t.workspaceId),
  index("clients_workspace_status_idx").on(t.workspaceId, t.status),
]);

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("contacts_client_idx").on(t.clientId)]);

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  company: text("company").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  source: text("source"),
  status: leadStatus("status").notNull().default("new"),
  serviceInterest: text("service_interest"),
  estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
  estimatedMrr: numeric("estimated_mrr", { precision: 12, scale: 2 }),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  notes: text("notes"),
  convertedClientId: uuid("converted_client_id").references(() => clients.id, { onDelete: "set null" }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("leads_workspace_status_idx").on(t.workspaceId, t.status)]);

export const pipelineStages = pgTable("pipeline_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  probability: integer("probability").notNull().default(0),
  isWon: boolean("is_won").notNull().default(false),
  isLost: boolean("is_lost").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("pipeline_stages_workspace_idx").on(t.workspaceId, t.position)]);

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").notNull().references(() => pipelineStages.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  contactName: text("contact_name"),
  value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
  mrr: numeric("mrr", { precision: 12, scale: 2 }).notNull().default("0"),
  status: opportunityStatus("status").notNull().default("open"),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
  expectedCloseDate: date("expected_close_date"),
  wonAt: timestamp("won_at", { withTimezone: true }),
  lostAt: timestamp("lost_at", { withTimezone: true }),
  lostReason: text("lost_reason"),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("opportunities_workspace_stage_idx").on(t.workspaceId, t.stageId),
  index("opportunities_workspace_status_idx").on(t.workspaceId, t.status),
]);

/* ========== services & billing ========== */
export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  defaultPrice: numeric("default_price", { precision: 12, scale: 2 }),
  defaultFrequency: billingFrequency("default_frequency").notNull().default("monthly"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("services_workspace_name_unique").on(t.workspaceId, t.name)]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  frequency: billingFrequency("frequency").notNull().default("monthly"),
  status: subscriptionStatus("status").notNull().default("active"),
  startDate: date("start_date").notNull(),
  nextBillingDate: date("next_billing_date"),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("subscriptions_workspace_status_idx").on(t.workspaceId, t.status),
  index("subscriptions_client_idx").on(t.clientId),
]);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  status: invoiceStatus("status").notNull().default("draft"),
  issueDate: date("issue_date"),
  dueDate: date("due_date"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("invoices_workspace_number_unique").on(t.workspaceId, t.number),
  index("invoices_workspace_status_idx").on(t.workspaceId, t.status),
  index("invoices_client_idx").on(t.clientId),
]);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: createdAt(),
}, (t) => [index("invoice_items_invoice_idx").on(t.invoiceId)]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: paymentStatus("status").notNull().default("succeeded"),
  method: text("method"),
  reference: text("reference"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("payments_workspace_paid_idx").on(t.workspaceId, t.paidAt),
  index("payments_invoice_idx").on(t.invoiceId),
]);

/* ========== operations ========== */
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatus("status").notNull().default("todo"),
  priority: taskPriority("priority").notNull().default("medium"),
  assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("tasks_workspace_status_idx").on(t.workspaceId, t.status),
  index("tasks_assignee_idx").on(t.assigneeId),
  index("tasks_client_idx").on(t.clientId),
]);

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("notes_client_idx").on(t.clientId)]);

export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
  metadata: jsonb("metadata"),
  createdAt: createdAt(),
}, (t) => [index("activity_workspace_created_idx").on(t.workspaceId, t.createdAt)]);

/* ========== onboarding ========== */
export const onboardingTemplates = pgTable("onboarding_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: createdAt(),
});

export const onboardingSteps = pgTable("onboarding_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id").notNull().references(() => onboardingTemplates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
});

export const clientOnboarding = pgTable("client_onboarding", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => onboardingTemplates.id, { onDelete: "set null" }),
  stepName: text("step_name").notNull(),
  position: integer("position").notNull().default(0),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("client_onboarding_client_idx").on(t.clientId)]);
