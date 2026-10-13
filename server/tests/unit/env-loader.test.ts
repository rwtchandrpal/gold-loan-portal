import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { findMonorepoRoot, loadMonorepoEnv } from '../../src/config/loadEnv.js';
import { validateEnv, envSchema } from '../../src/config/env.js';

describe('Unified Environment Loading (loadEnv & envSchema)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('findMonorepoRoot', () => {
    it('reliably finds the monorepo root containing workspaces package.json', () => {
      const root = findMonorepoRoot();
      expect(fs.existsSync(path.join(root, 'package.json'))).toBe(true);
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      expect(pkg.workspaces).toBeDefined();
      expect(pkg.workspaces).toContain('server');
      expect(pkg.workspaces).toContain('client');
    });

    it('finds root deterministically when given a deep subdirectory path', () => {
      const deepDir = path.resolve(process.cwd(), 'src', 'config');
      const root = findMonorepoRoot(deepDir);
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      expect(pkg.workspaces).toContain('server');
    });
  });

  describe('loadMonorepoEnv precedence & platform override', () => {
    it('preserves existing platform environment variables over file values (override: false)', () => {
      // Simulate platform variable (Render / OS)
      process.env.PLATFORM_TEST_VAR = 'platform_value';

      // Create a temporary directory with a .env file
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
      const tempEnvPath = path.join(tempDir, '.env');
      fs.writeFileSync(tempEnvPath, 'PLATFORM_TEST_VAR=file_value\nNEW_FILE_VAR=from_file\n');

      const result = loadMonorepoEnv({ rootDir: tempDir, override: false });
      expect(result.loaded).toBe(true);
      expect(process.env.PLATFORM_TEST_VAR).toBe('platform_value'); // platform preserved!
      expect(process.env.NEW_FILE_VAR).toBe('from_file'); // new var loaded

      // Clean up temp
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('continues gracefully without throwing when root .env is absent (cloud deployment scenario)', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-env-test-'));
      const result = loadMonorepoEnv({ rootDir: emptyDir });
      expect(result.loaded).toBe(false);
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });
  });

  describe('validateEnv schema & errors', () => {
    it('honors dynamically assigned PORT from hosting platforms like Render', () => {
      const config = validateEnv({
        ...process.env,
        PORT: '10000',
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@render.host/db',
      });
      expect(config.PORT).toBe(10000);
      expect(typeof config.PORT).toBe('number');
    });

    it('rejects malformed non-numeric PORT with clear error', () => {
      expect(() =>
        validateEnv({
          ...process.env,
          PORT: 'not-a-port',
        })
      ).toThrowError(/Invalid environment configuration/);
    });

    it('rejects out-of-range PORT (< 1 or > 65535)', () => {
      expect(() =>
        validateEnv({
          ...process.env,
          PORT: '70000',
        })
      ).toThrowError(/Invalid environment configuration/);

      expect(() =>
        validateEnv({
          ...process.env,
          PORT: '-5',
        })
      ).toThrowError(/Invalid environment configuration/);
    });

    it('rejects malformed NODE_ENV', () => {
      expect(() =>
        validateEnv({
          ...process.env,
          NODE_ENV: 'staging', // not in development | production | test
        })
      ).toThrowError(/Invalid environment configuration/);
    });

    it('strictly requires DATABASE_URL in production environment', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          DATABASE_URL: '',
        })
      ).toThrowError(/DATABASE_URL is required in production environment/);
    });

    it('allows DATABASE_URL to be omitted in test and development environments', () => {
      const devConfig = validateEnv({
        NODE_ENV: 'development',
      });
      expect(devConfig.DATABASE_URL).toBeUndefined();

      const testConfig = validateEnv({
        NODE_ENV: 'test',
      });
      expect(testConfig.DATABASE_URL).toBeUndefined();
    });

    it('rejects negative or zero GOLD_RATE_24K', () => {
      expect(() =>
        validateEnv({
          ...process.env,
          GOLD_RATE_24K: '-100',
        })
      ).toThrowError(/Invalid environment configuration/);
    });
  });
});
