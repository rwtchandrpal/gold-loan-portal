import { describe, it, expect } from 'vitest';
import { resolveApiBaseUrl, buildApiUrl } from './api.js';

describe('Frontend API URL Configuration & Resolution (client/src/config/api.ts)', () => {
  describe('resolveApiBaseUrl in Development & Test Mode', () => {
    it('defaults to http://localhost:4000 when VITE_API_BASE_URL is not set', () => {
      const url = resolveApiBaseUrl({
        MODE: 'development',
        DEV: true,
        PROD: false,
        VITE_API_BASE_URL: undefined,
      });
      expect(url).toBe('http://localhost:4000');
    });

    it('honors explicitly configured VITE_API_BASE_URL and trims whitespace', () => {
      const url = resolveApiBaseUrl({
        MODE: 'development',
        DEV: true,
        PROD: false,
        VITE_API_BASE_URL: '  http://localhost:4001  ',
      });
      expect(url).toBe('http://localhost:4001');
    });

    it('normalizes trailing slashes in development base URL', () => {
      const url = resolveApiBaseUrl({
        MODE: 'development',
        DEV: true,
        PROD: false,
        VITE_API_BASE_URL: 'http://localhost:4000///',
      });
      expect(url).toBe('http://localhost:4000');
    });
  });

  describe('resolveApiBaseUrl in Production Mode (Vercel)', () => {
    it('throws explicit error when VITE_API_BASE_URL is missing in production (never silently falls back to localhost)', () => {
      expect(() =>
        resolveApiBaseUrl({
          MODE: 'production',
          DEV: false,
          PROD: true,
          VITE_API_BASE_URL: undefined,
        })
      ).toThrowError(/Missing VITE_API_BASE_URL in production.*cannot silently fall back to localhost/);

      expect(() =>
        resolveApiBaseUrl({
          MODE: 'production',
          DEV: false,
          PROD: true,
          VITE_API_BASE_URL: '   ',
        })
      ).toThrowError(/Missing VITE_API_BASE_URL in production.*cannot silently fall back to localhost/);
    });

    it('rejects localhost as API host when deployed on a remote production host (e.g. Vercel domain)', () => {
      expect(() =>
        resolveApiBaseUrl(
          {
            MODE: 'production',
            DEV: false,
            PROD: true,
            VITE_API_BASE_URL: 'http://localhost:4000',
          },
          'gold-loan-portal.vercel.app'
        )
      ).toThrowError(/Production frontend hosted on 'gold-loan-portal\.vercel\.app' cannot use localhost as API host/);

      expect(() =>
        resolveApiBaseUrl(
          {
            MODE: 'production',
            DEV: false,
            PROD: true,
            VITE_API_BASE_URL: 'http://127.0.0.1:4000',
          },
          'my-gold-app.vercel.app'
        )
      ).toThrowError(/Production frontend hosted on 'my-gold-app\.vercel\.app' cannot use localhost as API host/);
    });

    it('returns normalized deployed Render URL in production', () => {
      const url = resolveApiBaseUrl(
        {
          MODE: 'production',
          DEV: false,
          PROD: true,
          VITE_API_BASE_URL: 'https://gold-loan-api.onrender.com/',
        },
        'gold-loan-portal.vercel.app'
      );
      expect(url).toBe('https://gold-loan-api.onrender.com');
    });
  });

  describe('buildApiUrl', () => {
    it('builds full endpoint URL with custom base URL', () => {
      const endpoint = buildApiUrl('/api/v1/loan-schemes', 'https://api.onrender.com');
      expect(endpoint).toBe('https://api.onrender.com/api/v1/loan-schemes');
    });

    it('handles base URL with trailing slash without creating double slashes', () => {
      const endpoint = buildApiUrl('/api/v1/quotes', 'https://api.onrender.com///');
      expect(endpoint).toBe('https://api.onrender.com/api/v1/quotes');
    });

    it('handles path without leading slash', () => {
      const endpoint = buildApiUrl('api/v1/leads', 'https://api.onrender.com');
      expect(endpoint).toBe('https://api.onrender.com/api/v1/leads');
    });

    it('handles query parameters correctly', () => {
      const endpoint = buildApiUrl('/api/v1/leads?planId=PLAN_EMI_01', 'https://api.onrender.com');
      expect(endpoint).toBe('https://api.onrender.com/api/v1/leads?planId=PLAN_EMI_01');
    });
  });
});
