import type { LootItem, LootItemId, Rarity } from '@/types';

export const LOOT_ITEMS: LootItem[] = [
  {
    id: 'reroll_token',
    name: 'OMKASTNINGSMYNT',
    description: 'Ger dig en extra omkastning när du söker uppdrag.',
    icon: '🎲',
    rarity: 'common',
    isChest: false,
    usable: false,
  },
  {
    id: 'streak_shield',
    name: 'SVITSKÖLD',
    description: 'Skyddar din svit en dag om du missar att spela.',
    icon: '🛡️',
    rarity: 'uncommon',
    isChest: false,
    usable: false,
  },
  {
    id: 'lucky_coin',
    name: 'TURMYNT',
    description: 'Ökar chansen till loot på nästa avklarade uppdrag.',
    icon: '🪙',
    rarity: 'uncommon',
    isChest: false,
    usable: true,
  },
  {
    id: 'xp_elixir',
    name: 'XP-ELIXIR',
    description: '+25% XP på nästa avklarade uppdrag.',
    icon: '🧪',
    rarity: 'rare',
    isChest: false,
    usable: true,
  },
  {
    id: 'boss_key',
    name: 'BOSSNYCKEL',
    description: 'Dubbel bosskada på nästa avklarade uppdrag.',
    icon: '🗝️',
    rarity: 'rare',
    isChest: false,
    usable: true,
  },
  {
    id: 'focus_rune',
    name: 'FOKUSRUNA',
    description: '+15% guld på nästa avklarade uppdrag.',
    icon: '🔮',
    rarity: 'uncommon',
    isChest: false,
    usable: true,
  },
  {
    id: 'gold_pouch',
    name: 'GULDPUNG',
    description: 'Öppnas till en handfull guld.',
    icon: '💰',
    rarity: 'common',
    isChest: true,
    usable: true,
  },
  {
    id: 'mystery_chest',
    name: 'MYSTERIEKISTA',
    description: 'Innehåller ett slumpmässigt föremål.',
    icon: '🎁',
    rarity: 'rare',
    isChest: true,
    usable: true,
  },
  {
    id: 'epic_chest',
    name: 'EPISK KISTA',
    description: 'Innehåller två bra föremål.',
    icon: '📦',
    rarity: 'epic',
    isChest: true,
    usable: true,
  },
  {
    id: 'legendary_chest',
    name: 'LEGENDARISK KISTA',
    description: 'Innehåller tre värdefulla föremål och en hög med guld.',
    icon: '🏆',
    rarity: 'legendary',
    isChest: true,
    usable: true,
  },
];

export const LOOT_BY_ID: Record<LootItemId, LootItem> = Object.fromEntries(
  LOOT_ITEMS.map((item) => [item.id, item]),
) as Record<LootItemId, LootItem>;

export function getLootItem(id: LootItemId): LootItem {
  return LOOT_BY_ID[id];
}

/** Base drop chance per quest rarity, before Lucky Coin. */
export const LOOT_CHANCE_BY_RARITY: Record<Rarity, number> = {
  common: 0.12,
  uncommon: 0.2,
  rare: 0.32,
  epic: 0.55,
  legendary: 1,
};

/** Weighted drop table for a normal quest reward. */
export const DROP_TABLE: { id: LootItemId; weight: number }[] = [
  { id: 'reroll_token', weight: 30 },
  { id: 'gold_pouch', weight: 22 },
  { id: 'streak_shield', weight: 14 },
  { id: 'focus_rune', weight: 12 },
  { id: 'lucky_coin', weight: 10 },
  { id: 'xp_elixir', weight: 7 },
  { id: 'boss_key', weight: 5 },
  { id: 'mystery_chest', weight: 4 },
  { id: 'epic_chest', weight: 1.5 },
  { id: 'legendary_chest', weight: 0.5 },
];

/** What a chest can contain. Chests never contain themselves. */
export const CHEST_TABLES: Record<LootItemId, { id: LootItemId; weight: number }[]> = {
  gold_pouch: [{ id: 'gold_pouch', weight: 1 }],
  mystery_chest: [
    { id: 'reroll_token', weight: 30 },
    { id: 'streak_shield', weight: 20 },
    { id: 'focus_rune', weight: 18 },
    { id: 'lucky_coin', weight: 15 },
    { id: 'xp_elixir', weight: 10 },
    { id: 'boss_key', weight: 7 },
  ],
  epic_chest: [
    { id: 'xp_elixir', weight: 26 },
    { id: 'boss_key', weight: 22 },
    { id: 'streak_shield', weight: 20 },
    { id: 'lucky_coin', weight: 18 },
    { id: 'reroll_token', weight: 14 },
  ],
  legendary_chest: [
    { id: 'boss_key', weight: 25 },
    { id: 'xp_elixir', weight: 25 },
    { id: 'streak_shield', weight: 20 },
    { id: 'lucky_coin', weight: 15 },
    { id: 'reroll_token', weight: 15 },
  ],
  // Non-chest items are never opened; empty tables keep the record total.
  reroll_token: [],
  streak_shield: [],
  lucky_coin: [],
  xp_elixir: [],
  boss_key: [],
  focus_rune: [],
};

/** Gold granted when a gold pouch or chest yields coins. */
export const CHEST_GOLD: Record<string, [number, number]> = {
  gold_pouch: [15, 45],
  legendary_chest: [80, 160],
};
