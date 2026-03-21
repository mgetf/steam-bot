import { env } from '@/env.ts';

export interface PendingOrder {
  orderNumber: string;
  itemAppId: number;
  itemMarketHashName: string;
  itemsRequired: number;
  teamId: number;
  expiresAt: string;
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
    const response = await fetch(
      `${env.MGE_API_URL}/api/v1/item-payments/pending/${steamId}`,
      { headers: authHeaders() }
    );

    if (!response.ok) {
      console.error(`[website] getPendingOrder failed: HTTP ${response.status} for steamId=${steamId}`);
      return null;
    }

    return (await response.json()) as PendingOrderResponse;
  } catch (err) {
    console.error(`[website] getPendingOrder error for steamId=${steamId}:`, err);
    return null;
  }
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

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
          console.warn(`[website] confirmPayment attempt ${attempt}/${MAX_RETRIES} failed: ${error} — retrying in ${delay / 1000}s...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        return { success: false, error };
      }

      return (await response.json()) as ConfirmPaymentResponse;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[website] confirmPayment attempt ${attempt}/${MAX_RETRIES} error: ${err} — retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      console.error(`[website] confirmPayment failed after ${MAX_RETRIES} attempts:`, err);
      return { success: false, error: String(err) };
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}
