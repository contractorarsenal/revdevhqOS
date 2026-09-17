# Future ideas — not being built yet

Deliberately deferred during the CA Command Center recovery/rebuild. Nothing
here should be started without an explicit go-ahead.

## Deferred UX from shipped slices

- **Client Requests tab on the client detail page.** `/client-requests` and
  `/portal/requests` are the only surfaces today. Revisit if usage shows staff
  actually need request context inline while looking at a client record.
- **Internal (staff-side) editing of an individual client lead's status,
  assignment, or notes.** Post-split (Slice 6), staff can view a client's
  leads (`/clients/[id]/leads`) and manually log one, but changing an
  existing lead's status/assignee/notes is portal-only (`client_member`+).
  Building internal parity means adding `authorize()`-gated mirrors of
  `updateClientLeadStatus` / `assignClientLead` / `updateClientLeadEstimate` /
  `updateClientLeadClosedValue` / `addClientLeadNote` — real work, not a
  repoint, so it waited rather than expanding Slice 6's scope.
- **Richer project stage sub-states.** Slice 4 introduced BUILDING →
  CLIENT_REVIEW → REVISIONS → READY_TO_LAUNCH, but nothing currently derives
  those automatically (e.g. from task completion) — they're manual for now.

## Explicitly out of scope per the Phase 2 plan

Do not build any of these without a separate, explicit request:

- Grok bots / AI executives / AI assistant features
- Gmail ingestion
- Slack integration
- QuickBooks integration
- Whop integration
- SMS
- Automated follow-ups
- Fake/simulated notifications or analytics
- Infrastructure monitoring
