import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const uuidOrNull = z
  .union([z.literal(""), z.string().uuid()])
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const moneyField = z.coerce.number().min(0).max(999_999_999);
export const optionalMoneyField = z
  .union([z.literal(""), z.coerce.number().min(0).max(999_999_999)])
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const optionalDate = z
  .string()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const monthField = z
  .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}$/, "Use the month picker")])
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const workspaceSchema = z.object({
  name: z.string().trim().min(2, "Workspace name is required").max(80),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
});

export const WORKSPACE_ROLES = ["owner", "admin", "manager", "member", "viewer"] as const;

export const changePasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  name: z.string().trim().min(1, "Name is required").max(120),
  role: z.enum(WORKSPACE_ROLES),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(WORKSPACE_ROLES),
});

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200),
  website: optionalTrimmed,
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]).transform((v) => (v === "" ? null : v)).nullable().optional(),
  phone: optionalTrimmed,
  industry: optionalTrimmed,
  address: optionalTrimmed,
  status: z.enum(["onboarding", "active", "past_due", "paused", "canceled"]).default("onboarding"),
  ownerId: optionalTrimmed,
  startDate: optionalDate,
  contactName: optionalTrimmed,
  contactEmail: optionalTrimmed,
  contactPhone: optionalTrimmed,
});

export const contactSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(200),
  title: optionalTrimmed,
  email: optionalTrimmed,
  phone: optionalTrimmed,
  isPrimary: z.coerce.boolean().default(false),
});

export const leadSchema = z.object({
  company: z.string().trim().min(1, "Company is required").max(200),
  contactName: optionalTrimmed,
  email: optionalTrimmed,
  phone: optionalTrimmed,
  source: optionalTrimmed,
  status: z.enum(["new", "contacted", "qualified", "unqualified", "converted", "lost"]).default("new"),
  serviceInterest: optionalTrimmed,
  estimatedValue: optionalMoneyField,
  estimatedMrr: optionalMoneyField,
  ownerId: optionalTrimmed,
  nextFollowUpAt: optionalDate,
  notes: z.string().trim().max(5000).transform((v) => (v === "" ? null : v)).nullable().optional(),
});

const optionalIngestionToken = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

/** Internal manual entry of a lead FOR a client — feeds that client's
 * portal immediately. Distinct from leadSchema (agency-prospect leads):
 * status is the 5-value client-facing workflow, clientId is required.
 * `receivedOn` is a calendar date (YYYY-MM-DD), not an instant.
 * externalMessageId / dedupeKey stay optional because the human form does
 * not collect them. Automated Inbox ingest must use clientLeadIngestSchema
 * (keys required on the first insert), not this schema. */
export const clientLeadManualEntrySchema = z.object({
  clientId: z.string().uuid("Select a client"),
  name: z.string().trim().min(1, "Name is required").max(200),
  email: optionalTrimmed,
  phone: optionalTrimmed,
  requestedService: optionalTrimmed,
  source: z.enum(["Website", "Google Business Profile", "Google Ads", "Facebook", "Referral", "Phone", "Manual", "Other"]).default("Manual"),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date received is required"),
  status: z.enum(["new", "contacted", "estimate_scheduled", "won", "lost"]).default("new"),
  estimatedValue: optionalMoneyField,
  externalMessageId: optionalIngestionToken,
  dedupeKey: optionalIngestionToken,
  ingestionSource: z.enum(["manual", "website", "webhook", "api", "gmail", "form"]).optional(),
});

/** Automated Inbox ingest. Every identity field is required so the first
 * INSERT carries externalMessageId, dedupeKey, receivedOn, and
 * ingestionSource. `manual` is intentionally absent — humans use
 * clientLeadManualEntrySchema. `receivedOn` is YYYY-MM-DD, not an instant. */
export const CLIENT_LEAD_INGEST_SOURCES = ["website", "webhook", "api", "gmail", "form"] as const;

const requiredIngestionToken = (field: string) =>
  z.string().trim().min(1, `${field} is required`).max(500);

export const clientLeadIngestSchema = z.object({
  clientId: z.string().uuid("clientId must be a client uuid"),
  name: z.string().trim().min(1, "Name is required").max(200),
  email: optionalTrimmed,
  phone: optionalTrimmed,
  requestedService: optionalTrimmed,
  source: z.enum(["Website", "Google Business Profile", "Google Ads", "Facebook", "Referral", "Phone", "Manual", "Other"]),
  receivedOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "receivedOn must be YYYY-MM-DD"),
  externalMessageId: requiredIngestionToken("externalMessageId"),
  dedupeKey: requiredIngestionToken("dedupeKey"),
  ingestionSource: z.enum(CLIENT_LEAD_INGEST_SOURCES),
});

/** Portal-side lead mutations — each field is edited independently. */
export const clientLeadStatusSchema = z.object({ status: z.enum(["new", "contacted", "estimate_scheduled", "won", "lost"]) });
export const clientLeadAssignSchema = z.object({ profileId: uuidOrNull });
export const clientLeadEstimateSchema = z.object({ estimatedValue: optionalMoneyField });
export const clientLeadClosedValueSchema = z.object({ closedValue: optionalMoneyField });
export const clientLeadNoteSchema = z.object({ note: z.string().trim().min(1, "Note cannot be empty").max(2000) });

export const stageSchema = z.object({
  name: z.string().trim().min(1).max(80),
  probability: z.coerce.number().int().min(0).max(100).default(0),
});

export const opportunitySchema = z.object({
  name: z.string().trim().min(1, "Deal name is required").max(200),
  stageId: z.string().uuid(),
  leadId: uuidOrNull,
  clientId: uuidOrNull,
  contactName: optionalTrimmed,
  value: moneyField.default(0),
  mrr: moneyField.default(0),
  ownerId: optionalTrimmed,
  expectedCloseDate: optionalDate,
});

export const serviceSchema = z.object({
  name: z.string().trim().min(1, "Service name is required").max(120),
  description: optionalTrimmed,
  defaultPrice: optionalMoneyField,
  defaultFrequency: z.enum(["one_time", "weekly", "monthly", "quarterly", "yearly"]).default("monthly"),
});

// Days 29-31 are allowed: billing math clamps to the last day of shorter
// months (Feb 28/29, 30-day months) via dateOnPaymentDay.
const paymentDayField = z
  .union([z.literal(""), z.coerce.number().int().min(1).max(31)])
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

/** Editable billing terms of an existing subscription. Deliberately has no
 * clientId/serviceId: a subscription can never be re-attributed to another
 * client or service by editing it. */
export const subscriptionEditSchema = z.object({
  amount: moneyField,
  frequency: z.enum(["one_time", "weekly", "monthly", "quarterly", "yearly"]).default("monthly"),
  status: z.enum(["trial", "active", "past_due", "paused", "canceled", "completed"]).default("active"),
  startDate: z.string().min(1, "Start date is required"),
  nextBillingDate: optionalDate,
  paymentDay: paymentDayField,
});

export const subscriptionSchema = subscriptionEditSchema.extend({
  clientId: z.string().uuid(),
  serviceId: z.string().uuid(),
});

export const expenseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.enum(["software", "office_rent", "payroll", "contractors", "ads", "tools", "misc"]).default("misc"),
  amount: moneyField,
  expenseDate: z.string().min(1, "Date is required"),
  frequency: z.enum(["one_time", "monthly"]).default("one_time"),
  vendor: optionalTrimmed,
  notes: z.string().trim().max(2000).transform((v) => (v === "" ? null : v)).nullable().optional(),
});

export const workspaceBrandingSchema = z.object({
  businessName: optionalTrimmed,
  primaryColor: z
    .union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #E11D48")])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  accentColor: z
    .union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #E11D48")])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  businessEmail: optionalTrimmed,
  businessPhone: optionalTrimmed,
  website: optionalTrimmed,
});

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(300),
  quantity: z.coerce.number().min(0.01).max(100000).default(1),
  unitPrice: moneyField,
});

export const invoiceSchema = z.object({
  clientId: z.string().uuid(),
  number: z.string().trim().min(1, "Invoice number is required").max(40),
  status: z.enum(["draft", "open"]).default("draft"),
  billingFrequency: z.enum(["one_time", "monthly"]).default("one_time"),
  billingMonth: monthField,
  issueDate: optionalDate,
  dueDate: optionalDate,
  items: z.array(invoiceItemSchema).min(1, "Add at least one line item"),
});

export const paymentSchema = z.object({
  clientId: uuidOrNull,
  invoiceId: uuidOrNull,
  amount: z.coerce.number().positive("Amount must be greater than zero").max(999_999_999),
  status: z.enum(["pending", "succeeded", "failed", "refunded"]).default("succeeded"),
  paymentType: z.enum(["one_time", "monthly"]).default("one_time"),
  billingMonth: monthField,
  method: optionalTrimmed,
  reference: optionalTrimmed,
  paidAt: z.string().min(1, "Payment date is required"),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().trim().max(5000).transform((v) => (v === "" ? null : v)).nullable().optional(),
  status: z.enum(["todo", "in_progress", "waiting", "completed", "canceled"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  assigneeId: optionalTrimmed,
  clientId: uuidOrNull,
  leadId: uuidOrNull,
  opportunityId: uuidOrNull,
  projectId: uuidOrNull,
  dueDate: optionalDate,
  scheduledDate: optionalDate,
  scheduledStartTime: optionalTrimmed,
  scheduledEndTime: optionalTrimmed,
  allDay: z.coerce.boolean().default(false),
  clientVisible: z.coerce.boolean().default(false),
});

// The original 5 values ("planning", "active", "on_hold", "completed",
// "archived") are retired — kept in the database enum (existing rows were
// migrated off them) but no longer assignable through the app.
export const PROJECT_STATUSES = [
  "onboarding", "waiting_on_client", "ready_to_build", "building", "client_review",
  "revisions", "ready_to_launch", "live", "paused", "at_risk", "closed",
] as const;

export const WAITING_ON_PARTIES = ["client", "ca", "jay", "third_party", "other"] as const;
export type WaitingOnParty = (typeof WAITING_ON_PARTIES)[number];

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(5000).transform((v) => (v === "" ? null : v)).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).default("ready_to_build"),
  ownerId: uuidOrNull,
  clientId: uuidOrNull,
  startDate: optionalDate,
  dueDate: optionalDate,
  waitingOn: optionalTrimmed,
  waitingOnParty: z
    .union([z.literal(""), z.enum(WAITING_ON_PARTIES)])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  nextAction: optionalTrimmed,
  clientVisible: z.coerce.boolean().default(false),
  clientSummary: z.string().trim().max(2000).transform((v) => (v === "" ? null : v)).nullable().optional(),
  color: z
    .union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});

export const noteSchema = z.object({
  body: z.string().trim().min(1, "Note text is required").max(5000),
  clientId: uuidOrNull,
  leadId: uuidOrNull,
  opportunityId: uuidOrNull,
  taskId: uuidOrNull,
});

export const convertOpportunitySchema = z.object({
  opportunityId: z.string().uuid(),
  clientName: z.string().trim().min(1, "Client name is required").max(200),
  contactName: optionalTrimmed,
  contactEmail: optionalTrimmed,
  subscriptions: z
    .array(
      z.object({
        serviceId: z.string().uuid(),
        amount: moneyField,
        frequency: z.enum(["one_time", "weekly", "monthly", "quarterly", "yearly"]).default("monthly"),
      })
    )
    .default([]),
});

export type ClientInput = z.infer<typeof clientSchema>;
export type LeadInput = z.infer<typeof leadSchema>;
export type OpportunityInput = z.infer<typeof opportunitySchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type SubscriptionInput = z.infer<typeof subscriptionSchema>;
export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type TaskInput = z.infer<typeof taskSchema>;

export const calendarEventSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  eventType: z.enum(["work", "meeting", "focus_time", "deadline", "reminder", "personal", "out_of_office", "task"]).default("work"),
  clientId: uuidOrNull,
  taskId: uuidOrNull,
  assigneeId: uuidOrNull,
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  allDay: z.coerce.boolean().default(false),
  color: z
    .union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  notes: z.string().trim().max(2000).transform((v) => (v === "" ? null : v)).nullable().optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled"),
});

export const goalSchema = z
  .object({
    name: z.string().trim().min(1, "Goal name is required").max(120),
    description: z.string().trim().max(2000).transform((v) => (v === "" ? null : v)).nullable().optional(),
    metricType: z.enum([
      "revenue_collected", "new_clients", "new_leads", "calls_completed",
      "emails_sent", "projects_completed", "tasks_completed", "custom",
    ]),
    periodType: z.enum(["weekly", "monthly", "quarterly", "annual", "custom"]),
    targetValue: z.coerce.number().gt(0, "Target must be greater than zero").max(999_999_999),
    // Period anchors — which one applies depends on periodType (checked below).
    weekDate: z.string().optional(),
    month: z.string().optional(),
    quarter: z.coerce.number().int().optional(),
    year: z.coerce.number().int().optional(),
    customStart: z.string().optional(),
    customEnd: z.string().optional(),
    color: z
      .union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #DC2626")])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    isPrimary: z.coerce.boolean().default(false),
    manualStartValue: z
      .union([z.literal(""), z.coerce.number().min(0, "Starting value cannot be negative").max(999_999_999)])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    const need = (field: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [field], message });
    if (data.periodType === "weekly" && !data.weekDate) need("weekDate", "Pick a date inside the target week");
    if (data.periodType === "monthly" && !data.month) need("month", "Pick a target month");
    if (data.periodType === "quarterly" && (!data.quarter || !data.year)) need("quarter", "Pick a quarter and year");
    if (data.periodType === "annual" && !data.year) need("year", "Pick a target year");
    if (data.periodType === "custom") {
      if (!data.customStart || !data.customEnd) need("customStart", "Custom periods need start and end dates");
      else if (data.customEnd < data.customStart) need("customEnd", "End date must be on or after the start date");
    }
  });

export const goalProgressSchema = z.object({
  value: z.coerce.number().min(0, "Progress cannot be negative").max(999_999_999),
  note: z.string().trim().max(500).transform((v) => (v === "" ? null : v)).nullable().optional(),
});

export const primaryContactSchema = z.object({
  name: z.string().trim().min(1, "Contact name is required").max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email"),
  phone: optionalTrimmed,
  title: optionalTrimmed,
});

export const portalInviteSchema = z.object({
  role: z.enum(["client_owner", "client_member", "client_read_only"]).default("client_owner"),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(20, "Invalid invitation link"),
  fullName: z.string().trim().min(1, "Your name is required").max(200),
  phone: optionalTrimmed,
  title: optionalTrimmed,
  confirmBusiness: z.literal(true, { error: "Please confirm you are joining this business" }),
  acceptTerms: z.literal(true, { error: "Please accept the terms to continue" }),
  emailNotifications: z.coerce.boolean().default(true),
});

export const clientPortalSettingsSchema = z.object({
  industry: z
    .union([z.literal(""), z.string().trim().max(60)])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  portalAccentColor: z
    .union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #DC2626")])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});

/* ========== approvals ("Needs Jay") ========== */
export const APPROVAL_TYPES = [
  "pricing", "deployment", "payment_issue", "refund_cancellation",
  "client_issue", "scope_decision", "security", "blocker", "other",
] as const;

export const createApprovalSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: optionalTrimmed,
  type: z.enum(APPROVAL_TYPES).default("other"),
  riskSummary: optionalTrimmed,
  requestedAction: optionalTrimmed,
  clientId: uuidOrNull,
  projectId: uuidOrNull,
  leadId: uuidOrNull,
  taskId: uuidOrNull,
});

export const resolveApprovalSchema = z.object({
  status: z.enum(["approved", "declined", "resolved", "cancelled"]),
  resolutionNotes: optionalTrimmed,
});

/* ========== client requests ========== */
export const CLIENT_REQUEST_TYPES = [
  "photo_change", "phone_update", "content_revision", "new_page", "new_service",
  "bug", "form_issue", "tracking_issue", "technical_problem", "support_request", "other",
] as const;

export const CLIENT_REQUEST_STATUSES = ["new", "triaged", "in_progress", "waiting", "complete", "client_notified"] as const;

export const clientRequestSchema = z.object({
  clientId: z.string().uuid("Select a client"),
  type: z.enum(CLIENT_REQUEST_TYPES).default("other"),
  description: z.string().trim().min(1, "Description is required").max(3000),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

/** Portal submission never accepts a clientId — it's derived from the
 * caller's own portal session server-side (see authorizePortal). */
export const portalClientRequestSchema = clientRequestSchema.omit({ clientId: true });

export const updateClientRequestStatusSchema = z.object({
  status: z.enum(CLIENT_REQUEST_STATUSES),
  resolutionNotes: optionalTrimmed,
  clientUpdate: z.string().trim().max(1000).transform((v) => (v === "" ? null : v)).nullable().optional(),
});

/** Portal request submission: optional project link, validated against the
 * caller's own client server-side. */
export const portalRequestWithProjectSchema = portalClientRequestSchema.extend({
  projectId: uuidOrNull,
});

export const projectUpdateSchema = z.object({
  body: z.string().trim().min(1, "Update text is required").max(3000),
  clientVisible: z.coerce.boolean().default(true),
});

export const portalAccountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
});

export const FILE_CATEGORIES = ["logo", "image", "document", "mockup", "brand", "deliverable", "other"] as const;
export const requestUploadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sizeBytes: z.coerce.number().int().positive().max(25 * 1024 * 1024, "Files can be up to 25 MB."),
  mimeType: z.string().trim().max(120).optional().nullable(),
  category: z.enum(FILE_CATEGORIES).default("other"),
  projectId: uuidOrNull,
});

export const DASHBOARD_WIDGET_IDS = [
  "needs_jay", "project_health", "waiting_on", "attention", "todays_work", "team_workload",
  "client_requests", "sales_pipeline", "client_leads", "financial", "upcoming", "activity",
] as const;
export const dashboardLayoutSchema = z.object({
  order: z.array(z.enum(DASHBOARD_WIDGET_IDS)).max(DASHBOARD_WIDGET_IDS.length),
  hidden: z.array(z.enum(DASHBOARD_WIDGET_IDS)).max(DASHBOARD_WIDGET_IDS.length),
});

export const bulkPaymentRowSchema = z.object({
  rowId: z.string().min(1).max(64),
  clientId: z.string().uuid("Select a client"),
  subscriptionId: uuidOrNull,
  invoiceId: uuidOrNull,
  amount: z.coerce.number().positive("Amount must be greater than zero").max(999_999_999),
  paidAt: z.string().min(1, "Payment date is required").regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date"),
  method: optionalTrimmed,
  reference: optionalTrimmed,
  note: z.string().trim().max(500).transform((v) => (v === "" ? null : v)).nullable().optional(),
  /** "YYYY-MM"; only meaningful with a subscription (defaults to the payment month). */
  billingMonth: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
});
export type BulkPaymentRowInput = z.infer<typeof bulkPaymentRowSchema>;
export const bulkPaymentBatchSchema = z.object({
  rows: z.array(bulkPaymentRowSchema).min(1, "Add at least one payment").max(50, "A batch can hold up to 50 payments"),
  /** rowIds the user explicitly confirmed despite a "possible duplicate" warning. */
  confirmedDuplicateRowIds: z.array(z.string()).default([]),
});

export const triageClientRequestSchema = z.object({
  taskTitle: z.string().trim().min(1, "Task title is required").max(200),
  assigneeId: uuidOrNull,
  dueDate: optionalDate,
});
