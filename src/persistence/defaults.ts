import type {
  ActiveBuffs,
  DailyState,
  MarketState,
  PerkState,
  Player,
  Progression,
  RogueDaySave,
  Settings,
  Statistics,
  StreakState,
} from '@/types';

export const SCHEMA_VERSION = 2;
export const APP_VERSION = '2.0.0';
export const DEFAULT_PLAYER_NAME = 'Skuggvandrare';

export function createDefaultStatistics(): Statistics {
  return {
    questsCompleted: 0,
    questsAbandoned: 0,
    questsByCategory: {},
    questsByRarity: {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    },
    questsByDuration: {},
    totalXpEarned: 0,
    totalGoldEarned: 0,
    totalGoldSpent: 0,
    totalMinutes: 0,
    totalBossDamage: 0,
    bossesDefeated: 0,
    legendaryQuests: 0,
    epicQuests: 0,
    chaosQuests: 0,
    dailyQuestsCompleted: 0,
    chainsCompleted: 0,
    rerollsUsed: 0,
    lootFound: 0,
    eventsTriggered: 0,
    marketPurchases: 0,
    timedChallengesWon: 0,
    weaknessHits: 0,
    followUpsCompleted: 0,
    completionDates: {},
  };
}

export function createDefaultProgression(): Progression {
  return { level: 1, xp: 0, totalXp: 0, gold: 0 };
}

export function createDefaultStreak(): StreakState {
  return { current: 0, longest: 0, lastCompletionDate: null, shieldUsedOn: null };
}

export function createDefaultMarket(): MarketState {
  return { date: null, purchased: {} };
}

export function createDefaultPerks(): PerkState {
  return { selected: [] };
}

export function createDefaultDaily(): DailyState {
  return { date: null, questId: null, completed: false, freeRerollUsedOn: null };
}

export function createDefaultBuffs(): ActiveBuffs {
  return {
    xpElixir: false,
    luckyCoin: false,
    bossKey: false,
    focusRune: false,
    shrineXpBonusQuests: 0,
  };
}

export function createDefaultSettings(): Settings {
  const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  return {
    sound: false,
    reducedMotion: prefersReducedMotion,
    animations: !prefersReducedMotion,
    highContrast: false,
  };
}

export function createDefaultPlayer(name = DEFAULT_PLAYER_NAME): Player {
  return { name, createdAt: new Date().toISOString() };
}

/**
 * A brand new save. This is only ever used when no valid save exists -
 * never written over a loaded save.
 */
export function createDefaultSave(name = DEFAULT_PLAYER_NAME): RogueDaySave {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    player: createDefaultPlayer(name),
    progression: createDefaultProgression(),
    inventory: [],
    buffs: createDefaultBuffs(),
    history: [],
    achievements: [],
    boss: null,
    bossHistory: [],
    questChains: {},
    statistics: createDefaultStatistics(),
    daily: createDefaultDaily(),
    streak: createDefaultStreak(),
    settings: createDefaultSettings(),
    market: createDefaultMarket(),
    perks: createDefaultPerks(),
    eventFollowUp: null,
    activeQuest: null,
    recentQuestIds: [],
    onboardingComplete: false,
    metadata: {
      createdAt: now,
      lastSavedAt: now,
      saveCount: 0,
      appVersion: APP_VERSION,
    },
  };
}
