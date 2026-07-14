import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    // Component tests opt into jsdom per-file via a `@vitest-environment jsdom`
    // docblock — everything else (finance math, validation, ...) stays on the
    // faster node environment.
    setupFiles: ["./vitest.setup.ts"],
  },
});
