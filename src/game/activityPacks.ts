import type {
  ActivityPack,
  BossDefinition,
  ChainProgressState,
  FeedbackState,
  PackPoolInfo,
  PackState,
  PerkEffects,
  Quest,
  QuestDuration,
  QuestFilters,
  RogueDaySave,
} from '@/types';
import { QUESTS } from '@/data/quests';
import {
  ACTIVITY_PACKS,
  FAVOURITE_PACK_LIMIT,
  MIN_HEALTHY_POOL,
  RECENT_PACK_LIMIT,
  getPackById,
} from '@/data/activityPacks';
import { getBossById } from '@/data/bosses';
import { createRng, randomRng, type Rng } from '@/utils/rng';
import { toLocalDateKey } from '@/utils/date';
import { feedbackWeight } from './feedback';
import { isSecretUnlocked, type SecretContext } from './secrets';
import {
  CATEGORY_WINDOW,
  categoryWeights,
  rollQuestChoices,
  type QuestRollResult,
} from './questSelection';

/**
 * Activity packs — the engine.
 *
 * A pack narrows the library and then hands the result to the ordinary quest
 * selection engine. It never bypasses it: the same three tiers, the same
 * rarity roll, the same anti-repetition and the same thumbs-up/down weighting
 * apply. A pack is a filter in front of the existing machine, not a second
 * machine beside it.
 *
 * Order of precedence, and it only goes one way:
 *
 *   1. The pack's hard constraints.
 *   2. The player's existing personalisation - recent memory, category
 *      variety, feedback weights.
 *
 * Personalisation can never widen a pack past its constraints, and a pack can
 * never suppress a category so hard that it disappears.
 */

/* ------------------------------------------------------------------ */
/* Eligibility                                                         */
/* ------------------------------------------------------------------ */

export interface PackContext {
  /** The week's boss, for BOSS RUSH. */
  boss?: BossDefinition | undefined;
  /** Save + clock, so gated secret quests behave the same as anywhere else. */
  secrets?: SecretContext;
  chains?: Record<string, ChainProgressState>;
}

/**
 * Does this quest satisfy the pack's hard constraints?
 *
 * Everything in here is a hard gate. Nothing below this function can put a
 * quest back that this function rejected.
 */
export function matchesPack(quest: Quest, pack: ActivityPack, context: PackContext = {}): boolean {
  // Chain steps are gated on chain progress and belong to their own flow.
  if (quest.chainId) return false;

  // Secret quests keep their own local unlock rules inside a pack too.
  if (quest.category === 'secret') {
    if (!context.secrets || !isSecretUnlocked(quest, context.secrets)) return false;
  }

  if (quest.mode !== 'any' && quest.mode !== pack.mode) return false;

  if (!pack.allowedDurations.includes(quest.duration)) return false;
  if (!pack.allowedEnergies.includes(quest.energy)) return false;

  // A quest fits the pack's locations if any of its own locations is allowed.
  if (!quest.locations.some((location) => pack.allowedLocations.includes(location))) return false;

  if (pack.onlyCategories && !pack.onlyCategories.includes(quest.category)) return false;
  if (pack.excludedCategories.includes(quest.category)) return false;

  for (const tag of pack.requiredTags) {
    if (!quest.contentTags.includes(tag)) return false;
  }
  for (const tag of pack.excludedTags) {
    if (quest.contentTags.includes(tag)) return false;
  }

  // BOSS RUSH is the one pack whose membership follows live state.
  if (pack.dynamic === 'boss-weakness') {
    const boss = context.boss;
    if (!boss) return false;
    if (!boss.weaknessCategories.includes(quest.category)) return false;
  }

  return true;
}

/** Every quest the pack can currently offer. */
export function packPool(pack: ActivityPack, context: PackContext = {}): Quest[] {
  return QUESTS.filter((quest) => matchesPack(quest, pack, context));
}

/** Pool size and health, for the pack card and the tests. */
export function packPoolInfo(pack: ActivityPack, context: PackContext = {}): PackPoolInfo {
  const total = packPool(pack, context).length;
  return { packId: pack.id, total, starved: total < MIN_HEALTHY_POOL };
}

/** Pool sizes for every pack, in display order. */
export function allPackPools(context: PackContext = {}): PackPoolInfo[] {
  return ACTIVITY_PACKS.map((pack) => packPoolInfo(pack, context));
}

/* ------------------------------------------------------------------ */
/* Turning a pack into filters the existing engine understands         */
/* ------------------------------------------------------------------ */

/**
 * The widest filters that still contain the whole pack.
 *
 * `rollQuestChoices` re-checks these hard constraints itself, so they must not
 * be narrower than the pack — otherwise the engine would drop quests the pack
 * legitimately allows. The pack's own gate does the real narrowing.
 */
export function packFilters(pack: ActivityPack, mood: QuestFilters['mood']): QuestFilters {
  const duration = Math.max(...pack.allowedDurations) as QuestDuration;
  const energy = pack.allowedEnergies.includes('high')
    ? 'high'
    : pack.allowedEnergies.includes('medium')
      ? 'medium'
      : 'low';

  // 'anywhere' as a filter means "do not filter on location", which is what a
  // pack that allows more than one location needs.
  const location =
    pack.allowedLocations.length === 1 && pack.allowedLocations[0] !== 'anywhere'
      ? pack.allowedLocations[0]
      : 'anywhere';

  // A pack is authored as 'normal' or 'chaos'; QuestFilters has no 'any'.
  const mode: QuestFilters['mode'] = pack.mode === 'chaos' ? 'chaos' : 'normal';

  return { duration, energy, location, mood, mode };
}

/**
 * The mood a pack rolls with.
 *
 * Packs express mood as a preference, so the pool is not cut by it. Picking
 * from the pack's preferred moods keeps the flavour without starving the roll.
 */
export function packMood(pack: ActivityPack, rng: Rng): QuestFilters['mood'] {
  if (pack.preferredMoods.length === 0) return 'motivated';
  return rng.pick(pack.preferredMoods);
}

/* ------------------------------------------------------------------ */
/* Weighting                                                           */
/* ------------------------------------------------------------------ */

/** How much a preferred tag or category lifts a quest's weight. */
export const PREFERRED_TAG_BONUS = 0.35;
export const PREFERRED_CATEGORY_BONUS = 0.6;
export const PREFERRED_ENERGY_BONUS = 0.3;
export const PREFERRED_MOOD_BONUS = 0.25;

/**
 * The pack's soft preferences, as a multiplier.
 *
 * Always at least 1: a preference can only lift, never suppress. Anything a
 * pack wants to keep out belongs in its hard constraints, where it is visible
 * and testable, rather than hidden in a weight approaching zero.
 */
export function packPreferenceWeight(quest: Quest, pack: ActivityPack): number {
  let weight = 1;

  for (const tag of pack.preferredTags) {
    if (quest.contentTags.includes(tag)) weight += PREFERRED_TAG_BONUS;
  }
  if (pack.preferredCategories.includes(quest.category)) weight += PREFERRED_CATEGORY_BONUS;
  if (pack.preferredEnergy && quest.energy === pack.preferredEnergy) {
    weight += PREFERRED_ENERGY_BONUS;
  }
  if (pack.preferredMoods.some((mood) => quest.moods.includes(mood))) {
    weight += PREFERRED_MOOD_BONUS;
  }

  return weight;
}

/**
 * The complete weight for one quest inside one pack.
 *
 * Pack preference, then the player's own personalisation on top: category
 * variety pressure and the local thumbs-up/down score. The personalisation
 * factors are the same ones an ordinary roll uses, so a pack feels like the
 * rest of the game rather than a separate mode.
 */
export function packQuestWeight(
  quest: Quest,
  pack: ActivityPack,
  options: { recentQuestIds?: string[]; feedback?: FeedbackState } = {},
): number {
  const categories = categoryWeights(options.recentQuestIds ?? []);
  const variety = categories.get(quest.category) ?? 1;
  const feeling = feedbackWeight(options.feedback?.scores ?? {}, quest.category);
  return packPreferenceWeight(quest, pack) * variety * feeling;
}

/* ------------------------------------------------------------------ */
/* Rolling                                                             */
/* ------------------------------------------------------------------ */

export interface PackRollOptions {
  pack: ActivityPack;
  save: RogueDaySave;
  now?: Date;
  rng?: Rng;
  effects?: PerkEffects | undefined;
}

export interface PackRollResult extends QuestRollResult {
  packId: string;
  /** How many quests the pack could have drawn from. */
  packPoolSize: number;
}

/**
 * Roll three offers from a pack.
 *
 * The pack narrows the library; `rollQuestChoices` does everything else, so
 * tiers, rarity, chaos modifiers, challenges, boss weakness readouts and the
 * anti-repetition window all behave exactly as they do on the manual path.
 */
export function rollFromPack(options: PackRollOptions): PackRollResult {
  const { pack, save, now = new Date(), rng = randomRng, effects } = options;

  const boss = save.boss ? getBossById(save.boss.bossId) : undefined;
  const context: PackContext = {
    boss,
    secrets: { now, save },
    chains: save.questChains,
  };

  const pool = packPool(pack, context);
  const mood = packMood(pack, rng);

  if (pool.length === 0) {
    return {
      packId: pack.id,
      packPoolSize: 0,
      offers: [],
      moodRelaxed: false,
      empty: true,
      poolSize: 0,
    };
  }

  const allowed = new Set(pool.map((quest) => quest.id));

  const result = rollQuestChoices({
    filters: packFilters(pack, mood),
    chains: save.questChains,
    recentQuestIds: save.recentQuestIds,
    feedback: save.feedback,
    secrets: context.secrets,
    boss,
    effects,
    rng,
    restrictTo: allowed,
    extraWeight: (quest) => packPreferenceWeight(quest, pack),
  });

  return { ...result, packId: pack.id, packPoolSize: pool.length };
}

/* ------------------------------------------------------------------ */
/* SURPRISE ME                                                         */
/* ------------------------------------------------------------------ */

/** Durations a surprise may use unless the player opted into long ones. */
export const SURPRISE_DURATIONS: QuestDuration[] = [5, 15, 30];

/**
 * A pack-shaped roll with no pack.
 *
 * Deliberately never hands out a 60-minute quest unless the player has turned
 * long surprises on in settings: a surprise the player did not choose should
 * not be able to claim an hour of their day.
 */
export function surprisePack(allowLong: boolean): ActivityPack {
  return {
    id: 'pack_surprise',
    name: 'ÖVERRASKA MIG',
    icon: '🎲',
    shortDescription: 'Låt spelet välja.',
    flavourText: allowLong
      ? 'Vad som helst ur hela biblioteket, upp till en timme.'
      : 'Vad som helst ur hela biblioteket — men aldrig längre än en halvtimme.',
    allowedDurations: allowLong ? [5, 15, 30, 60] : SURPRISE_DURATIONS,
    allowedEnergies: ['low', 'medium', 'high'],
    allowedLocations: ['home', 'outside', 'anywhere'],
    requiredTags: [],
    excludedTags: [],
    excludedCategories: [],
    preferredMoods: ['bored', 'stressed', 'motivated', 'adventurous'],
    preferredTags: [],
    preferredCategories: [],
    mode: 'normal',
    accent: '#67e8f9',
    sortOrder: 0,
  };
}

/* ------------------------------------------------------------------ */
/* DAGENS LÄGE                                                         */
/* ------------------------------------------------------------------ */

/** Extra gold share granted on the first completion through today's pack. */
export const DAILY_PACK_GOLD_BONUS = 0.1;

/**
 * One pack per local calendar day, derived purely from the date.
 *
 * Same shape as the daily quest: a seeded RNG over the date string, so it is
 * identical every time the app opens that day, needs no server and stores no
 * roll. BOSS RUSH is excluded because its pool can be empty between weeks.
 */
export function getDailyPack(dateKey: string = toLocalDateKey()): ActivityPack {
  const candidates = ACTIVITY_PACKS.filter((pack) => !pack.dynamic);
  const rng = createRng(`rogueday-daily-pack-${dateKey}`);
  return candidates[rng.int(0, candidates.length - 1)];
}

/** Has today's pack bonus already been used? */
export function dailyPackBonusAvailable(
  packs: PackState,
  dateKey: string = toLocalDateKey(),
): boolean {
  return packs.dailyBonusClaimedOn !== dateKey;
}

/**
 * Is this roll eligible for today's bonus?
 *
 * Only the first completion of the day, and only through today's pack.
 */
export function qualifiesForDailyBonus(
  packs: PackState,
  packId: string | null,
  dateKey: string = toLocalDateKey(),
): boolean {
  if (!packId) return false;
  if (!dailyPackBonusAvailable(packs, dateKey)) return false;
  return getDailyPack(dateKey).id === packId;
}

/* ------------------------------------------------------------------ */
/* Favourites, recents and completions                                 */
/* ------------------------------------------------------------------ */

/** Toggle a favourite, keeping the list inside its limit. */
export function toggleFavouritePack(packs: PackState, packId: string): PackState {
  if (!getPackById(packId)) return packs;

  if (packs.favourites.includes(packId)) {
    return { ...packs, favourites: packs.favourites.filter((id) => id !== packId) };
  }
  if (packs.favourites.length >= FAVOURITE_PACK_LIMIT) return packs;
  return { ...packs, favourites: [...packs.favourites, packId] };
}

export function isFavouritePack(packs: PackState, packId: string): boolean {
  return packs.favourites.includes(packId);
}

export function favouritesFull(packs: PackState): boolean {
  return packs.favourites.length >= FAVOURITE_PACK_LIMIT;
}

/** Remember that a pack was just used. Most recent first, no duplicates. */
export function rememberPack(packs: PackState, packId: string): PackState {
  if (!getPackById(packId)) return packs;
  const recent = [packId, ...packs.recent.filter((id) => id !== packId)].slice(
    0,
    RECENT_PACK_LIMIT,
  );
  return { ...packs, recent };
}

/** Record a completion against the pack it came from. */
export function recordPackCompletion(
  packs: PackState,
  packId: string | null,
  viaDailyPack: boolean,
): PackState {
  if (!packId) return packs;
  return {
    ...packs,
    completions: { ...packs.completions, [packId]: (packs.completions[packId] ?? 0) + 1 },
    dailyPackCompletions: packs.dailyPackCompletions + (viaDailyPack ? 1 : 0),
  };
}

/* ------------------------------------------------------------------ */
/* Display ordering and stats                                          */
/* ------------------------------------------------------------------ */

/** Packs in the order the hub shows them: favourites first, then sortOrder. */
export function orderedPacks(packs: PackState, level: number): ActivityPack[] {
  const visible = ACTIVITY_PACKS.filter(
    (pack) => pack.minimumLevel === undefined || level >= pack.minimumLevel,
  );
  return [...visible].sort((a, b) => {
    const favA = packs.favourites.indexOf(a.id);
    const favB = packs.favourites.indexOf(b.id);
    if (favA !== -1 || favB !== -1) {
      if (favA === -1) return 1;
      if (favB === -1) return -1;
      return favA - favB;
    }
    return a.sortOrder - b.sortOrder;
  });
}

/** The packs used most recently, resolved and still valid. */
export function recentPacks(packs: PackState): ActivityPack[] {
  return packs.recent
    .map((id) => getPackById(id))
    .filter((pack): pack is ActivityPack => pack !== undefined);
}

export interface PackStats {
  totalCompletions: number;
  distinctPacks: number;
  favouriteCount: number;
  dailyPackCompletions: number;
  mostUsed: { pack: ActivityPack; count: number } | null;
}

export function packStats(packs: PackState): PackStats {
  const entries = Object.entries(packs.completions).filter(([, count]) => count > 0);
  const top = entries.sort((a, b) => b[1] - a[1])[0];
  const topPack = top ? getPackById(top[0]) : undefined;

  return {
    totalCompletions: entries.reduce((sum, [, count]) => sum + count, 0),
    distinctPacks: entries.length,
    favouriteCount: packs.favourites.length,
    dailyPackCompletions: packs.dailyPackCompletions,
    mostUsed: topPack && top ? { pack: topPack, count: top[1] } : null,
  };
}

/** Re-exported so callers do not need two imports to read a window size. */
export { CATEGORY_WINDOW };
