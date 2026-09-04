import type {
  AchievementContext,
  AchievementDefinition,
  AchievementState,
  RogueDaySave,
} from '@/types';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from '@/data/achievements';

export function buildAchievementContext(save: RogueDaySave): AchievementContext {
  return {
    statistics: save.statistics,
    progression: save.progression,
    streak: save.streak,
    history: save.history,
    bossHistory: save.bossHistory,
    chains: save.questChains,
    inventory: save.inventory,
    player: save.player,
    achievementsUnlocked: save.achievements.length,
  };
}

export interface AchievementEvaluation {
  achievements: AchievementState[];
  unlocked: AchievementDefinition[];
  rewardGold: number;
  rewardXp: number;
}

/**
 * Run every achievement predicate against the current save and unlock the
 * ones that now pass. Already-unlocked achievements are never re-evaluated,
 * so their unlock timestamps stay stable.
 */
export function evaluateAchievements(
  save: RogueDaySave,
  now: Date = new Date(),
): AchievementEvaluation {
  const unlockedIds = new Set(save.achievements.map((entry) => entry.id));
  const context = buildAchievementContext(save);

  const newlyUnlocked: AchievementDefinition[] = [];
  let rewardGold = 0;
  let rewardXp = 0;

  for (const achievement of ACHIEVEMENTS) {
    if (unlockedIds.has(achievement.id)) continue;
    let passes = false;
    try {
      passes = achievement.check(context);
    } catch {
      // A malformed save should never crash the unlock pass.
      passes = false;
    }
    if (!passes) continue;

    newlyUnlocked.push(achievement);
    rewardGold += achievement.rewardGold ?? 0;
    rewardXp += achievement.rewardXp ?? 0;
  }

  if (newlyUnlocked.length === 0) {
    return { achievements: save.achievements, unlocked: [], rewardGold: 0, rewardXp: 0 };
  }

  const unlockedAt = now.toISOString();
  const achievements = [
    ...save.achievements,
    ...newlyUnlocked.map((achievement) => ({ id: achievement.id, unlockedAt })),
  ];

  return { achievements, unlocked: newlyUnlocked, rewardGold, rewardXp };
}

export interface AchievementView extends AchievementDefinition {
  unlocked: boolean;
  unlockedAt: string | null;
  /** What to show in the UI - hidden achievements stay masked while locked. */
  displayName: string;
  displayDescription: string;
}

export function getAchievementViews(save: RogueDaySave): AchievementView[] {
  const unlockedMap = new Map(save.achievements.map((entry) => [entry.id, entry.unlockedAt]));

  return ACHIEVEMENTS.map((achievement) => {
    const unlockedAt = unlockedMap.get(achievement.id) ?? null;
    const unlocked = unlockedAt !== null;
    const masked = achievement.hidden && !unlocked;

    return {
      ...achievement,
      unlocked,
      unlockedAt,
      displayName: masked ? achievement.hiddenName : achievement.name,
      displayDescription: masked ? 'Ett hemligt märke. Fortsätt spela.' : achievement.description,
    };
  });
}

export function getAchievementById(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_BY_ID[id];
}
