"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { previewBulkPayments, submitBulkPayments, type BulkRowEvaluation, type BulkSaveResult } from "@/server/actions/bulk-payments";
import { formatMoney, invoiceBalance } from "@/lib/finance/metrics";
import { sumRows } from "@/lib/bulk-payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ClientOpt = { id: string; name: string };
type SubOpt = { id: string; clientId: string; serviceName: string; amount: string; frequency: string; status: string };
type InvOpt = { id: string; clientId: string; number: string; status: string; total: string; amountPaid: string };

type Row = {
  rowId: string; clientId: string; clientQuery: string; applies: string; amount: string;
  paidAt: string; method: string; reference: string; note: string; billingMonth: string;
};

const METHODS = ["Zelle", "ACH", "Check", "Cash", "Card", "Venmo", "Wire"];
let counter = 0;
const newRow = (today: string): Row => ({
  rowId: `r${Date.now().toString(36)}${counter++}`, clientId: "", clientQuery: "", applies: "", amount: "",
  paidAt: today, method: "", reference: "", note: "", billingMonth: today.slice(0, 7),
});

function ClientPicker({ clients, value, query, onChange }: {
  clients: ClientOpt[]; value: string; query: string; onChange: (id: string, query: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, query]);
  return (
    <div className="relative">
      <Input
        value={query} placeholder="Search client…" aria-label="Client" role="combobox" aria-expanded={open} aria-autocomplete="list"
        className={cn("h-8 text-xs", !value && query && "border-destructive/60")}
        onChange={(e) => { onChange("", e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && matches[active]) { e.preventDefault(); onChange(matches[active].id, matches[active].name); setOpen(false); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && matches.length > 0 && !value && (
        <ul role="listbox" className="absolute z-50 mt-1 max-h-48 w-full min-w-48 overflow-auto rounded-md border border-border bg-popover p-1 text-xs shadow-md">
          {matches.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); onChange(c.id, c.name); setOpen(false); }}
              className={cn("cursor-pointer truncate rounded-sm px-2 py-1.5", i === active && "bg-accent")}>
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BulkPaymentsDialog({
  open, onOpenChange, clients, subscriptions, invoices, today,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  clients: ClientOpt[]; subscriptions: SubOpt[]; invoices: InvOpt[]; today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<"edit" | "review" | "done">("edit");
  const [rows, setRows] = useState<Row[]>(() => [newRow(today), newRow(today), newRow(today)]);
  const [evals, setEvals] = useState<Record<string, BulkRowEvaluation>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, BulkSaveResult>>({});
  const [summary, setSummary] = useState<{ count: number; total: number } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const nextFocus = useRef<HTMLButtonElement>(null);

  const patch = (rowId: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.rowId === rowId ? { ...r, ...p } : r)));

  function optionsFor(clientId: string) {
    return {
      subs: subscriptions.filter((s) => s.clientId === clientId && s.status !== "canceled"),
      invs: invoices.filter((i) => i.clientId === clientId && (i.status === "open" || i.status === "past_due")),
    };
  }

  function onApplies(r: Row, value: string) {
    const p: Partial<Row> = { applies: value };
    if (!r.amount) {
      if (value.startsWith("sub:")) p.amount = subscriptions.find((s) => s.id === value.slice(4))?.amount ?? "";
      if (value.startsWith("inv:")) {
        const inv = invoices.find((i) => i.id === value.slice(4));
        if (inv) p.amount = String(invoiceBalance(inv));
      }
    }
    patch(r.rowId, p);
  }

  function toPayload(r: Row) {
    return {
      rowId: r.rowId, clientId: r.clientId,
      subscriptionId: r.applies.startsWith("sub:") ? r.applies.slice(4) : "",
      invoiceId: r.applies.startsWith("inv:") ? r.applies.slice(4) : "",
      amount: r.amount, paidAt: r.paidAt, method: r.method, reference: r.reference, note: r.note,
      billingMonth: r.applies.startsWith("sub:") ? r.billingMonth || null : null,
    };
  }

  // A row is "blank" if nothing was entered at all — silently ignored.
  const filled = rows.filter((r) => r.clientId || r.clientQuery || r.amount || r.applies || r.reference || r.note);
  const validAmount = (r: Row) => Number(r.amount) > 0;
  const total = sumRows(filled.filter(validAmount).map((r) => ({ amount: Number(r.amount) })));

  function review() {
    setFormError(null);
    if (filled.length === 0) return setFormError("Add at least one payment.");
    const bad = filled.find((r) => !r.clientId || !validAmount(r) || !r.paidAt);
    if (bad) return setFormError("Every row needs a client from the list, an amount greater than zero, and a date.");
    startTransition(async () => {
      const res = await previewBulkPayments({ rows: filled.map(toPayload) });
      if (!res.ok || !res.data) { setFormError(res.ok ? "Could not review this batch." : res.error); return; }
      setEvals(Object.fromEntries(res.data.rows.map((e) => [e.rowId, e])));
      setConfirmed(new Set());
      setStep("review");
    });
  }

  const savable = filled.filter((r) => {
    const e = evals[r.rowId];
    return e && !e.blocked && (!e.needsConfirm || confirmed.has(r.rowId));
  });
  const savableTotal = sumRows(savable.map((r) => ({ amount: Number(r.amount) })));

  function save() {
    startTransition(async () => {
      const res = await submitBulkPayments({ rows: filled.map(toPayload), confirmedDuplicateRowIds: [...confirmed] });
      if (!res.ok || !res.data) { toast.error(res.ok ? "Could not save." : res.error); return; }
      const map = Object.fromEntries(res.data.results.map((x) => [x.rowId, x]));
      setResults(map);
      setSummary({ count: res.data.savedCount, total: res.data.savedTotal });
      setStep("done");
      router.refresh();
      if (res.data.savedCount > 0) toast.success(`${res.data.savedCount} payment${res.data.savedCount === 1 ? "" : "s"} recorded`);
    });
  }

  function reset(keepFailed: boolean) {
    setRows((rs) => {
      const keep = keepFailed ? rs.filter((r) => results[r.rowId] && !results[r.rowId].ok) : [];
      return keep.length ? keep : [newRow(today), newRow(today), newRow(today)];
    });
    setEvals({}); setConfirmed(new Set()); setResults({}); setSummary(null); setFormError(null); setStep("edit");
  }

  const failed = filled.filter((r) => results[r.rowId] && !results[r.rowId].ok);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o && step === "done") reset(false); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Bulk add payments</DialogTitle>
          <DialogDescription>
            {step === "edit" && "Enter several payments at once. Each one goes through the same billing rules as a single payment."}
            {step === "review" && "Review before saving. Nothing has been recorded yet."}
            {step === "done" && "Batch finished."}
          </DialogDescription>
        </DialogHeader>

        {step === "edit" && (
          <div className="space-y-3">
            <datalist id="bulk-methods">{METHODS.map((m) => <option key={m} value={m} />)}</datalist>
            <div className="hidden grid-cols-12 gap-2 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
              <span className="col-span-3">Client</span><span className="col-span-3">Applies to</span><span className="col-span-1">Amount</span>
              <span className="col-span-2">Date</span><span className="col-span-1">Method</span><span className="col-span-2">Reference</span>
            </div>
            {rows.map((r, idx) => {
              const { subs, invs } = optionsFor(r.clientId);
              return (
                <div key={r.rowId} className="grid grid-cols-2 gap-2 rounded-md border border-border p-2 md:grid-cols-12 md:border-0 md:p-0">
                  <div className="col-span-2 md:col-span-3"><ClientPicker clients={clients} value={r.clientId} query={r.clientQuery} onChange={(id, q) => patch(r.rowId, { clientId: id, clientQuery: q, applies: "" })} /></div>
                  <select value={r.applies} onChange={(e) => onApplies(r, e.target.value)} disabled={!r.clientId} aria-label="Applies to"
                    className="col-span-2 h-8 rounded-md border border-input bg-transparent px-2 text-xs md:col-span-3">
                    <option value="">Unallocated payment</option>
                    {subs.map((s) => <option key={s.id} value={`sub:${s.id}`}>{s.serviceName} — {formatMoney(s.amount)}/{s.frequency === "monthly" ? "mo" : s.frequency}</option>)}
                    {invs.map((i) => <option key={i.id} value={`inv:${i.id}`}>Invoice {i.number} — {formatMoney(invoiceBalance(i))} due</option>)}
                  </select>
                  <Input value={r.amount} onChange={(e) => patch(r.rowId, { amount: e.target.value })} inputMode="decimal" placeholder="0.00" aria-label="Amount" className="col-span-1 h-8 text-xs md:col-span-1" />
                  <Input type="date" value={r.paidAt} onChange={(e) => patch(r.rowId, { paidAt: e.target.value, billingMonth: e.target.value.slice(0, 7) })} aria-label="Payment date" className="col-span-1 h-8 text-xs md:col-span-2" />
                  <Input value={r.method} onChange={(e) => patch(r.rowId, { method: e.target.value })} list="bulk-methods" placeholder="Method" aria-label="Method" className="col-span-1 h-8 text-xs" />
                  <Input value={r.reference} onChange={(e) => patch(r.rowId, { reference: e.target.value })} placeholder="Reference / txn ID" aria-label="Reference" className="col-span-1 h-8 text-xs md:col-span-2" />
                  <div className="col-span-2 flex items-center gap-2 md:col-span-12">
                    <Input value={r.note} onChange={(e) => patch(r.rowId, { note: e.target.value })} placeholder="Note (optional)" aria-label="Note" className="h-8 flex-1 text-xs" />
                    {r.applies.startsWith("sub:") && (
                      <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">Month
                        <Input type="month" value={r.billingMonth} onChange={(e) => patch(r.rowId, { billingMonth: e.target.value })} className="h-8 w-36 text-xs" />
                      </label>
                    )}
                    <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" aria-label={`Remove row ${idx + 1}`}
                      onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.rowId !== r.rowId) : rs))}><Trash2 className="size-3.5" /></Button>
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" ref={nextFocus} onClick={() => setRows((rs) => [...rs, newRow(today)])} disabled={rows.length >= 50}><Plus className="size-3.5" /> Add row</Button>
              <p className="ml-auto text-[12.5px] text-muted-foreground">{filled.length} payment{filled.length === 1 ? "" : "s"} · batch total <span className="tabular-nums font-semibold text-foreground">{formatMoney(total)}</span></p>
              <Button type="button" size="sm" onClick={review} disabled={pending}>{pending ? "Checking…" : "Review payments"}</Button>
            </div>
            {formError && <p role="alert" className="text-xs text-destructive">{formError}</p>}
          </div>
        )}

        {step === "review" && (
          <div className="space-y-3">
            <ul className="divide-y divide-border rounded-md border border-border">
              {filled.map((r) => {
                const e = evals[r.rowId];
                if (!e) return null;
                return (
                  <li key={r.rowId} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                    {e.blocked ? <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Blocked" /> : e.needsConfirm ? <XCircle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-label="Needs confirmation" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-label="Ready" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold">{e.clientName ?? "Unknown client"} <span className="font-normal text-muted-foreground">· {e.appliesTo}</span></p>
                      <p className="text-[11.5px] text-muted-foreground">{r.paidAt}{r.method ? ` · ${r.method}` : ""}{r.reference ? ` · ${r.reference}` : ""}</p>
                      {e.messages.map((m) => <p key={m} className={cn("text-[11.5px]", e.blocked ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>{m}</p>)}
                      {e.needsConfirm && !e.blocked && (
                        <label className="mt-1 flex items-center gap-2 text-[12px]">
                          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={confirmed.has(r.rowId)}
                            onChange={(ev) => setConfirmed((c) => { const n = new Set(c); if (ev.target.checked) n.add(r.rowId); else n.delete(r.rowId); return n; })} />
                          Record this payment anyway
                        </label>
                      )}
                    </div>
                    <span className="tabular-nums text-[13px] font-semibold">{formatMoney(r.amount)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setStep("edit")}>Back to edit</Button>
              <p className="ml-auto text-[12.5px] text-muted-foreground">{savable.length} of {filled.length} will be saved · <span className="tabular-nums font-semibold text-foreground">{formatMoney(savableTotal)}</span></p>
              <Button type="button" size="sm" onClick={save} disabled={pending || savable.length === 0}>{pending ? "Saving…" : `Save ${savable.length} payment${savable.length === 1 ? "" : "s"}`}</Button>
            </div>
          </div>
        )}

        {step === "done" && summary && (
          <div className="space-y-3">
            <p className="text-[13px]"><span className="font-semibold">{summary.count}</span> payment{summary.count === 1 ? "" : "s"} recorded · <span className="tabular-nums font-semibold">{formatMoney(summary.total)}</span></p>
            {failed.length > 0 && (
              <div className="rounded-md border border-destructive/40 p-3">
                <p className="text-[12.5px] font-semibold text-destructive">{failed.length} row{failed.length === 1 ? "" : "s"} were not saved</p>
                <ul className="mt-1 space-y-1">
                  {failed.map((r) => <li key={r.rowId} className="text-[12px]">{evals[r.rowId]?.clientName ?? r.clientQuery}: <span className="text-muted-foreground">{results[r.rowId]?.error}</span></li>)}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              {failed.length > 0 && <Button size="sm" variant="outline" onClick={() => reset(true)}>Fix failed rows</Button>}
              <Button size="sm" variant="outline" onClick={() => reset(false)}>Add another batch</Button>
              <Button size="sm" className="ml-auto" onClick={() => { onOpenChange(false); reset(false); }}>Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
