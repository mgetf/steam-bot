# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it privately using [GitHub Security Advisories](../../security/advisories/new) rather than opening a public issue.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any relevant logs (redact secrets and Steam IDs)

We aim to acknowledge reports within a few days.

## Scope Notes

- `STEAM_PASSWORD`, `STEAM_SHARED_SECRET`, and `STEAM_IDENTITY_SECRET` grant full control of the bot Steam account, including bypassing Steam Guard and auto-confirming trades. Exposure of any of these is a critical incident.
- `MGE_API_KEY` can call mge.tf item-payment APIs. Rotate immediately if leaked.
- `steam-data/` contains persisted Steam login sessions. Never commit this directory or include it in Docker build context.
- Use a dedicated bot Steam account only. Do not run this bot against a personal account with valuable inventory.
- `.env` and `.maFile` files must never be committed or published.
