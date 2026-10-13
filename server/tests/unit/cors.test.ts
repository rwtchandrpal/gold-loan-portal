import { describe, it, expect } from 'vitest';
import { parseCorsOrigins, isOriginAllowed } from '../../src/config/cors.js';

describe('CORS Configuration & Origin Parsing (cors.ts)', () => {
  it('parses a single origin string correctly', () => {
    const origins = parseCorsOrigins('http://localhost:5173');
    expect(origins).toEqual(['http://localhost:5173']);
  });

  it('parses multiple comma-separated origins and trims whitespace', () => {
    const origins = parseCorsOrigins('https://my-app.vercel.app, http://localhost:5173, https://preview.vercel.app');
    expect(origins).toEqual([
      'https://my-app.vercel.app',
      'http://localhost:5173',
      'https://preview.vercel.app',
    ]);
  });

  it('normalizes trailing slashes on configured origins', () => {
    const origins = parseCorsOrigins('https://my-app.vercel.app/ , http://localhost:5173///');
    expect(origins).toEqual([
      'https://my-app.vercel.app',
      'http://localhost:5173',
    ]);
  });

  it('defaults to http://localhost:5173 when configuration is empty or whitespace', () => {
    expect(parseCorsOrigins('')).toEqual(['http://localhost:5173']);
    expect(parseCorsOrigins('   ')).toEqual(['http://localhost:5173']);
    expect(parseCorsOrigins(undefined)).toEqual(['http://localhost:5173']);
  });

  describe('isOriginAllowed', () => {
    const allowed = ['https://goldloan.vercel.app', 'http://localhost:5173'];

    it('permits requests without an Origin header (curl, mobile, same-origin, health check)', () => {
      expect(isOriginAllowed(undefined, allowed)).toBe(true);
      expect(isOriginAllowed('', allowed)).toBe(true);
    });

    it('permits exact matches in the allowed list', () => {
      expect(isOriginAllowed('https://goldloan.vercel.app', allowed)).toBe(true);
      expect(isOriginAllowed('http://localhost:5173', allowed)).toBe(true);
    });

    it('permits origins that have a trailing slash in the request', () => {
      expect(isOriginAllowed('https://goldloan.vercel.app/', allowed)).toBe(true);
    });

    it('rejects unauthorized origins', () => {
      expect(isOriginAllowed('https://malicious-site.com', allowed)).toBe(false);
      expect(isOriginAllowed('http://localhost:3000', allowed)).toBe(false);
    });
  });
});
