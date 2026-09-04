import type {
  BossDefinition,
  ChainProgressState,
  ChallengeModifier,
  ChaosModifier,
  ChoiceTier,
  PerkEffects,
  Quest,
  QuestFilters,
  QuestOffer,
  Rarity,
  RogueDaySave,
} from '@/types';
import { CHAIN_BY_ID, QUEST_CHAINS } from '@/data/chains';
import { eligibleChallenges } from '@/data/challenges';
import { getWeaknessInfo } from './boss';
import { QUESTS, getQuestById } from '@/data/quests';
import { createRng, createId, randomRng, type Rng } from '@/utils/rng';
import { toLocalDateKey } from '@/utils/date';
import {
  RARITY_DAMAGE_MULTIPLIER,
  RARITY_MULTIPLIER,
  TIER_REWARD_MULTIPLIER,
  rollTierRarity,
} from './rarity';

/** How many recently-seen quests to remember and avoid re-offering. */
export const RECENT_MEMORY = 40;

export const CHAOS_MODIFIERS: ChaosModifier[] = [
  {
    id: 'cursed',
    name: 'FÖRBANNAT UPPDRAG',
    description: 'Genomför uppdraget utan att sätta dig en enda gång.',
    rewardMultiplier: 1.3,
  },
  {
    id: 'speedrun',
    name: 'SPEEDRUN',
    description: 'Klara det på halva den utsatta tiden. Ta tid.',
    rewardMultiplier: 1.4,
  },
  {
    id: 'combo',
    name: 'COMBO-UPPDRAG',
    description: 'Lägg till en extra pytteliten syssla och gör båda.',
    rewardMultiplier: 1.35,
  },
  {
    id: 'mystery',
    name: 'MYSTERIEUPPDRAG',
    description: 'Målet avslöjas först när du accepterat.',
    rewardMultiplier: 1.5,
    hidesObjective: true,
  },
  {
    id: 'double_gamble',
    name: 'DUBBEL-XP-VADET',
    description: 'Gör en svårare version av uppdraget för dubbel belöning.',
    rewardMultiplier: 2,
  },
  {
    id: 'no_phone',
    name: 'KAOSMODIFIERARE: INGEN TELEFON',
    description: 'Ingen telefon förrän uppdraget är klart.',
    rewardMultiplier: 1.25,
  },
  {
    id: 'silence',
    name: 'TYSTNADENS PAKT',
    description: 'Genomför uppdraget utan att säga ett ord.',
    rewardMultiplier: 1.2,
  },
  {
    id: 'music_only',
    name: 'ARBETSSÅNGEN',
    description: 'Genomför uppdraget till en låt eller spellista som ger dig energi.',
    rewardMultiplier: 1.15,
  },
];

/**
 * HARD constraints. These describe what the player physically can do right now
 * and are never relaxed, in any code path, for any reason:
 *
 *   duration - never longer than the time they said they have
 *   energy   - never more demanding than the energy they said they have
 *   location - never somewhere they are not
 *
 * Mode is also hard: a chaos-only quest must not appear in a normal run.
 */
export function matchesHardConstraints(quest: Quest, filters: QuestFilters): boolean {
  if (quest.duration > filters.duration) return false;
  if (!energyAllows(filters.energy, quest.energy)) return false;

  if (filters.location !== 'anywhere') {
    if (!quest.locations.includes(filters.location) && !quest.locations.includes('anywhere')) {
      return false;
    }
  }

  if (quest.mode !== 'any' && quest.mode !== filters.mode) return false;

  return true;
}

/** Mood is a preference: it shapes the pool but may be set aside as a last resort. */
export function matchesMood(quest: Quest, filters: QuestFilters): boolean {
  return quest.moods.includes(filters.mood);
}

/** Does the quest satisfy every stated constraint, mood included? */
export function matchesFilters(quest: Quest, filters: QuestFilters): boolean {
  return matchesHardConstraints(quest, filters) && matchesMood(quest, filters);
}

const ENERGY_RANK = { low: 0, medium: 1, high: 2 } as const;

function energyAllows(available: QuestFilters['energy'], required: Quest['energy']): boolean {
  return ENERGY_RANK[required] <= ENERGY_RANK[available];
}

/**
 * Chain steps are only eligible when they are the chain's next unfinished
 * step, so a chain always plays out in order.
 */
export function isChainQuestAvailable(
  quest: Quest,
  chains: Record<string, ChainProgressState>,
): boolean {
  if (!quest.chainId || quest.chainStep === undefined) return true;
  const chain = CHAIN_BY_ID[quest.chainId];
  if (!chain) return false;
  const progress = chains[quest.chainId];
  if (progress?.completed) return false;
  const nextStep = (progress?.completedSteps ?? 0) + 1;
  return quest.chainStep === nextStep;
}

export interface PoolOptions {
  filters: QuestFilters;
  chains: Record<string, ChainProgressState>;
  recentQuestIds: string[];
  /** Include chain quests in the pool (default true). */
  includeChains?: boolean;
}

export interface QuestPoolResult {
  quests: Quest[];
  /** True when mood had to be set aside to find anything at all. */
  moodRelaxed: boolean;
}

/**
 * Build the eligible pool.
 *
 * Relaxation happens in a strict order and never touches a hard constraint:
 *
 *   1. hard constraints + mood, minus recently seen quests
 *   2. hard constraints + mood, recency allowed back in
 *   3. hard constraints only  (mood relaxed - the UI says so out loud)
 *
 * If even step 3 is empty the pool is genuinely empty, and the caller tells the
 * player rather than handing them something they cannot do.
 */
export function buildQuestPoolDetailed(options: PoolOptions): QuestPoolResult {
  const { filters, chains, recentQuestIds, includeChains = true } = options;

  const allowed = (quest: Quest): boolean => {
    if (!includeChains && quest.chainId) return false;
    if (quest.chainId && !isChainQuestAvailable(quest, chains)) return false;
    return matchesHardConstraints(quest, filters);
  };

  const hardMatches = QUESTS.filter(allowed);
  const withMood = hardMatches.filter((quest) => matchesMood(quest, filters));

  const recent = new Set(recentQuestIds);
  const freshWithMood = withMood.filter((quest) => !recent.has(quest.id));

  if (freshWithMood.length >= 3) return { quests: freshWithMood, moodRelaxed: false };
  if (withMood.length > 0) return { quests: withMood, moodRelaxed: false };

  // Mood is the only thing that may be given up, and only when nothing else
  // is on offer. Hard constraints still hold.
  const freshHard = hardMatches.filter((quest) => !recent.has(quest.id));
  if (freshHard.length >= 3) return { quests: freshHard, moodRelaxed: true };

  return { quests: hardMatches, moodRelaxed: hardMatches.length > 0 };
}

/** Backwards-compatible pool accessor. */
export function buildQuestPool(options: PoolOptions): Quest[] {
  return buildQuestPoolDetailed(options).quests;
}

function computeRewards(
  quest: Quest,
  rarity: Rarity,
  tier: ChoiceTier,
  modifier?: ChaosModifier,
  challenge?: ChallengeModifier,
): { xp: number; gold: number; bossDamage: number } {
  const rarityMultiplier = RARITY_MULTIPLIER[rarity];
  const modifierMultiplier = modifier?.rewardMultiplier ?? 1;

  // The challenge carries the tier's reward premium. Without one (SAFE, or a
  // tier whose pool was empty) the flat tier multiplier applies instead, so a
  // WILD offer is never worth less than a SAFE one.
  const tierMultiplier = challenge?.rewardMultiplier ?? TIER_REWARD_MULTIPLIER[tier];

  const xp = Math.round(quest.baseXp * rarityMultiplier * tierMultiplier * modifierMultiplier);
  const gold = Math.round(quest.baseGold * rarityMultiplier * tierMultiplier * modifierMultiplier);

  return { xp, gold, bossDamage: computeBossDamage(quest, rarity) };
}

const DAMAGE_BY_DURATION: Record<number, number> = { 5: 25, 15: 60, 30: 110, 60: 200 };

const DIFFICULTY_DAMAGE: Record<Quest['difficulty'], number> = {
  easy: 0.9,
  medium: 1,
  hard: 1.15,
  extreme: 1.3,
};

/**
 * Boss damage scales with how much the quest actually asked of the player:
 * a common 5-minute quest lands around 25, a legendary 60-minute one over 250.
 */
export function computeBossDamage(quest: Quest, rarity: Rarity): number {
  const base = DAMAGE_BY_DURATION[quest.duration] ?? 25;
  return Math.round(base * RARITY_DAMAGE_MULTIPLIER[rarity] * DIFFICULTY_DAMAGE[quest.difficulty]);
}

export interface BuildOfferOptions {
  quest: Quest;
  tier: ChoiceTier;
  filters: QuestFilters;
  rng: Rng;
  isDaily?: boolean;
  forcedRarity?: Rarity;
  /** The week's boss, so the offer can advertise a weakness hit up front. */
  boss?: BossDefinition | undefined;
  /** Perk effects, for the weakness bonus readout. */
  effects?: PerkEffects | undefined;
}

export function buildOffer(options: BuildOfferOptions): QuestOffer {
  const { quest, tier, filters, rng, isDaily = false, forcedRarity, boss, effects } = options;

  const rarity = forcedRarity ?? rollTierRarity(tier, quest.rarity, rng);

  // Chaos mode layers a modifier on top - the wilder the tier, the likelier.
  let modifier: ChaosModifier | undefined;
  if (filters.mode === 'chaos') {
    const modifierChance = tier === 'safe' ? 0.5 : tier === 'wild' ? 0.75 : 1;
    if (rng.chance(modifierChance)) {
      modifier = rng.pick(CHAOS_MODIFIERS);
    }
  }

  // WILD and DANGEROUS always carry a real, visible challenge when one fits.
  let challenge: ChallengeModifier | undefined;
  if (tier !== 'safe' && !isDaily) {
    const candidates = eligibleChallenges(quest, tier);
    if (candidates.length > 0) challenge = rng.pick(candidates);
  }

  const rewards = computeRewards(quest, rarity, tier, modifier, challenge);

  const weakness = getWeaknessInfo(boss, quest.category, effects?.weaknessBonusExtra ?? 0);

  const chain = quest.chainId ? CHAIN_BY_ID[quest.chainId] : undefined;

  return {
    offerId: createId('offer'),
    tier,
    quest,
    rarity,
    xp: rewards.xp,
    gold: rewards.gold,
    bossDamage: rewards.bossDamage,
    ...(modifier ? { modifier } : {}),
    ...(challenge ? { challenge } : {}),
    hidden: modifier?.hidesObjective === true || challenge?.hidesObjective === true,
    isDaily,
    weaknessMultiplier: weakness.multiplier,
    hitsWeakness: weakness.weak,
    ...(chain && quest.chainStep !== undefined
      ? {
          chainInfo: {
            chainId: chain.id,
            step: quest.chainStep,
            total: chain.questIds.length,
            chainName: chain.name,
          },
        }
      : {}),
  };
}

export interface RollOptions {
  filters: QuestFilters;
  chains: Record<string, ChainProgressState>;
  recentQuestIds: string[];
  rng?: Rng;
  /** The week's boss, so offers can advertise weakness hits. */
  boss?: BossDefinition | undefined;
  effects?: PerkEffects | undefined;
}

export interface QuestRollResult {
  offers: QuestOffer[];
  /** True when mood was set aside to find anything; the UI must say so. */
  moodRelaxed: boolean;
  /** True when nothing at all matched the hard constraints. */
  empty: boolean;
  /** How many quests the choices were drawn from. */
  poolSize: number;
}

/**
 * Roll the three choices.
 *
 * Every offer always satisfies the player's hard constraints - there is no
 * fallback path that hands out a 60-minute outdoor quest to someone with 15
 * minutes at home. If nothing matches, the result is explicitly empty and the
 * UI asks them to widen their filters instead.
 */
export function rollQuestChoices(options: RollOptions): QuestRollResult {
  const { filters, chains, recentQuestIds, rng = randomRng, boss, effects } = options;

  const pool = buildQuestPoolDetailed({ filters, chains, recentQuestIds });

  if (pool.quests.length === 0) {
    return { offers: [], moodRelaxed: false, empty: true, poolSize: 0 };
  }

  const shuffled = rng.shuffle(pool.quests);
  const tiers: ChoiceTier[] = ['safe', 'wild', 'dangerous'];

  const offers = tiers.map((tier, index) =>
    buildOffer({
      quest: shuffled[index % shuffled.length],
      tier,
      filters,
      rng,
      boss,
      effects,
    }),
  );

  return {
    offers,
    moodRelaxed: pool.moodRelaxed,
    empty: false,
    poolSize: pool.quests.length,
  };
}

/* ------------------------------------------------------------------ */
/* Daily quest                                                         */
/* ------------------------------------------------------------------ */

/**
 * One deterministic quest per local calendar day. Derived purely from the
 * date string, so it is identical every time the app opens that day and needs
 * no server, no network and no stored roll.
 */
export function getDailyQuestForDate(dateKey: string): Quest {
  const rng = createRng(`rogueday-daily-${dateKey}`);
  // Daily quests come from the standalone pool so a chain is never forced.
  const candidates = QUESTS.filter(
    (quest) => !quest.chainId && quest.mode !== 'chaos' && quest.category !== 'secret',
  );
  const index = rng.int(0, candidates.length - 1);
  return candidates[index];
}

export function buildDailyOffer(dateKey: string): QuestOffer {
  const quest = getDailyQuestForDate(dateKey);
  const rng = createRng(`rogueday-daily-offer-${dateKey}`);
  const filters: QuestFilters = {
    duration: quest.duration,
    energy: quest.energy,
    location: 'anywhere',
    mood: quest.moods[0],
    mode: 'normal',
  };
  return buildOffer({
    quest,
    tier: 'safe',
    filters,
    rng,
    isDaily: true,
    forcedRarity: rollTierRarity('wild', quest.rarity, rng),
  });
}

/** Bonus multiplier applied on top of the daily quest's normal rewards. */
export const DAILY_BONUS_MULTIPLIER = 1.5;

/* ------------------------------------------------------------------ */
/* Recency + chains                                                    */
/* ------------------------------------------------------------------ */

export function rememberQuests(recent: string[], questIds: string[]): string[] {
  const next = [...questIds, ...recent];
  const seen = new Set<string>();
  const deduped = next.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return deduped.slice(0, RECENT_MEMORY);
}

export interface ChainAdvanceResult {
  chains: Record<string, ChainProgressState>;
  completedChainId: string | null;
}

/** Record a completed chain step and report if the whole chain just finished. */
export function advanceChain(
  chains: Record<string, ChainProgressState>,
  quest: Quest,
  completedAt: string,
): ChainAdvanceResult {
  if (!quest.chainId || quest.chainStep === undefined) {
    return { chains, completedChainId: null };
  }

  const chain = CHAIN_BY_ID[quest.chainId];
  if (!chain) return { chains, completedChainId: null };

  const existing: ChainProgressState = chains[quest.chainId] ?? {
    chainId: quest.chainId,
    completedSteps: 0,
    completedQuestIds: [],
    completed: false,
  };

  if (existing.completed || existing.completedQuestIds.includes(quest.id)) {
    return { chains, completedChainId: null };
  }

  const completedSteps = existing.completedSteps + 1;
  const completed = completedSteps >= chain.questIds.length;

  const updated: ChainProgressState = {
    ...existing,
    completedSteps,
    completedQuestIds: [...existing.completedQuestIds, quest.id],
    completed,
    ...(completed ? { completedAt } : {}),
  };

  return {
    chains: { ...chains, [quest.chainId]: updated },
    completedChainId: completed ? chain.id : null,
  };
}

/** Chains the player has started but not finished, for the quest screen. */
export function getActiveChains(
  chains: Record<string, ChainProgressState>,
): { chainId: string; name: string; icon: string; step: number; total: number }[] {
  return QUEST_CHAINS.map((chain) => {
    const progress = chains[chain.id];
    const step = progress?.completedSteps ?? 0;
    return {
      chainId: chain.id,
      name: chain.name,
      icon: chain.icon,
      step,
      total: chain.questIds.length,
    };
  }).filter((entry) => entry.step > 0 && entry.step < entry.total);
}

/* ------------------------------------------------------------------ */
/* Rerolls                                                             */
/* ------------------------------------------------------------------ */

export interface RerollAvailability {
  canReroll: boolean;
  usesToken: boolean;
  usesFreeDaily: boolean;
  reason: string;
}

/**
 * A reroll spends a token when the player owns one; otherwise they get one
 * free reroll per local day.
 */
export function getRerollAvailability(save: RogueDaySave, today = toLocalDateKey()): RerollAvailability {
  const tokens = save.inventory.find((entry) => entry.itemId === 'reroll_token')?.count ?? 0;

  if (tokens > 0) {
    return {
      canReroll: true,
      usesToken: true,
      usesFreeDaily: false,
      reason: `${tokens} omkastningsmynt kvar`,
    };
  }

  if (save.daily.freeRerollUsedOn !== today) {
    return {
      canReroll: true,
      usesToken: false,
      usesFreeDaily: true,
      reason: 'Gratis omkastning idag',
    };
  }

  return {
    canReroll: false,
    usesToken: false,
    usesFreeDaily: false,
    reason: 'Inga omkastningar kvar idag',
  };
}

export { getQuestById };
