import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, text, boolean, timestamp, uuid, integer, numeric, date,
  jsonb, index, uniqueIndex, check,
} from "drizzle-orm/pg-core";

/* ========== enums ========== */
export const workspaceRole = pgEnum("workspace_role", ["owner", "admin", "manager", "member", "viewer"]);
export const clientStatus = pgEnum("client_status", ["onboarding", "active", "past_due", "paused", "canceled", "archived"]);
export const leadStatus = pgEnum("lead_status", ["new", "contacted", "qualified", "unqualified", "converted", "lost"]);
export const opportunityStatus = pgEnum("opportunity_status", ["open", "won", "lost"]);
export const subscriptionStatus = pgEnum("subscription_status", ["trial", "active", "past_due", "paused", "canceled", "completed"]);
export const billingFrequency = pgEnum("billing_frequency", ["one_time", "weekly", "monthly", "quarterly", "yearly"]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "open", "paid", "past_due", "void"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded", "voided"]);
export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "waiting", "completed", "canceled"]);
export const taskPriority = pgEnum("task_priority", ["low", "medium", "high", "urgent"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

/* ========== identity ========== */
/**
 * App profile for a Supabase Auth user. `id` mirrors auth.users.id — the
 * FK to auth.users is added in raw SQL in the migration (cross-schema).
 * Supabase Auth owns credentials & sessions; no auth tables live here.
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
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
  businessName: text("business_name"),
  primaryColor: text("primary_color"),
  accentColor: text("accent_color"),
  businessEmail: text("business_email"),
  businessPhone: text("business_phone"),
  website: text("website"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
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
  // Manual portal accent override; falls back to the industry default.
  portalAccentColor: text("portal_accent_color"),
  address: text("address"),
  status: clientStatus("status").notNull().default("onboarding"),
  ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
  startDate: date("start_date"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("clients_workspace_idx").on(t.workspaceId),
  index("clients_workspace_status_idx").on(t.workspaceId, t.status),
  index("clients_workspace_created_idx").on(t.workspaceId, t.createdAt),
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
}, (t) => [
  index("contacts_client_idx").on(t.clientId),
  // At most one primary contact per client — the portal invite identity.
  uniqueIndex("contacts_one_primary_per_client").on(t.clientId).where(sql`${t.isPrimary} = true`),
]);

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
  ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  notes: text("notes"),
  convertedClientId: uuid("converted_client_id").references(() => clients.id, { onDelete: "set null" }),
  // A lead GENERATED FOR one of our clients (Contractor Arsenal delivers
  // leads to contractors) — distinct from convertedClientId, which records
  // an agency prospect that became a client.
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("leads_workspace_status_idx").on(t.workspaceId, t.status),
  index("leads_workspace_client_idx").on(t.workspaceId, t.clientId),
]);

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
  ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
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
  paymentDay: integer("payment_day"),
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
  billingFrequency: billingFrequency("billing_frequency").notNull().default("one_time"),
  billingMonth: date("billing_month"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("invoices_workspace_number_unique").on(t.workspaceId, t.number),
  index("invoices_workspace_status_idx").on(t.workspaceId, t.status),
  index("invoices_workspace_issue_idx").on(t.workspaceId, t.issueDate),
  index("invoices_workspace_billing_month_idx").on(t.workspaceId, t.billingMonth),
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
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: paymentStatus("status").notNull().default("succeeded"),
  paymentType: billingFrequency("payment_type").notNull().default("one_time"),
  billingMonth: date("billing_month"),
  method: text("method"),
  reference: text("reference"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: uuid("voided_by").references(() => profiles.id, { onDelete: "set null" }),
  voidReason: text("void_reason"),
  createdAt: createdAt(),
}, (t) => [
  index("payments_workspace_paid_idx").on(t.workspaceId, t.paidAt),
  index("payments_workspace_billing_month_idx").on(t.workspaceId, t.billingMonth),
  index("payments_invoice_idx").on(t.invoiceId),
  index("payments_subscription_month_idx").on(t.subscriptionId, t.billingMonth),
]);

export const expenseStatus = pgEnum("expense_status", ["active", "archived"]);
export const expenseCategory = pgEnum("expense_category", [
  "software", "office_rent", "payroll", "contractors", "ads", "tools", "misc",
]);

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: expenseCategory("category").notNull().default("misc"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  expenseDate: date("expense_date").notNull(),
  frequency: billingFrequency("frequency").notNull().default("one_time"),
  vendor: text("vendor"),
  notes: text("notes"),
  status: expenseStatus("status").notNull().default("active"),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (t) => [
  index("expenses_workspace_date_idx").on(t.workspaceId, t.expenseDate),
  index("expenses_workspace_category_idx").on(t.workspaceId, t.category),
  index("expenses_workspace_status_idx").on(t.workspaceId, t.status),
]);

export const calendarEventStatus = pgEnum("calendar_event_status", ["scheduled", "in_progress", "completed", "cancelled"]);
export const calendarEventType = pgEnum("calendar_event_type", [
  "work", "meeting", "focus_time", "deadline", "reminder", "personal", "out_of_office", "task",
]);

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  eventType: calendarEventType("event_type").notNull().default("work"),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  assigneeId: uuid("assignee_id").references(() => profiles.id, { onDelete: "set null" }),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  allDay: boolean("all_day").notNull().default(false),
  color: text("color"),
  notes: text("notes"),
  status: calendarEventStatus("status").notNull().default("scheduled"),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("calendar_events_workspace_start_idx").on(t.workspaceId, t.startAt),
  index("calendar_events_client_idx").on(t.clientId),
  index("calendar_events_task_idx").on(t.taskId),
]);

export const projectStatus = pgEnum("project_status", ["planning", "active", "on_hold", "completed", "archived"]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  status: projectStatus("status").notNull().default("planning"),
  ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  color: text("color"),
  // Set when status transitions to "completed"; used by goal metrics to
  // attribute a completion to a specific period. Cleared if reopened.
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (t) => [
  index("projects_workspace_status_idx").on(t.workspaceId, t.status),
]);

/* ========== operations ========== */
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatus("status").notNull().default("todo"),
  priority: taskPriority("priority").notNull().default("medium"),
  assigneeId: uuid("assignee_id").references(() => profiles.id, { onDelete: "set null" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  scheduledDate: date("scheduled_date"),
  scheduledStartTime: text("scheduled_start_time"),
  scheduledEndTime: text("scheduled_end_time"),
  allDay: boolean("all_day").notNull().default(false),
  calendarVisible: boolean("calendar_visible").notNull().default(true),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("tasks_workspace_status_idx").on(t.workspaceId, t.status),
  index("tasks_workspace_due_idx").on(t.workspaceId, t.dueDate),
  index("tasks_workspace_project_idx").on(t.workspaceId, t.projectId),
  index("tasks_workspace_scheduled_idx").on(t.workspaceId, t.scheduledDate),
  index("tasks_assignee_idx").on(t.assigneeId),
  index("tasks_client_idx").on(t.clientId),
]);

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  authorId: uuid("author_id").references(() => profiles.id, { onDelete: "set null" }),
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
  actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
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

/* ========== goals ========== */
export const goalMetricType = pgEnum("goal_metric_type", [
  "revenue_collected", "new_clients", "new_leads", "calls_completed",
  "emails_sent", "projects_completed", "tasks_completed", "custom",
]);
export const goalPeriodType = pgEnum("goal_period_type", ["weekly", "monthly", "quarterly", "annual", "custom"]);
export const goalStatus = pgEnum("goal_status", ["active", "completed", "archived"]);

/**
 * One row = one goal for ONE defined performance period ("Monthly Revenue —
 * July 2026"). Periods are identified by period_start/period_end, stored as
 * workspace-local calendar dates resolved at creation time — never mutated
 * to "roll over" to the next period, so history stays readable. A new
 * period means a new row (see duplicateGoalForNextPeriod).
 */
export const businessGoals = pgTable("business_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  metricType: goalMetricType("metric_type").notNull(),
  periodType: goalPeriodType("period_type").notNull(),
  targetValue: numeric("target_value", { precision: 12, scale: 2 }).notNull(),
  // Only meaningful for manual metrics (calls_completed, emails_sent, custom).
  manualCurrentValue: numeric("manual_current_value", { precision: 12, scale: 2 }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  status: goalStatus("status").notNull().default("active"),
  color: text("color"),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (t) => [
  index("business_goals_workspace_status_idx").on(t.workspaceId, t.status),
  index("business_goals_workspace_period_idx").on(t.workspaceId, t.periodStart, t.periodEnd),
  index("business_goals_workspace_created_idx").on(t.workspaceId, t.createdAt),
  index("business_goals_workspace_archived_idx").on(t.workspaceId, t.archivedAt),
  // At most one primary goal per workspace, enforced at the database level.
  uniqueIndex("business_goals_one_primary_per_workspace").on(t.workspaceId).where(sql`${t.isPrimary} = true`),
  check("business_goals_target_positive", sql`${t.targetValue} > 0`),
  check("business_goals_manual_non_negative", sql`${t.manualCurrentValue} IS NULL OR ${t.manualCurrentValue} >= 0`),
  check("business_goals_period_valid", sql`${t.periodEnd} >= ${t.periodStart}`),
]);

/** Audit trail for manual progress updates only — automatic metrics are
 * computed from source records and need no event log. */
export const goalProgressUpdates = pgTable("goal_progress_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  goalId: uuid("goal_id").notNull().references(() => businessGoals.id, { onDelete: "cascade" }),
  previousValue: numeric("previous_value", { precision: 12, scale: 2 }).notNull(),
  newValue: numeric("new_value", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [
  index("goal_progress_updates_goal_created_idx").on(t.goalId, t.createdAt),
]);

/* ========== client portal ========== */
export const clientPortalRole = pgEnum("client_portal_role", ["client_owner", "client_member", "client_read_only"]);
export const clientPortalStatus = pgEnum("client_portal_status", ["invited", "active", "suspended", "revoked"]);

/**
 * Invitation to the client portal. Only the SHA-256 hash of the invite
 * token is stored — the plaintext token exists once, in the copyable link
 * shown to the internal owner, and is never logged or persisted.
 */
export const clientPortalInvites = pgTable("client_portal_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: clientPortalRole("role").notNull().default("client_owner"),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  invitedBy: uuid("invited_by").references(() => profiles.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("client_portal_invites_token_hash_unique").on(t.tokenHash),
  index("client_portal_invites_workspace_client_idx").on(t.workspaceId, t.clientId),
  index("client_portal_invites_workspace_created_idx").on(t.workspaceId, t.createdAt),
]);

/** A profile's access to one client's portal. One row per (client, profile);
 * status transitions instead of duplicate rows. */
export const clientPortalMemberships = pgTable("client_portal_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  role: clientPortalRole("role").notNull().default("client_owner"),
  status: clientPortalStatus("status").notNull().default("active"),
  invitedBy: uuid("invited_by").references(() => profiles.id, { onDelete: "set null" }),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("client_portal_memberships_client_profile_unique").on(t.clientId, t.profileId),
  index("client_portal_memberships_profile_idx").on(t.profileId),
  index("client_portal_memberships_workspace_client_idx").on(t.workspaceId, t.clientId),
]);
