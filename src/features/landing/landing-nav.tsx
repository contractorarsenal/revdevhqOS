"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export const START_PROJECT_MAILTO = "mailto:jay@revdevhq.com?subject=Custom%20Software%20Project";

const NAV_LINKS = [
  { href: "#what-we-build", label: "What We Build" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#contact", label: "Contact" },
];

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500";

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0A0A0C]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <a href="#top" className={`flex items-center gap-2.5 rounded-sm ${focusRing}`} aria-label="RevDevHQ — back to top">
          <span aria-hidden className="block size-2.5 bg-red-600" />
          <span className="text-[15px] font-semibold tracking-tight text-white">RevDevHQ</span>
        </a>

        <nav aria-label="Main" className="ml-4 hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className={`rounded-sm text-sm text-zinc-400 transition-colors hover:text-white ${focusRing}`}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <Link
            href="/sign-in"
            className={`inline-flex h-9 items-center rounded-sm border border-white/15 px-4 text-sm font-medium text-white transition-colors hover:border-white/40 hover:bg-white/5 ${focusRing}`}
          >
            Client Login
          </Link>
          <a
            href={START_PROJECT_MAILTO}
            className={`inline-flex h-9 items-center rounded-sm bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-500 ${focusRing}`}
          >
            Start a Project
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          className={`ml-auto inline-flex size-10 items-center justify-center rounded-sm text-white md:hidden ${focusRing}`}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-white/10 px-5 pb-5 pt-2 md:hidden">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`block rounded-sm py-3.5 text-[15px] text-zinc-300 transition-colors hover:text-white ${focusRing}`}
            >
              {l.label}
            </a>
          ))}
          <div className="mt-3 flex flex-col gap-2.5">
            <Link
              href="/sign-in"
              onClick={() => setOpen(false)}
              className={`inline-flex h-11 items-center justify-center rounded-sm border border-white/15 text-sm font-medium text-white ${focusRing}`}
            >
              Client Login
            </Link>
            <a
              href={START_PROJECT_MAILTO}
              onClick={() => setOpen(false)}
              className={`inline-flex h-11 items-center justify-center rounded-sm bg-red-600 text-sm font-semibold text-white ${focusRing}`}
            >
              Start a Project
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
