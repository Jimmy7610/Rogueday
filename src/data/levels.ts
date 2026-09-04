import type { LevelTitle } from '@/types';

/** Highest level the curve is defined for. */
export const MAX_LEVEL = 50;

/**
 * XP required to go from `level` to `level + 1`.
 *
 * Growth is gentle early (a couple of quests per level) and steepens so that
 * level 50 is a genuine long-haul goal rather than a weekend's work.
 */
export function xpForLevel(level: number): number {
  if (level < 1) return 0;
  if (level >= MAX_LEVEL) return 0;
  const base = 100;
  const growth = Math.pow(level, 1.55);
  return Math.round((base + growth * 55) / 5) * 5;
}

/** Cumulative XP needed to reach `level` from level 1. */
export function totalXpToReachLevel(level: number): number {
  let total = 0;
  for (let current = 1; current < level; current += 1) {
    total += xpForLevel(current);
  }
  return total;
}

/**
 * Rank titles. Data-driven: the highest entry at or below the player's level
 * wins, so new titles can be inserted anywhere without touching game logic.
 */
export const LEVEL_TITLES: LevelTitle[] = [
  { level: 1, title: 'Skuggvandrare' },
  { level: 2, title: 'Nybörjarhjälte' },
  { level: 3, title: 'Ärendekrigare' },
  { level: 4, title: 'Dammbesegrare' },
  { level: 5, title: 'Vardagsslaktare' },
  { level: 6, title: 'Diskbergsbestigare' },
  { level: 7, title: 'Rutinbrytare' },
  { level: 8, title: 'Nattvandrare' },
  { level: 9, title: 'Sysslornas Skräck' },
  { level: 10, title: 'Vardagsmästare' },
  { level: 12, title: 'Questjägare' },
  { level: 14, title: 'Inkorgens Fiende' },
  { level: 16, title: 'Kaosriddare' },
  { level: 18, title: 'Tvättbergets Herre' },
  { level: 20, title: 'Vardagslegend' },
  { level: 22, title: 'Uppdragsmagiker' },
  { level: 25, title: 'Mytisk Prokrastineringsjägare' },
  { level: 28, title: 'Ordningens Väktare' },
  { level: 30, title: 'Ödesvandrare' },
  { level: 33, title: 'Tidens Tämjare' },
  { level: 36, title: 'Bossbanare' },
  { level: 40, title: 'Verklighetsbändare' },
  { level: 44, title: 'Evighetens Krönikör' },
  { level: 47, title: 'Vardagens Arkitekt' },
  { level: 50, title: 'RogueDay Legend' },
];

export function titleForLevel(level: number): string {
  let title = LEVEL_TITLES[0].title;
  for (const entry of LEVEL_TITLES) {
    if (entry.level <= level) title = entry.title;
    else break;
  }
  return title;
}

/** The next title the player has not yet reached, if any. */
export function nextTitle(level: number): LevelTitle | null {
  return LEVEL_TITLES.find((entry) => entry.level > level) ?? null;
}
