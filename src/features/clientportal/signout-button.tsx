"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function PortalSignOutButton() {
  const router = useRouter();
  return (
    <Button variant="outline" size="sm" onClick={async () => { await createClient().auth.signOut(); router.push("/clientportal/signin"); router.refresh(); }}>
      Sign out
    </Button>
  );
}
