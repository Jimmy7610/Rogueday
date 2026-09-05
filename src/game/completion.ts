import type {
  ActiveQuestState,
  BossHitSummary,
  HistoryEntry,
  LootItemId,
  QuestOffer,
  RewardLine,
  RewardSummary,
  RogueDaySave,
  Statistics,
} from '@/types';
import { CHAIN_BY_ID } from '@/data/chains';
import { getBossById } from '@/data/bosses';
import { toLocalDateKey } from '@/utils/date';
import { createId, randomRng, type Rng } from '@/utils/rng';
import { applyBossDamage, ensureCurrentBoss, getWeaknessInfo } from './boss';
import { evaluateAchievements } from './achievements';
import {
  DAILY_PACK_GOLD_BONUS,
  getDailyPack,
  qualifiesForDailyBonus,
  recordPackCompletion,
} from './activityPacks';
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
import { getEffects, pendingMilestones } from './perks';
import { applyGold, applyXp } from './progression';
import { DAILY_BONUS_MULTIPLIER, advanceChain, rememberQuests } from './questSelection';
import { registerCompletion } from './streak';
import {
  TIME_BONUS_DAMAGE_FRACTION,
  TIME_BONUS_GOLD_FRACTION,
  TIME_BONUS_XP_FRACTION,
  beatTheClock,
} from './timer';

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
 * This is the single place where a completion changes the game: rewards, boss
 * damage, history, streak, chains, statistics, loot, perks and achievements all
 * flow from here into one new authoritative save object.
 *
 * Every reward is recorded as an itemised `RewardLine`. The lines are summed to
 * produce exactly the XP and gold applied to progression, so the HUD can never
 * move without the player being shown why.
 */
export function completeQuest(
  save: RogueDaySave,
  offer: QuestOffer,
  now: Date = new Date(),
  rng: Rng = randomRng,
  active?: ActiveQuestState | null,
): CompletionResult {
  const quest = offer.quest;
  const dateKey = toLocalDateKey(now);
  const isoNow = now.toISOString();
  const effects = getEffects(save);
  const lines: RewardLine[] = [];

  /* ---------------- quest reward ---------------- */

  const isFirstToday = (save.statistics.completionDates[dateKey] ?? 0) === 0;

  const dailyMultiplier = offer.isDaily
    ? DAILY_BONUS_MULTIPLIER + effects.dailyQuestXpBonus
    : 1;
  const elixirMultiplier = save.buffs.xpElixir ? XP_ELIXIR_MULTIPLIER : 1;
  const shrineMultiplier = save.buffs.shrineXpBonusQuests > 0 ? SHRINE_XP_MULTIPLIER : 1;
  const firstQuestMultiplier = isFirstToday ? 1 + effects.firstQuestXpBonus : 1;

  const goldMultiplier =
    (save.buffs.focusRune ? FOCUS_RUNE_GOLD_MULTIPLIER : 1) *
    (offer.isDaily ? DAILY_BONUS_MULTIPLIER : 1) *
    (1 + effects.goldBonus);

  const xpEarned = Math.round(
    offer.xp * dailyMultiplier * elixirMultiplier * shrineMultiplier * firstQuestMultiplier,
  );
  const goldEarned = Math.round(offer.gold * goldMultiplier);

  lines.push({
    id: 'quest',
    label: 'UPPDRAG',
    xp: xpEarned,
    gold: goldEarned,
    detail: quest.title,
    tone: 'default',
  });

  /* ---------------- daily pack bonus ---------------- */

  // The pack the quest was rolled from, and whether this completion is the
  // first one today through DAGENS LÄGE. Modest and once per day.
  const packId = (active ?? save.activeQuest)?.packId ?? null;
  const viaDailyPack = qualifiesForDailyBonus(save.packs, packId, dateKey);

  if (viaDailyPack) {
    const bonusGold = Math.max(1, Math.round(goldEarned * DAILY_PACK_GOLD_BONUS));
    lines.push({
      id: 'daily-pack',
      label: 'DAGENS LÄGE',
      xp: 0,
      gold: bonusGold,
      detail: getDailyPack(dateKey).name,
      tone: 'bonus',
    });
  }

  /* ---------------- timed challenge ---------------- */

  const activeQuest = active ?? save.activeQuest;
  const hadTimedChallenge = Boolean(offer.challenge?.timerMinutes);
  const timeBonus = hadTimedChallenge && beatTheClock(activeQuest ?? null, now);

  let timeBonusXp = 0;
  let timeBonusGold = 0;
  if (timeBonus) {
    timeBonusXp = Math.round(xpEarned * TIME_BONUS_XP_FRACTION);
    timeBonusGold = Math.round(goldEarned * TIME_BONUS_GOLD_FRACTION);
    lines.push({
      id: 'time',
      label: 'TIDSBONUS',
      xp: timeBonusXp,
      gold: timeBonusGold,
      detail: offer.challenge?.name ?? 'Klarat i tid',
      tone: 'bonus',
    });
  }

  /* ---------------- boss ---------------- */

  const { boss: currentBoss } = ensureCurrentBoss(save.boss, now);
  const definition = getBossById(currentBoss.bossId);
  const weakness = getWeaknessInfo(definition, quest.category, effects.weaknessBonusExtra);

  const bossKeyMultiplier = save.buffs.bossKey ? BOSS_KEY_DAMAGE_MULTIPLIER : 1;
  const rawDamage =
    offer.bossDamage *
    bossKeyMultiplier *
    weakness.multiplier *
    (1 + effects.bossDamageBonus) *
    (timeBonus ? 1 + TIME_BONUS_DAMAGE_FRACTION : 1);

  const bossResult = applyBossDamage(currentBoss, rawDamage, now);

  let bossHistory = save.bossHistory;
  const bossLoot: LootItemId[] = [];

  if (bossResult.justDefeated && bossResult.defeatedBoss) {
    const defeated = bossResult.defeatedBoss;
    bossLoot.push(defeated.reward.chest);
    lines.push({
      id: 'boss',
      label: 'BOSS BESEGRAD',
      xp: defeated.reward.xp,
      gold: defeated.reward.gold,
      detail: defeated.name,
      loot: [defeated.reward.chest],
      tone: 'boss',
    });
    bossHistory = [
      {
        bossId: defeated.id,
        bossName: defeated.name,
        weekKey: bossResult.boss.weekKey,
        defeatedAt: isoNow,
        questsUsed: bossResult.boss.questsContributed,
        totalDamage: bossResult.boss.totalDamage,
        rewardXp: defeated.reward.xp,
        rewardGold: defeated.reward.gold,
        rewardChest: defeated.reward.chest,
      },
      ...save.bossHistory,
    ];
  }

  const bossSummary: BossHitSummary | null = definition
    ? {
        bossId: definition.id,
        bossName: definition.name,
        icon: definition.icon,
        accent: definition.accent,
        hpBefore: bossResult.hpBefore,
        hpAfter: bossResult.boss.currentHp,
        maxHp: bossResult.boss.maxHp,
        damage: bossResult.damageDealt,
        weaknessHit: weakness.weak,
        weaknessMultiplier: weakness.multiplier,
        resisted: weakness.resistant,
        defeated: bossResult.justDefeated,
        phasesTriggered: bossResult.phasesTriggered,
      }
    : null;

  /* ---------------- loot ---------------- */

  const questLoot = rollQuestLoot(
    offer.rarity,
    save.buffs.luckyCoin,
    rng,
    effects.lootChanceBonus,
  );
  const allLoot: LootItemId[] = [...questLoot.items, ...bossLoot];

  /* ---------------- chains ---------------- */

  const chainResult = advanceChain(save.questChains, quest, isoNow);
  const completedChain = chainResult.completedChainId
    ? CHAIN_BY_ID[chainResult.completedChainId]
    : undefined;

  if (completedChain) {
    if (completedChain.chestReward) allLoot.push(completedChain.chestReward);
    lines.push({
      id: 'chain',
      label: 'KEDJEBONUS',
      xp: completedChain.bonusXp,
      gold: completedChain.bonusGold,
      detail: completedChain.name,
      ...(completedChain.chestReward ? { loot: [completedChain.chestReward] } : {}),
      tone: 'chain',
    });
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

  const subtotalXp = lines.reduce((sum, line) => sum + line.xp, 0);
  const subtotalGold = lines.reduce((sum, line) => sum + line.gold, 0);

  const statistics: Statistics = {
    ...save.statistics,
    questsCompleted: save.statistics.questsCompleted + 1,
    questsByCategory: bumpRecord(save.statistics.questsByCategory, quest.category),
    questsByRarity: {
      ...save.statistics.questsByRarity,
      [offer.rarity]: save.statistics.questsByRarity[offer.rarity] + 1,
    },
    questsByDuration: bumpRecord(save.statistics.questsByDuration, String(quest.duration)),
    totalXpEarned: save.statistics.totalXpEarned + subtotalXp,
    totalGoldEarned: save.statistics.totalGoldEarned + subtotalGold,
    totalMinutes: save.statistics.totalMinutes + quest.duration,
    totalBossDamage: save.statistics.totalBossDamage + bossResult.damageDealt,
    bossesDefeated: save.statistics.bossesDefeated + (bossResult.justDefeated ? 1 : 0),
    legendaryQuests: save.statistics.legendaryQuests + (offer.rarity === 'legendary' ? 1 : 0),
    epicQuests: save.statistics.epicQuests + (offer.rarity === 'epic' ? 1 : 0),
    chaosQuests: save.statistics.chaosQuests + (historyEntry.mode === 'chaos' ? 1 : 0),
    dailyQuestsCompleted: save.statistics.dailyQuestsCompleted + (offer.isDaily ? 1 : 0),
    chainsCompleted: save.statistics.chainsCompleted + (completedChain ? 1 : 0),
    lootFound: save.statistics.lootFound + allLoot.length,
    timedChallengesWon: save.statistics.timedChallengesWon + (timeBonus ? 1 : 0),
    weaknessHits: save.statistics.weaknessHits + (weakness.weak ? 1 : 0),
    completionDates: bumpRecord(save.statistics.completionDates, dateKey),
  };

  /* ---------------- progression (part one) ---------------- */

  const levelBefore = save.progression.level;
  const xpResult = applyXp(save.progression, subtotalXp);
  let progression = applyGold(xpResult.progression, subtotalGold);
  const levelUps = [...xpResult.levelUps];

  /* ---------------- assemble the new save ---------------- */

  let nextSave: RogueDaySave = {
    ...save,
    progression,
    inventory,
    buffs: consumeBuffs(save.buffs, effects.bossKeyDoubleHit && save.buffs.bossKey),
    history: [historyEntry, ...save.history],
    boss: bossResult.boss,
    bossHistory,
    questChains: chainResult.chains,
    statistics,
    streak: streakResult.streak,
    daily: offer.isDaily ? { ...save.daily, completed: true } : save.daily,
    activeQuest: null,
    recentQuestIds: rememberQuests(save.recentQuestIds, [quest.id]),
    packs: {
      ...recordPackCompletion(save.packs, packId, viaDailyPack),
      ...(viaDailyPack ? { dailyBonusClaimedOn: dateKey } : {}),
    },
  };

  /* ---------------- achievements ---------------- */

  const achievementResult = evaluateAchievements(nextSave, now);

  if (achievementResult.unlocked.length > 0) {
    lines.push({
      id: 'badges',
      label: 'MÄRKEN',
      xp: achievementResult.rewardXp,
      gold: achievementResult.rewardGold,
      detail: achievementResult.unlocked.map((entry) => entry.name).join(' · '),
      tone: 'badge',
    });

    const achievementXp = applyXp(nextSave.progression, achievementResult.rewardXp);
    progression = applyGold(achievementXp.progression, achievementResult.rewardGold);
    levelUps.push(...achievementXp.levelUps);

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

  /* ---------------- totals ---------------- */

  const totalXp = lines.reduce((sum, line) => sum + line.xp, 0);
  const totalGold = lines.reduce((sum, line) => sum + line.gold, 0);

  const perkChoicesUnlocked = pendingMilestones(
    nextSave.progression.level,
    nextSave.perks,
  ).filter((milestone) => milestone > levelBefore);

  const reward: RewardSummary = {
    lines,
    totalXp,
    totalGold,
    xp: xpEarned,
    gold: goldEarned,
    bossDamage: bossResult.damageDealt,
    bossDefeated: bossResult.justDefeated,
    boss: bossSummary,
    loot: allLoot,
    levelUps,
    achievements: achievementResult.unlocked,
    ...(completedChain ? { chainCompleted: completedChain } : {}),
    streak: streakResult.streak.current,
    streakSaved: streakResult.shieldUsed,
    dailyBonus: offer.isDaily,
    timeBonus,
    perkChoicesUnlocked,
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
