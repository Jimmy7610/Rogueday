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
  /** Tier challenge for WILD / DANGEROUS offers. */
  challenge?: ChallengeModifier;
  /** Mystery quests hide their description until accepted. */
  hidden: boolean;
  isDaily: boolean;
  /** Bonus damage multiplier from the weekly boss's weakness, 1 when none. */
  weaknessMultiplier?: number;
  /** True when the quest category is one the current boss is weak to. */
  hitsWeakness?: boolean;
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

/**
 * What makes WILD and DANGEROUS genuinely different from SAFE.
 *
 * A challenge is an extra, always-safe requirement layered on the quest. It is
 * shown before the player accepts (unless it hides the objective) and is stored
 * inside the accepted offer, so a reload can never change the deal.
 *
 * "Dangerous" means risk/reward in game terms - never physical risk.
 */
export interface ChallengeModifier {
  id: string;
  name: string;
  /** The extra requirement, in player-facing Swedish. */
  requirement: string;
  tier: Exclude<ChoiceTier, 'safe'>;
  /** Multiplier applied to XP and gold on top of rarity. */
  rewardMultiplier: number;
  /** When set, the challenge is a timed one and drives the focus timer. */
  timerMinutes?: number;
  /** Restrict the challenge to quests of these categories. */
  categories?: QuestCategory[];
  /** Restrict to quests of at least this duration. */
  minDuration?: QuestDuration;
  /** Mystery challenges keep the objective sealed until accepted. */
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

/** A line the boss says when its HP crosses a threshold. */
export interface BossPhase {
  /** Fraction of max HP at or below which the phase fires (0.75 / 0.5 / 0.25). */
  threshold: number;
  message: string;
}

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
  /** Quest categories that hit this boss harder. */
  weaknessCategories: QuestCategory[];
  /** Quest categories this boss shrugs off. */
  resistanceCategories: QuestCategory[];
  /** Reaction lines fired once each as HP drops. */
  phases: BossPhase[];
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
  /** Thresholds already revealed, so each phase line fires exactly once. */
  phasesSeen: number[];
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
  /** Items bought in the market. */
  marketPurchases: number;
  /** Timed challenges beaten. */
  timedChallengesWon: number;
  /** Quests completed that hit a boss weakness. */
  weaknessHits: number;
  /** Event follow-up challenges completed. */
  followUpsCompleted: number;
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
/* Market                                                              */
/* ------------------------------------------------------------------ */

/** One item on sale in today's market. */
export interface MarketOffer {
  /** Stable per-day key, used to record purchases. */
  offerId: string;
  itemId: LootItemId;
  price: number;
  /** How many copies today's stock holds. */
  stock: number;
  /** 0 when sold at list price. */
  discountPercent: number;
  /** A single-copy highlight of the day. */
  featured: boolean;
}

export interface MarketState {
  /** Local YYYY-MM-DD the current stock belongs to. */
  date: string | null;
  /** offerId -> copies already bought today. */
  purchased: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Perks                                                               */
/* ------------------------------------------------------------------ */

export type PerkTheme = 'momentum' | 'fortune' | 'slayer';

export interface PerkDefinition {
  id: string;
  name: string;
  description: string;
  theme: PerkTheme;
  /** Milestone level at which this perk becomes selectable. */
  level: number;
  icon: string;
}

export interface PerkState {
  /** Perk ids the player has chosen, one per reached milestone. */
  selected: string[];
}

/** Aggregated passive effects of every selected perk. */
export interface PerkEffects {
  /** Extra XP fraction on the day's first completed quest. */
  firstQuestXpBonus: number;
  /** Extra XP fraction on the daily quest. */
  dailyQuestXpBonus: number;
  /** Extra free rerolls per local day. */
  extraFreeRerolls: number;
  /** Extra gold fraction on every completion. */
  goldBonus: number;
  /** Flat addition to the loot roll probability. */
  lootChanceBonus: number;
  /** Fraction off market prices. */
  merchantDiscount: number;
  /** Extra boss damage fraction. */
  bossDamageBonus: number;
  /** Added on top of the base weakness multiplier. */
  weaknessBonusExtra: number;
  /** Boss Key survives one extra qualifying hit. */
  bossKeyDoubleHit: boolean;
}

/* ------------------------------------------------------------------ */
/* Focus timer                                                         */
/* ------------------------------------------------------------------ */

/**
 * Real-timestamp timer. Elapsed time is derived from wall-clock stamps rather
 * than a decrementing counter, so backgrounding the tab, re-rendering or
 * reloading cannot drift it.
 */
export interface FocusTimerState {
  /** ISO stamp of when the current run began; null while paused. */
  runningSince: string | null;
  /** Milliseconds banked from previous runs. */
  accumulatedMs: number;
  /** Target in ms for a timed challenge; null for a free-running timer. */
  targetMs: number | null;
  /** Set once the player beats a timed challenge. */
  beatenAt?: string;
}

/* ------------------------------------------------------------------ */
/* Event follow-ups                                                    */
/* ------------------------------------------------------------------ */

/** An optional bonus objective offered by an event, claimable the same day. */
export interface EventFollowUp {
  id: string;
  eventId: EventId;
  title: string;
  description: string;
  rewardXp: number;
  rewardGold: number;
  createdAt: string;
  /** Local YYYY-MM-DD after which it quietly expires. */
  expiresOn: string;
}

/** Transient outcome of an event choice, shown before the event closes. */
export interface EventResult {
  eventId: EventId;
  choiceId: string;
  title: string;
  messages: string[];
  goldDelta: number;
  xpDelta: number;
  itemsGained: LootItemId[];
  followUp?: EventFollowUp;
}

/** Transient result of using or buying an item, for the reveal animation. */
export interface ItemRevealState {
  /** The chest or item that was used. */
  sourceItemId: LootItemId;
  title: string;
  itemsGained: LootItemId[];
  goldGained: number;
  messages: string[];
  isChest: boolean;
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
  /** Optional focus timer. Absent until the player starts one. */
  timer?: FocusTimerState;
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
  /** v2: today's market stock purchases. */
  market: MarketState;
  /** v2: chosen milestone perks. */
  perks: PerkState;
  /** v2: an outstanding optional bonus objective from an event. */
  eventFollowUp: EventFollowUp | null;
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

/**
 * One explained contribution to a completion's reward. The lines always add up
 * to the totals, so the HUD can never change without the player seeing why.
 */
export interface RewardLine {
  id: string;
  /** Swedish heading, e.g. "UPPDRAG", "TIDSBONUS", "BOSS BESEGRAD". */
  label: string;
  xp: number;
  gold: number;
  /** Optional supporting text, e.g. the chain or boss name. */
  detail?: string;
  loot?: LootItemId[];
  tone?: 'default' | 'bonus' | 'boss' | 'chain' | 'badge';
}

export interface BossHitSummary {
  bossId: string;
  bossName: string;
  icon: string;
  accent: string;
  hpBefore: number;
  hpAfter: number;
  maxHp: number;
  damage: number;
  /** True when the quest category matched a boss weakness. */
  weaknessHit: boolean;
  /** Extra multiplier applied, 1 when none. */
  weaknessMultiplier: number;
  resisted: boolean;
  defeated: boolean;
  /** Phase lines crossed by this hit, in order. */
  phasesTriggered: BossPhase[];
}

export interface RewardSummary {
  /** Every reward, itemised. Sums to totalXp / totalGold exactly. */
  lines: RewardLine[];
  totalXp: number;
  totalGold: number;
  /** Quest-only figures, kept for the compact readouts. */
  xp: number;
  gold: number;
  bossDamage: number;
  bossDefeated: boolean;
  boss: BossHitSummary | null;
  loot: LootItemId[];
  levelUps: { level: number; title: string }[];
  achievements: AchievementDefinition[];
  chainCompleted?: QuestChain;
  streak: number;
  streakSaved: boolean;
  dailyBonus: boolean;
  /** Set when a timed challenge was beaten. */
  timeBonus: boolean;
  /** Milestone levels that now owe the player a perk choice. */
  perkChoicesUnlocked: number[];
}
