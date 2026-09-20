import { PROJECT_STATUSES } from "@/lib/validation";

export const PROJECT_STATUS_LABEL: Record<(typeof PROJECT_STATUSES)[number], string> = {
  onboarding: "Onboarding",
  waiting_on_client: "Waiting on client",
  ready_to_build: "Ready to build",
  building: "Building",
  client_review: "Client review",
  revisions: "Revisions",
  ready_to_launch: "Ready to launch",
  live: "Live",
  paused: "Paused",
  at_risk: "At risk",
  closed: "Closed",
};
