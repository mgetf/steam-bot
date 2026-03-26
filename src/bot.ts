import { existsSync, mkdirSync } from 'fs';
import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import TradeOfferManager from 'steam-tradeoffer-manager';
import type TradeOffer from 'steam-tradeoffer-manager/lib/classes/TradeOffer.js';
import SteamTotp from 'steam-totp';
import SteamID from 'steamid';
import { env, isOwner } from '@/env.ts';
import { handleNewOffer } from '@/services/trades.ts';
import { notify } from '@/utils/discord.ts';

if (!existsSync('./steam-data')) {
  mkdirSync('./steam-data', { recursive: true });
}

export const client = new SteamUser({
  dataDirectory: './steam-data',
  autoRelogin: true
});

export const community = new SteamCommunity();

export const manager = new TradeOfferManager({
  steam: client,
  community,
  language: 'en',
  pollInterval: 30000
});

const RELOGIN_ERRORS = new Set(['LoggedInElsewhere', 'LogonSessionReplaced']);
const RELOGIN_BASE_DELAY_MS = 15_000;
const RELOGIN_MAX_ATTEMPTS = 5;
const SESSION_CONFLICT_RETRY_MS = 2 * 60 * 1000;
const HEALTH_CHECK_INTERVAL_MS = 60_000;

let reloginAttempts = 0;
let reloginTimer: ReturnType<typeof setTimeout> | null = null;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let inSessionConflict = false;

export function login(): void {
  const twoFactorCode = SteamTotp.generateAuthCode(env.STEAM_SHARED_SECRET);

  client.logOn({
    accountName: env.STEAM_ACCOUNT_NAME,
    password: env.STEAM_PASSWORD,
    twoFactorCode
  });
}

function scheduleRelogin(sessionConflict = false): void {
  if (reloginTimer) return;

  if (!sessionConflict) {
    if (reloginAttempts >= RELOGIN_MAX_ATTEMPTS) {
      console.error(`[bot] Exceeded ${RELOGIN_MAX_ATTEMPTS} re-login attempts, exiting`);
      notify('Bot Offline', `Exceeded ${RELOGIN_MAX_ATTEMPTS} re-login attempts — process exiting.`, 'error');
      process.exit(1);
    }
    reloginAttempts++;
  }

  const delay = sessionConflict
    ? SESSION_CONFLICT_RETRY_MS
    : RELOGIN_BASE_DELAY_MS * Math.pow(2, reloginAttempts - 1);

  if (sessionConflict) {
    console.log(`[bot] Session conflict — retrying in ${delay / 1000}s...`);
  } else {
    console.log(`[bot] Scheduling re-login attempt ${reloginAttempts}/${RELOGIN_MAX_ATTEMPTS} in ${delay / 1000}s...`);
  }

  reloginTimer = setTimeout(() => {
    reloginTimer = null;
    login();
  }, delay);
}

function startHealthCheck(): void {
  if (healthCheckTimer) clearInterval(healthCheckTimer);

  healthCheckTimer = setInterval(() => {
    if (!client.steamID) {
      console.warn('[bot] Health check: not logged in, triggering re-login');
      notify('Health Check Failed', 'Bot not logged in — triggering re-login', 'warning');
      scheduleRelogin();
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

client.on('loggedOn', () => {
  console.log(`[bot] Logged in as ${env.STEAM_ACCOUNT_NAME}`);

  const recovered = inSessionConflict || reloginAttempts > 0;

  reloginAttempts = 0;
  inSessionConflict = false;
  if (reloginTimer) {
    clearTimeout(reloginTimer);
    reloginTimer = null;
  }

  if (recovered) {
    notify('Bot Recovered', `Back online as **${env.STEAM_ACCOUNT_NAME}**`, 'success');
  } else {
    notify('Bot Online', `Logged in as **${env.STEAM_ACCOUNT_NAME}**`, 'success');
  }

  client.setPersona(SteamUser.EPersonaState.Online);
  client.gamesPlayed([440]);
});

let newOfferListenerAttached = false;

function pollActiveOffers(): void {
  console.log('[bot] Checking for active offers received while offline...');

  manager.getOffers(1, (err: Error | null, _sent: unknown[], received: TradeOffer[]) => {
    if (err) {
      console.error('[bot] Failed to fetch active offers:', err.message);
      return;
    }

    const pending = received.filter(
      (offer: TradeOffer) => offer.state === TradeOfferManager.ETradeOfferState.Active,
    );

    if (pending.length === 0) {
      console.log('[bot] No pending offers found');
      return;
    }

    console.log(`[bot] Found ${pending.length} pending offer(s), processing...`);
    for (const offer of pending) {
      handleNewOffer(offer);
    }
  });
}

client.on('webSession', (_sessionId: string, cookies: string[]) => {
  console.log('[bot] Web session started, setting cookies...');

  community.setCookies(cookies);

  manager.setCookies(cookies, (err: Error | null) => {
    if (err) {
      console.error('[bot] Failed to set trade manager cookies:', err.message);
      return;
    }
    console.log('[bot] Trade manager ready');

    if (!newOfferListenerAttached) {
      manager.on('newOffer', handleNewOffer);
      newOfferListenerAttached = true;
    }

    startHealthCheck();
    pollActiveOffers();
  });
});

community.on('sessionExpired', () => {
  console.warn('[bot] Web session expired, requesting new session...');
  client.webLogOn();
});

client.on('friendRelationship', (steamId: SteamID, relationship: SteamUser.EFriendRelationship) => {
  if (relationship === SteamUser.EFriendRelationship.RequestRecipient) {
    const id64 = steamId.getSteamID64();
    if (isOwner(id64)) {
      console.log(`[bot] Accepting friend request from owner ${id64}`);
      client.addFriend(steamId);
    } else {
      console.log(`[bot] Rejecting friend request from ${id64}`);
      client.removeFriend(steamId);
    }
  }
});

client.on('steamGuard', (domain: string | null, _callback: (code: string) => void) => {
  console.warn(`[bot] Steam Guard required (domain: ${domain ?? 'mobile'}) — unhandled`);
});

client.on('error', (err: Error) => {
  console.error('[bot] Steam client error:', err?.message ?? err);

  if (RELOGIN_ERRORS.has(err?.message)) {
    if (!inSessionConflict) {
      inSessionConflict = true;
      notify('Session Conflict', `**${err.message}** — retrying every ${SESSION_CONFLICT_RETRY_MS / 1000}s until session is free`, 'warning');
    }
    scheduleRelogin(true);
  }
});

client.on('disconnected', (eresult: number, msg?: string) => {
  console.warn(`[bot] Disconnected (eresult=${eresult}): ${msg ?? 'no message'}`);
});
