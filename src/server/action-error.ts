import { ZodError } from "zod";
import { DrizzleQueryError } from "drizzle-orm";

/**
 * No "server-only" import here (unlike authorize.ts) — this is pure logic,
 * kept in its own module so it can be unit-tested directly in vitest.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Postgres SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = "23505";

export function actionError(error: unknown): { ok: false; error: string } {
  // ZodError#message is a JSON-stringified issue dump (zod v4) — never fit
  // for a toast. Surface the first field's own message instead.
  if (error instanceof ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Please check the form and try again." };
  }
  // A DrizzleQueryError's own .message is literally "Failed query: <full
  // SQL>\nparams: <values>" — never something a user should see. Log the
  // real query/cause server-side (where it's actually useful for
  // debugging) and translate only the one shape common enough to explain
  // safely; everything else becomes a generic, honest retry message. Every
  // *intentional* `throw new Error("...")` elsewhere in the app is a plain
  // Error, not this class, so none of those messages are affected.
  if (error instanceof DrizzleQueryError) {
    console.error("[db error]", error.message, error.cause);
    const code = (error.cause as { code?: string } | undefined)?.code;
    if (code === UNIQUE_VIOLATION) {
      return { ok: false, error: "That already exists — check for a duplicate and try again." };
    }
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }
  const message = error instanceof Error ? error.message : "Something went wrong. Try again.";
  return { ok: false, error: message };
}
