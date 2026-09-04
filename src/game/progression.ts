import type { LevelInfo, Progression } from '@/types';
import { MAX_LEVEL, titleForLevel, xpForLevel } from '@/data/levels';

/** Derived view of the player's level, for the HUD. */
export function getLevelInfo(progression: Progression): LevelInfo {
  const level = Math.min(Math.max(1, progression.level), MAX_LEVEL);
  const xpForCurrent = xpForLevel(level);
  const xpIntoLevel = level >= MAX_LEVEL ? 0 : Math.max(0, progression.xp);

  return {
    level,
    title: titleForLevel(level),
    xpIntoLevel,
    xpForLevel: xpForCurrent,
    totalXp: progression.totalXp,
    progress: xpForCurrent > 0 ? Math.min(1, xpIntoLevel / xpForCurrent) : 1,
  };
}

export interface XpGainResult {
  progression: Progression;
  levelUps: { level: number; title: string }[];
}

/**
 * Apply XP and roll levels forward. Overflow XP carries into the next level,
 * and multiple level-ups from a single reward are all reported.
 */
export function applyXp(progression: Progression, amount: number): XpGainResult {
  const gained = Math.max(0, Math.round(amount));
  let level = Math.min(Math.max(1, progression.level), MAX_LEVEL);
  let xp = Math.max(0, progression.xp) + gained;
  const totalXp = Math.max(0, progression.totalXp) + gained;
  const levelUps: { level: number; title: string }[] = [];

  while (level < MAX_LEVEL) {
    const needed = xpForLevel(level);
    if (needed <= 0 || xp < needed) break;
    xp -= needed;
    level += 1;
    levelUps.push({ level, title: titleForLevel(level) });
  }

  if (level >= MAX_LEVEL) {
    // At the cap XP stops accumulating into a next level but total XP keeps
    // climbing, so lifetime statistics stay honest.
    xp = 0;
  }

  return {
    progression: { ...progression, level, xp, totalXp },
    levelUps,
  };
}

export function applyGold(progression: Progression, amount: number): Progression {
  return { ...progression, gold: Math.max(0, progression.gold + Math.round(amount)) };
}

/** Rebuild level/xp from total XP. Used when repairing an inconsistent save. */
export function deriveLevelFromTotalXp(totalXp: number): { level: number; xp: number } {
  let level = 1;
  let remaining = Math.max(0, totalXp);

  while (level < MAX_LEVEL) {
    const needed = xpForLevel(level);
    if (needed <= 0 || remaining < needed) break;
    remaining -= needed;
    level += 1;
  }

  return { level, xp: level >= MAX_LEVEL ? 0 : remaining };
}
