/**
 * Frontend API Configuration and Endpoint URL Builder.
 *
 * Enforces unified environment handling across Local development, Render backend,
 * and Vercel production hosting.
 */

export interface ClientEnv {
  VITE_API_BASE_URL?: string;
  MODE?: string;
  PROD?: boolean;
  DEV?: boolean;
}

/**
 * Resolves and validates the API base URL from Vite environment variables.
 *
 * Rules:
 * 1. Local development / test: Uses VITE_API_BASE_URL or defaults to http://localhost:4000.
 * 2. Production (Vercel): Requires explicit VITE_API_BASE_URL pointing to the deployed backend.
 *    Never silently falls back to localhost.
 * 3. Handles trailing slashes safely.
 */
export function resolveApiBaseUrl(
  envOverride?: ClientEnv,
  hostnameOverride?: string
): string {
  const env: ClientEnv = envOverride ?? {
    VITE_API_BASE_URL: import.meta.env?.VITE_API_BASE_URL,
    MODE: import.meta.env?.MODE,
    PROD: import.meta.env?.PROD,
    DEV: import.meta.env?.DEV,
  };

  const rawUrl = env.VITE_API_BASE_URL?.trim();
  const isProd = env.PROD || env.MODE === 'production';
  const currentHost = hostnameOverride ?? (typeof window !== 'undefined' ? window.location?.hostname : '');

  if (isProd) {
    // A production frontend must never silently fall back to localhost
    if (!rawUrl) {
      throw new Error(
        '[API Configuration Error] Missing VITE_API_BASE_URL in production. ' +
        'A production frontend cannot silently fall back to localhost. ' +
        'Please configure VITE_API_BASE_URL in your hosting platform (e.g. Vercel) to point to your deployed backend URL.'
      );
    }

    // Verify production deployment does not target localhost
    const isLocalhostTarget = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(rawUrl);
    const isRemoteHost = currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1';

    if (isLocalhostTarget && isRemoteHost) {
      throw new Error(
        `[API Configuration Error] Production frontend hosted on '${currentHost}' cannot use localhost as API host (${rawUrl}). ` +
        'Please set VITE_API_BASE_URL to your deployed backend URL in Vercel.'
      );
    }

    return rawUrl.replace(/\/+$/, '');
  }

  // Development / Test mode
  if (rawUrl) {
    return rawUrl.replace(/\/+$/, '');
  }

  // Safe local development default
  return 'http://localhost:4000';
}

/**
 * Constructs an absolute or proxied API URL, guaranteeing single-slash concatenation.
 *
 * @param path Endpoint subpath, e.g. "/api/v1/loan-schemes" or "api/v1/quotes"
 * @param baseUrl Optional override base URL (defaults to resolveApiBaseUrl())
 */
export function buildApiUrl(path: string, baseUrl?: string): string {
  const base = baseUrl !== undefined ? baseUrl.trim().replace(/\/+$/, '') : resolveApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!base) {
    return normalizedPath;
  }

  return `${base}${normalizedPath}`;
}
