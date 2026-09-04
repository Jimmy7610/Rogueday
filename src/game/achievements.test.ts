import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_COUNT } from '@/data/achievements';
import { evaluateAchievements, getAchievementViews } from './achievements';
import { completeQuest } from './completion';
import { makeOffer, makeSave, NO_LUCK_RNG } from '@/test/helpers';

const AT = new Date('2026-09-04T12:00:00');

describe('achievement catalogue', () => {
  it('ships at least 60 achievements', () => {
    expect(ACHIEVEMENT_COUNT).toBeGreaterThanOrEqual(60);
  });

  it('has unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((entry) => entry.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('gives every achievement complete data and a real predicate', () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.name.length, achievement.id).toBeGreaterThan(0);
      expect(achievement.description.length, achievement.id).toBeGreaterThan(5);
      expect(achievement.icon, achievement.id).toBeTruthy();
      expect(typeof achievement.check, achievement.id).toBe('function');
    }
  });

  it('covers all nine categories', () => {
    const categories = new Set(ACHIEVEMENTS.map((entry) => entry.category));
    expect(categories.size).toBe(9);
  });

  it('includes hidden achievements', () => {
    expect(ACHIEVEMENTS.filter((entry) => entry.hidden).length).toBeGreaterThan(0);
  });

  it('no achievement unlocks on a brand new save', () => {
    const fresh = makeSave();
    // The default hero name is what a player who skipped naming would have;
    // renaming is itself a (secret) achievement, so reset it here.
    fresh.player.name = 'Skuggvandrare';
    const result = evaluateAchievements(fresh, AT);
    expect(result.unlocked).toEqual([]);
    expect(result.achievements).toEqual([]);
  });

  it('every predicate runs without throwing on a fresh save', () => {
    // evaluateAchievements swallows throws; assert the predicates are sound
    // by calling them directly.
    const save = makeSave();
    const context = {
      statistics: save.statistics,
      progression: save.progression,
      streak: save.streak,
      history: save.history,
      bossHistory: save.bossHistory,
      chains: save.questChains,
      inventory: save.inventory,
      player: save.player,
      achievementsUnlocked: 0,
    };

    for (const achievement of ACHIEVEMENTS) {
      expect(() => achievement.check(context), achievement.id).not.toThrow();
    }
  });
});

describe('unlocking', () => {
  it('unlocks quest-count achievements at the right thresholds', () => {
    const save = makeSave();
    save.statistics.questsCompleted = 5;

    const result = evaluateAchievements(save, AT);
    const ids = result.unlocked.map((entry) => entry.id);

    expect(ids).toContain('first_blood');
    expect(ids).toContain('on_a_roll');
    expect(ids).not.toContain('getting_serious');
  });

  it('unlocks streak achievements from the longest streak', () => {
    const save = makeSave();
    save.streak.longest = 7;

    const ids = evaluateAchievements(save, AT).unlocked.map((entry) => entry.id);

    expect(ids).toContain('streak_3');
    expect(ids).toContain('streak_7');
    expect(ids).not.toContain('streak_14');
  });

  it('unlocks boss achievements from the boss history', () => {
    const save = makeSave();
    save.statistics.bossesDefeated = 1;
    save.bossHistory = [
      {
        bossId: 'lord_procrastination',
        bossName: 'LORD PROKRASTINATION',
        weekKey: '2026-09-07',
        defeatedAt: AT.toISOString(),
        questsUsed: 8,
        totalDamage: 2500,
        rewardXp: 500,
        rewardGold: 120,
        rewardChest: 'epic_chest',
      },
    ];

    const ids = evaluateAchievements(save, AT).unlocked.map((entry) => entry.id);

    expect(ids).toContain('boss_first');
    expect(ids).toContain('boss_procrastination');
    expect(ids).toContain('boss_flawless'); // 8 quests <= 10
    expect(ids).not.toContain('boss_ten');
  });

  it('unlocks rarity achievements', () => {
    const save = makeSave();
    save.statistics.legendaryQuests = 1;
    save.statistics.epicQuests = 1;

    const ids = evaluateAchievements(save, AT).unlocked.map((entry) => entry.id);

    expect(ids).toContain('rarity_epic');
    expect(ids).toContain('rarity_legendary');
  });

  it('unlocks chain achievements from chain state', () => {
    const save = makeSave();
    save.statistics.chainsCompleted = 1;
    save.questChains = {
      forgotten_drawer: {
        chainId: 'forgotten_drawer',
        completedSteps: 3,
        completedQuestIds: [],
        completed: true,
      },
    };

    const ids = evaluateAchievements(save, AT).unlocked.map((entry) => entry.id);

    expect(ids).toContain('chain_first');
    expect(ids).toContain('chain_drawer');
    expect(ids).not.toContain('chain_inbox');
  });

  it('unlocks the secret night-owl badge from the completion hour', () => {
    const save = makeSave();
    save.history = [
      {
        entryId: 'h1',
        questId: 'home_bed_fortress',
        title: 'T',
        category: 'home',
        rarity: 'common',
        difficulty: 'easy',
        duration: 5,
        xpEarned: 10,
        goldEarned: 2,
        bossDamage: 25,
        completedAt: new Date(2026, 8, 4, 2, 30).toISOString(),
        completedDate: '2026-09-04',
        mode: 'normal',
        isDaily: false,
      },
    ];

    const ids = evaluateAchievements(save, AT).unlocked.map((entry) => entry.id);
    expect(ids).toContain('secret_night_owl');
  });

  it('unlocks the named-hero badge only after a rename', () => {
    const save = makeSave();
    save.player.name = 'Skuggvandrare';
    expect(evaluateAchievements(save, AT).unlocked.map((e) => e.id)).not.toContain(
      'secret_named_hero',
    );

    save.player.name = 'Kaosriddaren';
    expect(evaluateAchievements(save, AT).unlocked.map((e) => e.id)).toContain(
      'secret_named_hero',
    );
  });

  it('accumulates reward gold and XP from unlocks', () => {
    const save = makeSave();
    save.statistics.questsCompleted = 25;

    const result = evaluateAchievements(save, AT);

    const expectedGold = result.unlocked.reduce(
      (sum, achievement) => sum + (achievement.rewardGold ?? 0),
      0,
    );
    expect(result.rewardGold).toBe(expectedGold);
    expect(result.rewardGold).toBeGreaterThan(0);
  });

  it('never re-unlocks or re-stamps an achievement', () => {
    const save = makeSave();
    save.statistics.questsCompleted = 1;

    const first = evaluateAchievements(save, AT);
    save.achievements = first.achievements;

    const second = evaluateAchievements(save, new Date('2026-10-01T12:00:00'));

    expect(second.unlocked).toEqual([]);
    expect(second.achievements).toBe(save.achievements);
    expect(save.achievements[0].unlockedAt).toBe(first.achievements[0].unlockedAt);
  });

  it('unlocks through the real completion flow', () => {
    const save = makeSave();
    const { save: next } = completeQuest(save, makeOffer('home_bed_fortress'), AT, NO_LUCK_RNG);

    expect(next.achievements.length).toBeGreaterThan(0);
    expect(next.achievements.every((entry) => entry.unlockedAt)).toBe(true);
  });
});

describe('achievement views', () => {
  it('masks hidden achievements while locked', () => {
    const views = getAchievementViews(makeSave());
    const hidden = views.find((view) => view.hidden);

    expect(hidden).toBeDefined();
    expect(hidden?.displayName).toBe('???');
    expect(hidden?.unlocked).toBe(false);
  });

  it('reveals hidden achievements once unlocked', () => {
    const save = makeSave();
    const hidden = ACHIEVEMENTS.find((entry) => entry.hidden)!;
    save.achievements = [{ id: hidden.id, unlockedAt: AT.toISOString() }];

    const view = getAchievementViews(save).find((entry) => entry.id === hidden.id);

    expect(view?.unlocked).toBe(true);
    expect(view?.displayName).toBe(hidden.name);
    expect(view?.displayDescription).toBe(hidden.description);
    expect(view?.unlockedAt).toBe(AT.toISOString());
  });

  it('shows non-hidden achievements by name even while locked', () => {
    const view = getAchievementViews(makeSave()).find((entry) => entry.id === 'first_blood');
    expect(view?.displayName).toBe('FÖRSTA BLODET');
    expect(view?.unlocked).toBe(false);
  });

  it('returns one view per achievement', () => {
    expect(getAchievementViews(makeSave())).toHaveLength(ACHIEVEMENT_COUNT);
  });
});
