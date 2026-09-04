import { describe, expect, it } from 'vitest';
import type { QuestFilters, RogueDaySave } from '@/types';
import { QUESTS } from '@/data/quests';
import { createDefaultSave } from '@/persistence/defaults';
import { createRng } from '@/utils/rng';
import { hasExplicitCondition, isSecretUnlocked, unlockedSecrets } from './secrets';
import { buildQuestPoolDetailed, rollQuestChoices } from './questSelection';

const SECRETS = QUESTS.filter((quest) => quest.category === 'secret');

/** A veteran player: high level, long streak, plenty of quests behind them. */
function veteran(dateKey = '2026-09-05'): RogueDaySave {
  const save = createDefaultSave('Hemlighetsjägaren');
  return {
    ...save,
    progression: { level: 22, xp: 0, totalXp: 50000, gold: 900 },
    streak: { ...save.streak, current: 9, longest: 12 },
    statistics: {
      ...save.statistics,
      questsCompleted: 300,
      completionDates: { [dateKey]: 4 },
    },
  };
}

const BASE: QuestFilters = {
  duration: 60,
  energy: 'high',
  location: 'anywhere',
  mood: 'motivated',
  mode: 'normal',
};

describe('secret quest gating', () => {
  it('has a real, hand-written condition for every secret quest but a documented few', () => {
    const withRule = SECRETS.filter((quest) => hasExplicitCondition(quest.id));
    expect(withRule.length / SECRETS.length).toBeGreaterThan(0.9);
  });

  it('locks every secret quest for a brand new player', () => {
    const fresh = createDefaultSave('Nybörjaren');
    const ctx = { now: new Date('2026-09-05T13:00:00'), save: fresh };
    expect(unlockedSecrets(QUESTS, ctx)).toEqual([]);
  });

  it('never gates a non-secret quest', () => {
    const ctx = { now: new Date('2026-09-05T13:00:00'), save: createDefaultSave('X') };
    for (const quest of QUESTS.filter((entry) => entry.category !== 'secret')) {
      expect(isSecretUnlocked(quest, ctx), quest.id).toBe(true);
    }
  });

  it('unlocks a different set at midnight than at midday', () => {
    const save = veteran();
    const night = unlockedSecrets(QUESTS, { now: new Date('2026-09-05T23:30:00'), save });
    const midday = unlockedSecrets(QUESTS, { now: new Date('2026-09-05T13:00:00'), save });

    const nightIds = new Set(night.map((quest) => quest.id));
    const middayIds = new Set(midday.map((quest) => quest.id));

    expect(nightIds).not.toEqual(middayIds);
    expect(nightIds.has('secret_midnight_pact')).toBe(true);
    expect(middayIds.has('secret_midnight_pact')).toBe(false);
  });

  it('unlocks the dawn quests only around dawn', () => {
    const save = veteran();
    const dawn = { now: new Date('2026-09-05T05:30:00'), save };
    const afternoon = { now: new Date('2026-09-05T15:00:00'), save };

    expect(isSecretUnlocked(QUESTS.find((q) => q.id === 'sc_dawn_watch')!, dawn)).toBe(true);
    expect(isSecretUnlocked(QUESTS.find((q) => q.id === 'sc_dawn_watch')!, afternoon)).toBe(false);
  });

  it('unlocks weekend secrets on Saturday but not on Wednesday', () => {
    const save = veteran('2026-09-05');
    const quest = QUESTS.find((entry) => entry.id === 'sc_finish_what_no_one_asked')!;

    // 2026-09-05 is a Saturday; 2026-09-02 is a Wednesday.
    expect(isSecretUnlocked(quest, { now: new Date('2026-09-05T12:00:00'), save })).toBe(true);
    expect(isSecretUnlocked(quest, { now: new Date('2026-09-02T12:00:00'), save })).toBe(false);
  });

  it('unlocks streak secrets only once the streak is long enough', () => {
    const quest = QUESTS.find((entry) => entry.id === 'in_secret_no_complaint_day')!;
    const base = createDefaultSave('Svitjägaren');
    const now = new Date('2026-09-05T12:00:00');

    // Both have enough play behind them; only the streak differs.
    const played = { ...base, statistics: { ...base.statistics, questsCompleted: 20 } };
    const short = { ...played, streak: { ...base.streak, current: 2 } };
    const long = { ...played, streak: { ...base.streak, current: 6 } };

    expect(isSecretUnlocked(quest, { now, save: short })).toBe(false);
    expect(isSecretUnlocked(quest, { now, save: long })).toBe(true);
  });

  it('reads nothing but the clock and the save', () => {
    // A save object with no extra fields is enough for every condition; if a
    // rule ever reached for the network or a device API this would throw.
    const save = veteran();
    for (const quest of SECRETS) {
      expect(() => isSecretUnlocked(quest, { now: new Date(), save })).not.toThrow();
    }
  });
});

describe('secrets in the roll', () => {
  it('keeps secret quests out of the pool when no context is supplied', () => {
    const pool = buildQuestPoolDetailed({ filters: BASE, chains: {}, recentQuestIds: [] });
    expect(pool.quests.some((quest) => quest.category === 'secret')).toBe(false);
  });

  it('keeps them out for a new player even with a context', () => {
    const pool = buildQuestPoolDetailed({
      filters: BASE,
      chains: {},
      recentQuestIds: [],
      secrets: { now: new Date('2026-09-05T13:00:00'), save: createDefaultSave('Ny') },
    });
    expect(pool.quests.some((quest) => quest.category === 'secret')).toBe(false);
  });

  it('lets them into the pool once their condition holds', () => {
    const pool = buildQuestPoolDetailed({
      filters: BASE,
      chains: {},
      recentQuestIds: [],
      secrets: { now: new Date('2026-09-05T23:30:00'), save: veteran() },
    });
    expect(pool.quests.some((quest) => quest.category === 'secret')).toBe(true);
  });

  it('can actually be offered, rather than being unreachable content', () => {
    let sawSecret = false;
    for (let i = 0; i < 200 && !sawSecret; i += 1) {
      const result = rollQuestChoices({
        filters: BASE,
        chains: {},
        recentQuestIds: [],
        secrets: { now: new Date('2026-09-05T23:30:00'), save: veteran() },
        rng: createRng(`secret-${i}`),
      });
      sawSecret = result.offers.some((offer) => offer.quest.category === 'secret');
    }
    expect(sawSecret).toBe(true);
  });

  it('never offers a secret quest that breaks the player’s filters', () => {
    const filters: QuestFilters = {
      duration: 15,
      energy: 'low',
      location: 'home',
      mood: 'stressed',
      mode: 'normal',
    };

    for (let i = 0; i < 40; i += 1) {
      const result = rollQuestChoices({
        filters,
        chains: {},
        recentQuestIds: [],
        secrets: { now: new Date('2026-09-05T23:30:00'), save: veteran() },
        rng: createRng(`secret-filter-${i}`),
      });
      for (const offer of result.offers) {
        expect(offer.quest.duration).toBeLessThanOrEqual(15);
        expect(offer.quest.energy).toBe('low');
        expect(
          offer.quest.locations.includes('home') || offer.quest.locations.includes('anywhere'),
        ).toBe(true);
      }
    }
  });
});
