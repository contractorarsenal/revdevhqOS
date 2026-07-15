"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Pencil, Plus, Archive, ChevronLeft, DollarSign, FileText, StickyNote, CheckSquare, ClipboardList, CalendarDays,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClientAvatar } from "@/components/shared/client-avatar";
import { FinancialAmount } from "@/components/shared/financial-amount";
import { ActivityTimeline } from "@/components/shared/activity-timeline";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { invoiceBalance, isPastDue } from "@/lib/finance/metrics";
import { formatFullDate, toDateOnlyString } from "@/lib/date-tz";
import { archiveClient, addContact, startOnboarding, toggleOnboardingStep } from "@/server/actions/clients";
import { markSubscriptionCollected, voidPayment, restorePayment } from "@/server/actions/billing";
import { addNote } from "@/server/actions/notes";
import { setTaskCompletion } from "@/server/actions/tasks";
import { setSubscriptionStatus } from "@/server/actions/billing";
import { Checkbox } from "@/components/ui/checkbox";
import { ClientFormDialog } from "./client-form-dialog";
import { TaskFormDialog } from "@/features/tasks/task-form-dialog";
import { SubscriptionFormDialog } from "@/features/billing/subscription-form-dialog";
import { SubscriptionEditDialog } from "@/features/billing/subscription-edit-dialog";
import { EventFormDialog } from "@/features/calendar/event-form-dialog";
import { PaymentFormDialog } from "@/features/billing/payment-form-dialog";
import { InvoiceFormDialog } from "@/features/billing/invoice-form-dialog";
import { ClientPortalSection } from "@/features/clients/client-portal-section";
import { ClientLeadSummaryCard } from "@/features/clients/client-lead-summary";
import type { ClientPortalAccess } from "@/server/queries/client-portal";
import type { ClientLeadSummary } from "@/server/queries/client-leads";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ClientDetailView({
  detail, billing, members, services, portalAccess, leadSummary, canManagePortal,
}: {
  detail: any; billing: any; members: any[]; services: any[];
  portalAccess: ClientPortalAccess; leadSummary: ClientLeadSummary; canManagePortal: boolean;
}) {
  const router = useRouter();
  const client = detail.client;
  const clientInvoiceOptions = billing.invoices.map((i: any) => ({ ...i, clientName: client.name }));
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [editSub, setEditSub] = useState<any>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [editPay, setEditPay] = useState<any>(null);
  const [invOpen, setInvOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [collectingId, setCollectingId] = useState<string | null>(null);

  async function markCollected(subscriptionId: string) {
    setCollectingId(subscriptionId);
    const result = await markSubscriptionCollected(subscriptionId);
    setCollectingId(null);
    if (!result.ok) toast.error(result.error);
    else { toast.success("Payment recorded"); router.refresh(); }
  }
  const [noteBody, setNoteBody] = useState("");

  async function run(promise: Promise<{ ok: boolean; error?: string }>, success: string) {
    const result = await promise;
    if (!result.ok) toast.error(result.error ?? "Action failed");
    else {
      toast.success(success);
      router.refresh();
    }
  }

  async function submitNote() {
    if (!noteBody.trim()) return;
    await run(addNote({ body: noteBody, clientId: client.id }), "Note added");
    setNoteBody("");
  }

  async function submitContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await run(
      addContact({
        clientId: client.id,
        name: String(form.get("name")),
        title: String(form.get("title") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        isPrimary: form.get("isPrimary") === "on",
      }),
      "Contact added"
    );
    setContactOpen(false);
  }

  const openTasks = detail.tasks.filter((t: any) => ["todo", "in_progress"].includes(t.status));
  const outstanding = detail.invoices
    .filter((i: any) => ["open", "past_due"].includes(i.status))
    .reduce((sum: number, i: any) => sum + invoiceBalance(i), 0);

  return (
    <div>
      <Link href="/clients" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" /> Clients
      </Link>

      {/* header */}
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card px-4 py-4 shadow-sm">
        <ClientAvatar name={client.name} className="size-11 rounded-lg text-sm" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight">{client.name}</h1>
            <StatusBadge status={client.status} />
            {outstanding > 0 && <StatusBadge status="past_due" tone={detail.invoices.some((i: any) => isPastDue(i)) ? "red" : "amber"} />}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {client.industry ?? "—"} · Client since {client.startDate ?? format(new Date(client.createdAt), "MMM yyyy")} · Owner: {detail.ownerName ?? "Unassigned"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">MRR</p>
            <FinancialAmount value={detail.mrr} suffix="/mo" className="text-lg" />
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" /> Edit Client
          </Button>
          {client.status !== "archived" && (
            <ConfirmationDialog
              trigger={<Button variant="outline" size="sm" className="gap-1.5 text-destructive"><Archive className="size-3.5" /> Archive</Button>}
              title="Archive this client?"
              description="The client is hidden from active lists; billing history is preserved."
              confirmLabel="Archive"
              destructive
              onConfirm={() => run(archiveClient(client.id), "Client archived")}
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_310px]">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="portal">Portal</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <ClientLeadSummaryCard summary={leadSummary} clientName={client.name} />

            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="flex items-center border-b border-border/60 px-4 py-2.5">
                <h2 className="text-[12.5px] font-semibold">Contacts</h2>
                <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs" onClick={() => setContactOpen(true)}>
                  <Plus className="size-3.5" /> Add contact
                </Button>
              </header>
              {detail.contacts.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">No contacts yet.</p>
              ) : (
                detail.contacts.map((c: any) => (
                  <div key={c.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                    <ClientAvatar name={c.name} className="rounded-full" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">
                        {c.name} {c.title && <span className="text-xs text-muted-foreground">· {c.title}</span>}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    {c.isPrimary && <StatusBadge status="primary" tone="indigo" />}
                  </div>
                ))
              )}
            </section>

            {billing.duePayments.length > 0 && (
              <section className="rounded-lg border border-amber-300 bg-amber-50 shadow-sm dark:border-amber-900 dark:bg-amber-950/40">
                <header className="flex items-center border-b border-amber-300/60 px-4 py-2.5 dark:border-amber-900/60">
                  <h2 className="text-[12.5px] font-semibold">Payment due</h2>
                </header>
                {billing.duePayments.map((d: any) => (
                  <div key={d.subscriptionId} className="flex items-center gap-3 border-t border-amber-300/40 px-4 py-2.5 first:border-t-0 dark:border-amber-900/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{d.serviceName}</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {new Date(d.dueMonth + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                        {d.late ? " · late" : ""}
                      </p>
                    </div>
                    <FinancialAmount value={d.amount} />
                    <Button size="sm" disabled={collectingId === d.subscriptionId} onClick={() => markCollected(d.subscriptionId)}>
                      {collectingId === d.subscriptionId ? "Recording…" : "Mark collected"}
                    </Button>
                  </div>
                ))}
              </section>
            )}

            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="flex items-center border-b border-border/60 px-4 py-2.5">
                <h2 className="text-[12.5px] font-semibold">Active services</h2>
                <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs" onClick={() => setSubOpen(true)}>
                  <Plus className="size-3.5" /> Add subscription
                </Button>
              </header>
              {billing.subscriptions.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">No subscriptions yet — add one to start counting MRR.</p>
              ) : (
                /* billing.subscriptions carries the full editable row
                   (paymentDay, dates) — detail.subscriptions is a slimmer
                   projection that starved the edit dialog of required
                   fields, which made Save silently no-op. */
                billing.subscriptions.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{s.serviceName}</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        Started {toDateOnlyString(s.startDate)}
                        {s.nextBillingDate ? ` · next billing ${toDateOnlyString(s.nextBillingDate)}` : ""}
                        {s.paymentDay ? ` · day ${s.paymentDay}` : ""}
                      </p>
                    </div>
                    <FinancialAmount value={s.amount} suffix={`/${s.frequency.replace("_", "-").replace("ly", "")}`} />
                    <StatusBadge status={s.status} />
                    {s.status === "active" && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => run(setSubscriptionStatus(s.id, "paused"), "Subscription paused")}>
                        Pause
                      </Button>
                    )}
                    {s.status === "paused" && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => run(setSubscriptionStatus(s.id, "active"), "Subscription resumed")}>
                        Resume
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditSub(s)}>
                      Edit
                    </Button>
                  </div>
                ))
              )}
            </section>

            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="flex items-center border-b border-border/60 px-4 py-2.5">
                <h2 className="text-[12.5px] font-semibold">Onboarding</h2>
                {detail.onboarding.length === 0 && (
                  <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs" onClick={() => run(startOnboarding(client.id), "Onboarding started")}>
                    <ClipboardList className="size-3.5" /> Start onboarding
                  </Button>
                )}
              </header>
              {detail.onboarding.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">Onboarding has not been started for this client.</p>
              ) : (
                <div className="px-4 py-3">
                  {detail.onboarding.map((step: any) => (
                    <label key={step.id} className="flex cursor-pointer items-center gap-2.5 py-1.5">
                      <Checkbox
                        checked={Boolean(step.completedAt)}
                        onCheckedChange={(v) => run(toggleOnboardingStep(step.id, v === true), v ? "Step completed" : "Step reopened")}
                      />
                      <span className={`text-[13px] ${step.completedAt ? "text-muted-foreground line-through" : ""}`}>{step.stepName}</span>
                    </label>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="portal" className="mt-4">
            <ClientPortalSection
              clientId={client.id}
              client={{ name: client.name, industry: client.industry ?? null, portalAccentColor: client.portalAccentColor ?? null }}
              access={portalAccess}
              canManage={canManagePortal}
            />
          </TabsContent>

          <TabsContent value="billing" className="mt-4 space-y-4">
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="flex items-center border-b border-border/60 px-4 py-2.5">
                <h2 className="text-[12.5px] font-semibold">Invoices</h2>
                <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs" onClick={() => setInvOpen(true)}>
                  <Plus className="size-3.5" /> New invoice
                </Button>
              </header>
              {detail.invoices.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">No invoices for this client yet.</p>
              ) : (
                detail.invoices.map((inv: any) => (
                  <div key={inv.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                    <FileText className="size-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{inv.number}</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        Issued {inv.issueDate ?? "—"} · due {inv.dueDate ?? "—"}
                      </p>
                    </div>
                    <FinancialAmount value={inv.total} />
                    <StatusBadge status={isPastDue(inv) ? "past_due" : inv.status} />
                  </div>
                ))
              )}
            </section>
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="flex items-center border-b border-border/60 px-4 py-2.5">
                <h2 className="text-[12.5px] font-semibold">Payments</h2>
                <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs" onClick={() => setPayOpen(true)}>
                  <Plus className="size-3.5" /> Record payment
                </Button>
              </header>
              {detail.payments.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">No payments recorded for this client.</p>
              ) : (
                detail.payments.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                    <DollarSign className="size-4 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{format(new Date(p.paidAt), "MMM d, yyyy")}</p>
                      <p className="text-[11.5px] text-muted-foreground">{[p.method, p.reference].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <FinancialAmount value={p.amount} className="text-emerald-700 dark:text-emerald-400" />
                    <StatusBadge status={p.status} />
                    {p.status !== "voided" ? (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditPay(p)}>
                          Edit
                        </Button>
                        <ConfirmationDialog
                          trigger={<Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">Remove</Button>}
                          title="Remove payment?"
                          description="Removes it from billing totals, reports, and goals, but keeps the record for review. It can be restored later."
                          confirmLabel="Remove payment"
                          destructive
                          onConfirm={() => run(voidPayment(p.id), "Payment removed")}
                        />
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => run(restorePayment(p.id), "Payment restored")}>
                        Restore
                      </Button>
                    )}
                  </div>
                ))
              )}
            </section>
          </TabsContent>

          <TabsContent value="tasks" className="mt-4">
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="flex items-center border-b border-border/60 px-4 py-2.5">
                <h2 className="text-[12.5px] font-semibold">Tasks</h2>
                <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs" onClick={() => setTaskOpen(true)}>
                  <Plus className="size-3.5" /> Add task
                </Button>
              </header>
              {detail.tasks.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">No tasks linked to this client.</p>
              ) : (
                detail.tasks.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                    <Checkbox
                      checked={t.status === "completed"}
                      onCheckedChange={(v) => run(setTaskCompletion(t.id, v === true), v ? "Task completed" : "Task reopened")}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-medium ${t.status === "completed" ? "text-muted-foreground line-through" : ""}`}>{t.title}</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {t.dueDate ? `Due ${format(new Date(t.dueDate), "MMM d")}` : "No due date"}
                      </p>
                    </div>
                    <StatusBadge status={t.priority} />
                  </div>
                ))
              )}
            </section>
          </TabsContent>

          <TabsContent value="notes" className="mt-4 space-y-3">
            <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
              <Textarea rows={2} placeholder="Write a note…" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
              <div className="mt-2 flex justify-end">
                <Button size="sm" className="gap-1.5" onClick={submitNote} disabled={!noteBody.trim()}>
                  <StickyNote className="size-3.5" /> Save note
                </Button>
              </div>
            </div>
            {detail.notes.map((n: any) => (
              <div key={n.id} className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
                <p className="whitespace-pre-wrap text-[13px]">{n.body}</p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{format(new Date(n.createdAt), "MMM d, yyyy · h:mm a")}</p>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <div className="rounded-lg border border-border bg-card px-4 py-4 shadow-sm">
              <ActivityTimeline items={detail.activity} />
            </div>
          </TabsContent>
        </Tabs>

        {/* contextual sidebar */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-sm">
            <h3 className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Account snapshot</h3>
            <dl className="space-y-2 text-[12.5px]">
              {[
                ["Current MRR", <FinancialAmount key="m" value={detail.mrr} suffix="/mo" />],
                ["Lifetime collected", <FinancialAmount key="l" value={detail.lifetimeCollected} />],
                [
                  "Next payment",
                  billing.nextPayment ? (
                    <span key="np" className={billing.nextPayment.late ? "font-semibold text-destructive" : ""}>
                      {formatFullDate(billing.nextPayment.dueDate)}
                      {billing.nextPayment.late ? " — overdue" : ""}
                    </span>
                  ) : (
                    <span key="np" className="text-muted-foreground">No active subscription</span>
                  ),
                ],
                ["Outstanding balance", <FinancialAmount key="o" value={outstanding} className={outstanding > 0 ? "text-destructive" : ""} />],
                ["Open tasks", <span key="t" className="tabular-nums font-semibold">{openTasks.length}</span>],
                ["Payment email", client.email ?? "—"],
                ["Phone", client.phone ?? "—"],
                ["Website", client.website ?? "—"],
                ["Address", client.address ?? "—"],
              ].map(([label, value], i) => (
                <div key={i} className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-sm">
            <h3 className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Quick actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="justify-start gap-1.5 text-xs" onClick={() => setTaskOpen(true)}><CheckSquare className="size-3.5" /> Add task</Button>
              <Button variant="outline" size="sm" className="justify-start gap-1.5 text-xs" onClick={() => setSubOpen(true)}><Plus className="size-3.5" /> Add service</Button>
              <Button variant="outline" size="sm" className="justify-start gap-1.5 text-xs" onClick={() => setInvOpen(true)}><FileText className="size-3.5" /> Create invoice</Button>
              <Button variant="outline" size="sm" className="justify-start gap-1.5 text-xs" onClick={() => setPayOpen(true)}><DollarSign className="size-3.5" /> Record payment</Button>
              <Button variant="outline" size="sm" className="justify-start gap-1.5 text-xs" onClick={() => setScheduleOpen(true)}><CalendarDays className="size-3.5" /> Schedule activity</Button>
            </div>
          </div>
        </aside>
      </div>

      {/* dialogs */}
      <ClientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        members={members.map((m: any) => ({ userId: m.userId, name: m.name }))}
        client={{
          id: client.id, name: client.name, website: client.website ?? "", email: client.email ?? "",
          phone: client.phone ?? "", industry: client.industry ?? "", address: client.address ?? "",
          status: client.status === "archived" ? "canceled" : client.status, ownerId: client.ownerId ?? "", startDate: client.startDate ?? "",
        }}
      />
      <TaskFormDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        fixedClientId={client.id}
        options={{ members: members.map((m: any) => ({ userId: m.userId, name: m.name })), clients: [], leads: [], opportunities: [] }}
      />
      <SubscriptionFormDialog open={subOpen} onOpenChange={setSubOpen} fixedClientId={client.id} clients={[{ id: client.id, name: client.name }]} services={services} />
      <EventFormDialog open={scheduleOpen} onOpenChange={setScheduleOpen} defaults={{ clientId: client.id }} clients={[{ id: client.id, name: client.name }]} members={members.map((m: any) => ({ userId: m.userId, name: m.name }))} />
      <PaymentFormDialog open={payOpen} onOpenChange={setPayOpen} fixedClientId={client.id} clients={[{ id: client.id, name: client.name }]} invoices={clientInvoiceOptions} />
      <PaymentFormDialog
        open={Boolean(editPay)}
        onOpenChange={(o) => !o && setEditPay(null)}
        fixedClientId={client.id}
        clients={[{ id: client.id, name: client.name }]}
        invoices={clientInvoiceOptions}
        payment={editPay}
      />
      <SubscriptionEditDialog open={Boolean(editSub)} onOpenChange={(o) => !o && setEditSub(null)} subscription={editSub} />
      <InvoiceFormDialog open={invOpen} onOpenChange={setInvOpen} fixedClientId={client.id} clients={[{ id: client.id, name: client.name }]} suggestedNumber={`INV-${String(1000 + billing.invoices.length + 1)}`} />

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add contact</DialogTitle></DialogHeader>
          <form onSubmit={submitContact} className="space-y-3">
            <div className="space-y-1"><Label>Name *</Label><Input name="name" required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Title</Label><Input name="title" /></div>
              <div className="space-y-1"><Label>Phone</Label><Input name="phone" /></div>
            </div>
            <div className="space-y-1"><Label>Email</Label><Input name="email" type="email" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPrimary" className="accent-primary" /> Primary contact</label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContactOpen(false)}>Cancel</Button>
              <Button type="submit">Add contact</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
