"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PortalSignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setLoading(false);
    if (error) return setError("That email and password don't match. Check them and try again.");
    router.push("/clientportal/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor="cp-email">Email</Label><Input id="cp-email" name="email" type="email" required autoComplete="email" /></div>
      <div className="space-y-1.5"><Label htmlFor="cp-password">Password</Label><Input id="cp-password" name="password" type="password" required autoComplete="current-password" /></div>
      {error && <p role="alert" className="text-[12.5px] text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
