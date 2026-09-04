import { describe, expect, it } from 'vitest';
import { LEVEL_TITLES, MAX_LEVEL, nextTitle, titleForLevel, totalXpToReachLevel, xpForLevel } from '@/data/levels';
import { applyGold, applyXp, deriveLevelFromTotalXp, getLevelInfo } from './progression';
import { createDefaultProgression } from '@/persistence/defaults';

describe('level curve', () => {
  it('defines at least 50 levels', () => {
    expect(MAX_LEVEL).toBeGreaterThanOrEqual(50);
  });

  it('gets progressively more expensive', () => {
    for (let level = 1; level < MAX_LEVEL - 1; level += 1) {
      expect(xpForLevel(level + 1)).toBeGreaterThan(xpForLevel(level));
    }
  });

  it('starts gently and ends substantial', () => {
    expect(xpForLevel(1)).toBeLessThanOrEqual(200);
    expect(xpForLevel(49)).toBeGreaterThan(xpForLevel(1) * 10);
  });

  it('returns zero past the cap', () => {
    expect(xpForLevel(MAX_LEVEL)).toBe(0);
    expect(xpForLevel(MAX_LEVEL + 10)).toBe(0);
  });

  it('cumulative XP is monotonic', () => {
    let previous = 0;
    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      const total = totalXpToReachLevel(level);
      expect(total).toBeGreaterThan(previous);
      previous = total;
    }
  });
});

describe('titles', () => {
  it('starts at Skuggvandrare', () => {
    expect(titleForLevel(1)).toBe('Skuggvandrare');
  });

  it('matches the spec at the named milestones', () => {
    expect(titleForLevel(3)).toBe('Ärendekrigare');
    expect(titleForLevel(5)).toBe('Vardagsslaktare');
    expect(titleForLevel(8)).toBe('Nattvandrare');
    expect(titleForLevel(12)).toBe('Questjägare');
    expect(titleForLevel(16)).toBe('Kaosriddare');
    expect(titleForLevel(20)).toBe('Vardagslegend');
    expect(titleForLevel(25)).toBe('Mytisk Prokrastineringsjägare');
    expect(titleForLevel(30)).toBe('Ödesvandrare');
    expect(titleForLevel(40)).toBe('Verklighetsbändare');
    expect(titleForLevel(50)).toBe('RogueDay Legend');
  });

  it('holds the previous title between milestones', () => {
    expect(titleForLevel(21)).toBe(titleForLevel(20));
    expect(titleForLevel(4)).not.toBe(titleForLevel(5));
  });

  it('is data-driven and sorted', () => {
    for (let index = 1; index < LEVEL_TITLES.length; index += 1) {
      expect(LEVEL_TITLES[index].level).toBeGreaterThan(LEVEL_TITLES[index - 1].level);
    }
  });

  it('reports the next unreached title', () => {
    expect(nextTitle(1)?.level).toBe(2);
    expect(nextTitle(MAX_LEVEL)).toBeNull();
  });
});

describe('applyXp', () => {
  it('adds XP without levelling when below the threshold', () => {
    const result = applyXp(createDefaultProgression(), 10);

    expect(result.progression.xp).toBe(10);
    expect(result.progression.totalXp).toBe(10);
    expect(result.progression.level).toBe(1);
    expect(result.levelUps).toEqual([]);
  });

  it('levels up and carries the overflow', () => {
    const needed = xpForLevel(1);
    const result = applyXp(createDefaultProgression(), needed + 25);

    expect(result.progression.level).toBe(2);
    expect(result.progression.xp).toBe(25);
    expect(result.levelUps).toHaveLength(1);
    expect(result.levelUps[0].level).toBe(2);
    expect(result.levelUps[0].title).toBe(titleForLevel(2));
  });

  it('reports several level-ups from one big reward', () => {
    const needed = xpForLevel(1) + xpForLevel(2) + xpForLevel(3);
    const result = applyXp(createDefaultProgression(), needed);

    expect(result.progression.level).toBe(4);
    expect(result.levelUps.map((entry) => entry.level)).toEqual([2, 3, 4]);
  });

  it('never loses total XP', () => {
    let progression = createDefaultProgression();
    let expected = 0;

    for (let index = 0; index < 200; index += 1) {
      const amount = 37 + index;
      expected += amount;
      progression = applyXp(progression, amount).progression;
    }

    expect(progression.totalXp).toBe(expected);
  });

  it('stops levelling at the cap but keeps counting total XP', () => {
    let progression = { level: MAX_LEVEL, xp: 0, totalXp: 999999, gold: 0 };
    progression = applyXp(progression, 5000).progression;

    expect(progression.level).toBe(MAX_LEVEL);
    expect(progression.totalXp).toBe(1004999);
  });

  it('ignores negative XP', () => {
    const result = applyXp({ level: 3, xp: 40, totalXp: 500, gold: 0 }, -100);
    expect(result.progression.xp).toBe(40);
    expect(result.progression.totalXp).toBe(500);
  });
});

describe('gold', () => {
  it('adds and never goes below zero', () => {
    expect(applyGold(createDefaultProgression(), 50).gold).toBe(50);
    expect(applyGold({ level: 1, xp: 0, totalXp: 0, gold: 10 }, -50).gold).toBe(0);
  });
});

describe('getLevelInfo', () => {
  it('derives progress for the HUD', () => {
    const info = getLevelInfo({ level: 2, xp: 30, totalXp: 200, gold: 0 });

    expect(info.level).toBe(2);
    expect(info.xpIntoLevel).toBe(30);
    expect(info.xpForLevel).toBe(xpForLevel(2));
    expect(info.progress).toBeCloseTo(30 / xpForLevel(2), 5);
    expect(info.title).toBe(titleForLevel(2));
  });

  it('caps progress at one', () => {
    const info = getLevelInfo({ level: MAX_LEVEL, xp: 0, totalXp: 1, gold: 0 });
    expect(info.progress).toBe(1);
  });
});

describe('deriveLevelFromTotalXp', () => {
  it('round-trips the curve', () => {
    for (const level of [1, 2, 5, 10, 20, 35]) {
      const total = totalXpToReachLevel(level);
      expect(deriveLevelFromTotalXp(total).level).toBe(level);
      expect(deriveLevelFromTotalXp(total).xp).toBe(0);
    }
  });

  it('handles partial progress', () => {
    const total = totalXpToReachLevel(4) + 17;
    const derived = deriveLevelFromTotalXp(total);

    expect(derived.level).toBe(4);
    expect(derived.xp).toBe(17);
  });
});
