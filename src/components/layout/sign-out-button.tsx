"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground"
      title="Sign out"
      onClick={async () => {
        await createClient().auth.signOut();
        router.push("/sign-in");
        router.refresh();
      }}
    >
      <LogOut className="size-3.5" />
    </Button>
  );
}
