"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: String(form.get("email")),
      password: String(form.get("password")),
      options: {
        data: { name: String(form.get("name")) },
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/setup`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message || "Could not create the account.");
      return;
    }
    if (data.session) {
      // Email confirmation is disabled on the Supabase project — user is signed in.
      toast.success("Account created — you're signed in.");
      router.push("/setup");
      router.refresh();
      return;
    }
    // Supabase returned no session: this project currently requires email confirmation.
    setNeedsConfirmation(true);
  }

  if (needsConfirmation) {
    return (
      <div className="space-y-3">
        <p className="rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          Account created. This workspace currently requires email confirmation — we sent you a
          link. Open it, then sign in. (Workspace admins can turn this off in Supabase:
          Authentication → Providers → Email → “Confirm email”.)
        </p>
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href="/sign-in">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" name="name" required placeholder="Jay Rivera" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@agency.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required autoComplete="new-password" minLength={8} placeholder="At least 8 characters" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
