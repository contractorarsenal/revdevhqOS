import { requireWorkspace } from "@/lib/auth/session";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace();
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar
        workspaceName={ctx.workspace.name}
        userName={ctx.user.name}
        userEmail={ctx.user.email}
        role={ctx.role}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar workspaceName={ctx.workspace.name} userName={ctx.user.name} />
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-6 py-5">{children}</main>
      </div>
    </div>
  );
}
