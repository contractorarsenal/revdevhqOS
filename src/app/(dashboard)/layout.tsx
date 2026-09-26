import { requireWorkspace } from "@/lib/auth/session";
import { countPendingApprovals } from "@/server/queries/approvals";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace();
  const pendingApprovals = await countPendingApprovals(ctx.workspace.id);
  return (
    <div className="flex h-screen overflow-hidden bg-background lg:gap-3 lg:p-3">
      <AppSidebar
        workspaceName={ctx.workspace.name}
        userName={ctx.user.name}
        userEmail={ctx.user.email}
        role={ctx.role}
        pendingApprovals={pendingApprovals}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar workspaceName={ctx.workspace.name} userName={ctx.user.name} role={ctx.role} />
        {/* Bottom padding reserves space for MobileBottomNav (h-16 + safe
            area) below md so content never renders underneath the fixed
            tab bar; md and up drop back to the normal padding. */}
        <main className="mx-auto flex w-full min-h-0 max-w-[1560px] flex-1 flex-col overflow-y-auto px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-2 sm:px-6 md:pb-6 lg:pl-5 lg:pr-4">
          {children}
        </main>
      </div>
      <MobileBottomNav pendingApprovals={pendingApprovals} />
    </div>
  );
}
