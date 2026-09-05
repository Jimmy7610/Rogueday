import { beforeEach, describe, expect, it } from 'vitest';
import { SAVE_KEY, loadGame } from './storage';
import { SCHEMA_VERSION } from './defaults';
import { migrateSave } from './migrate';
import { mergeWithDefaults } from './validate';
import { FEEDBACK_LIMIT } from '@/game/feedback';

/**
 * v2 -> v3 migration.
 *
 * V3 adds exactly one thing to the save: the local thumbs-up/down record.
 * A V2 player must keep every point of progress, and their game must keep
 * working without the new section ever having existed.
 */

/** A realistic version-2 save as written by RogueDay V2. */
function makeV2Fixture(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    player: { name: 'Gryningsvakten', createdAt: '2026-03-02T08:00:00.000Z' },
    progression: { level: 19, xp: 410, totalXp: 41200, gold: 1875 },
    inventory: [{ itemId: 'reroll_token', count: 2 }],
    buffs: { xpElixir: true, luckyCoin: false, bossKey: true, focusRune: false, shrineXpBonusQuests: 1 },
    history: [
      {
        entryId: 'h_v2',
        questId: 'ad_inbox_raid',
        title: 'INBOX NOLL-RÄDEN',
        category: 'digital',
        rarity: 'epic',
        difficulty: 'medium',
        duration: 15,
        xpEarned: 120,
        goldEarned: 22,
        bossDamage: 140,
        completedAt: '2026-08-30T19:00:00.000Z',
        completedDate: '2026-08-30',
        mode: 'chaos',
        isDaily: false,
      },
    ],
    achievements: [{ id: 'first_quest', unlockedAt: '2026-03-02T09:00:00.000Z', progress: 1 }],
    boss: {
      bossId: 'boss_dammdraken',
      weekKey: '2026-W36',
      currentHp: 410,
      maxHp: 810,
      defeated: false,
      startedAt: '2026-08-31T00:00:00.000Z',
      phasesSeen: [0.5],
    },
    bossHistory: [
      { bossId: 'boss_kaosanden', weekKey: '2026-W35', defeated: true, damageDealt: 900, questsUsed: 9 },
    ],
    questChains: { forgotten_drawer: { chainId: 'forgotten_drawer', completedSteps: 2, completed: false } },
    statistics: {
      questsCompleted: 240,
      questsAbandoned: 6,
      totalXp: 41200,
      totalGold: 5200,
      totalMinutes: 4100,
      questsByCategory: { digital: 40 },
      questsByRarity: { epic: 11 },
      questsByDuration: { '15': 90 },
      completionDates: { '2026-08-30': 3 },
      bossesDefeated: 5,
      chainsCompleted: 2,
      eventsResolved: 14,
      rerollsUsed: 8,
      marketPurchases: 12,
      timedChallengesWon: 7,
      weaknessHits: 19,
      followUpsCompleted: 4,
    },
    daily: { date: '2026-08-31', questId: 'home_bed_fortress', completed: true, freeRerollUsedOn: null },
    streak: { current: 22, longest: 31, lastCompletedDate: '2026-08-30', shieldUsedOn: null },
    settings: { sound: false, reducedMotion: true, animations: false, highContrast: true },
    market: { date: '2026-08-31', purchased: { reroll_token: 1 } },
    perks: { selected: ['perk_gold_touch'] },
    eventFollowUp: null,
    activeQuest: null,
    recentQuestIds: ['ad_inbox_raid', 'home_bed_fortress'],
    onboardingComplete: true,
    metadata: {
      createdAt: '2026-03-02T08:00:00.000Z',
      lastSavedAt: '2026-08-31T21:00:00.000Z',
      saveCount: 1180,
      appVersion: '2.0.0',
    },
  };
}

describe('v2 -> v3 migration', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('reports the upgrade to the current schema', () => {
    const result = migrateSave(makeV2Fixture());
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe(2);
    expect(result.toVersion).toBe(SCHEMA_VERSION);
  });

  it('carries a v2 save all the way through v3 to the current schema', () => {
    const save = mergeWithDefaults(migrateSave(makeV2Fixture()).save);
    expect(save.schemaVersion).toBe(SCHEMA_VERSION);
    // Both later additions are present and empty.
    expect(save.feedback).toEqual({ scores: {}, quests: {}, up: 0, down: 0 });
    expect(save.packs.favourites).toEqual([]);
  });

  it('keeps every point of V2 progress untouched', () => {
    const save = mergeWithDefaults(migrateSave(makeV2Fixture()).save);

    expect(save.player.name).toBe('Gryningsvakten');
    expect(save.progression).toEqual({ level: 19, xp: 410, totalXp: 41200, gold: 1875 });
    expect(save.history).toHaveLength(1);
    expect(save.history[0].xpEarned).toBe(120);
    expect(save.achievements[0].id).toBe('first_quest');
    expect(save.boss?.currentHp).toBe(410);
    expect(save.boss?.phasesSeen).toEqual([0.5]);
    expect(save.bossHistory).toHaveLength(1);
    expect(save.questChains.forgotten_drawer.completedSteps).toBe(2);
    expect(save.statistics.questsCompleted).toBe(240);
    expect(save.statistics.weaknessHits).toBe(19);
    expect(save.streak.longest).toBe(31);
    expect(save.market.purchased.reroll_token).toBe(1);
    expect(save.perks.selected).toEqual(['perk_gold_touch']);
    expect(save.settings.highContrast).toBe(true);
    expect(save.settings.reducedMotion).toBe(true);
    expect(save.recentQuestIds).toEqual(['ad_inbox_raid', 'home_bed_fortress']);
    expect(save.inventory[0]).toEqual({ itemId: 'reroll_token', count: 2 });
  });

  it('adds an empty feedback record and nothing else', () => {
    const save = mergeWithDefaults(migrateSave(makeV2Fixture()).save);
    expect(save.feedback).toEqual({ scores: {}, quests: {}, up: 0, down: 0 });
  });

  it('loads a stored v2 save end to end', () => {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(makeV2Fixture()));
    const loaded = loadGame();

    expect(loaded.save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.migrated).toBe(true);
    expect(loaded.save.progression.totalXp).toBe(41200);
    expect(loaded.save.feedback.up).toBe(0);
  });

  it('a v3 save round-trips without migrating again', () => {
    const once = migrateSave(makeV2Fixture()).save;
    const twice = migrateSave(once);
    expect(twice.migrated).toBe(false);
    expect(twice.fromVersion).toBe(SCHEMA_VERSION);
  });

  it('sanitises a hand-edited feedback block instead of trusting it', () => {
    const fixture = makeV2Fixture();
    fixture.feedback = {
      scores: { cleaning: -9999, food: 'nope', chaos: 3 },
      quests: { a: 1, b: 0, c: -1 },
      up: -5,
      down: 2.7,
    };

    const save = mergeWithDefaults(migrateSave(fixture).save);

    expect(save.feedback.scores.cleaning).toBe(-FEEDBACK_LIMIT);
    expect(save.feedback.scores.food).toBeUndefined();
    expect(save.feedback.scores.chaos).toBe(3);
    expect(save.feedback.quests).toEqual({ a: 1, c: -1 });
    expect(save.feedback.up).toBe(0);
    expect(save.feedback.down).toBe(3);
  });
});
