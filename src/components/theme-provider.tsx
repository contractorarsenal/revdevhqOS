"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Dark is the default; the choice persists in localStorage and next-themes'
 * inline script applies it before first paint, so there is no theme flash. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="ca-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
