"use client";

import { Button } from "@/components/ui/button";

/** Global error boundary — controlled fallback instead of a raw server crash page. */
export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-base font-semibold">Something went wrong</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The server hit an unexpected error. It has been logged
          {error.digest ? ` (reference ${error.digest})` : ""}. Try again — if it keeps happening,
          check the deployment logs.
        </p>
        <Button size="sm" className="mt-4" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
