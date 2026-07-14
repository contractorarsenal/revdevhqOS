import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav, START_PROJECT_MAILTO } from "@/features/landing/landing-nav";

export const metadata: Metadata = {
  title: "RevDevHQ | Custom Software for Business",
  description:
    "Custom web applications, internal tools, automations, integrations, and AI workflows built around the way your business works.",
  alternates: { canonical: "https://revdevhq.com" },
  openGraph: {
    title: "RevDevHQ | Custom Software for Business",
    description:
      "Custom web applications, internal tools, automations, integrations, and AI workflows built around the way your business works.",
    url: "https://revdevhq.com",
    siteName: "RevDevHQ",
    type: "website",
  },
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500";

const buttonPrimary = `inline-flex h-11 items-center justify-center rounded-sm bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-500 ${focusRing}`;
const buttonSecondary = `inline-flex h-11 items-center justify-center rounded-sm border border-white/15 px-6 text-sm font-medium text-white transition-colors hover:border-white/40 hover:bg-white/5 ${focusRing}`;

const SERVICES = [
  {
    title: "Custom Business Software",
    body: "Web applications designed around your team, processes, and customers.",
  },
  {
    title: "Internal Tools and Portals",
    body: "Dashboards, CRMs, admin systems, client portals, and operational tools.",
  },
  {
    title: "Automation and Integrations",
    body: "Connect the tools you already use and remove repetitive manual work.",
  },
  {
    title: "AI Workflows",
    body: "Practical AI systems that help teams process information, complete tasks, and make decisions faster.",
  },
];

const STEPS = [
  { n: "01", title: "Understand", body: "We map your workflow, pain points, and business requirements." },
  { n: "02", title: "Design", body: "We define the right system, user experience, and technical approach." },
  { n: "03", title: "Build", body: "We develop, test, and refine the software around real business use." },
  { n: "04", title: "Launch", body: "We deploy the system, help your team adopt it, and continue improving it." },
];

const OUTCOMES = [
  "Replace spreadsheets and disconnected tools",
  "Automate repetitive work",
  "Bring your operations into one system",
];

const SYSTEM_AREAS = ["Leads", "Customers", "Projects", "Tasks", "Billing", "Automations"];

const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "RevDevHQ",
  url: "https://revdevhq.com",
  email: "jay@revdevhq.com",
  description:
    "Custom web applications, internal tools, automations, integrations, and AI workflows built around the way your business works.",
};

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }} />
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
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-20 sm:px-8 sm:pb-28 sm:pt-28 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-500">
                Custom software for modern businesses
              </p>
              <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Software built around the way your business works.
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
                We design and develop custom web applications, internal tools, automations, and AI
                workflows that replace manual work and help businesses move faster.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a href={START_PROJECT_MAILTO} className={buttonPrimary}>
                  Start a Project
                </a>
                <Link href="/sign-in" className={buttonSecondary}>
                  Client Login
                </Link>
              </div>
              <p className="mt-6 text-sm text-zinc-500">
                Built for operators, growing teams, and businesses ready to work smarter.
              </p>
            </div>
            <div className="mx-auto w-full max-w-[520px] lg:mx-0">
              <SystemDiagram />
            </div>
          </div>
        </section>

        {/* Problem / positioning */}
        <section className="border-t border-white/10">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2 lg:gap-16">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Stop forcing your business into generic software.
            </h2>
            <div>
              <p className="text-base leading-relaxed text-zinc-400 sm:text-lg">
                Most software forces your team to change the way it works. RevDevHQ takes the
                opposite approach. We learn your workflow, identify the bottlenecks, and build a
                system around your business.
              </p>
              <ul className="mt-8 space-y-4">
                {OUTCOMES.map((o) => (
                  <li key={o} className="flex items-start gap-3.5 text-[15px] text-zinc-200">
                    <span aria-hidden className="mt-1.75 block size-1.5 shrink-0 bg-red-600" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* What We Build */}
        <section id="what-we-build" className="scroll-mt-20 border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-500">What we build</p>
            <h2 className="mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Systems shaped by your operation, not the other way around.
            </h2>
            <div className="mt-12 grid gap-px border border-white/10 bg-white/10 sm:grid-cols-2">
              {SERVICES.map((s) => (
                <div key={s.title} className="bg-[#0A0A0C] p-7 sm:p-9">
                  <h3 className="text-lg font-medium tracking-tight">{s.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-500">How it works</p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              From bottleneck to working software.
            </h2>
            <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {STEPS.map((s) => (
                <li key={s.n} className="border-t border-white/15 pt-5">
                  <span className="text-sm font-semibold tabular-nums text-red-500">{s.n}</span>
                  <h3 className="mt-2.5 text-lg font-medium tracking-tight">{s.title}</h3>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-zinc-400">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Value statement */}
        <section className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-20 text-center sm:px-8 sm:py-28">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              One system. Less friction.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
              The goal is not to add more software to your business. It is to create the right
              software so your team can move faster, stay organized, and focus on the work that
              matters.
            </p>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-y-3">
              {SYSTEM_AREAS.map((area, i) => (
                <span key={area} className="flex items-center">
                  {i > 0 && <span aria-hidden className="hidden h-px w-6 bg-white/15 sm:block" />}
                  <span className="mx-1.5 border border-white/15 bg-white/[0.02] px-4 py-2 text-sm text-zinc-200 sm:mx-0">
                    {area}
                  </span>
                </span>
              ))}
            </div>
            <p className="mt-6 text-sm text-zinc-500">
              An example of the areas a custom system can bring together.
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section id="contact" className="scroll-mt-20 border-t border-white/10">
          <div className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-28">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Ready to build software around your business?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
              Tell us what is slowing your team down. We will help you turn it into a system that
              works.
            </p>
            <div className="mt-9 flex flex-col items-center gap-4">
              <a href={START_PROJECT_MAILTO} className={buttonPrimary}>
                Start a Project
              </a>
              <Link
                href="/sign-in"
                className={`rounded-sm text-sm text-zinc-400 underline-offset-4 transition-colors hover:text-white hover:underline ${focusRing}`}
              >
                Already a client? Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="flex items-center gap-2.5">
              <span aria-hidden className="block size-2.5 bg-red-600" />
              <span className="text-[15px] font-semibold tracking-tight">RevDevHQ</span>
            </p>
            <p className="mt-2 text-sm text-zinc-500">Custom software for modern businesses.</p>
          </div>
          <div className="flex flex-col gap-2.5 text-sm md:items-end">
            <a
              href="mailto:jay@revdevhq.com"
              className={`rounded-sm text-zinc-400 transition-colors hover:text-white ${focusRing}`}
            >
              jay@revdevhq.com
            </a>
            <Link
              href="/sign-in"
              className={`rounded-sm text-zinc-400 transition-colors hover:text-white ${focusRing}`}
            >
              Client Login
            </Link>
            <p className="text-zinc-600">© {new Date().getFullYear()} RevDevHQ</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
