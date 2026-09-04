import type {
  HistoryEntry,
  LootItemId,
  QuestOffer,
  RewardSummary,
  RogueDaySave,
  Statistics,
} from '@/types';
import { CHAIN_BY_ID } from '@/data/chains';
import { toLocalDateKey } from '@/utils/date';
import { createId, randomRng, type Rng } from '@/utils/rng';
import { applyBossDamage, ensureCurrentBoss } from './boss';
import { evaluateAchievements } from './achievements';
import {
  BOSS_KEY_DAMAGE_MULTIPLIER,
  FOCUS_RUNE_GOLD_MULTIPLIER,
  SHRINE_XP_MULTIPLIER,
  XP_ELIXIR_MULTIPLIER,
  addItems,
  consumeBuffs,
  removeItem,
  rollQuestLoot,
} from './loot';
import { applyGold, applyXp } from './progression';
import { DAILY_BONUS_MULTIPLIER, advanceChain, rememberQuests } from './questSelection';
import { registerCompletion } from './streak';

export interface CompletionResult {
  save: RogueDaySave;
  reward: RewardSummary;
}

function bumpRecord(record: Record<string, number>, key: string, amount = 1): Record<string, number> {
  return { ...record, [key]: (record[key] ?? 0) + amount };
}

/**
 * Complete the active quest.
 *
 * This is the single place where a completion changes the game: rewards,
 * boss damage, history, streak, chains, statistics, loot and achievements all
 * flow from here into one new authoritative save object. The caller persists
 * that object; nothing here touches storage directly.
 */
export function completeQuest(
  save: RogueDaySave,
  offer: QuestOffer,
  now: Date = new Date(),
  rng: Rng = randomRng,
): CompletionResult {
  const quest = offer.quest;
  const dateKey = toLocalDateKey(now);
  const isoNow = now.toISOString();

  /* ---------------- rewards ---------------- */

  const dailyMultiplier = offer.isDaily ? DAILY_BONUS_MULTIPLIER : 1;
  const elixirMultiplier = save.buffs.xpElixir ? XP_ELIXIR_MULTIPLIER : 1;
  const shrineMultiplier = save.buffs.shrineXpBonusQuests > 0 ? SHRINE_XP_MULTIPLIER : 1;
  const goldMultiplier = save.buffs.focusRune ? FOCUS_RUNE_GOLD_MULTIPLIER : 1;

  const xpEarned = Math.round(offer.xp * dailyMultiplier * elixirMultiplier * shrineMultiplier);
  const goldEarned = Math.round(offer.gold * dailyMultiplier * goldMultiplier);

  /* ---------------- boss ---------------- */

  const { boss: currentBoss } = ensureCurrentBoss(save.boss, now);
  const rawDamage = offer.bossDamage * (save.buffs.bossKey ? BOSS_KEY_DAMAGE_MULTIPLIER : 1);
  const bossResult = applyBossDamage(currentBoss, rawDamage, now);

  let bossHistory = save.bossHistory;
  let bossRewardXp = 0;
  let bossRewardGold = 0;
  const bossLoot: LootItemId[] = [];

  if (bossResult.justDefeated && bossResult.defeatedBoss) {
    const definition = bossResult.defeatedBoss;
    bossRewardXp = definition.reward.xp;
    bossRewardGold = definition.reward.gold;
    bossLoot.push(definition.reward.chest);
    bossHistory = [
      {
        bossId: definition.id,
        bossName: definition.name,
        weekKey: bossResult.boss.weekKey,
        defeatedAt: isoNow,
        questsUsed: bossResult.boss.questsContributed,
        totalDamage: bossResult.boss.totalDamage,
        rewardXp: definition.reward.xp,
        rewardGold: definition.reward.gold,
        rewardChest: definition.reward.chest,
      },
      ...save.bossHistory,
    ];
  }

  /* ---------------- loot ---------------- */

  const questLoot = rollQuestLoot(offer.rarity, save.buffs.luckyCoin, rng);
  const allLoot: LootItemId[] = [...questLoot.items, ...bossLoot];

  /* ---------------- chains ---------------- */

  const chainResult = advanceChain(save.questChains, quest, isoNow);
  const completedChain = chainResult.completedChainId
    ? CHAIN_BY_ID[chainResult.completedChainId]
    : undefined;

  let chainXp = 0;
  let chainGold = 0;
  if (completedChain) {
    chainXp = completedChain.bonusXp;
    chainGold = completedChain.bonusGold;
    if (completedChain.chestReward) allLoot.push(completedChain.chestReward);
  }

  /* ---------------- streak ---------------- */

  const streakResult = registerCompletion(save.streak, save.inventory, now);

  /* ---------------- inventory ---------------- */

  let inventory = addItems(save.inventory, allLoot);
  if (streakResult.shieldUsed) {
    inventory = removeItem(inventory, 'streak_shield', 1);
  }

  /* ---------------- history ---------------- */

  const historyEntry: HistoryEntry = {
    entryId: createId('h'),
    questId: quest.id,
    title: quest.title,
    category: quest.category,
    rarity: offer.rarity,
    difficulty: quest.difficulty,
    duration: quest.duration,
    xpEarned,
    goldEarned,
    bossDamage: bossResult.damageDealt,
    completedAt: isoNow,
    completedDate: dateKey,
    mode: quest.mode === 'chaos' || offer.modifier ? 'chaos' : 'normal',
    isDaily: offer.isDaily,
    ...(quest.chainId ? { chainId: quest.chainId } : {}),
  };

  /* ---------------- statistics ---------------- */

  const statistics: Statistics = {
    ...save.statistics,
    questsCompleted: save.statistics.questsCompleted + 1,
    questsByCategory: bumpRecord(save.statistics.questsByCategory, quest.category),
    questsByRarity: {
      ...save.statistics.questsByRarity,
      [offer.rarity]: save.statistics.questsByRarity[offer.rarity] + 1,
    },
    questsByDuration: bumpRecord(save.statistics.questsByDuration, String(quest.duration)),
    totalXpEarned: save.statistics.totalXpEarned + xpEarned + bossRewardXp + chainXp,
    totalGoldEarned: save.statistics.totalGoldEarned + goldEarned + bossRewardGold + chainGold,
    totalMinutes: save.statistics.totalMinutes + quest.duration,
    totalBossDamage: save.statistics.totalBossDamage + bossResult.damageDealt,
    bossesDefeated: save.statistics.bossesDefeated + (bossResult.justDefeated ? 1 : 0),
    legendaryQuests: save.statistics.legendaryQuests + (offer.rarity === 'legendary' ? 1 : 0),
    epicQuests: save.statistics.epicQuests + (offer.rarity === 'epic' ? 1 : 0),
    chaosQuests: save.statistics.chaosQuests + (historyEntry.mode === 'chaos' ? 1 : 0),
    dailyQuestsCompleted: save.statistics.dailyQuestsCompleted + (offer.isDaily ? 1 : 0),
    chainsCompleted: save.statistics.chainsCompleted + (completedChain ? 1 : 0),
    lootFound: save.statistics.lootFound + allLoot.length,
    completionDates: bumpRecord(save.statistics.completionDates, dateKey),
  };

  /* ---------------- progression ---------------- */

  const totalXp = xpEarned + bossRewardXp + chainXp;
  const xpResult = applyXp(save.progression, totalXp);
  let progression = applyGold(xpResult.progression, goldEarned + bossRewardGold + chainGold);

  /* ---------------- assemble the new save ---------------- */

  let nextSave: RogueDaySave = {
    ...save,
    progression,
    inventory,
    buffs: consumeBuffs(save.buffs),
    history: [historyEntry, ...save.history],
    boss: bossResult.boss,
    bossHistory,
    questChains: chainResult.chains,
    statistics,
    streak: streakResult.streak,
    daily: offer.isDaily ? { ...save.daily, completed: true } : save.daily,
    activeQuest: null,
    recentQuestIds: rememberQuests(save.recentQuestIds, [quest.id]),
  };

  /* ---------------- achievements ---------------- */

  const achievementResult = evaluateAchievements(nextSave, now);

  if (achievementResult.unlocked.length > 0) {
    const achievementXp = applyXp(nextSave.progression, achievementResult.rewardXp);
    progression = applyGold(achievementXp.progression, achievementResult.rewardGold);
    xpResult.levelUps.push(...achievementXp.levelUps);

    nextSave = {
      ...nextSave,
      progression,
      achievements: achievementResult.achievements,
      statistics: {
        ...nextSave.statistics,
        totalXpEarned: nextSave.statistics.totalXpEarned + achievementResult.rewardXp,
        totalGoldEarned: nextSave.statistics.totalGoldEarned + achievementResult.rewardGold,
      },
    };
  }

  const reward: RewardSummary = {
    xp: xpEarned,
    gold: goldEarned,
    bossDamage: bossResult.damageDealt,
    bossDefeated: bossResult.justDefeated,
    loot: allLoot,
    levelUps: xpResult.levelUps,
    achievements: achievementResult.unlocked,
    ...(completedChain ? { chainCompleted: completedChain } : {}),
    streak: streakResult.streak.current,
    dailyBonus: offer.isDaily,
  };

  return { save: nextSave, reward };
}

/** Abandoning a quest costs nothing but is recorded in the statistics. */
export function abandonQuest(save: RogueDaySave): RogueDaySave {
  return {
    ...save,
    activeQuest: null,
    statistics: {
      ...save.statistics,
      questsAbandoned: save.statistics.questsAbandoned + 1,
    },
  };
}
