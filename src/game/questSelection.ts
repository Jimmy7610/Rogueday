import type {
  ChainProgressState,
  ChaosModifier,
  ChoiceTier,
  Quest,
  QuestFilters,
  QuestOffer,
  Rarity,
  RogueDaySave,
} from '@/types';
import { CHAIN_BY_ID, QUEST_CHAINS } from '@/data/chains';
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
    name: 'MUSIKENS TVÅNG',
    description: 'Uppdraget måste göras till musik på hög volym.',
    rewardMultiplier: 1.15,
  },
];

/** Does the quest satisfy the player's stated constraints? */
export function matchesFilters(quest: Quest, filters: QuestFilters): boolean {
  // Duration: never hand out something longer than the time the player has.
  if (quest.duration > filters.duration) return false;

  // Energy: never demand more energy than the player has.
  if (!energyAllows(filters.energy, quest.energy)) return false;

  // Location: 'anywhere' from the player accepts everything; otherwise the
  // quest must be doable at the stated place.
  if (filters.location !== 'anywhere') {
    if (!quest.locations.includes(filters.location) && !quest.locations.includes('anywhere')) {
      return false;
    }
  }

  // Mood must be one the quest is written for.
  if (!quest.moods.includes(filters.mood)) return false;

  // Mode: chaos-only quests never appear in normal runs, and vice versa.
  if (quest.mode !== 'any' && quest.mode !== filters.mode) return false;

  return true;
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

/**
 * Build the eligible pool. Recently-seen quests are pushed out first, but if
 * that would empty the pool they are allowed back in - the player always gets
 * something that respects their filters.
 */
export function buildQuestPool(options: PoolOptions): Quest[] {
  const { filters, chains, recentQuestIds, includeChains = true } = options;

  const eligible = QUESTS.filter((quest) => {
    if (!includeChains && quest.chainId) return false;
    if (quest.chainId && !isChainQuestAvailable(quest, chains)) return false;
    return matchesFilters(quest, filters);
  });

  const recent = new Set(recentQuestIds);
  const fresh = eligible.filter((quest) => !recent.has(quest.id));

  return fresh.length >= 3 ? fresh : eligible;
}

function computeRewards(
  quest: Quest,
  rarity: Rarity,
  tier: ChoiceTier,
  modifier?: ChaosModifier,
): { xp: number; gold: number; bossDamage: number } {
  const rarityMultiplier = RARITY_MULTIPLIER[rarity];
  const tierMultiplier = TIER_REWARD_MULTIPLIER[tier];
  const modifierMultiplier = modifier?.rewardMultiplier ?? 1;

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
}

export function buildOffer(options: BuildOfferOptions): QuestOffer {
  const { quest, tier, filters, rng, isDaily = false, forcedRarity } = options;

  const rarity = forcedRarity ?? rollTierRarity(tier, quest.rarity, rng);

  // Chaos mode layers a modifier on top - the wilder the tier, the likelier.
  let modifier: ChaosModifier | undefined;
  if (filters.mode === 'chaos') {
    const modifierChance = tier === 'safe' ? 0.5 : tier === 'wild' ? 0.75 : 1;
    if (rng.chance(modifierChance)) {
      modifier = rng.pick(CHAOS_MODIFIERS);
    }
  }

  const rewards = computeRewards(quest, rarity, tier, modifier);

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
    hidden: modifier?.hidesObjective === true,
    isDaily,
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
}

/**
 * Roll the three choices. Each tier gets a distinct quest where the pool
 * allows it, and all three always respect the player's filters.
 */
export function rollQuestChoices(options: RollOptions): QuestOffer[] {
  const { filters, chains, recentQuestIds, rng = randomRng } = options;

  const pool = buildQuestPool({ filters, chains, recentQuestIds });

  if (pool.length === 0) {
    // Nothing matched even after relaxing recency - fall back to the least
    // demanding quests that still respect duration and location.
    const fallback = QUESTS.filter(
      (quest) =>
        quest.duration <= filters.duration &&
        quest.mode !== 'chaos' &&
        (filters.location === 'anywhere' ||
          quest.locations.includes(filters.location) ||
          quest.locations.includes('anywhere')),
    );
    const source = fallback.length > 0 ? fallback : QUESTS;
    const picks = rng.shuffle(source).slice(0, 3);
    return (['safe', 'wild', 'dangerous'] as ChoiceTier[]).map((tier, index) =>
      buildOffer({ quest: picks[index % picks.length], tier, filters, rng }),
    );
  }

  const shuffled = rng.shuffle(pool);
  const tiers: ChoiceTier[] = ['safe', 'wild', 'dangerous'];

  return tiers.map((tier, index) =>
    buildOffer({ quest: shuffled[index % shuffled.length], tier, filters, rng }),
  );
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
