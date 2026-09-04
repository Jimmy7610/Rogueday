import type { ActiveBuffs, InventoryEntry, LootItemId, Rarity } from '@/types';
import { CHEST_GOLD, CHEST_TABLES, DROP_TABLE, LOOT_CHANCE_BY_RARITY } from '@/data/loot';
import { randomRng, weightedPick, type Rng } from '@/utils/rng';

/** Lucky Coin adds a flat bonus to the roll. */
export const LUCKY_COIN_BONUS = 0.25;

export function rollLootChance(rarity: Rarity, luckyCoin: boolean, perkBonus = 0): number {
  const base = LOOT_CHANCE_BY_RARITY[rarity];
  return Math.min(1, base + (luckyCoin ? LUCKY_COIN_BONUS : 0) + Math.max(0, perkBonus));
}

export interface LootRollResult {
  items: LootItemId[];
  gold: number;
}

/** Roll a quest completion's loot. Returns an empty result on a miss. */
export function rollQuestLoot(
  rarity: Rarity,
  luckyCoin: boolean,
  rng: Rng = randomRng,
  perkBonus = 0,
): LootRollResult {
  const chance = rollLootChance(rarity, luckyCoin, perkBonus);
  if (!rng.chance(chance)) return { items: [], gold: 0 };

  const drop = weightedPick(
    DROP_TABLE.map((entry) => ({ ...entry })),
    rng,
  );

  return { items: [drop.id], gold: 0 };
}

/** Open a chest into its contents. */
export function openChest(chestId: LootItemId, rng: Rng = randomRng): LootRollResult {
  const table = CHEST_TABLES[chestId] ?? [];

  if (chestId === 'gold_pouch') {
    const [min, max] = CHEST_GOLD.gold_pouch;
    return { items: [], gold: rng.int(min, max) };
  }

  const counts: Record<string, number> = {
    mystery_chest: 1,
    epic_chest: 2,
    legendary_chest: 3,
  };
  const drawCount = counts[chestId] ?? 1;

  const items: LootItemId[] = [];
  for (let i = 0; i < drawCount && table.length > 0; i += 1) {
    items.push(weightedPick(table.map((entry) => ({ ...entry })), rng).id);
  }

  let gold = 0;
  if (chestId === 'legendary_chest') {
    const [min, max] = CHEST_GOLD.legendary_chest;
    gold = rng.int(min, max);
  }

  return { items, gold };
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export function addItem(inventory: InventoryEntry[], itemId: LootItemId, count = 1): InventoryEntry[] {
  const existing = inventory.find((entry) => entry.itemId === itemId);
  if (existing) {
    return inventory.map((entry) =>
      entry.itemId === itemId ? { ...entry, count: entry.count + count } : entry,
    );
  }
  return [...inventory, { itemId, count }];
}

export function addItems(inventory: InventoryEntry[], itemIds: LootItemId[]): InventoryEntry[] {
  return itemIds.reduce((acc, itemId) => addItem(acc, itemId), inventory);
}

export function removeItem(
  inventory: InventoryEntry[],
  itemId: LootItemId,
  count = 1,
): InventoryEntry[] {
  return inventory
    .map((entry) => (entry.itemId === itemId ? { ...entry, count: entry.count - count } : entry))
    .filter((entry) => entry.count > 0);
}

export function countItem(inventory: InventoryEntry[], itemId: LootItemId): number {
  return inventory.find((entry) => entry.itemId === itemId)?.count ?? 0;
}

export function hasItem(inventory: InventoryEntry[], itemId: LootItemId): boolean {
  return countItem(inventory, itemId) > 0;
}

/* ------------------------------------------------------------------ */
/* Buffs                                                               */
/* ------------------------------------------------------------------ */

export const XP_ELIXIR_MULTIPLIER = 1.25;
export const FOCUS_RUNE_GOLD_MULTIPLIER = 1.15;
export const BOSS_KEY_DAMAGE_MULTIPLIER = 2;
export const SHRINE_XP_MULTIPLIER = 1.3;

/** Which buff a usable item activates. Chests are handled separately. */
export const BUFF_BY_ITEM: Partial<Record<LootItemId, keyof ActiveBuffs>> = {
  xp_elixir: 'xpElixir',
  lucky_coin: 'luckyCoin',
  boss_key: 'bossKey',
  focus_rune: 'focusRune',
};

/**
 * Consume the one-shot buffs after a completion.
 *
 * `keepBossKey` comes from the Slayer perk NYCKELSMED, which lets a Boss Key
 * survive one extra qualifying hit.
 */
export function consumeBuffs(buffs: ActiveBuffs, keepBossKey = false): ActiveBuffs {
  return {
    xpElixir: false,
    luckyCoin: false,
    bossKey: keepBossKey,
    focusRune: false,
    shrineXpBonusQuests: Math.max(0, buffs.shrineXpBonusQuests - 1),
  };
}

export function hasAnyBuff(buffs: ActiveBuffs): boolean {
  return (
    buffs.xpElixir ||
    buffs.luckyCoin ||
    buffs.bossKey ||
    buffs.focusRune ||
    buffs.shrineXpBonusQuests > 0
  );
}
