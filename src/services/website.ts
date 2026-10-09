import { env } from '@/env.ts';

export interface PaymentPlayer {
  steamId: string;
  name: string;
}

export interface PaymentSpot {
  seasonLabel: string;
  leaguePath: string;
  teamName: string | null;
  teamPath: string | null;
  itemCount: number;
  moneyLabel: string | null;
  players: PaymentPlayer[];
}

export interface PendingOrder {
  orderNumber: string;
  itemAppId: number;
  itemMarketHashName: string;
  itemName?: string;
  itemsRequired: number;
  teamId: number;
  expiresAt: string;
  payer?: PaymentPlayer;
  moneyLabel?: string | null;
  spots?: PaymentSpot[];
}

export interface SitePlayer {
  steamId: string;
  name: string;
}

interface PendingOrderResponse {
  hasPending: boolean;
  order?: PendingOrder;
}

interface ConfirmPaymentData {
  orderNumber: string;
  tradeOfferId: string;
  itemsReceived: number;
  senderSteamId: string;
}

interface ConfirmPaymentResponse {
  success: boolean;
  error?: string;
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.MGE_API_KEY}`
  };
}

export async function getPendingOrder(steamId: string): Promise<PendingOrderResponse | null> {
  try {
    const response = await fetch(`${env.MGE_API_URL}/api/v1/item-payments/pending/${steamId}`, {
      headers: authHeaders()
    });

    if (!response.ok) {
      console.error(
        `[website] getPendingOrder failed: HTTP ${response.status} for steamId=${steamId}`
      );
      return null;
    }

    const body = (await response.json()) as PendingOrderResponse;
    if (body.order) {
      body.order = {
        ...body.order,
        itemName: body.order.itemName || body.order.itemMarketHashName,
        payer: body.order.payer ?? { steamId, name: 'A player' },
        moneyLabel: body.order.moneyLabel ?? null,
        spots: body.order.spots ?? []
      };
    }
    return body;
  } catch (err) {
    console.error(`[website] getPendingOrder error for steamId=${steamId}:`, err);
    return null;
  }
}

export async function getSitePlayer(steamId: string): Promise<SitePlayer | null> {
  try {
    const response = await fetch(`${env.MGE_API_URL}/api/v1/users/${steamId}`, {
      headers: authHeaders()
    });

    if (!response.ok) return null;

    const body = (await response.json()) as { steamId?: string; steamUsername?: string };
    if (!body.steamId || !body.steamUsername) return null;
    return { steamId: body.steamId, name: body.steamUsername };
  } catch (err) {
    console.error(`[website] getSitePlayer error for steamId=${steamId}:`, err);
    return null;
  }
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

export interface PendingRefund {
  id: number;
  playerSteamId: string;
  playerName: string;
  tradeOfferUrl: string;
  itemAppId: number;
  itemMarketHashName: string;
  itemName: string;
  itemQuantity: number;
  tradeOfferId: string | null;
}

export async function getPendingRefunds(): Promise<PendingRefund[] | null> {
  try {
    const response = await fetch(`${env.MGE_API_URL}/api/v1/item-refunds/pending`, {
      headers: authHeaders()
    });
    if (!response.ok) {
      console.error(`[website] getPendingRefunds failed: HTTP ${response.status}`);
      return null;
    }
    const body = (await response.json()) as { refunds?: PendingRefund[] };
    return body.refunds ?? [];
  } catch (err) {
    console.error('[website] getPendingRefunds error:', err);
    return null;
  }
}

export async function markRefundSent(data: {
  refundId: number;
  tradeOfferId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${env.MGE_API_URL}/api/v1/item-refunds/sent`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }
    return (await response.json()) as { success: boolean; error?: string };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function confirmRefund(data: {
  refundId: number;
  tradeOfferId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${env.MGE_API_URL}/api/v1/item-refunds/confirm`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }
    return (await response.json()) as { success: boolean; error?: string };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function failRefund(data: { refundId: number; error: string }): Promise<void> {
  try {
    await fetch(`${env.MGE_API_URL}/api/v1/item-refunds/fail`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
  } catch (err) {
    console.error(`[website] failRefund error for ${data.refundId}:`, err);
  }
}

export async function confirmPayment(data: ConfirmPaymentData): Promise<ConfirmPaymentResponse> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${env.MGE_API_URL}/api/v1/item-payments/confirm`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const error = `HTTP ${response.status}: ${text}`;

        if (attempt < MAX_RETRIES && response.status >= 500) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(
            `[website] confirmPayment attempt ${attempt}/${MAX_RETRIES} failed: ${error} — retrying in ${delay / 1000}s...`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        return { success: false, error };
      }

      return (await response.json()) as ConfirmPaymentResponse;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[website] confirmPayment attempt ${attempt}/${MAX_RETRIES} error: ${err} — retrying in ${delay / 1000}s...`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      console.error(`[website] confirmPayment failed after ${MAX_RETRIES} attempts:`, err);
      return { success: false, error: String(err) };
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}
