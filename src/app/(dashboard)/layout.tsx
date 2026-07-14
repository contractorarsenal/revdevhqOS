import { requireWorkspace } from "@/lib/auth/session";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace();
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        workspaceName={ctx.workspace.name}
        userName={ctx.user.name}
        userEmail={ctx.user.email}
        role={ctx.role}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar workspaceName={ctx.workspace.name} userName={ctx.user.name} role={ctx.role} />
        {/* Bottom padding reserves space for MobileBottomNav (h-16 + safe
            area) below md so content never renders underneath the fixed
            tab bar; md and up drop back to the normal padding. */}
        <main className="mx-auto flex w-full min-h-0 max-w-[1480px] flex-1 flex-col overflow-y-auto px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:pb-5">
          {children}
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
