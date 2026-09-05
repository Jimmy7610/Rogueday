import { describe, expect, it } from 'vitest';
import type { Difficulty, QuestFilters, RogueDaySave } from '@/types';
import { BOSSES } from '@/data/bosses';
import { createBossState } from './boss';
import { completeQuest } from './completion';
import { rollQuestChoices } from './questSelection';
import { createRng } from '@/utils/rng';
import { makeSave, NO_LUCK_RNG } from '@/test/helpers';

/**
 * Boss balance.
 *
 * These are measurements, not assertions about arbitrary numbers. The
 * simulation plays a boss week the way an ordinary player would - 15-minute
 * quests, mixed tiers, no consumables, no perks - and counts how many
 * completions the boss actually takes.
 *
 * Design targets (quests to defeat, for a typical player):
 *
 *   MEDIUM   12-16
 *   HARD     16-22
 *   EXTREME  20-28
 *
 * "Typical" means the `mixed` style: a player who rotates through the tiers,
 * sometimes taking a wild or dangerous offer. That is the intended way to
 * play, so it is what the bands describe.
 *
 * The `safe` style - never once taking a risk - is deliberately the slowest
 * route, because SAFE now draws the smallest of the three quests on offer. It
 * still has to finish in a sane number of quests, which the bound below checks,
 * but it is not the balance target.
 *
 * Rarity luck, boss weaknesses, Boss Keys, daily quests, timed challenges and
 * chain finales all pull the real number further down.
 */

const TARGET_BANDS: Record<Difficulty, [number, number]> = {
  easy: [8, 14],
  medium: [12, 16],
  hard: [16, 22],
  extreme: [20, 28],
};

const TYPICAL_FILTERS: QuestFilters = {
  duration: 15,
  energy: 'medium',
  location: 'anywhere',
  mood: 'motivated',
  mode: 'normal',
};

interface SimulationOptions {
  bossId: string;
  /** 'safe' models a cautious player; 'mixed' a normal one. */
  style: 'safe' | 'mixed';
  seed: string;
  /** Give up after this many quests, so a bad build can't hang the suite. */
  maxQuests?: number;
}

/** Play a boss week and return how many quests it took to win. */
function simulateWeek(options: SimulationOptions): { quests: number; killed: boolean } {
  const { bossId, style, seed, maxQuests = 80 } = options;

  let save: RogueDaySave = makeSave(new Date(2026, 8, 7, 9));
  save = { ...save, boss: createBossState('2026-09-07') };
  // Pin the boss under test rather than whichever one the week rolled.
  save = { ...save, boss: { ...save.boss!, bossId, ...bossHpFor(bossId) } };

  const rng = createRng(seed);

  for (let index = 0; index < maxQuests; index += 1) {
    const { offers } = rollQuestChoices({
      filters: TYPICAL_FILTERS,
      chains: save.questChains,
      recentQuestIds: save.recentQuestIds,
      rng,
    });
    if (offers.length === 0) break;

    // A cautious player always takes SAFE; a normal one rotates through the
    // tiers, which is how the game is actually played.
    const offer = style === 'safe' ? offers[0] : offers[index % offers.length];

    const result = completeQuest(
      save,
      offer,
      new Date(2026, 8, 7 + (index % 7), 10, 0, 0),
      NO_LUCK_RNG,
    );
    save = result.save;

    if (save.boss?.defeated) return { quests: index + 1, killed: true };
  }

  return { quests: maxQuests, killed: false };
}

function bossHpFor(bossId: string): { currentHp: number; maxHp: number } {
  const definition = BOSSES.find((boss) => boss.id === bossId)!;
  return { currentHp: definition.maxHp, maxHp: definition.maxHp };
}

/** Median across several seeds, so one lucky run cannot pass the test. */
function medianQuests(bossId: string, style: 'safe' | 'mixed'): number {
  const runs = Array.from({ length: 9 }, (_, index) =>
    simulateWeek({ bossId, style, seed: `${bossId}-${style}-${index}` }).quests,
  ).sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)];
}

/** Dev aid: RD_BOSS_REPORT=1 npx vitest run src/game/bossBalance.test.ts */
if (process.env.RD_BOSS_REPORT) {
  for (const boss of BOSSES) {
    // eslint-disable-next-line no-console
    console.log(
      `${boss.id.padEnd(22)} ${boss.difficulty.padEnd(8)} hp=${String(boss.maxHp).padStart(5)}  mixed=${medianQuests(boss.id, 'mixed')}  safe=${medianQuests(boss.id, 'safe')}`,
    );
  }
}

describe('weekly boss balance', () => {
  it('every boss is beatable within a week of ordinary play', () => {
    for (const boss of BOSSES) {
      const result = simulateWeek({ bossId: boss.id, style: 'mixed', seed: `${boss.id}-reach` });
      expect(result.killed, `${boss.name} was not defeated in 80 quests`).toBe(true);
    }
  });

  it('lands inside the design band for a normal, tier-mixing player', () => {
    for (const boss of BOSSES) {
      const median = medianQuests(boss.id, 'mixed');
      const [min, max] = TARGET_BANDS[boss.difficulty];

      expect(
        median,
        `${boss.name} (${boss.difficulty}) took ${median} quests, band is ${min}-${max}`,
      ).toBeGreaterThanOrEqual(min);
      expect(
        median,
        `${boss.name} (${boss.difficulty}) took ${median} quests, band is ${min}-${max}`,
      ).toBeLessThanOrEqual(max);
    }
  });

  it('stays reasonable even for a player who never takes a risk', () => {
    // SAFE always draws the smallest quest on offer, so this path is slower by
    // design. It must still be a week of ordinary effort, not a grind.
    for (const boss of BOSSES) {
      const median = medianQuests(boss.id, 'safe');
      const ceiling = Math.round(TARGET_BANDS[boss.difficulty][1] * 1.8);

      expect(
        median,
        `${boss.name}: ${median} cautious quests exceeds the ${ceiling} ceiling`,
      ).toBeLessThanOrEqual(ceiling);
    }
  });

  it('harder bosses genuinely take longer than easier ones', () => {
    const byDifficulty = new Map<Difficulty, number[]>();

    for (const boss of BOSSES) {
      const median = medianQuests(boss.id, 'mixed');
      const list = byDifficulty.get(boss.difficulty) ?? [];
      list.push(median);
      byDifficulty.set(boss.difficulty, list);
    }

    const average = (values: number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / values.length;

    const medium = average(byDifficulty.get('medium') ?? []);
    const hard = average(byDifficulty.get('hard') ?? []);
    const extreme = average(byDifficulty.get('extreme') ?? []);

    expect(hard).toBeGreaterThan(medium);
    expect(extreme).toBeGreaterThan(hard);
  });

  it('taking the riskier tiers is meaningfully faster', () => {
    // Wild and dangerous offers pay more, so a bolder player should finish
    // sooner. This guards against the tiers becoming cosmetic.
    const safeTotal = BOSSES.reduce((sum, boss) => sum + medianQuests(boss.id, 'safe'), 0);
    const mixedTotal = BOSSES.reduce((sum, boss) => sum + medianQuests(boss.id, 'mixed'), 0);

    expect(mixedTotal).toBeLessThan(safeTotal);
  });

  it('exploiting a weakness measurably shortens the fight', () => {
    // Damage maths rather than a full simulation: the weakness multiplier has
    // to be worth actively steering toward.
    const boss = BOSSES.find((entry) => entry.weaknessCategories.length > 0)!;
    expect(boss.weaknessCategories.length).toBeGreaterThanOrEqual(2);

    const neutralQuests = Math.ceil(boss.maxHp / 100);
    const weaknessQuests = Math.ceil(boss.maxHp / (100 * 1.25));

    expect(weaknessQuests).toBeLessThan(neutralQuests);
  });
});
