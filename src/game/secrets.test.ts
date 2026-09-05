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

/* ------------------------------------------------------------------ */
/* V3.1: one test per new unlock rule                                  */
/* ------------------------------------------------------------------ */

/** A save with enough history to clear the base gate, and nothing else. */
function played(overrides: Partial<RogueDaySave> = {}): RogueDaySave {
  const base = createDefaultSave('Utforskaren');
  return {
    ...base,
    statistics: { ...base.statistics, questsCompleted: 40 },
    ...overrides,
  };
}

const questById = (id: string) => QUESTS.find((entry) => entry.id === id)!;

/** Is this secret quest unlocked at that moment, for that save? */
function open(id: string, now: Date, save: RogueDaySave = played()): boolean {
  return isSecretUnlocked(questById(id), { now, save });
}

/** Local YYYY-MM-DD, matching how the save records completion dates. */
function toKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}


/** A minimal but valid history entry, for tests that only care about the count. */
function historyEntries(count: number): RogueDaySave['history'] {
  return Array.from({ length: count }, (_, index) => ({
    entryId: `h${index}`,
    questId: 'home_bed_fortress',
    title: 'BÄDDAT',
    category: 'home' as const,
    rarity: 'common' as const,
    difficulty: 'easy' as const,
    duration: 5 as const,
    xpEarned: 20,
    goldEarned: 4,
    bossDamage: 25,
    completedAt: '2026-09-01T10:00:00.000Z',
    completedDate: '2026-09-01',
    mode: 'normal' as const,
    isDaily: false,
  }));
}

describe('v3.1 clock-window secrets', () => {
  it('DEN TRETTONDE TIMMEN opens only between 13:00 and 14:00', () => {
    expect(open('sx_thirteenth_hour', new Date('2026-09-09T12:59:00'))).toBe(false);
    expect(open('sx_thirteenth_hour', new Date('2026-09-09T13:00:00'))).toBe(true);
    expect(open('sx_thirteenth_hour', new Date('2026-09-09T13:59:00'))).toBe(true);
    expect(open('sx_thirteenth_hour', new Date('2026-09-09T14:00:00'))).toBe(false);
  });

  it('MELLAN TVA OCH TRE opens only in the small hours', () => {
    expect(open('sx_between_two_and_three', new Date('2026-09-09T01:59:00'))).toBe(false);
    expect(open('sx_between_two_and_three', new Date('2026-09-09T02:00:00'))).toBe(true);
    expect(open('sx_between_two_and_three', new Date('2026-09-09T03:30:00'))).toBe(true);
    expect(open('sx_between_two_and_three', new Date('2026-09-09T04:00:00'))).toBe(false);
  });
});

describe('v3.1 calendar secrets', () => {
  // 2026-09-11 is a Friday, 2026-09-13 a Sunday, 2026-09-09 a Wednesday.
  it('FREDAGENS SISTA HANDLING needs both the day and the hour', () => {
    expect(open('sx_friday_last_act', new Date('2026-09-11T16:00:00'))).toBe(true);
    expect(open('sx_friday_last_act', new Date('2026-09-11T10:00:00'))).toBe(false);
    expect(open('sx_friday_last_act', new Date('2026-09-10T16:00:00'))).toBe(false);
  });

  it('SONDAGSVILAN opens on Sunday and no other day', () => {
    expect(open('sx_sunday_idleness', new Date('2026-09-13T11:00:00'))).toBe(true);
    expect(open('sx_sunday_idleness', new Date('2026-09-12T11:00:00'))).toBe(false);
    expect(open('sx_sunday_idleness', new Date('2026-09-14T11:00:00'))).toBe(false);
  });

  it('MANADENS SISTA DAG opens only on the final day of a month', () => {
    expect(open('sx_last_day_of_month', new Date('2026-09-30T18:00:00'))).toBe(true);
    expect(open('sx_last_day_of_month', new Date('2026-09-29T18:00:00'))).toBe(false);
    // Also correct for a 31-day month and for February.
    expect(open('sx_last_day_of_month', new Date('2026-10-31T18:00:00'))).toBe(true);
    expect(open('sx_last_day_of_month', new Date('2026-02-28T18:00:00'))).toBe(true);
  });

  it('DEN NYA MANADENS TIMME opens in the first three days only', () => {
    expect(open('sx_new_month_hour', new Date('2026-09-01T10:00:00'))).toBe(true);
    expect(open('sx_new_month_hour', new Date('2026-09-03T10:00:00'))).toBe(true);
    expect(open('sx_new_month_hour', new Date('2026-09-04T10:00:00'))).toBe(false);
  });
});

describe('v3.1 boss secrets', () => {
  const withBoss = (currentHp: number, maxHp: number, defeated = false): RogueDaySave => {
    const base = played();
    return {
      ...base,
      boss: {
        bossId: 'doom_drawer',
        weekKey: '2026-09-07',
        currentHp,
        maxHp,
        defeated,
        totalDamage: maxHp - currentHp,
        questsContributed: 4,
        damageByDate: {},
        phasesSeen: [],
      },
    };
  };

  const NOW = new Date('2026-09-09T12:00:00');

  it('DRAKENS SISTA ANDETAG opens only when the boss is nearly dead', () => {
    expect(open('sx_dragons_last_breath', NOW, withBoss(120, 800))).toBe(true);
    expect(open('sx_dragons_last_breath', NOW, withBoss(400, 800))).toBe(false);
  });

  it('DRAKENS SISTA ANDETAG closes again once the boss is dead', () => {
    expect(open('sx_dragons_last_breath', NOW, withBoss(0, 800, true))).toBe(false);
  });

  it('SEGERVARVET opens only after the weekly boss has fallen', () => {
    expect(open('sx_victory_lap', NOW, withBoss(0, 800, true))).toBe(true);
    expect(open('sx_victory_lap', NOW, withBoss(120, 800))).toBe(false);
  });

  it('BOSSENS OGA needs an untouched boss and a week already half gone', () => {
    // Wednesday, boss still at 95%.
    expect(open('sx_untouched_boss', NOW, withBoss(760, 800))).toBe(true);
    // Same boss, but it is only Monday.
    expect(open('sx_untouched_boss', new Date('2026-09-07T12:00:00'), withBoss(760, 800))).toBe(
      false,
    );
    // Wednesday, but the boss has already taken real damage.
    expect(open('sx_untouched_boss', NOW, withBoss(300, 800))).toBe(false);
  });

  it('no boss secret unlocks when there is no boss at all', () => {
    const noBoss = played({ boss: null });
    expect(open('sx_dragons_last_breath', NOW, noBoss)).toBe(false);
    expect(open('sx_victory_lap', NOW, noBoss)).toBe(false);
    expect(open('sx_untouched_boss', NOW, noBoss)).toBe(false);
  });
});

describe('v3.1 progress secrets', () => {
  const NOW = new Date('2026-09-09T12:00:00');

  const withStreak = (current: number): RogueDaySave => {
    const base = played();
    return { ...base, streak: { ...base.streak, current } };
  };

  it('DEN SJUNDE DAGEN needs a seven-day streak', () => {
    expect(open('sx_seventh_day', NOW, withStreak(6))).toBe(false);
    expect(open('sx_seventh_day', NOW, withStreak(7))).toBe(true);
  });

  it('DEN TRETTIONDE DAGEN needs a thirty-day streak', () => {
    expect(open('sx_thirtieth_day', NOW, withStreak(29))).toBe(false);
    expect(open('sx_thirtieth_day', NOW, withStreak(30))).toBe(true);
  });

  it('TJUGONDE NIVAN needs level twenty', () => {
    const at = (level: number): RogueDaySave => {
      const base = played();
      return { ...base, progression: { ...base.progression, level } };
    };
    expect(open('sx_level_twenty', NOW, at(19))).toBe(false);
    expect(open('sx_level_twenty', NOW, at(20))).toBe(true);
  });

  it('KAOSETS BARN needs a long history of chaos quests', () => {
    const withChaos = (chaosQuests: number): RogueDaySave => {
      const base = played();
      return { ...base, statistics: { ...base.statistics, chaosQuests } };
    };
    expect(open('sx_child_of_chaos', NOW, withChaos(24))).toBe(false);
    expect(open('sx_child_of_chaos', NOW, withChaos(25))).toBe(true);
  });

  it('DEN FORSTA LEGENDEN opens on the first legendary completion', () => {
    const withLegendary = (legendaryQuests: number): RogueDaySave => {
      const base = played();
      return { ...base, statistics: { ...base.statistics, legendaryQuests } };
    };
    expect(open('sx_first_legend', NOW, withLegendary(0))).toBe(false);
    expect(open('sx_first_legend', NOW, withLegendary(1))).toBe(true);
  });

  it('category secrets need that category to have been played a lot', () => {
    const withCategory = (category: string, count: number): RogueDaySave => {
      const base = played();
      return {
        ...base,
        statistics: { ...base.statistics, questsByCategory: { [category]: count } },
      };
    };
    expect(open('sx_cleaners_secret', NOW, withCategory('cleaning', 19))).toBe(false);
    expect(open('sx_cleaners_secret', NOW, withCategory('cleaning', 20))).toBe(true);
    expect(open('sx_wanderers_find', NOW, withCategory('walking', 14))).toBe(false);
    expect(open('sx_wanderers_find', NOW, withCategory('walking', 15))).toBe(true);
    // Playing a lot of one category does not unlock the other one.
    expect(open('sx_wanderers_find', NOW, withCategory('cleaning', 50))).toBe(false);
  });

  it('ARKIVARIENS BELONING needs a hundred history entries', () => {
    const withHistory = (count: number): RogueDaySave => {
      const base = played();
      return {
        ...base,
        history: historyEntries(count),
      };
    };
    expect(open('sx_archivists_reward', NOW, withHistory(99))).toBe(false);
    expect(open('sx_archivists_reward', NOW, withHistory(100))).toBe(true);
  });

  it('FEMTE UPPDRAGET IDAG needs five completions on this local day', () => {
    const withToday = (count: number): RogueDaySave => {
      const base = played();
      return {
        ...base,
        statistics: { ...base.statistics, completionDates: { [toKey(NOW)]: count } },
      };
    };
    expect(open('sx_fifth_today', NOW, withToday(4))).toBe(false);
    expect(open('sx_fifth_today', NOW, withToday(5))).toBe(true);
  });
});

describe('v3.1 secrets keep the library rules', () => {
  it('gives every new secret quest an explicit condition', () => {
    const newSecrets = QUESTS.filter((entry) => entry.id.startsWith('sx_'));
    expect(newSecrets.length).toBeGreaterThanOrEqual(14);
    for (const entry of newSecrets) {
      expect(hasExplicitCondition(entry.id), `${entry.id} has no rule`).toBe(true);
    }
  });

  it('locks every new secret for a brand new player, whatever the clock says', () => {
    const fresh = createDefaultSave('Nyborjaren');
    const moments = [
      '2026-09-11T16:00:00', // Friday afternoon
      '2026-09-13T11:00:00', // Sunday
      '2026-09-30T13:30:00', // last day of the month, thirteenth hour
      '2026-10-01T02:30:00', // first of the month, small hours
    ];
    for (const moment of moments) {
      expect(unlockedSecrets(QUESTS, { now: new Date(moment), save: fresh }), moment).toEqual([]);
    }
  });

  it('leaves no secret quest permanently unreachable', () => {
    const moments = [
      new Date('2026-09-07T05:30:00'),
      new Date('2026-09-09T02:30:00'),
      new Date('2026-09-09T13:30:00'),
      new Date('2026-09-11T16:30:00'),
      new Date('2026-09-12T12:00:00'),
      new Date('2026-09-13T11:00:00'),
      new Date('2026-09-30T20:00:00'),
      new Date('2026-10-01T10:00:00'),
      new Date('2026-10-01T22:30:00'),
    ];

    const maxed: RogueDaySave = (() => {
      const base = createDefaultSave('Fullstandig');
      return {
        ...base,
        progression: { ...base.progression, level: 50 },
        streak: { ...base.streak, current: 60 },
        history: historyEntries(200),
        statistics: {
          ...base.statistics,
          questsCompleted: 500,
          chaosQuests: 60,
          legendaryQuests: 5,
          questsByCategory: { cleaning: 60, walking: 60 },
          completionDates: Object.fromEntries(moments.map((moment) => [toKey(moment), 9])),
        },
        boss: {
          bossId: 'doom_drawer',
          weekKey: '2026-09-07',
          currentHp: 40,
          maxHp: 800,
          defeated: false,
          totalDamage: 760,
          questsContributed: 9,
          damageByDate: {},
          phasesSeen: [],
        },
      };
    })();

    const defeated: RogueDaySave = { ...maxed, boss: { ...maxed.boss!, defeated: true } };
    const untouched: RogueDaySave = { ...maxed, boss: { ...maxed.boss!, currentHp: 790 } };

    const reachable = new Set<string>();
    for (const now of moments) {
      for (const save of [maxed, defeated, untouched]) {
        for (const entry of unlockedSecrets(QUESTS, { now, save })) reachable.add(entry.id);
      }
    }

    const unreachable = SECRETS.filter((entry) => !reachable.has(entry.id)).map(
      (entry) => entry.id,
    );
    expect(unreachable, `unreachable secrets: ${unreachable.join(', ')}`).toEqual([]);
  });
});
