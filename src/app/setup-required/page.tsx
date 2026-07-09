import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Controlled landing page for a deployment whose database is unreachable or
 * not yet migrated. Static — renders without touching the database.
 */
export default function SetupRequiredPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Almost there — the database isn’t ready yet</CardTitle>
          <CardDescription>
            You signed in successfully, but this deployment can’t reach its application database
            (or the schema hasn’t been created yet). No data was lost.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">If you are the administrator:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Verify <code className="rounded bg-muted px-1">DATABASE_URL</code> and{" "}
              <code className="rounded bg-muted px-1">DATABASE_URL_DIRECT</code> are set to the
              Supabase connection strings — in Vercel (Project → Settings → Environment Variables)
              and locally in <code className="rounded bg-muted px-1">.env.local</code>.
            </li>
            <li>
              Apply the schema: <code className="rounded bg-muted px-1">npm run db:migrate</code>
            </li>
            <li>
              Bootstrap the first admin:{" "}
              <code className="rounded bg-muted px-1">ADMIN_PASSWORD=… npm run admin:create</code>
            </li>
          </ol>
          <p>Details are in the project README. Server logs contain the exact database error.</p>
          <Button asChild size="sm" className="mt-2">
            <Link href="/dashboard">Try again</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
