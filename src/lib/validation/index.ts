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
  clientId: uuidOrNull,
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
});

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(5000).transform((v) => (v === "" ? null : v)).nullable().optional(),
  status: z.enum(["planning", "active", "on_hold", "completed", "archived"]).default("planning"),
  ownerId: uuidOrNull,
  clientId: uuidOrNull,
  startDate: optionalDate,
  dueDate: optionalDate,
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
