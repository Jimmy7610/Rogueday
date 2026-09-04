/**
 * RogueDay - core domain types.
 * Code is English; all user-facing copy lives in data files and components (Swedish).
 */

/* ------------------------------------------------------------------ */
/* Quest domain                                                        */
/* ------------------------------------------------------------------ */

export type QuestCategory =
  | 'adulting'
  | 'home'
  | 'cleaning'
  | 'organization'
  | 'outside'
  | 'walking'
  | 'social'
  | 'creative'
  | 'health'
  | 'movement'
  | 'mindfulness'
  | 'digital'
  | 'learning'
  | 'decluttering'
  | 'food'
  | 'selfcare'
  | 'miniadventure'
  | 'chaos'
  | 'secret'
  | 'weekend'
  | 'morning'
  | 'evening';

/** Available time in minutes. */
export type QuestDuration = 5 | 15 | 30 | 60;

export type EnergyLevel = 'low' | 'medium' | 'high';

export type QuestLocation = 'home' | 'outside' | 'anywhere';

export type Mood = 'bored' | 'stressed' | 'motivated' | 'adventurous';

/** Which run-mode a quest belongs to. `any` fits both. */
export type QuestMode = 'normal' | 'chaos' | 'any';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** The three offered risk tiers after a roll. */
export type ChoiceTier = 'safe' | 'wild' | 'dangerous';

export interface Quest {
  id: string;
  title: string;
  description: string;
  flavourText: string;
  category: QuestCategory;
  duration: QuestDuration;
  energy: EnergyLevel;
  locations: QuestLocation[];
  moods: Mood[];
  mode: QuestMode;
  difficulty: Difficulty;
  baseXp: number;
  baseGold: number;
  rarity: Rarity;
  tags: string[];
  /** Set when the quest belongs to a chain. */
  chainId?: string;
  chainStep?: number;
}

/** A quest instance offered to the player, with rolled rewards + modifiers. */
export interface QuestOffer {
  offerId: string;
  tier: ChoiceTier;
  quest: Quest;
  /** Effective rarity after the tier roll (may upgrade the base rarity). */
  rarity: Rarity;
  xp: number;
  gold: number;
  bossDamage: number;
  /** Chaos modifier applied on top (chaos mode only). */
  modifier?: ChaosModifier;
  /** Mystery quests hide their description until accepted. */
  hidden: boolean;
  isDaily: boolean;
  chainInfo?: { chainId: string; step: number; total: number; chainName: string };
}

export interface ChaosModifier {
  id: string;
  name: string;
  description: string;
  /** Multiplier applied to XP and gold. */
  rewardMultiplier: number;
  /** If true the real objective is hidden until accepted. */
  hidesObjective?: boolean;
}

export interface QuestFilters {
  duration: QuestDuration;
  energy: EnergyLevel;
  location: QuestLocation;
  mood: Mood;
  mode: 'normal' | 'chaos';
}

/* ------------------------------------------------------------------ */
/* Chains                                                              */
/* ------------------------------------------------------------------ */

export interface QuestChain {
  id: string;
  name: string;
  description: string;
  icon: string;
  questIds: string[];
  bonusXp: number;
  bonusGold: number;
  badgeId?: string;
  chestReward?: LootItemId;
}

export interface ChainProgressState {
  chainId: string;
  completedSteps: number;
  completedQuestIds: string[];
  completed: boolean;
  completedAt?: string;
}

/* ------------------------------------------------------------------ */
/* Loot                                                                */
/* ------------------------------------------------------------------ */

export type LootItemId =
  | 'reroll_token'
  | 'streak_shield'
  | 'lucky_coin'
  | 'xp_elixir'
  | 'boss_key'
  | 'mystery_chest'
  | 'epic_chest'
  | 'legendary_chest'
  | 'gold_pouch'
  | 'focus_rune';

export interface LootItem {
  id: LootItemId;
  name: string;
  description: string;
  icon: string;
  rarity: Rarity;
  /** Chest items open into other loot when used. */
  isChest: boolean;
  /** Consumables can be used from the inventory. */
  usable: boolean;
}

export interface InventoryEntry {
  itemId: LootItemId;
  count: number;
}

/** Buffs that apply to the next completed quest. */
export interface ActiveBuffs {
  xpElixir: boolean;
  luckyCoin: boolean;
  bossKey: boolean;
  focusRune: boolean;
  /** From ANCIENT SHRINE event - number of quests left with the bonus. */
  shrineXpBonusQuests: number;
}

/* ------------------------------------------------------------------ */
/* Progression                                                         */
/* ------------------------------------------------------------------ */

export interface LevelTitle {
  level: number;
  title: string;
}

export interface LevelInfo {
  level: number;
  title: string;
  xpIntoLevel: number;
  xpForLevel: number;
  totalXp: number;
  progress: number;
}

/* ------------------------------------------------------------------ */
/* Bosses                                                              */
/* ------------------------------------------------------------------ */

export interface BossDefinition {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  flavourText: string;
  maxHp: number;
  difficulty: Difficulty;
  icon: string;
  /** CSS accent colour used by the boss illustration. */
  accent: string;
  reward: BossReward;
}

export interface BossReward {
  xp: number;
  gold: number;
  badgeId: string;
  chest: LootItemId;
}

export interface BossState {
  bossId: string;
  /** Local YYYY-MM-DD of the Monday that starts this boss week. */
  weekKey: string;
  currentHp: number;
  maxHp: number;
  defeated: boolean;
  defeatedAt?: string;
  totalDamage: number;
  questsContributed: number;
  /** Damage per local YYYY-MM-DD, for "damage today". */
  damageByDate: Record<string, number>;
}

export interface BossHistoryEntry {
  bossId: string;
  bossName: string;
  weekKey: string;
  defeatedAt: string;
  questsUsed: number;
  totalDamage: number;
  rewardXp: number;
  rewardGold: number;
  rewardChest: LootItemId;
}

/* ------------------------------------------------------------------ */
/* History and stats                                                   */
/* ------------------------------------------------------------------ */

export interface HistoryEntry {
  entryId: string;
  questId: string;
  title: string;
  category: QuestCategory;
  rarity: Rarity;
  difficulty: Difficulty;
  duration: QuestDuration;
  xpEarned: number;
  goldEarned: number;
  bossDamage: number;
  /** ISO timestamp. */
  completedAt: string;
  /** Local YYYY-MM-DD. */
  completedDate: string;
  mode: 'normal' | 'chaos';
  isDaily: boolean;
  chainId?: string;
}

export interface Statistics {
  questsCompleted: number;
  questsAbandoned: number;
  questsByCategory: Record<string, number>;
  questsByRarity: Record<Rarity, number>;
  questsByDuration: Record<string, number>;
  totalXpEarned: number;
  totalGoldEarned: number;
  totalGoldSpent: number;
  totalMinutes: number;
  totalBossDamage: number;
  bossesDefeated: number;
  legendaryQuests: number;
  epicQuests: number;
  chaosQuests: number;
  dailyQuestsCompleted: number;
  chainsCompleted: number;
  rerollsUsed: number;
  lootFound: number;
  eventsTriggered: number;
  /** Local YYYY-MM-DD -> quests completed that day. */
  completionDates: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

export type AchievementCategory =
  | 'quests'
  | 'streak'
  | 'boss'
  | 'rarity'
  | 'gold'
  | 'chaos'
  | 'chains'
  | 'special'
  | 'secret';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  /** Shown while locked when `hidden` is true. */
  hiddenName: string;
  category: AchievementCategory;
  icon: string;
  hidden: boolean;
  rewardGold?: number;
  rewardXp?: number;
  check: (ctx: AchievementContext) => boolean;
}

export interface AchievementContext {
  statistics: Statistics;
  progression: Progression;
  streak: StreakState;
  history: HistoryEntry[];
  bossHistory: BossHistoryEntry[];
  chains: Record<string, ChainProgressState>;
  inventory: InventoryEntry[];
  player: Player;
  achievementsUnlocked: number;
}

export interface AchievementState {
  id: string;
  unlockedAt: string;
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export type EventId =
  | 'wandering_merchant'
  | 'double_or_nothing'
  | 'lucky_drop'
  | 'goblin_tax'
  | 'mysterious_stranger'
  | 'ancient_shrine';

export interface GameEventChoice {
  id: string;
  label: string;
  description: string;
}

export interface GameEventDefinition {
  id: EventId;
  name: string;
  title: string;
  description: string;
  icon: string;
  weight: number;
  choices: GameEventChoice[];
}

export interface PendingEvent {
  eventId: EventId;
  /** Per-event payload rolled at trigger time. */
  payload: Record<string, number | string>;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Player / settings / save                                            */
/* ------------------------------------------------------------------ */

export interface Player {
  name: string;
  createdAt: string;
}

export interface Progression {
  level: number;
  xp: number;
  totalXp: number;
  gold: number;
}

export interface StreakState {
  current: number;
  longest: number;
  /** Local YYYY-MM-DD of the last day a quest was completed. */
  lastCompletionDate: string | null;
  /** Shield consumed automatically to protect a single missed day. */
  shieldUsedOn: string | null;
}

export interface DailyState {
  /** Local YYYY-MM-DD. */
  date: string | null;
  questId: string | null;
  completed: boolean;
  /** Free reroll allowance is per local day. */
  freeRerollUsedOn: string | null;
}

export interface Settings {
  sound: boolean;
  reducedMotion: boolean;
  animations: boolean;
  highContrast: boolean;
}

export interface ActiveQuestState {
  offer: QuestOffer;
  acceptedAt: string;
}

export interface SaveMetadata {
  createdAt: string;
  lastSavedAt: string;
  saveCount: number;
  appVersion: string;
}

export interface RogueDaySave {
  schemaVersion: number;
  player: Player;
  progression: Progression;
  inventory: InventoryEntry[];
  buffs: ActiveBuffs;
  history: HistoryEntry[];
  achievements: AchievementState[];
  boss: BossState | null;
  bossHistory: BossHistoryEntry[];
  questChains: Record<string, ChainProgressState>;
  statistics: Statistics;
  daily: DailyState;
  streak: StreakState;
  settings: Settings;
  activeQuest: ActiveQuestState | null;
  /** Quest ids recently offered/completed, most recent first. */
  recentQuestIds: string[];
  onboardingComplete: boolean;
  metadata: SaveMetadata;
}

/* ------------------------------------------------------------------ */
/* Runtime-only UI state                                               */
/* ------------------------------------------------------------------ */

export type ScreenId = 'quests' | 'boss' | 'history' | 'badges' | 'data';

export interface RewardSummary {
  xp: number;
  gold: number;
  bossDamage: number;
  bossDefeated: boolean;
  loot: LootItemId[];
  levelUps: { level: number; title: string }[];
  achievements: AchievementDefinition[];
  chainCompleted?: QuestChain;
  streak: number;
  dailyBonus: boolean;
}
