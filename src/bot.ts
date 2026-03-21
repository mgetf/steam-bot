import { existsSync, mkdirSync } from 'fs';
import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import TradeOfferManager from 'steam-tradeoffer-manager';
import type TradeOffer from 'steam-tradeoffer-manager/lib/classes/TradeOffer.js';
import SteamTotp from 'steam-totp';
import SteamID from 'steamid';
import { env, isOwner } from '@/env.ts';
import { handleNewOffer } from '@/services/trades.ts';

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

export function login(): void {
  const twoFactorCode = SteamTotp.generateAuthCode(env.STEAM_SHARED_SECRET);

  client.logOn({
    accountName: env.STEAM_ACCOUNT_NAME,
    password: env.STEAM_PASSWORD,
    twoFactorCode
  });
}

client.on('loggedOn', () => {
  console.log(`[bot] Logged in as ${env.STEAM_ACCOUNT_NAME}`);
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

    pollActiveOffers();
  });
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
});

client.on('disconnected', (eresult: number, msg?: string) => {
  console.warn(`[bot] Disconnected (eresult=${eresult}): ${msg ?? 'no message'}`);
});
