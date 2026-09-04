import { describe, expect, it } from 'vitest';
import type { Rarity } from '@/types';
import { createRng } from '@/utils/rng';
import {
  RARITY_DAMAGE_MULTIPLIER,
  RARITY_LABELS,
  RARITY_MULTIPLIER,
  RARITY_ORDER,
  RARITY_WEIGHTS,
  maxRarity,
  rollRarity,
  rollTierRarity,
  upgradeRarity,
} from './rarity';

describe('rarity table', () => {
  it('matches the documented distribution weights', () => {
    expect(RARITY_WEIGHTS).toEqual({
      common: 45,
      uncommon: 28,
      rare: 17,
      epic: 8,
      legendary: 2,
    });
    expect(Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('has a Swedish label for every rarity', () => {
    for (const rarity of RARITY_ORDER) {
      expect(RARITY_LABELS[rarity].length).toBeGreaterThan(0);
    }
  });

  it('reward and damage multipliers rise with rarity', () => {
    for (let index = 1; index < RARITY_ORDER.length; index += 1) {
      const previous = RARITY_ORDER[index - 1];
      const current = RARITY_ORDER[index];
      expect(RARITY_MULTIPLIER[current]).toBeGreaterThan(RARITY_MULTIPLIER[previous]);
      expect(RARITY_DAMAGE_MULTIPLIER[current]).toBeGreaterThan(
        RARITY_DAMAGE_MULTIPLIER[previous],
      );
    }
  });
});

describe('rollRarity', () => {
  it('lands within roughly the documented probabilities', () => {
    const counts: Record<Rarity, number> = {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    };

    const rng = createRng('distribution');
    const rolls = 40000;
    for (let index = 0; index < rolls; index += 1) {
      counts[rollRarity(rng)] += 1;
    }

    // Generous tolerance: this asserts the shape of the table, not exact luck.
    expect(counts.common / rolls).toBeGreaterThan(0.4);
    expect(counts.common / rolls).toBeLessThan(0.5);
    expect(counts.uncommon / rolls).toBeGreaterThan(0.24);
    expect(counts.uncommon / rolls).toBeLessThan(0.32);
    expect(counts.rare / rolls).toBeGreaterThan(0.14);
    expect(counts.rare / rolls).toBeLessThan(0.2);
    expect(counts.epic / rolls).toBeGreaterThan(0.06);
    expect(counts.epic / rolls).toBeLessThan(0.1);
    expect(counts.legendary / rolls).toBeGreaterThan(0.012);
    expect(counts.legendary / rolls).toBeLessThan(0.03);
  });

  it('is deterministic for a seeded generator', () => {
    expect(rollRarity(createRng('x'))).toBe(rollRarity(createRng('x')));
  });
});

describe('rarity helpers', () => {
  it('upgrades and clamps at legendary', () => {
    expect(upgradeRarity('common', 1)).toBe('uncommon');
    expect(upgradeRarity('common', 2)).toBe('rare');
    expect(upgradeRarity('legendary', 3)).toBe('legendary');
    expect(upgradeRarity('common', -5)).toBe('common');
  });

  it('picks the higher of two rarities', () => {
    expect(maxRarity('common', 'epic')).toBe('epic');
    expect(maxRarity('legendary', 'rare')).toBe('legendary');
    expect(maxRarity('rare', 'rare')).toBe('rare');
  });
});

describe('tier rarity floors', () => {
  it('never returns below the quest base rarity for safe', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const result = rollTierRarity('safe', 'rare', createRng(`s-${seed}`));
      expect(RARITY_ORDER.indexOf(result)).toBeGreaterThanOrEqual(RARITY_ORDER.indexOf('rare'));
    }
  });

  it('wild is at least one step above the base', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const result = rollTierRarity('wild', 'common', createRng(`w-${seed}`));
      expect(RARITY_ORDER.indexOf(result)).toBeGreaterThanOrEqual(1);
    }
  });

  it('dangerous is at least two steps above the base', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const result = rollTierRarity('dangerous', 'common', createRng(`d-${seed}`));
      expect(RARITY_ORDER.indexOf(result)).toBeGreaterThanOrEqual(2);
    }
  });

  it('dangerous averages a higher rarity than safe', () => {
    let safeTotal = 0;
    let dangerousTotal = 0;

    for (let seed = 0; seed < 400; seed += 1) {
      safeTotal += RARITY_ORDER.indexOf(rollTierRarity('safe', 'common', createRng(`a-${seed}`)));
      dangerousTotal += RARITY_ORDER.indexOf(
        rollTierRarity('dangerous', 'common', createRng(`a-${seed}`)),
      );
    }

    expect(dangerousTotal).toBeGreaterThan(safeTotal);
  });
});
