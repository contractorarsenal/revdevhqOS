import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/features/landing/landing-nav";
import { env } from "@/lib/env/server";

export const metadata: Metadata = {
  title: "CA Command Center",
  description: "Contractor Arsenal's internal operations system — leads, clients, projects, tasks, and billing in one place.",
  alternates: { canonical: env.NEXT_PUBLIC_APP_URL },
  openGraph: {
    title: "CA Command Center",
    description: "Contractor Arsenal's internal operations system.",
    url: env.NEXT_PUBLIC_APP_URL,
    siteName: "CA Command Center",
    type: "website",
  },
  robots: { index: false, follow: false },
};

const SYSTEM_AREAS = ["Leads", "Clients", "Projects", "Tasks", "Billing"];

/** Abstract system diagram — inputs flowing through one hub to outputs. */
function SystemDiagram() {
  return (
    <svg
      viewBox="0 0 520 360"
      aria-hidden="true"
      className="h-auto w-full max-w-[520px]"
      fill="none"
    >
      {/* inputs */}
      {[48, 154, 260].map((y) => (
        <rect key={y} x="20" y={y} width="132" height="52" rx="3" className="fill-white/[0.02] stroke-white/15" />
      ))}
      {/* abstract content lines inside inputs */}
      {[48, 154, 260].map((y) => (
        <g key={`c${y}`} className="stroke-white/15">
          <path d={`M36 ${y + 20} H104`} />
          <path d={`M36 ${y + 33} H84`} />
        </g>
      ))}
      {/* hub */}
      <rect x="220" y="116" width="150" height="128" rx="3" className="fill-red-600/5 stroke-red-600/70" strokeWidth="1.25" />
      <g className="stroke-white/20">
        <path d="M240 148 H350" />
        <path d="M240 172 H326" />
        <path d="M240 196 H338" />
        <path d="M240 220 H302" />
      </g>
      {/* connections in */}
      <g className="stroke-white/15">
        <path d="M152 74 H186 V148 H220" />
        <path d="M152 180 H220" />
        <path d="M152 286 H186 V212 H220" />
      </g>
      {/* connections out */}
      <path d="M370 152 H396 V124 H420" className="stroke-white/15" />
      <path d="M370 208 H396 V236 H420" strokeDasharray="4 4" className="stroke-white/15" />
      {/* outputs */}
      <rect x="420" y="92" width="80" height="64" rx="3" className="fill-white/[0.02] stroke-white/15" />
      <rect x="420" y="204" width="80" height="64" rx="3" className="fill-white/[0.02] stroke-white/15" />
      {/* joints */}
      {[
        [186, 74],
        [186, 286],
        [396, 124],
        [396, 236],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" className="fill-[#0A0A0C] stroke-white/30" />
      ))}
      <circle cx="186" cy="180" r="3.5" className="fill-red-600 motion-safe:animate-pulse" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div id="top" className="min-h-screen bg-[#0A0A0C] text-white">
      <LandingNav />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_75%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[420px] [background-image:radial-gradient(ellipse_at_top,rgba(220,38,38,0.10),transparent_65%)]"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-500">
                Contractor Arsenal
              </p>
              <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                CA Command Center
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
                The system Contractor Arsenal runs the business on — leads, clients, projects,
                tasks, and billing, all in one place.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/sign-in"
                  className="inline-flex h-11 items-center justify-center rounded-sm bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                >
                  Sign in
                </Link>
              </div>
            </div>
            <div className="mx-auto w-full max-w-[520px] lg:mx-0">
              <SystemDiagram />
            </div>
          </div>
        </section>

        {/* One system */}
        <section className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-16 text-center sm:px-8 sm:py-20">
            <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              One system for the whole operation.
            </h2>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-y-3">
              {SYSTEM_AREAS.map((area, i) => (
                <span key={area} className="flex items-center">
                  {i > 0 && <span aria-hidden className="hidden h-px w-6 bg-white/15 sm:block" />}
                  <span className="mx-1.5 border border-white/15 bg-white/[0.02] px-4 py-2 text-sm text-zinc-200 sm:mx-0">
                    {area}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
          <p className="flex items-center gap-2.5">
            <span aria-hidden className="block size-2.5 bg-red-600" />
            <span className="text-[15px] font-semibold tracking-tight">CA Command Center</span>
            <span className="text-sm text-zinc-500">— Contractor Arsenal</span>
          </p>
          <p className="text-sm text-zinc-600">© {new Date().getFullYear()} Contractor Arsenal</p>
        </div>
      </footer>
    </div>
  );
}
