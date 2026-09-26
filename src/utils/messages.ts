import type { ItemValidationFailure } from '@/services/items.ts';
import type { PaymentPlayer, PaymentSpot, PendingOrder, SitePlayer } from '@/services/website.ts';
import { env } from '@/env.ts';

export interface DiscordMessage {
  title: string;
  description: string;
}

function site(path: string): string {
  const base = env.MGE_API_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function link(label: string, url: string): string {
  const safe = label.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim() || 'link';
  return `[${safe}](${url})`;
}

function playerLink(player: PaymentPlayer | SitePlayer): string {
  return link(player.name, site(`/users/${player.steamId}`));
}

function steamLink(label: string, steamId: string): string {
  return link(label, `https://steamcommunity.com/profiles/${steamId}`);
}

function joinNames(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0] ?? ''} and ${parts[1] ?? ''}`;
  const last = parts[parts.length - 1] ?? '';
  return `${parts.slice(0, -1).join(', ')}, and ${last}`;
}

function itemPhrase(count: number, itemName: string): string {
  if (/key/i.test(itemName)) {
    return count === 1 ? '1 key' : `${count} keys`;
  }
  return count === 1 ? `1 ${itemName}` : `${count} ${itemName}`;
}

function spotsOf(order: PendingOrder): PaymentSpot[] {
  return order.spots ?? [];
}

function payerOf(order: PendingOrder): PaymentPlayer {
  return order.payer ?? { steamId: '', name: 'A player' };
}

function seasonLinks(order: PendingOrder): string {
  const spots = spotsOf(order);
  if (spots.length === 0) return 'their signup';
  return joinNames(spots.map((spot) => link(spot.seasonLabel, site(spot.leaguePath))));
}

function paidPhrase(order: PendingOrder): string {
  const spots = spotsOf(order);
  const counted = spots.reduce((sum, spot) => sum + spot.itemCount, 0);
  const count = counted > 0 ? counted : order.itemsRequired;
  const items = `**${itemPhrase(count, order.itemName || order.itemMarketHashName)}**`;
  if (order.moneyLabel) return `${items} (${order.moneyLabel})`;
  return items;
}

function teamLink(spot: PaymentSpot): string | null {
  if (!spot.teamName || !spot.teamPath) return null;
  return link(spot.teamName, site(spot.teamPath));
}

function describeSpot(order: PendingOrder, spot: PaymentSpot): string {
  const payer = payerOf(order);
  const season = link(spot.seasonLabel, site(spot.leaguePath));
  const team = teamLink(spot);
  const others = spot.players.filter((player) => player.steamId !== payer.steamId);
  const includesSelf = spot.players.some((player) => player.steamId === payer.steamId);
  const who =
    others.length === 0
      ? null
      : includesSelf
        ? joinNames([playerLink(payer), ...others.map(playerLink)])
        : joinNames(others.map(playerLink));

  if (!who && team) return `a spot on ${team} in ${season}`;
  if (!who) return season;
  if (team) return `${who} to play with ${team} in ${season}`;
  return `${who} to play ${season}`;
}

export function paymentReceivedMessage(order: PendingOrder): DiscordMessage {
  const payer = playerLink(payerOf(order));
  const paid = paidPhrase(order);
  const spots = spotsOf(order);

  if (spots.length === 0) {
    return {
      title: 'Payment received',
      description: `${payer} paid ${paid} for a signup.`
    };
  }

  if (spots.length === 1) {
    const spot = spots[0]!;
    return {
      title: 'Payment received',
      description: `${payer} paid ${paid} for ${describeSpot(order, spot)}.`
    };
  }

  const lines = spots.map((spot) => {
    const season = link(spot.seasonLabel, site(spot.leaguePath));
    const team = teamLink(spot);
    const people = joinNames(spot.players.map(playerLink));
    const who = team ? `${people} on ${team}` : people;
    const price = order.moneyLabel || !spot.moneyLabel ? '' : ` (${spot.moneyLabel})`;
    return `• ${who} in ${season}${price}`;
  });

  return {
    title: 'Payment received',
    description: `${payer} paid ${paid}:\n${lines.join('\n')}`
  };
}

export function ownerTradeMessage(player: SitePlayer | null, steamId: string): DiscordMessage {
  const who = player ? playerLink(player) : steamLink('The bot owner', steamId);
  return {
    title: 'Owner trade',
    description: `${who} traded with the bot. No signup was charged.`
  };
}

export function noSignupMessage(player: SitePlayer | null, steamId: string): DiscordMessage {
  const who = player ? playerLink(player) : steamLink('Someone', steamId);
  return {
    title: 'Trade declined',
    description: `${who} sent a trade, but they have no signup waiting.`
  };
}

export function websiteDownMessage(steamId: string): DiscordMessage {
  return {
    title: 'Trade declined',
    description: `${steamLink('Someone', steamId)} sent a trade, but the website did not answer, so it was declined. Their items were not taken.`
  };
}

export function expiredSignupMessage(order: PendingOrder): DiscordMessage {
  const many = spotsOf(order).length > 1;
  return {
    title: 'Trade declined',
    description: `${playerLink(payerOf(order))} sent a trade for ${seasonLinks(order)}, but ${many ? 'those signups expired' : 'that signup expired'}, so it was declined.`
  };
}

export function invalidTradeMessage(
  order: PendingOrder,
  failure: ItemValidationFailure
): DiscordMessage {
  const payer = playerLink(payerOf(order));
  const seasons = seasonLinks(order);
  const itemName = order.itemName || order.itemMarketHashName;
  const many = spotsOf(order).length > 1;

  if (failure.code === 'requests_items') {
    return {
      title: 'Trade declined',
      description: `${payer} asked the bot to send items while paying for ${seasons}, so the trade was declined.`
    };
  }

  if (failure.code === 'wrong_count') {
    const need = many ? 'Those signups need' : 'That signup needs';
    return {
      title: 'Trade declined',
      description: `${payer} sent **${itemPhrase(failure.got, itemName)}** for ${seasons}. ${need} **${itemPhrase(failure.expected, itemName)}**, so the trade was declined.`
    };
  }

  if (failure.code === 'wrong_item') {
    const need = many ? 'Those signups need' : 'That signup needs';
    return {
      title: 'Trade declined',
      description: `${payer} sent ${failure.got} for ${seasons}. ${need} ${failure.expected}, so the trade was declined.`
    };
  }

  return {
    title: 'Trade declined',
    description: `${payer} sent items from another game for ${seasons}, so the trade was declined.`
  };
}

function steamNote(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const clean = message.replace(/\s+/g, ' ').trim();
  if (!clean || clean === 'undefined') return '';
  const short = clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
  return ` Steam said: ${short}`;
}

export function acceptFailedMessage(order: PendingOrder, err: unknown): DiscordMessage {
  const many = spotsOf(order).length > 1;
  return {
    title: 'Trade not accepted',
    description: `${playerLink(payerOf(order))} tried to pay ${paidPhrase(order)} for ${seasonLinks(order)}, but Steam refused the trade. ${many ? 'Those signups are' : 'The signup is'} still unpaid.${steamNote(err)}`
  };
}

export function ownerAcceptFailedMessage(
  player: SitePlayer | null,
  steamId: string,
  err: unknown
): DiscordMessage {
  const who = player ? playerLink(player) : steamLink('The bot owner', steamId);
  return {
    title: 'Owner trade not accepted',
    description: `${who} sent a trade and Steam refused it.${steamNote(err)}`
  };
}

export function paymentRecordFailedMessage(order: PendingOrder): DiscordMessage {
  return {
    title: 'Signup not marked paid',
    description: `${playerLink(payerOf(order))} paid ${paidPhrase(order)} for ${seasonLinks(order)}, and Steam took the items, but the website did not mark the signup as paid. ${link('Open item payments', site('/admin/item-payments'))}.`
  };
}

export function botOnlineMessage(): DiscordMessage {
  return {
    title: 'Trade bot online',
    description: 'It is signed into Steam and can accept signup payments.'
  };
}

export function botRecoveredMessage(): DiscordMessage {
  return {
    title: 'Trade bot back online',
    description: 'It signed back into Steam and can accept signup payments again.'
  };
}

export function botReconnectingMessage(): DiscordMessage {
  return {
    title: 'Trade bot reconnecting',
    description: 'It lost its Steam login. Signup payments are paused until it signs back in.'
  };
}

export function sessionConflictMessage(retryMinutes: number): DiscordMessage {
  return {
    title: 'Trade bot signed in elsewhere',
    description: `Another session is using the bot account. It will try again every ${retryMinutes} minutes.`
  };
}

export function botShutDownMessage(): DiscordMessage {
  return {
    title: 'Trade bot shut down',
    description:
      'It could not sign back into Steam. Signup payments will not be accepted until it is restarted.'
  };
}

export function validationLog(failure: ItemValidationFailure): string {
  if (failure.code === 'requests_items') return 'offer asks the bot for items';
  if (failure.code === 'wrong_count')
    return `expected ${failure.expected} items, got ${failure.got}`;
  if (failure.code === 'wrong_app') return 'items are from another game';
  return `expected "${failure.expected}", got "${failure.got}"`;
}
