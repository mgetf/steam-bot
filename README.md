# mge.tf Steam Bot

Steam trade bot for [mge.tf](https://mge.tf) item payments. When a user initiates an item payment on the website, the bot validates and accepts their incoming trade offer, then calls the mge.tf API to confirm the payment.

## Stack

| Technology | Purpose |
|------------|---------|
| Node.js ≥20 | Runtime (v24 recommended) |
| pnpm | Package manager |
| TypeScript | Type safety |
| steam-user v5 | Steam client login, session, presence |
| steam-tradeoffer-manager v2 | Trade offer lifecycle |
| steamcommunity v3 | Session management, trade confirmations |
| steam-totp v2 | Steam Guard 2FA code generation |
| @t3-oss/env-core + Zod | Environment variable validation |

**Do not use Bun.** The `steam-user` client initialises under Bun but no events fire due to `websocket13` TCP incompatibilities.

## Install

```bash
pnpm install
```

Copy `.env.example` to `.env` and fill in values (see Environment variables below).

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start locally (loads `.env` automatically) |
| `pnpm start` | Start in production (env vars from environment) |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STEAM_ACCOUNT_NAME` | Yes | Bot Steam account username |
| `STEAM_PASSWORD` | Yes | Bot Steam account password |
| `STEAM_SHARED_SECRET` | Yes | From SDA `.maFile` (generates 2FA codes) |
| `STEAM_IDENTITY_SECRET` | Yes | From SDA `.maFile` (auto-confirms trades) |
| `MGE_API_URL` | Yes | mge.tf base URL (e.g. `https://mge.tf`) |
| `MGE_API_KEY` | Yes | API key from Admin → Site → API Keys (`mge_...`) |
| `DISCORD_STATUS_WEBHOOK_URL` | No | Discord webhook for bot status notifications |
| `BOT_OWNER_IDS` | No | Comma-separated Steam64 IDs of bot owners |

See [`.env.example`](.env.example) for a template.

## Communication model

**Bot → website only (one-directional).**

The bot calls the mge.tf website's `/api/v1/*` endpoints:

- `GET /api/v1/item-payments/pending/:steamId` — check if a sender has a pending order
- `POST /api/v1/item-payments/confirm` — confirm payment after accepting a trade

The website never calls the bot. Bot connection info (trade URL, profile) is stored in the website's database settings.

All requests use `Authorization: Bearer mge_...` via the mge.tf API key system.

## Session persistence

The bot uses `dataDirectory: './steam-data'` and `autoRelogin: true` on the `SteamUser` client. Login keys persist to disk so restarts reuse the existing session instead of triggering a fresh login, avoiding Steam's login rate limits.

`steam-data/` is gitignored and must be mounted as a persistent volume on Railway (or equivalent).

## Threat model

- Use a **dedicated bot Steam account** with no valuable inventory beyond what the payment flow requires. Compromise of credentials or session files equals account takeover.
- **Never commit** `.env`, `.maFile`, or `steam-data/` session files. These grant full account access.
- `STEAM_SHARED_SECRET` and `STEAM_IDENTITY_SECRET` bypass Steam Guard and auto-confirm trades. Treat them like root passwords.
- `MGE_API_KEY` can confirm item payments via the website API. Rotate immediately if exposed.
- The Docker build uses `.dockerignore` to exclude `.env*` and `steam-data/` from build context. Verify before building images in CI or locally.

## Deploy

Docker image is defined in [`Dockerfile`](Dockerfile). Railway config is in [`railway.json`](railway.json). Set all required env vars in the hosting dashboard and mount a persistent volume at `./steam-data`.

## Contributing

See [`AGENTS.md`](AGENTS.md) for architecture, directory layout, and coding conventions.

## Security

Report vulnerabilities privately via [GitHub Security Advisories](../../security/advisories/new). See [`SECURITY.md`](SECURITY.md) for scope and reporting details.
