"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { convertOpportunityToClient } from "@/server/actions/pipeline";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type ServiceOption = { id: string; name: string; defaultPrice: string | null; defaultFrequency: string };
type Selection = { serviceId: string; amount: string; frequency: string; enabled: boolean };
type Opportunity = { id: string; name: string; contactName: string | null };

function ConvertForm({
  opportunity, services, onClose,
}: { opportunity: Opportunity; services: ServiceOption[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState(opportunity.name);
  const [contactName, setContactName] = useState(opportunity.contactName ?? "");
  const [contactEmail, setContactEmail] = useState("");
  const [selections, setSelections] = useState<Selection[]>(() =>
    services.map((s) => ({
      serviceId: s.id,
      amount: s.defaultPrice ?? "0",
      frequency: s.defaultFrequency,
      enabled: false,
    }))
  );

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await convertOpportunityToClient({
        opportunityId: opportunity.id,
        clientName,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        subscriptions: selections
          .filter((s) => s.enabled)
          .map((s) => ({ serviceId: s.serviceId, amount: Number(s.amount) || 0, frequency: s.frequency })),
      });
      if (!result.ok) return setError(result.error);
      toast.success("Deal won — client created");
      onClose();
      if (result.data) router.push(`/clients/${result.data.clientId}`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Client name *</Label>
          <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Primary contact</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Contact email</Label>
            <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Subscriptions to create</Label>
          {services.length === 0 ? (
            <p className="text-xs text-muted-foreground">No services defined yet — you can add subscriptions later from the client page.</p>
          ) : (
            <div className="space-y-1.5 rounded-md border border-border p-2.5">
              {selections.map((sel, i) => {
                const svc = services.find((s) => s.id === sel.serviceId)!;
                return (
                  <div key={sel.serviceId} className="flex items-center gap-2.5">
                    <Checkbox
                      checked={sel.enabled}
                      onCheckedChange={(v) =>
                        setSelections((prev) => prev.map((p, pi) => (pi === i ? { ...p, enabled: v === true } : p)))
                      }
                    />
                    <span className="flex-1 text-[13px]">{svc.name}</span>
                    <Input
                      className="h-8 w-24 text-xs"
                      type="number" step="0.01" min="0"
                      value={sel.amount}
                      disabled={!sel.enabled}
                      onChange={(e) => setSelections((prev) => prev.map((p, pi) => (pi === i ? { ...p, amount: e.target.value } : p)))}
                    />
                    <select
                      className="h-8 rounded-md border border-input bg-transparent px-1.5 text-xs"
                      value={sel.frequency}
                      disabled={!sel.enabled}
                      onChange={(e) => setSelections((prev) => prev.map((p, pi) => (pi === i ? { ...p, frequency: e.target.value } : p)))}
                    >
                      {["one_time", "weekly", "monthly", "quarterly", "yearly"].map((f) => (
                        <option key={f} value={f}>{f.replace("_", "-")}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={pending || !clientName.trim()}>
          {pending ? "Converting…" : "Mark won & create client"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ConvertDialog({
  open, onOpenChange, opportunity, services,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity | null;
  services: ServiceOption[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Convert to client</DialogTitle>
          <DialogDescription>
            Marks the deal won, creates the client with selected subscriptions, and opens an onboarding task — in one transaction.
          </DialogDescription>
        </DialogHeader>
        {opportunity && (
          <ConvertForm key={opportunity.id} opportunity={opportunity} services={services} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
