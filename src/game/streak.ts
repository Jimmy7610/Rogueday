import type { InventoryEntry, StreakState } from '@/types';
import { daysBetween, toLocalDateKey } from '@/utils/date';

export interface StreakUpdateResult {
  streak: StreakState;
  /** True when a streak shield was consumed to bridge a missed day. */
  shieldUsed: boolean;
  /** True when the streak counter went up on this completion. */
  incremented: boolean;
}

/**
 * Advance the streak for a completed quest.
 *
 * Rules:
 * - Streaks are counted in local calendar days.
 * - Several quests on the same day never inflate the streak.
 * - Exactly one missed day can be bridged by a Streak Shield.
 * - The player is never punished twice for the same gap.
 */
export function registerCompletion(
  streak: StreakState,
  inventory: InventoryEntry[],
  now: Date = new Date(),
): StreakUpdateResult {
  const today = toLocalDateKey(now);
  const last = streak.lastCompletionDate;

  if (last === today) {
    // Already counted today - nothing changes.
    return { streak, shieldUsed: false, incremented: false };
  }

  if (last === null) {
    const next: StreakState = {
      ...streak,
      current: 1,
      longest: Math.max(1, streak.longest),
      lastCompletionDate: today,
    };
    return { streak: next, shieldUsed: false, incremented: true };
  }

  const gap = daysBetween(last, today);

  if (gap <= 0) {
    // Clock moved backwards (timezone change, manual clock edit). Keep the
    // streak intact and just re-anchor the date rather than punishing.
    return {
      streak: { ...streak, lastCompletionDate: today },
      shieldUsed: false,
      incremented: false,
    };
  }

  if (gap === 1) {
    const current = streak.current + 1;
    return {
      streak: {
        ...streak,
        current,
        longest: Math.max(current, streak.longest),
        lastCompletionDate: today,
      },
      shieldUsed: false,
      incremented: true,
    };
  }

  const hasShield = (inventory.find((entry) => entry.itemId === 'streak_shield')?.count ?? 0) > 0;

  if (gap === 2 && hasShield) {
    const current = streak.current + 1;
    return {
      streak: {
        ...streak,
        current,
        longest: Math.max(current, streak.longest),
        lastCompletionDate: today,
        shieldUsedOn: today,
      },
      shieldUsed: true,
      incremented: true,
    };
  }

  // Gap too large - the streak restarts at one.
  return {
    streak: {
      ...streak,
      current: 1,
      longest: Math.max(1, streak.longest),
      lastCompletionDate: today,
    },
    shieldUsed: false,
    incremented: true,
  };
}

/**
 * The streak as it should be *displayed* right now. A stored streak whose last
 * completion is older than yesterday has already lapsed, but it is only
 * rewritten in the save when the player next completes something.
 */
export function getDisplayStreak(streak: StreakState, now: Date = new Date()): number {
  if (!streak.lastCompletionDate) return 0;
  const gap = daysBetween(streak.lastCompletionDate, toLocalDateKey(now));
  if (gap <= 1) return streak.current;
  return 0;
}

/** True when the player has already completed something today. */
export function hasCompletedToday(streak: StreakState, now: Date = new Date()): boolean {
  return streak.lastCompletionDate === toLocalDateKey(now);
}


/* ------------------------------------------------------------------ */
/* Display status                                                      */
/* ------------------------------------------------------------------ */

export interface StreakStatus {
  /** Days to show; 0 when the streak has lapsed. */
  days: number;
  label: string;
  icon: string;
  tone: 'hot' | 'risk' | 'cold';
  /** True when yesterday was missed but a shield can still bridge it. */
  atRisk: boolean;
}

/**
 * How the streak should read in the HUD right now.
 *
 * A streak whose last completion was the day before yesterday has not lapsed
 * if the player owns a Streak Shield - the shield will bridge it on the next
 * completion. Saying "INGEN SVIT" there would be simply wrong, so it says the
 * streak is at risk and that a shield is ready. The wording is never shaming.
 */
export function getStreakStatus(
  streak: StreakState,
  inventory: InventoryEntry[],
  now: Date = new Date(),
): StreakStatus {
  const days = getDisplayStreak(streak, now);

  if (days > 0) {
    return {
      days,
      label: `${days} ${days === 1 ? 'DAG' : 'DAGAR'}`,
      icon: '🔥',
      tone: 'hot',
      atRisk: false,
    };
  }

  const last = streak.lastCompletionDate;
  const hasShield = (inventory.find((entry) => entry.itemId === 'streak_shield')?.count ?? 0) > 0;

  if (last && hasShield && daysBetween(last, toLocalDateKey(now)) === 2) {
    return {
      days: streak.current,
      label: 'SVIT I FARA',
      icon: '🛡️',
      tone: 'risk',
      atRisk: true,
    };
  }

  return { days: 0, label: 'INGEN SVIT', icon: '🔥', tone: 'cold', atRisk: false };
}
