import type TradeOffer from 'steam-tradeoffer-manager/lib/classes/TradeOffer.js';
import type { PendingOrder } from '@/services/website.ts';

export type ItemValidationFailure =
  | { code: 'requests_items' }
  | { code: 'wrong_count'; expected: number; got: number }
  | { code: 'wrong_app' }
  | { code: 'wrong_item'; expected: string; got: string };

interface ValidationResult {
  valid: boolean;
  failure?: ItemValidationFailure;
}

export function validateOfferItems(offer: TradeOffer, order: PendingOrder): ValidationResult {
  if (offer.itemsToGive.length > 0) {
    return { valid: false, failure: { code: 'requests_items' } };
  }

  if (offer.itemsToReceive.length !== order.itemsRequired) {
    return {
      valid: false,
      failure: {
        code: 'wrong_count',
        expected: order.itemsRequired,
        got: offer.itemsToReceive.length
      }
    };
  }

  for (const item of offer.itemsToReceive) {
    if (Number(item.appid) !== order.itemAppId) {
      return { valid: false, failure: { code: 'wrong_app' } };
    }

    if (item.market_hash_name !== order.itemMarketHashName) {
      return {
        valid: false,
        failure: {
          code: 'wrong_item',
          expected: order.itemName || order.itemMarketHashName,
          got: item.market_hash_name ?? 'unknown item'
        }
      };
    }
  }

  return { valid: true };
}
