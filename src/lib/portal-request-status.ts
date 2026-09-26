/** Client-facing wording for internal request states. */
export const PORTAL_REQUEST_STATUS: Record<string, { label: string; waitingOnYou: boolean; done: boolean }> = {
  new: { label: "Received", waitingOnYou: false, done: false },
  triaged: { label: "Reviewed", waitingOnYou: false, done: false },
  in_progress: { label: "In progress", waitingOnYou: false, done: false },
  waiting: { label: "Waiting on you", waitingOnYou: true, done: false },
  complete: { label: "Complete", waitingOnYou: false, done: true },
  client_notified: { label: "Complete", waitingOnYou: false, done: true },
};
