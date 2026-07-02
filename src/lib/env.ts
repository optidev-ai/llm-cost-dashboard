/**
 * Runtime environment variable helper for OptiDev deployments.
 *
 * - Development: Reads from import.meta.env (Vite build-time)
 * - Production: Falls back to window.__ENV__ (runtime injection)
 */

declare global {
  interface Window {
    __ENV__?: Record<string, string>;
  }
}

/**
 * Get an environment variable from either Vite's build-time env or
 * OptiDev's runtime-injected window.__ENV__.
 */
export function getEnv(key: string): string | undefined {
  // Try Vite's build-time env first (works in dev)
  const viteValue = import.meta.env[key];
  if (viteValue !== undefined && viteValue !== '') {
    return viteValue;
  }

  // Fall back to runtime-injected env (works in production)
  return window.__ENV__?.[key];
}
