import "server-only";

/**
 * Development-only query timing. No-ops in production — never runs or logs
 * anything user-visible outside development.
 */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV !== "development") return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    console.log(`[timing] ${label}: ${Math.round(performance.now() - start)}ms`);
  }
}
