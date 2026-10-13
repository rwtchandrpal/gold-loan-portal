/**
 * Parses and normalizes CORS origins from environment configuration.
 *
 * Supports:
 * - Single origin: "http://localhost:5173"
 * - Comma-separated origins: "https://app.vercel.app, http://localhost:5173"
 * - Trailing slash normalization: "https://app.vercel.app/" -> "https://app.vercel.app"
 */
export function parseCorsOrigins(rawOrigin?: string): string[] {
  if (!rawOrigin || !rawOrigin.trim()) {
    return ['http://localhost:5173'];
  }

  return rawOrigin
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Validates whether an incoming request Origin is permitted by the configured origins.
 * Allows non-browser requests (null/undefined origin, e.g. curl, health checks, server-to-server).
 */
export function isOriginAllowed(requestOrigin: string | undefined, allowedOrigins: string[]): boolean {
  if (!requestOrigin) {
    return true;
  }
  const normalized = requestOrigin.trim().replace(/\/+$/, '');
  return allowedOrigins.includes(normalized);
}
