export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">r</div>
          <span className="text-lg font-semibold tracking-tight">
            revdevhq<span className="text-muted-foreground">OS</span>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
