import type { ChoiceTier, Rarity } from '@/types';
import type { Rng } from '@/utils/rng';

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Design target from the spec: 45 / 28 / 17 / 8 / 2. */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 45,
  uncommon: 28,
  rare: 17,
  epic: 8,
  legendary: 2,
};

export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'VANLIG',
  uncommon: 'OVANLIG',
  rare: 'SÄLLSYNT',
  epic: 'EPISK',
  legendary: 'LEGENDARISK',
};

/** Reward multipliers by rarity. */
export const RARITY_MULTIPLIER: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.2,
  rare: 1.5,
  epic: 2,
  legendary: 3,
};

/** Boss damage multipliers by rarity. */
export const RARITY_DAMAGE_MULTIPLIER: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.15,
  rare: 1.35,
  epic: 1.6,
  legendary: 1.9,
};

export function rollRarity(rng: Rng): Rarity {
  const total = RARITY_ORDER.reduce((sum, rarity) => sum + RARITY_WEIGHTS[rarity], 0);
  let roll = rng.next() * total;
  for (const rarity of RARITY_ORDER) {
    roll -= RARITY_WEIGHTS[rarity];
    if (roll <= 0) return rarity;
  }
  return 'common';
}

export function rarityIndex(rarity: Rarity): number {
  return RARITY_ORDER.indexOf(rarity);
}

export function upgradeRarity(rarity: Rarity, steps: number): Rarity {
  const index = Math.min(RARITY_ORDER.length - 1, Math.max(0, rarityIndex(rarity) + steps));
  return RARITY_ORDER[index];
}

export function maxRarity(a: Rarity, b: Rarity): Rarity {
  return rarityIndex(a) >= rarityIndex(b) ? a : b;
}

/**
 * Each choice tier rolls its own rarity, with the riskier tiers guaranteed a
 * floor so WILD and DANGEROUS genuinely feel better than SAFE.
 */
export function rollTierRarity(tier: ChoiceTier, baseRarity: Rarity, rng: Rng): Rarity {
  const rolled = rollRarity(rng);

  if (tier === 'safe') {
    return maxRarity(baseRarity, rolled);
  }

  if (tier === 'wild') {
    const floor = upgradeRarity(baseRarity, 1);
    return maxRarity(floor, upgradeRarity(rolled, 1));
  }

  // dangerous
  const floor = upgradeRarity(baseRarity, 2);
  return maxRarity(floor, upgradeRarity(rolled, 2));
}

/** Extra reward multiplier applied on top of rarity, per tier. */
export const TIER_REWARD_MULTIPLIER: Record<ChoiceTier, number> = {
  safe: 1,
  wild: 1.25,
  dangerous: 1.6,
};

export const TIER_LABELS: Record<ChoiceTier, string> = {
  safe: 'TRYGGT',
  wild: 'VILT',
  dangerous: 'FARLIGT',
};

export const TIER_DESCRIPTIONS: Record<ChoiceTier, string> = {
  safe: 'Normal svårighet och belöning.',
  wild: 'Ovanligare uppdrag, bättre belöning.',
  dangerous: 'Högsta belöningen. Och den märkligaste utmaningen.',
};
