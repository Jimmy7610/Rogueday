import { beforeEach, describe, expect, it } from 'vitest';
import type { RogueDaySave } from '@/types';
import { SAVE_KEY, loadGame, saveGame } from './storage';
import { SCHEMA_VERSION } from './defaults';
import { migrateSave } from './migrate';
import { mergeWithDefaults } from './validate';

/**
 * v1 -> v2 migration.
 *
 * A real player's v1 save is loaded end to end and every earned value is
 * checked to still be there afterwards. Migration is additive: it may add the
 * new V2 sections, but it must never drop or rewrite existing progress.
 */

/** A complete, realistic version-1 save as shipped by RogueDay 1.0. */
function makeV1Fixture(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    player: { name: 'Nattvandraren', createdAt: '2026-01-04T10:00:00.000Z' },
    progression: { level: 7, xp: 620, totalXp: 5840, gold: 342 },
    inventory: [
      { itemId: 'reroll_token', count: 3 },
      { itemId: 'streak_shield', count: 1 },
      { itemId: 'xp_elixir', count: 2 },
    ],
    buffs: {
      xpElixir: false,
      luckyCoin: true,
      bossKey: false,
      focusRune: false,
      shrineXpBonusQuests: 2,
    },
    history: [
      {
        entryId: 'h_a',
        questId: 'digi_inbox_raid',
        title: 'INBOX NOLL-RÄDEN',
        category: 'digital',
        rarity: 'rare',
        difficulty: 'medium',
        duration: 15,
        xpEarned: 75,
        goldEarned: 12,
        bossDamage: 90,
        completedAt: '2026-09-03T18:12:00.000Z',
        completedDate: '2026-09-03',
        mode: 'normal',
        isDaily: false,
      },
      {
        entryId: 'h_b',
        questId: 'home_dish_mountain',
        title: 'DISKBERGETS FALL',
        category: 'home',
        rarity: 'uncommon',
        difficulty: 'medium',
        duration: 15,
        xpEarned: 54,
        goldEarned: 9,
        bossDamage: 69,
        completedAt: '2026-09-04T09:30:00.000Z',
        completedDate: '2026-09-04',
        mode: 'normal',
        isDaily: true,
      },
    ],
    achievements: [
      { id: 'first_blood', unlockedAt: '2026-08-02T08:00:00.000Z' },
      { id: 'on_a_roll', unlockedAt: '2026-08-06T08:00:00.000Z' },
      { id: 'streak_7', unlockedAt: '2026-08-14T08:00:00.000Z' },
    ],
    boss: {
      bossId: 'laundry_mountain',
      weekKey: '2026-08-31',
      currentHp: 1850,
      maxHp: 2200,
      defeated: false,
      totalDamage: 350,
      questsContributed: 4,
      damageByDate: { '2026-09-03': 90, '2026-09-04': 260 },
    },
    bossHistory: [
      {
        bossId: 'kitchen_beast',
        bossName: 'KÖKSBESTEN',
        weekKey: '2026-08-24',
        defeatedAt: '2026-08-30T20:00:00.000Z',
        questsUsed: 18,
        totalDamage: 2000,
        rewardXp: 380,
        rewardGold: 90,
        rewardChest: 'mystery_chest',
      },
    ],
    questChains: {
      forgotten_drawer: {
        chainId: 'forgotten_drawer',
        completedSteps: 2,
        completedQuestIds: ['chain_drawer_1', 'chain_drawer_2'],
        completed: false,
      },
    },
    statistics: {
      questsCompleted: 42,
      questsAbandoned: 3,
      questsByCategory: { digital: 12, home: 18, cleaning: 12 },
      questsByRarity: { common: 20, uncommon: 12, rare: 8, epic: 2, legendary: 0 },
      questsByDuration: { '5': 10, '15': 24, '30': 6, '60': 2 },
      totalXpEarned: 5840,
      totalGoldEarned: 980,
      totalGoldSpent: 120,
      totalMinutes: 730,
      totalBossDamage: 4200,
      bossesDefeated: 1,
      legendaryQuests: 0,
      epicQuests: 2,
      chaosQuests: 5,
      dailyQuestsCompleted: 9,
      chainsCompleted: 0,
      rerollsUsed: 6,
      lootFound: 11,
      eventsTriggered: 7,
      completionDates: { '2026-09-03': 2, '2026-09-04': 1 },
    },
    daily: {
      date: '2026-09-04',
      questId: 'home_dish_mountain',
      completed: true,
      freeRerollUsedOn: '2026-09-04',
    },
    streak: {
      current: 9,
      longest: 14,
      lastCompletionDate: '2026-09-04',
      shieldUsedOn: '2026-08-20',
    },
    settings: { sound: true, reducedMotion: false, animations: true, highContrast: true },
    activeQuest: null,
    recentQuestIds: ['digi_inbox_raid', 'home_dish_mountain'],
    onboardingComplete: true,
    metadata: {
      createdAt: '2026-01-04T10:00:00.000Z',
      lastSavedAt: '2026-09-04T09:31:00.000Z',
      saveCount: 214,
      appVersion: '1.0.0',
    },
  };
}

function migrateFixture(): RogueDaySave {
  const result = migrateSave(makeV1Fixture());
  return mergeWithDefaults(result.save);
}

describe('v1 -> v2 migration', () => {
  beforeEach(() => window.localStorage.clear());

  it('reports the upgrade', () => {
    const result = migrateSave(makeV1Fixture());

    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(2);
    expect(result.save.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('keeps XP, level and gold exactly', () => {
    const save = migrateFixture();

    expect(save.progression.level).toBe(7);
    expect(save.progression.xp).toBe(620);
    expect(save.progression.totalXp).toBe(5840);
    expect(save.progression.gold).toBe(342);
  });

  it('keeps the player name and creation date', () => {
    const save = migrateFixture();
    expect(save.player.name).toBe('Nattvandraren');
    expect(save.player.createdAt).toBe('2026-01-04T10:00:00.000Z');
  });

  it('keeps every history record intact', () => {
    const save = migrateFixture();

    expect(save.history).toHaveLength(2);
    expect(save.history[0].questId).toBe('digi_inbox_raid');
    expect(save.history[0].xpEarned).toBe(75);
    expect(save.history[0].bossDamage).toBe(90);
    expect(save.history[1].isDaily).toBe(true);
  });

  it('keeps achievements and their unlock timestamps', () => {
    const save = migrateFixture();

    expect(save.achievements).toHaveLength(3);
    expect(save.achievements.map((entry) => entry.id)).toEqual([
      'first_blood',
      'on_a_roll',
      'streak_7',
    ]);
    expect(save.achievements[0].unlockedAt).toBe('2026-08-02T08:00:00.000Z');
  });

  it('keeps the in-progress boss, including its HP and damage log', () => {
    const save = migrateFixture();

    expect(save.boss?.bossId).toBe('laundry_mountain');
    expect(save.boss?.currentHp).toBe(1850);
    expect(save.boss?.totalDamage).toBe(350);
    expect(save.boss?.questsContributed).toBe(4);
    expect(save.boss?.damageByDate['2026-09-04']).toBe(260);
  });

  it('gives the migrated boss an empty phase log rather than pretending', () => {
    const save = migrateFixture();
    // A v1 boss never recorded phases, so none are marked as already seen and
    // the player still gets the reactions for the rest of the week.
    expect(save.boss?.phasesSeen).toEqual([]);
  });

  it('keeps boss history', () => {
    const save = migrateFixture();

    expect(save.bossHistory).toHaveLength(1);
    expect(save.bossHistory[0].bossId).toBe('kitchen_beast');
    expect(save.bossHistory[0].totalDamage).toBe(2000);
  });

  it('keeps streak, inventory, chains and settings', () => {
    const save = migrateFixture();

    expect(save.streak.current).toBe(9);
    expect(save.streak.longest).toBe(14);
    expect(save.streak.lastCompletionDate).toBe('2026-09-04');

    expect(save.inventory).toHaveLength(3);
    expect(save.inventory.find((entry) => entry.itemId === 'reroll_token')?.count).toBe(3);

    expect(save.questChains.forgotten_drawer.completedSteps).toBe(2);

    expect(save.settings.sound).toBe(true);
    expect(save.settings.highContrast).toBe(true);
  });

  it('keeps every existing statistic', () => {
    const save = migrateFixture();

    expect(save.statistics.questsCompleted).toBe(42);
    expect(save.statistics.totalXpEarned).toBe(5840);
    expect(save.statistics.totalGoldEarned).toBe(980);
    expect(save.statistics.totalMinutes).toBe(730);
    expect(save.statistics.totalBossDamage).toBe(4200);
    expect(save.statistics.bossesDefeated).toBe(1);
    expect(save.statistics.chaosQuests).toBe(5);
    expect(save.statistics.completionDates['2026-09-03']).toBe(2);
  });

  it('adds the new v2 sections with safe defaults', () => {
    const save = migrateFixture();

    expect(save.market).toEqual({ date: null, purchased: {} });
    expect(save.perks).toEqual({ selected: [] });
    expect(save.eventFollowUp).toBeNull();

    expect(save.statistics.marketPurchases).toBe(0);
    expect(save.statistics.timedChallengesWon).toBe(0);
    expect(save.statistics.weaknessHits).toBe(0);
    expect(save.statistics.followUpsCompleted).toBe(0);
  });

  it('loads a stored v1 save through the real startup path', () => {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(makeV1Fixture()));

    const loaded = loadGame();

    expect(loaded.source).toBe('main');
    expect(loaded.migrated).toBe(true);
    expect(loaded.save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.save.progression.totalXp).toBe(5840);
    expect(loaded.save.history).toHaveLength(2);
    expect(loaded.save.achievements).toHaveLength(3);
    expect(loaded.save.boss?.currentHp).toBe(1850);
    expect(loaded.save.perks.selected).toEqual([]);
  });

  it('does not rewrite the stored save merely by loading it', () => {
    const raw = JSON.stringify(makeV1Fixture());
    window.localStorage.setItem(SAVE_KEY, raw);

    loadGame();

    expect(window.localStorage.getItem(SAVE_KEY)).toBe(raw);
  });

  it('persists as v2 once the game saves again, without losing anything', () => {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(makeV1Fixture()));

    const migrated = loadGame().save;
    expect(saveGame(migrated).ok).toBe(true);

    const reloaded = loadGame();

    expect(reloaded.migrated).toBe(false); // already v2
    expect(reloaded.save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(reloaded.save.progression.totalXp).toBe(5840);
    expect(reloaded.save.progression.gold).toBe(342);
    expect(reloaded.save.history).toHaveLength(2);
    expect(reloaded.save.bossHistory).toHaveLength(1);
    expect(reloaded.save.streak.longest).toBe(14);
    expect(reloaded.save.player.name).toBe('Nattvandraren');
  });

  it('migrates a v0 prototype save all the way to v2', () => {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ level: 4, xp: 30, totalXp: 1200, gold: 55 }),
    );

    const loaded = loadGame();

    expect(loaded.save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.save.progression.level).toBe(4);
    expect(loaded.save.progression.totalXp).toBe(1200);
    expect(loaded.save.market).toBeDefined();
    expect(loaded.save.perks.selected).toEqual([]);
  });

  it('a v2 save round-trips without another migration', () => {
    const migrated = migrateFixture();
    const second = migrateSave(migrated as unknown as Record<string, unknown>);

    expect(second.migrated).toBe(false);
    expect(second.fromVersion).toBe(SCHEMA_VERSION);
  });
});
