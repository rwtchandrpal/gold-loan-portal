import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  GOLD_RATE_24K: z.coerce.number().default(7000),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
});

const rawEnv = {
  ...process.env,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GEMINI_API_KE,
};

export const env = envSchema.parse(rawEnv);
export type Env = z.infer<typeof envSchema>;
