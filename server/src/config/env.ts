import { z } from 'zod';
import { loadMonorepoEnv } from './loadEnv.js';

// Automatically load canonical root .env file
loadMonorepoEnv();

export const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    DATABASE_URL: z.string().optional(),
    DIRECT_URL: z.string().optional(),
    GOLD_RATE_24K: z.coerce.number().positive().default(7000),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && !data.DATABASE_URL?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL is required in production environment',
        path: ['DATABASE_URL'],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(inputEnv: Record<string, any> = process.env): Env {
  const rawEnv = {
    ...inputEnv,
    GEMINI_API_KEY: inputEnv.GEMINI_API_KEY || inputEnv.GEMINI_API_KE,
  };

  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorMessages = result.error.errors
      .map((err) => `  - ${err.path.join('.') || 'root'}: ${err.message}`)
      .join('\n');
    throw new Error(
      `[Config Error] Invalid environment configuration:\n${errorMessages}\n` +
      'Please verify your root .env file or deployment platform environment settings.'
    );
  }

  return result.data;
}

export const env = validateEnv();
