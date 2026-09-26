import { DASHBOARD_WIDGET_IDS } from "@/lib/validation";

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];
export type DashboardLayout = { order: DashboardWidgetId[]; hidden: DashboardWidgetId[] };

/** Default composition: what needs attention first, context and money after. */
export const DEFAULT_DASHBOARD_ORDER: DashboardWidgetId[] = [
  // primary: what to do now
  "todays_work", "attention",
  // secondary: state of the work and the money
  "needs_jay", "waiting_on", "client_requests", "project_health", "financial",
  // supporting context
  "upcoming", "sales_pipeline", "client_leads", "team_workload", "activity",
];

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = { order: DEFAULT_DASHBOARD_ORDER, hidden: [] };

/** Turns anything stored (or nothing) into a valid layout: unknown ids are
 * dropped, duplicates removed, and widgets added in later releases are
 * appended so nobody's saved layout ever hides a new widget by accident. */
export function normalizeLayout(raw: unknown): DashboardLayout {
  const known = new Set<string>(DASHBOARD_WIDGET_IDS);
  const obj = (raw && typeof raw === "object" ? raw : {}) as { order?: unknown; hidden?: unknown };
  const pick = (v: unknown): DashboardWidgetId[] => {
    const seen = new Set<string>();
    const out: DashboardWidgetId[] = [];
    if (Array.isArray(v)) {
      for (const id of v) {
        if (typeof id === "string" && known.has(id) && !seen.has(id)) { seen.add(id); out.push(id as DashboardWidgetId); }
      }
    }
    return out;
  };
  const order = pick(obj.order);
  for (const id of DEFAULT_DASHBOARD_ORDER) if (!order.includes(id)) order.push(id);
  const hidden = pick(obj.hidden);
  return { order, hidden };
}
