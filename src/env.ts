import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  runtimeEnv: process.env,
  server: {
    STEAM_ACCOUNT_NAME: z.string().min(1, 'STEAM_ACCOUNT_NAME is required'),
    STEAM_PASSWORD: z.string().min(1, 'STEAM_PASSWORD is required'),
    STEAM_SHARED_SECRET: z.string().min(1, 'STEAM_SHARED_SECRET is required'),
    STEAM_IDENTITY_SECRET: z.string().min(1, 'STEAM_IDENTITY_SECRET is required'),
    MGE_API_URL: z.string().url('MGE_API_URL must be a valid URL'),
    MGE_API_KEY: z.string().min(1, 'MGE_API_KEY is required'),
    DISCORD_STATUS_WEBHOOK_URL: z.string().url().optional(),
    BOT_OWNER_IDS: z
      .string()
      .optional()
      .default('')
      .transform((val) =>
        val
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      )
  }
});

export function isOwner(steamId: string): boolean {
  return env.BOT_OWNER_IDS.includes(steamId);
}
