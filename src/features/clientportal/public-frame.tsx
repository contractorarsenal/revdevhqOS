import { ThemeToggle } from "@/components/theme-toggle";

/** Centered frame for the portal's public pages (sign-in, invite, access paused). */
export function PortalPublicFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <span aria-hidden className="block size-2.5 bg-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Contractor Arsenal</span>
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="rounded-md border border-border bg-card p-5">{children}</div>
      </div>
    </div>
  );
}
