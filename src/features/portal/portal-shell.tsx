import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { PortalMobileNav } from "@/features/portal/portal-mobile-nav";

/**
 * The client portal's own chrome — deliberately separate from the internal
 * sidebar. Presentational and server-renderable so the internal
 * portal-preview route can reuse it without creating a session or
 * membership. The accent appears only in small details (top line, avatar,
 * highlights) — never as a full recolor.
 */
export function PortalShell({
  businessName, accent, userName, children, showSignOut = true, showNav = true,
}: {
  businessName: string;
  accent: string;
  userName?: string;
  children: React.ReactNode;
  showSignOut?: boolean;
  /** false inside the internal portal-preview route, which already renders
   * the internal MobileBottomNav — two fixed bottom bars would stack. */
  showNav?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div aria-hidden className="h-1 w-full" style={{ backgroundColor: accent }} />
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            {businessName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight">{businessName}</p>
            <p className="truncate text-[10.5px] leading-tight text-muted-foreground">
              Contractor Arsenal Command Center
            </p>
          </div>
          {userName && <span className="hidden max-w-[160px] truncate text-[12px] text-muted-foreground sm:block">{userName}</span>}
          {showSignOut && <SignOutButton />}
        </div>
      </header>
      <main
        className={cn(
          "mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8",
          showNav && "pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-8"
        )}
      >
        {children}
      </main>
      {showNav && <PortalMobileNav accent={accent} />}
    </div>
  );
}
