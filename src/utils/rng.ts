/**
 * Deterministic pseudo-random helpers.
 *
 * Daily quests and weekly boss rotation must be stable for a given local date,
 * so they use a seeded generator instead of Math.random().
 */

/** FNV-1a 32-bit string hash. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  /** True with the given probability (0..1). */
  chance(probability: number): boolean;
}

/** mulberry32 - small, fast, good enough for game rolls. */
export function createRng(seed: number | string): Rng {
  let state = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x9e3779b9;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (max <= min) return min;
    return min + Math.floor(next() * (max - min + 1));
  };

  const pick = <T,>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error('rng.pick: empty list');
    return items[int(0, items.length - 1)];
  };

  const shuffle = <T,>(items: readonly T[]): T[] => {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = int(0, i);
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  };

  const chance = (probability: number): boolean => next() < probability;

  return { next, int, pick, shuffle, chance };
}

/** Non-deterministic RNG for moment-to-moment rolls. */
export const randomRng: Rng = {
  next: () => Math.random(),
  int: (min, max) => (max <= min ? min : min + Math.floor(Math.random() * (max - min + 1))),
  pick: <T,>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error('rng.pick: empty list');
    return items[Math.floor(Math.random() * items.length)];
  },
  shuffle: <T,>(items: readonly T[]): T[] => {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  },
  chance: (probability) => Math.random() < probability,
};

/** Weighted pick. Weights must be positive. */
export function weightedPick<T extends { weight: number }>(items: readonly T[], rng: Rng): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng.next() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/** Short unique-ish id for history entries and offers. */
export function createId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${prefix}_${time}${rand}`;
}
