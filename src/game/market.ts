import type { LootItemId, MarketOffer, MarketState, PerkEffects, RogueDaySave } from '@/types';
import { LOOT_BY_ID } from '@/data/loot';
import { createRng } from '@/utils/rng';
import { toLocalDateKey } from '@/utils/date';
import { addItem } from './loot';
import { applyGold } from './progression';
import { getEffects } from './perks';

/**
 * MARKNAD - a deterministic daily shop.
 *
 * The stock is derived purely from the local calendar date, so every load on
 * the same day shows the same goods at the same prices, with no server and no
 * stored roll. Purchases are recorded per offer id, so refreshing the page can
 * never restock a sold-out item.
 */

/** List prices, before any discount. Balanced against quest gold rewards. */
export const MARKET_PRICES: Partial<Record<LootItemId, [number, number]>> = {
  reroll_token: [35, 55],
  focus_rune: [50, 70],
  lucky_coin: [60, 80],
  streak_shield: [90, 120],
  xp_elixir: [110, 150],
  boss_key: [130, 175],
  mystery_chest: [175, 240],
};

/** Items that can appear in the daily stock, with relative frequency. */
const STOCK_TABLE: { id: LootItemId; weight: number; maxStock: number }[] = [
  { id: 'reroll_token', weight: 26, maxStock: 3 },
  { id: 'focus_rune', weight: 20, maxStock: 2 },
  { id: 'lucky_coin', weight: 18, maxStock: 2 },
  { id: 'streak_shield', weight: 15, maxStock: 2 },
  { id: 'xp_elixir', weight: 12, maxStock: 2 },
  { id: 'boss_key', weight: 10, maxStock: 1 },
  { id: 'mystery_chest', weight: 7, maxStock: 1 },
];

export const MARKET_SIZE_MIN = 5;
export const MARKET_SIZE_MAX = 6;

/**
 * Build today's stock. Pure and deterministic for a given date key.
 *
 * Prices exclude perk discounts - those are applied at purchase time so that
 * levelling up immediately changes what the player pays.
 */
export function buildDailyStock(dateKey: string): MarketOffer[] {
  const rng = createRng(`rogueday-market-${dateKey}`);
  const count = rng.int(MARKET_SIZE_MIN, MARKET_SIZE_MAX);

  const pool = [...STOCK_TABLE];
  const offers: MarketOffer[] = [];

  // One guaranteed featured bargain, always a single copy.
  const featuredIndex = weightedIndex(pool, rng.next());
  const featured = pool.splice(featuredIndex, 1)[0];
  offers.push(
    makeOffer(featured.id, dateKey, 0, {
      stock: 1,
      discountPercent: rng.int(25, 45),
      featured: true,
      rng,
    }),
  );

  for (let index = 1; index < count && pool.length > 0; index += 1) {
    const pick = weightedIndex(pool, rng.next());
    const entry = pool.splice(pick, 1)[0];
    offers.push(
      makeOffer(entry.id, dateKey, index, {
        stock: rng.int(1, entry.maxStock),
        discountPercent: rng.chance(0.3) ? rng.int(5, 20) : 0,
        featured: false,
        rng,
      }),
    );
  }

  return offers;
}

function weightedIndex(pool: { weight: number }[], roll: number): number {
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let value = roll * total;
  for (let index = 0; index < pool.length; index += 1) {
    value -= pool[index].weight;
    if (value <= 0) return index;
  }
  return pool.length - 1;
}

function makeOffer(
  itemId: LootItemId,
  dateKey: string,
  slot: number,
  options: {
    stock: number;
    discountPercent: number;
    featured: boolean;
    rng: ReturnType<typeof createRng>;
  },
): MarketOffer {
  const [min, max] = MARKET_PRICES[itemId] ?? [50, 90];
  const listPrice = options.rng.int(min, max);
  const price = Math.max(
    5,
    Math.round((listPrice * (100 - options.discountPercent)) / 100),
  );

  return {
    offerId: `${dateKey}:${slot}:${itemId}`,
    itemId,
    price,
    stock: options.stock,
    discountPercent: options.discountPercent,
    featured: options.featured,
  };
}

/* ------------------------------------------------------------------ */
/* Player-facing view                                                  */
/* ------------------------------------------------------------------ */

export interface MarketOfferView extends MarketOffer {
  /** Price after perk discounts. */
  finalPrice: number;
  remaining: number;
  soldOut: boolean;
  affordable: boolean;
}

export function getMarketView(
  save: RogueDaySave,
  now: Date = new Date(),
): { dateKey: string; offers: MarketOfferView[] } {
  const dateKey = toLocalDateKey(now);
  const effects = getEffects(save);
  const purchased = save.market?.date === dateKey ? (save.market.purchased ?? {}) : {};

  const offers = buildDailyStock(dateKey).map((offer) => {
    const bought = purchased[offer.offerId] ?? 0;
    const remaining = Math.max(0, offer.stock - bought);
    const finalPrice = applyDiscount(offer.price, effects);
    return {
      ...offer,
      finalPrice,
      remaining,
      soldOut: remaining <= 0,
      affordable: save.progression.gold >= finalPrice,
    };
  });

  return { dateKey, offers };
}

export function applyDiscount(price: number, effects: PerkEffects): number {
  return Math.max(1, Math.round(price * (1 - effects.merchantDiscount)));
}

/* ------------------------------------------------------------------ */
/* Purchasing                                                          */
/* ------------------------------------------------------------------ */

export interface PurchaseResult {
  ok: boolean;
  save: RogueDaySave;
  /** Swedish explanation, shown either as a reveal or an error. */
  message: string;
  itemId?: LootItemId;
  pricePaid?: number;
}

/**
 * Buy one copy of an offer. Everything is re-validated here rather than
 * trusting the view, so a stale button can never oversell or underpay.
 */
export function purchaseOffer(
  save: RogueDaySave,
  offerId: string,
  now: Date = new Date(),
): PurchaseResult {
  const dateKey = toLocalDateKey(now);
  const offer = buildDailyStock(dateKey).find((entry) => entry.offerId === offerId);

  if (!offer) {
    return { ok: false, save, message: 'Varan finns inte i dagens utbud längre.' };
  }

  const market: MarketState =
    save.market?.date === dateKey
      ? save.market
      : { date: dateKey, purchased: {} };

  const bought = market.purchased[offerId] ?? 0;
  if (bought >= offer.stock) {
    return { ok: false, save, message: 'Slutsåld för idag.' };
  }

  const price = applyDiscount(offer.price, getEffects(save));
  if (save.progression.gold < price) {
    return { ok: false, save, message: `Du har inte råd. ${price} guld krävs.` };
  }

  const item = LOOT_BY_ID[offer.itemId];

  const next: RogueDaySave = {
    ...save,
    progression: applyGold(save.progression, -price),
    inventory: addItem(save.inventory, offer.itemId, 1),
    market: {
      date: dateKey,
      purchased: { ...market.purchased, [offerId]: bought + 1 },
    },
    statistics: {
      ...save.statistics,
      totalGoldSpent: save.statistics.totalGoldSpent + price,
      marketPurchases: save.statistics.marketPurchases + 1,
    },
  };

  return {
    ok: true,
    save: next,
    message: `${item.name} köpt för ${price} guld.`,
    itemId: offer.itemId,
    pricePaid: price,
  };
}

/** Drop yesterday's purchase record when the day rolls over. */
export function reconcileMarket(market: MarketState, now: Date = new Date()): MarketState {
  const dateKey = toLocalDateKey(now);
  if (market?.date === dateKey) return market;
  return { date: dateKey, purchased: {} };
}
