import type TradeOffer from 'steam-tradeoffer-manager/lib/classes/TradeOffer.js';
import type { PendingOrder } from '@/services/website.ts';

interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateOfferItems(offer: TradeOffer, order: PendingOrder): ValidationResult {
  if (offer.itemsToGive.length > 0) {
    return { valid: false, reason: 'Offer requests items from bot' };
  }

  if (offer.itemsToReceive.length !== order.itemsRequired) {
    return {
      valid: false,
      reason: `Expected ${order.itemsRequired} item(s), got ${offer.itemsToReceive.length}`
    };
  }

  for (const item of offer.itemsToReceive) {
    if (Number(item.appid) !== order.itemAppId) {
      return {
        valid: false,
        reason: `Item appid mismatch: expected ${order.itemAppId}, got ${item.appid}`
      };
    }

    if (item.market_hash_name !== order.itemMarketHashName) {
      return {
        valid: false,
        reason: `Item type mismatch: expected "${order.itemMarketHashName}", got "${item.market_hash_name}"`
      };
    }
  }

  return { valid: true };
}
