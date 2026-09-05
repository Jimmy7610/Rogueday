import { beforeEach, describe, expect, it } from 'vitest';
import { SAVE_KEY, loadGame } from './storage';
import { SCHEMA_VERSION } from './defaults';
import { migrateSave } from './migrate';
import { mergeWithDefaults } from './validate';
import { FAVOURITE_PACK_LIMIT, RECENT_PACK_LIMIT } from '@/data/activityPacks';

/**
 * v3 -> v4: activity packs.
 *
 * V3.2 adds exactly one section to the save: the local pack record. Everything
 * a V3 player had - including their thumbs-up/down feedback, which was itself
 * the v2 -> v3 addition - must survive untouched.
 */

/** A realistic version-3 save as written by RogueDay V3.1. */
function makeV3Fixture(): Record<string, unknown> {
  return {
    schemaVersion: 3,
    player: { name: 'Vandraren', createdAt: '2026-04-01T08:00:00.000Z' },
    progression: { level: 24, xp: 90, totalXp: 60400, gold: 2410 },
    inventory: [{ itemId: 'streak_shield', count: 1 }],
    buffs: {
      xpElixir: false,
      luckyCoin: true,
      bossKey: false,
      focusRune: false,
      shrineXpBonusQuests: 0,
    },
    history: [
      {
        entryId: 'h_v3',
        questId: 'home_bed_fortress',
        title: 'SÄNGENS ÅTERUPPBYGGNAD',
        category: 'home',
        rarity: 'rare',
        difficulty: 'easy',
        duration: 5,
        xpEarned: 44,
        goldEarned: 8,
        bossDamage: 30,
        completedAt: '2026-09-04T07:30:00.000Z',
        completedDate: '2026-09-04',
        mode: 'normal',
        isDaily: true,
      },
    ],
    achievements: [{ id: 'first_blood', unlockedAt: '2026-04-01T09:00:00.000Z', progress: 1 }],
    boss: {
      bossId: 'doom_drawer',
      weekKey: '2026-08-31',
      currentHp: 260,
      maxHp: 800,
      defeated: false,
      totalDamage: 540,
      questsContributed: 6,
      damageByDate: { '2026-09-04': 120 },
      phasesSeen: [0.5],
    },
    bossHistory: [
      {
        bossId: 'dust_king',
        weekKey: '2026-08-24',
        defeated: true,
        damageDealt: 730,
        questsUsed: 12,
      },
    ],
    questChains: {
      forgotten_drawer: { chainId: 'forgotten_drawer', completedSteps: 3, completed: true },
    },
    statistics: {
      questsCompleted: 410,
      questsAbandoned: 11,
      totalXpEarned: 60400,
      totalGoldEarned: 9100,
      totalGoldSpent: 2200,
      totalMinutes: 7300,
      questsByCategory: { home: 60, walking: 40 },
      questsByRarity: { common: 200, uncommon: 120, rare: 60, epic: 24, legendary: 6 },
      questsByDuration: { '5': 150, '15': 160 },
      completionDates: { '2026-09-04': 4 },
      totalBossDamage: 41000,
      bossesDefeated: 9,
      legendaryQuests: 6,
      epicQuests: 24,
      chaosQuests: 38,
      dailyQuestsCompleted: 60,
      chainsCompleted: 4,
      rerollsUsed: 21,
      lootFound: 44,
      eventsTriggered: 30,
      marketPurchases: 18,
      timedChallengesWon: 12,
      weaknessHits: 33,
      followUpsCompleted: 7,
    },
    daily: {
      date: '2026-09-04',
      questId: 'home_bed_fortress',
      completed: true,
      freeRerollUsedOn: null,
    },
    streak: { current: 14, longest: 41, lastCompletedDate: '2026-09-04', shieldUsedOn: null },
    settings: { sound: true, reducedMotion: false, animations: true, highContrast: false },
    market: { date: '2026-09-04', purchased: { xp_elixir: 1 } },
    perks: { selected: ['perk_gold_touch', 'perk_slayer'] },
    eventFollowUp: null,
    activeQuest: null,
    recentQuestIds: ['home_bed_fortress', 'walk_block_loop'],
    feedback: {
      scores: { cleaning: 3, walking: -2 },
      quests: { home_bed_fortress: 1 },
      up: 7,
      down: 3,
    },
    onboardingComplete: true,
    metadata: {
      createdAt: '2026-04-01T08:00:00.000Z',
      lastSavedAt: '2026-09-04T21:00:00.000Z',
      saveCount: 2100,
      appVersion: '3.1.0',
    },
  };
}

describe('v3 -> v4 migration', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('reports the upgrade', () => {
    const result = migrateSave(makeV3Fixture());
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe(3);
    expect(result.toVersion).toBe(SCHEMA_VERSION);
  });

  it('keeps every point of V3 progress untouched', () => {
    const save = mergeWithDefaults(migrateSave(makeV3Fixture()).save);

    expect(save.player.name).toBe('Vandraren');
    expect(save.progression).toEqual({ level: 24, xp: 90, totalXp: 60400, gold: 2410 });
    expect(save.history).toHaveLength(1);
    expect(save.achievements[0].id).toBe('first_blood');
    expect(save.boss?.currentHp).toBe(260);
    expect(save.boss?.phasesSeen).toEqual([0.5]);
    expect(save.bossHistory[0].bossId).toBe('dust_king');
    expect(save.questChains.forgotten_drawer.completed).toBe(true);
    expect(save.statistics.questsCompleted).toBe(410);
    expect(save.statistics.weaknessHits).toBe(33);
    expect(save.streak.longest).toBe(41);
    expect(save.market.purchased.xp_elixir).toBe(1);
    expect(save.perks.selected).toEqual(['perk_gold_touch', 'perk_slayer']);
    expect(save.inventory[0]).toEqual({ itemId: 'streak_shield', count: 1 });
    expect(save.recentQuestIds).toEqual(['home_bed_fortress', 'walk_block_loop']);
  });

  it('preserves the v3 feedback record exactly', () => {
    const save = mergeWithDefaults(migrateSave(makeV3Fixture()).save);
    expect(save.feedback).toEqual({
      scores: { cleaning: 3, walking: -2 },
      quests: { home_bed_fortress: 1 },
      up: 7,
      down: 3,
    });
  });

  it('adds an empty pack record and nothing else', () => {
    const save = mergeWithDefaults(migrateSave(makeV3Fixture()).save);
    expect(save.packs).toEqual({
      favourites: [],
      recent: [],
      completions: {},
      dailyBonusClaimedOn: null,
      dailyPackCompletions: 0,
    });
  });

  it('defaults the new setting without touching the old ones', () => {
    const save = mergeWithDefaults(migrateSave(makeV3Fixture()).save);
    expect(save.settings.sound).toBe(true);
    expect(save.settings.animations).toBe(true);
    expect(save.settings.longSurprises).toBe(false);
  });

  it('loads a stored v3 save end to end', () => {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(makeV3Fixture()));
    const loaded = loadGame();

    expect(loaded.save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.migrated).toBe(true);
    expect(loaded.save.progression.totalXp).toBe(60400);
    expect(loaded.save.packs.favourites).toEqual([]);
  });

  it('a v4 save round-trips without migrating again', () => {
    const once = migrateSave(makeV3Fixture()).save;
    const twice = migrateSave(once);
    expect(twice.migrated).toBe(false);
    expect(twice.fromVersion).toBe(SCHEMA_VERSION);
  });

  it('migrates a v1 save all the way to v4', () => {
    const v1 = { schemaVersion: 1, progression: { level: 3, xp: 10, totalXp: 900, gold: 40 } };
    const save = mergeWithDefaults(migrateSave(v1).save);

    expect(save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(save.progression.totalXp).toBe(900);
    expect(save.market).toBeDefined();
    expect(save.feedback.up).toBe(0);
    expect(save.packs.favourites).toEqual([]);
  });

  it('sanitises a hand-edited pack block instead of trusting it', () => {
    const fixture = makeV3Fixture();
    fixture.packs = {
      favourites: ['pack_exhausted', 'pack_nonexistent', 'pack_exhausted', 'pack_energy'],
      recent: ['pack_made_up', 'pack_social'],
      completions: { pack_energy: 4, pack_bogus: 10, pack_social: 'nope' },
      dailyBonusClaimedOn: 'not-a-date',
      dailyPackCompletions: -3,
    };

    const save = mergeWithDefaults(migrateSave(fixture).save);

    // Unknown ids dropped, duplicates collapsed, limits respected.
    expect(save.packs.favourites).toEqual(['pack_exhausted', 'pack_energy']);
    expect(save.packs.favourites.length).toBeLessThanOrEqual(FAVOURITE_PACK_LIMIT);
    expect(save.packs.recent).toEqual(['pack_social']);
    expect(save.packs.recent.length).toBeLessThanOrEqual(RECENT_PACK_LIMIT);
    expect(save.packs.completions).toEqual({ pack_energy: 4 });
    expect(save.packs.dailyBonusClaimedOn).toBeNull();
    expect(save.packs.dailyPackCompletions).toBe(0);
  });
});
