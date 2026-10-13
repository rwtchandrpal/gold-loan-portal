import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Resolve monorepo root directory deterministically
const rootDir = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Load environment variables from the monorepo root
  const env = loadEnv(mode, rootDir, '');

  // Build-time validation for Vercel production deployment
  const isVercelBuild = process.env.VERCEL === '1';
  if (isVercelBuild) {
    const apiBaseUrl = (env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL)?.trim();
    if (!apiBaseUrl) {
      throw new Error(
        '[Vite Build Error] Missing VITE_API_BASE_URL in Vercel production deployment. ' +
        'Please set VITE_API_BASE_URL in your Vercel Project Settings to your deployed backend URL.'
      );
    }
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(apiBaseUrl)) {
      throw new Error(
        `[Vite Build Error] Vercel production deployment cannot use localhost as API base URL (${apiBaseUrl}). ` +
        'Please set VITE_API_BASE_URL to your deployed Render backend URL in Vercel.'
      );
    }
  }

  const devProxyTarget = env.VITE_API_BASE_URL || 'http://localhost:4000';

  return {
    envDir: rootDir,
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: devProxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
