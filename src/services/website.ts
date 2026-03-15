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

export async function confirmPayment(data: ConfirmPaymentData): Promise<ConfirmPaymentResponse> {
  const attempt = async (): Promise<ConfirmPaymentResponse> => {
    const response = await fetch(`${env.MGE_API_URL}/api/v1/item-payments/confirm`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }

    return (await response.json()) as ConfirmPaymentResponse;
  };

  try {
    const result = await attempt();
    if (!result.success) {
      console.warn(`[website] confirmPayment attempt 1 failed: ${result.error} — retrying...`);
      await new Promise((r) => setTimeout(r, 2000));
      return await attempt();
    }
    return result;
  } catch (err) {
    console.error('[website] confirmPayment error:', err);
    return { success: false, error: String(err) };
  }
}
