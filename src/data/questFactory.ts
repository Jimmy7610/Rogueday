import type {
  Difficulty,
  EnergyLevel,
  Mood,
  Quest,
  QuestCategory,
  QuestDuration,
  QuestLocation,
  QuestMode,
  Rarity,
} from '@/types';

/**
 * Compact authoring shape for the quest library.
 *
 * Only the genuinely quest-specific fields are written out; everything else
 * falls back to a documented default so the 250+ entries stay readable and
 * consistently balanced.
 */
export interface QuestSeed {
  id: string;
  title: string;
  desc: string;
  flavour: string;
  cat: QuestCategory;
  dur: QuestDuration;
  energy: EnergyLevel;
  /** Default: ['anywhere'] */
  loc?: QuestLocation[];
  /** Default: every mood */
  moods?: Mood[];
  /** Default: derived from duration + energy */
  diff?: Difficulty;
  /** Default: 'common' */
  rarity?: Rarity;
  /** Default: 'normal' */
  mode?: QuestMode;
  tags?: string[];
  /** Explicit reward overrides; otherwise derived from duration + difficulty. */
  xp?: number;
  gold?: number;
  chainId?: string;
  chainStep?: number;
}

export const ALL_MOODS: Mood[] = ['bored', 'stressed', 'motivated', 'adventurous'];

const XP_BY_DURATION: Record<QuestDuration, number> = {
  5: 20,
  15: 45,
  30: 80,
  60: 140,
};

const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  easy: 0.8,
  medium: 1,
  hard: 1.25,
  extreme: 1.5,
};

/** Reward baseline. Rarity is layered on later, at offer time. */
export function deriveXp(duration: QuestDuration, difficulty: Difficulty): number {
  return Math.round(XP_BY_DURATION[duration] * DIFFICULTY_MULTIPLIER[difficulty]);
}

export function deriveGold(xp: number): number {
  return Math.max(2, Math.round(xp * 0.18));
}

function deriveDifficulty(duration: QuestDuration, energy: EnergyLevel): Difficulty {
  if (duration === 5) return energy === 'high' ? 'medium' : 'easy';
  if (duration === 15) return energy === 'low' ? 'easy' : 'medium';
  if (duration === 30) return energy === 'high' ? 'hard' : 'medium';
  return energy === 'low' ? 'medium' : 'hard';
}

/** Expand an authoring seed into a fully-populated Quest. */
export function buildQuest(seed: QuestSeed): Quest {
  const difficulty = seed.diff ?? deriveDifficulty(seed.dur, seed.energy);
  const xp = seed.xp ?? deriveXp(seed.dur, difficulty);
  const gold = seed.gold ?? deriveGold(xp);

  return {
    id: seed.id,
    title: seed.title,
    description: seed.desc,
    flavourText: seed.flavour,
    category: seed.cat,
    duration: seed.dur,
    energy: seed.energy,
    locations: seed.loc ?? ['anywhere'],
    moods: seed.moods ?? ALL_MOODS,
    mode: seed.mode ?? 'normal',
    difficulty,
    baseXp: xp,
    baseGold: gold,
    rarity: seed.rarity ?? 'common',
    tags: seed.tags ?? [],
    ...(seed.chainId ? { chainId: seed.chainId } : {}),
    ...(seed.chainStep !== undefined ? { chainStep: seed.chainStep } : {}),
  };
}

export function buildQuests(seeds: QuestSeed[]): Quest[] {
  return seeds.map(buildQuest);
}
