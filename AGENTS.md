## Overview

The **mge.tf Steam Bot** accepts Steam item trades (TF2 keys, etc.) as payment for league signups.
When a user initiates an item payment on the mge.tf website, the bot validates and accepts their incoming trade offer, then calls the mge.tf API to confirm the payment.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Node.js v24 | Runtime |
| pnpm | Package manager |
| TypeScript | Type safety |
| steam-user v5 | Steam client login, session, presence |
| steam-tradeoffer-manager v2 | Trade offer lifecycle |
| steamcommunity v3 | Session management, trade confirmations |
| steam-totp v2 | Steam Guard 2FA code generation |
| @t3-oss/env-core + Zod | Environment variable validation |
| ESLint + Prettier | Linting & formatting |

---

## Directory Structure

```
src/
├── index.ts              # Entry point: setup error handlers, login
├── bot.ts                # SteamUser + SteamCommunity + TradeOfferManager setup
├── env.ts                # Zod-validated environment variables
├── services/
│   ├── trades.ts         # (Phase 2) Trade offer validation + acceptance
│   ├── items.ts          # (Phase 2) Steam item identification by appId + marketHashName
│   └── website.ts        # (Phase 2) HTTP client to call mge.tf API
└── utils/
    └── error-handler.ts  # Global error handlers with optional shutdown callback
```

---

## Environment Variables

```
STEAM_ACCOUNT_NAME=       # Bot Steam account username
STEAM_PASSWORD=           # Bot Steam account password
STEAM_SHARED_SECRET=      # From .maFile (used to generate 2FA codes)
STEAM_IDENTITY_SECRET=    # From .maFile (used to auto-confirm trades)
MGE_API_URL=              # e.g. https://mge.tf
MGE_API_KEY=              # Generated in Admin → Site → API Keys (mge_...)
```

See `.env.example` for a template.

---

## Session Persistence

The bot uses `dataDirectory: './steam-data'` and `autoRelogin: true` on the `SteamUser` client.
This persists login keys to disk so restarts reuse the existing session instead of triggering a fresh login, avoiding Steam's login rate limits.

`steam-data/` is gitignored and must be mounted as a persistent volume on Railway.

---

## Communication Model

**Bot → Website only (one-directional).**

The bot calls the mge.tf website's `/api/v1/*` endpoints:
- `GET /api/v1/item-payments/pending/:steamId` — check if a sender has a pending order
- `POST /api/v1/item-payments/confirm` — confirm payment after accepting a trade

The website never calls the bot. Bot connection info (trade URL, profile) is stored in the website's database settings.

All requests are authenticated via `Authorization: Bearer mge_...` using the existing mge.tf API key system.

---

## Development Workflow

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the bot locally (loads `.env` automatically) |
| `pnpm start` | Start the bot in production (env vars from environment) |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |

> **Note:** The bot must run under Node.js. Bun is incompatible with `steam-user`'s `websocket13` TCP layer — the client initialises but no events ever fire under Bun.

---

## Path Aliases

`@/` → maps to `src/` (configured in `tsconfig.json`)

```typescript
import { env } from '@/env.ts';
import { client } from '@/bot.ts';
```

---

## Coding Conventions

- 2-space indent, single quotes, no trailing commas (Prettier)
- `strict: true`, `noUncheckedIndexedAccess: true`, `noUnusedLocals/Parameters: true`
- Logging: plain `console.log` / `console.error` — no logging framework

---

## Adding New Environment Variables

1. Add Zod schema entry to `src/env.ts`
2. Add to `.env.example`
3. Update this file under the Environment Variables section
4. Set in Railway dashboard
