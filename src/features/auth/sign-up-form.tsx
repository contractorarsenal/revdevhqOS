"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

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
    if (!data.session) {
      // Email confirmation is enabled on the Supabase project.
      setConfirmSent(true);
      return;
    }
    router.push("/setup");
    router.refresh();
  }

  if (confirmSent) {
    return (
      <p className="rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground">
        Check your email to confirm your account, then come back and sign in.
      </p>
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
