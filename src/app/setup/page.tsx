import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { workspaceMembers } from "@/lib/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceForm } from "@/features/auth/workspace-form";

export default async function SetupPage() {
  const user = await requireUser();
  const memberships = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, user.id))
    .limit(1);
  if (memberships.length > 0) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your workspace</CardTitle>
          <CardDescription>
            One workspace per agency. You will be its owner, and default pipeline stages and an
            onboarding template are created for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceForm />
        </CardContent>
      </Card>
    </div>
  );
}
