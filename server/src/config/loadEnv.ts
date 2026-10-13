import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/**
 * Finds the monorepo root directory deterministically by walking up
 * the directory tree until it finds a package.json containing a "workspaces" field.
 */
export function findMonorepoRoot(startDir?: string): string {
  let currentDir: string;

  if (startDir) {
    currentDir = path.resolve(startDir);
  } else {
    try {
      currentDir = path.dirname(fileURLToPath(import.meta.url));
    } catch {
      currentDir = process.cwd();
    }
  }

  while (currentDir !== path.dirname(currentDir)) {
    const pkgPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.workspaces) {
          return currentDir;
        }
      } catch {
        // Skip parse error and continue walking up
      }
    }
    currentDir = path.dirname(currentDir);
  }

  return process.cwd();
}

/**
 * Loads the canonical root .env file into process.env.
 *
 * Rules:
 * 1. Platform-supplied environment variables (Render, CI, OS) ALWAYS take precedence (override: false).
 * 2. If the root .env file is absent (e.g. deployed cloud environment), continues gracefully without error.
 * 3. Works deterministically whether executed from repository root or a workspace subdirectory.
 */
export function loadMonorepoEnv(options?: {
  rootDir?: string;
  override?: boolean;
}): { rootDir: string; envPath: string; loaded: boolean } {
  const rootDir = options?.rootDir ?? findMonorepoRoot();
  const rootEnvPath = path.join(rootDir, '.env');

  if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath, override: options?.override ?? false });
    return { rootDir, envPath: rootEnvPath, loaded: true };
  }

  // If rootDir was not explicitly overridden and rootEnvPath does not exist,
  // check if cwd happens to have a .env
  if (!options?.rootDir) {
    const cwdEnvPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(cwdEnvPath)) {
      dotenv.config({ path: cwdEnvPath, override: options?.override ?? false });
      return { rootDir, envPath: cwdEnvPath, loaded: true };
    }
  }

  return { rootDir, envPath: rootEnvPath, loaded: false };
}
