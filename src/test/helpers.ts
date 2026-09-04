import type { Quest, QuestFilters, QuestOffer, RogueDaySave } from '@/types';
import { QUESTS, getQuestById } from '@/data/quests';
import { buildOffer } from '@/game/questSelection';
import { createDefaultSave } from '@/persistence/defaults';
import { createRng } from '@/utils/rng';
import { reconcileWithClock } from '@/app/gameStore';

export const TEST_FILTERS: QuestFilters = {
  duration: 30,
  energy: 'medium',
  location: 'anywhere',
  mood: 'motivated',
  mode: 'normal',
};

/** A save that already has a boss and daily slot, as after a real startup. */
export function makeSave(now = new Date('2026-09-04T12:00:00')): RogueDaySave {
  return reconcileWithClock(createDefaultSave('Testhjälte'), now);
}

/** Deterministic offer for a known quest, so reward assertions are stable. */
export function makeOffer(
  questId: string,
  overrides: Partial<QuestOffer> = {},
  seed = 'test-seed',
): QuestOffer {
  const quest = getQuestById(questId);
  if (!quest) throw new Error(`Unknown test quest: ${questId}`);

  const offer = buildOffer({
    quest,
    tier: 'safe',
    filters: TEST_FILTERS,
    rng: createRng(seed),
    forcedRarity: 'common',
  });

  return { ...offer, ...overrides };
}

/** A quest guaranteed to exist, for tests that only need "some quest". */
export function anyQuest(): Quest {
  return QUESTS[0];
}

/** RNG that never rolls loot or events, keeping completion assertions clean. */
export const NO_LUCK_RNG = {
  next: () => 0.999,
  int: (min: number) => min,
  pick: <T,>(items: readonly T[]): T => items[0],
  shuffle: <T,>(items: readonly T[]): T[] => items.slice(),
  chance: () => false,
};

/** RNG that always succeeds, for loot/event tests. */
export const ALWAYS_RNG = {
  next: () => 0,
  int: (min: number) => min,
  pick: <T,>(items: readonly T[]): T => items[0],
  shuffle: <T,>(items: readonly T[]): T[] => items.slice(),
  chance: () => true,
};
