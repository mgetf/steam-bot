import type TradeOffer from 'steam-tradeoffer-manager/lib/classes/TradeOffer.js';
import { community } from '@/bot.ts';
import { env } from '@/env.ts';
import { getPendingOrder, confirmPayment } from '@/services/website.ts';
import { validateOfferItems } from '@/services/items.ts';
import { notify } from '@/utils/discord.ts';

function acceptOffer(offer: TradeOffer): Promise<string> {
  return new Promise((resolve, reject) => {
    offer.accept((err, status) => {
      if (err) reject(err);
      else resolve(status);
    });
  });
}

function declineOffer(offer: TradeOffer): Promise<void> {
  return new Promise((resolve, reject) => {
    offer.decline((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function confirmObjectOnce(offerId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    community.acceptConfirmationForObject(env.STEAM_IDENTITY_SECRET, offerId, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function confirmObject(offerId: string, retries = 3, delayMs = 3000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await confirmObjectOnce(offerId);
      return;
    } catch (err) {
      if (attempt < retries) {
        console.log(`[trades] Confirmation attempt ${attempt}/${retries} failed for ${offerId}, retrying in ${delayMs / 1000}s...`);
        await sleep(delayMs);
      } else {
        throw err;
      }
    }
  }
}

export async function handleNewOffer(offer: TradeOffer): Promise<void> {
  const steamId = offer.partner.getSteamID64();
  const offerId = offer.id ?? 'unknown';

  console.log(`[trades] Incoming offer ${offerId} from ${steamId}`);

  const decline = async (reason: string) => {
    console.log(`[trades] Declining offer ${offerId} from ${steamId}: ${reason}`);
    notify('Trade Declined', `Offer \`${offerId}\` from \`${steamId}\`\n${reason}`, 'warning');
    try {
      await declineOffer(offer);
    } catch (err) {
      console.error(`[trades] Failed to decline offer ${offerId}:`, err);
    }
  };

  const response = await getPendingOrder(steamId);

  if (!response) {
    await decline('website API unreachable');
    return;
  }

  if (!response.hasPending || !response.order) {
    await decline('no pending order found');
    return;
  }

  const order = response.order;

  if (new Date(order.expiresAt) < new Date()) {
    await decline('order has expired');
    return;
  }

  const validation = validateOfferItems(offer, order);
  if (!validation.valid) {
    await decline(validation.reason ?? 'item validation failed');
    return;
  }

  console.log(`[trades] Accepting offer ${offerId} for order ${order.orderNumber}`);

  try {
    const status = await acceptOffer(offer);
    console.log(`[trades] Offer ${offerId} accepted (status: ${status})`);
  } catch (err) {
    console.error(`[trades] Failed to accept offer ${offerId}:`, err);
    notify('Trade Accept Failed', `Offer \`${offerId}\` for **${order.orderNumber}**\n${err instanceof Error ? err.message : String(err)}`, 'error');
    return;
  }

  if (offer.itemsToGive.length > 0) {
    try {
      await confirmObject(offerId);
      console.log(`[trades] Offer ${offerId} confirmed via identity_secret`);
    } catch (err) {
      console.error(`[trades] Failed to confirm offer ${offerId}:`, err);
    }
  }

  const result = await confirmPayment({
    orderNumber: order.orderNumber,
    tradeOfferId: offerId,
    itemsReceived: offer.itemsToReceive.length,
    senderSteamId: steamId
  });

  if (result.success) {
    console.log(`[trades] Payment confirmed for order ${order.orderNumber}`);
    notify('Trade Accepted', `Offer \`${offerId}\` — payment confirmed for **${order.orderNumber}**\n${offer.itemsToReceive.length} item(s) from \`${steamId}\``, 'success');
  } else {
    console.error(`[trades] Payment confirmation failed for order ${order.orderNumber}: ${result.error}`);
    notify('Payment Failed', `Offer \`${offerId}\` accepted but payment confirmation failed for **${order.orderNumber}**\n${result.error}`, 'error');
  }
}
