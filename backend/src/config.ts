import { z } from 'zod';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  OPENAI_API_KEY: z.string().optional().or(z.literal('')),
  OPENAI_BASE_URL: z.string().url().optional(),
  LLM_MODEL: z.string().default('gpt-4.1-mini'),
  EVIDENCE_PUBLIC_URL: z.string().url().optional(),
  RULE_SIMILARITY_THRESHOLD: z.coerce.number().default(0.38),
  CHUNK_SIMILARITY_THRESHOLD: z.coerce.number().default(0.33),
  ADMIN_API_KEY: z.string().min(16, 'ADMIN_API_KEY must be at least 16 characters. Generate one with: openssl rand -hex 32'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const config = parsed.data;
export type AppConfig = typeof config;
