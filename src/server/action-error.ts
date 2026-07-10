import { ZodError } from "zod";

/**
 * No "server-only" import here (unlike authorize.ts) — this is pure logic,
 * kept in its own module so it can be unit-tested directly in vitest.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export function actionError(error: unknown): { ok: false; error: string } {
  // ZodError#message is a JSON-stringified issue dump (zod v4) — never fit
  // for a toast. Surface the first field's own message instead.
  if (error instanceof ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Please check the form and try again." };
  }
  const message = error instanceof Error ? error.message : "Something went wrong. Try again.";
  return { ok: false, error: message };
}
