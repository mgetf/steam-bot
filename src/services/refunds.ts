import type TradeOffer from 'steam-tradeoffer-manager/lib/classes/TradeOffer.js';
import { community, manager } from '@/bot.ts';
import { env } from '@/env.ts';
import {
  confirmRefund,
  failRefund,
  getPendingRefunds,
  markRefundSent,
  type PendingRefund
} from '@/services/website.ts';
import { notify } from '@/utils/discord.ts';
import { refundFailedMessage, refundSentMessage } from '@/utils/messages.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function confirmObjectOnce(offerId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    community.acceptConfirmationForObject(
      env.STEAM_IDENTITY_SECRET,
      offerId,
      (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function confirmOutgoing(offerId: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await confirmObjectOnce(offerId);
      return;
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(3000);
    }
  }
}

function loadInventory(
  appId: number
): Promise<Array<{ market_hash_name?: string; amount?: number }>> {
  return new Promise((resolve, reject) => {
    manager.getInventoryContents(appId, 2, true, (err: Error | null, inventory: unknown[]) => {
      if (err) reject(err);
      else resolve(inventory as Array<{ market_hash_name?: string; amount?: number }>);
    });
  });
}

function sendOffer(offer: TradeOffer): Promise<string> {
  return new Promise((resolve, reject) => {
    offer.send((err: Error | null, status: string) => {
      if (err) reject(err);
      else resolve(status);
    });
  });
}

let polling = false;
const inFlight = new Set<number>();
const sentOffers = new Map<number, string>();

async function processRefund(refund: PendingRefund): Promise<void> {
  if (inFlight.has(refund.id)) return;
  inFlight.add(refund.id);
  const who = { name: refund.playerName, steamId: refund.playerSteamId };
  const itemLabel = `${refund.itemQuantity}x ${refund.itemName}`;
  let offerId = refund.tradeOfferId ?? sentOffers.get(refund.id) ?? null;

  try {
    if (!offerId) {
      const inventory = await loadInventory(refund.itemAppId);
      const matches = inventory.filter(
        (item) => item.market_hash_name === refund.itemMarketHashName
      );
      if (matches.length < refund.itemQuantity) {
        const reason = `The bot only has ${matches.length} tradable ${refund.itemName}, and the refund needs ${refund.itemQuantity}.`;
        await failRefund({ refundId: refund.id, error: reason });
        const message = refundFailedMessage(who.name, who.steamId, reason);
        notify(message.title, message.description, 'error');
        return;
      }

      const offer = manager.createOffer(refund.tradeOfferUrl);
      offer.addMyItems(
        matches.slice(0, refund.itemQuantity) as Parameters<TradeOffer['addMyItems']>[0]
      );
      offer.setMessage(`mge.tf refund: ${itemLabel}`);

      const status = await sendOffer(offer);
      offerId = offer.id ?? null;
      if (!offerId) throw new Error('Steam did not return a trade offer id');
      sentOffers.set(refund.id, offerId);

      const recorded = await markRefundSent({ refundId: refund.id, tradeOfferId: offerId });
      if (!recorded.success) {
        const message = refundFailedMessage(
          who.name,
          who.steamId,
          `Steam sent the trade (${offerId}), but the website did not record it. The bot will retry the record, not a second trade.`
        );
        notify(message.title, message.description, 'error');
        return;
      }

      if (status === 'pending') await confirmOutgoing(offerId);
    }

    const result = await confirmRefund({ refundId: refund.id, tradeOfferId: offerId });
    if (!result.success) {
      const message = refundFailedMessage(
        who.name,
        who.steamId,
        `Steam sent the trade, but the website did not finish the refund. Offer ${offerId}.`
      );
      notify(message.title, message.description, 'error');
      return;
    }

    sentOffers.delete(refund.id);
    const message = refundSentMessage(who.name, who.steamId, `**${itemLabel}**`);
    notify(message.title, message.description, 'success');
    console.log(`[refunds] Sent offer ${offerId} for refund ${refund.id}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[refunds] Failed refund ${refund.id}:`, err);
    if (!offerId) await failRefund({ refundId: refund.id, error: reason });
    const message = refundFailedMessage(who.name, who.steamId, `Steam said: ${reason}`);
    notify(message.title, message.description, 'error');
  } finally {
    inFlight.delete(refund.id);
  }
}

export async function pollRefunds(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const refunds = await getPendingRefunds();
    if (!refunds || refunds.length === 0) return;
    console.log(`[refunds] ${refunds.length} pending refund(s)`);
    for (const refund of refunds) {
      await processRefund(refund);
    }
  } finally {
    polling = false;
  }
}
