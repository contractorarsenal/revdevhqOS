import Link from "next/link";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500";

/** Minimal header for the public entry page — this is an internal
 * application, not a marketing site, so there is nothing to navigate to
 * beyond signing in. */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0A0A0C]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <a href="#top" className={`flex items-center gap-2.5 rounded-sm ${focusRing}`} aria-label="CA Command Center — back to top">
          <span aria-hidden className="block size-2.5 bg-red-600" />
          <span className="text-[15px] font-semibold tracking-tight text-white">CA Command Center</span>
        </a>

        <Link
          href="/sign-in"
          className={`ml-auto inline-flex h-9 items-center rounded-sm border border-white/15 px-4 text-sm font-medium text-white transition-colors hover:border-white/40 hover:bg-white/5 ${focusRing}`}
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}
