import { describe, expect, it } from 'vitest';
import type { InventoryEntry, StreakState } from '@/types';
import { createDefaultStreak } from '@/persistence/defaults';
import { getDisplayStreak, hasCompletedToday, registerCompletion } from './streak';

const NO_ITEMS: InventoryEntry[] = [];
const WITH_SHIELD: InventoryEntry[] = [{ itemId: 'streak_shield', count: 1 }];

function streakOn(date: string, current: number, longest = current): StreakState {
  return { current, longest, lastCompletionDate: date, shieldUsedOn: null };
}

describe('streak', () => {
  it('starts at one on the first completion', () => {
    const result = registerCompletion(createDefaultStreak(), NO_ITEMS, new Date(2026, 8, 4));

    expect(result.streak.current).toBe(1);
    expect(result.streak.longest).toBe(1);
    expect(result.streak.lastCompletionDate).toBe('2026-09-04');
    expect(result.incremented).toBe(true);
  });

  it('increments on consecutive local days', () => {
    let streak = createDefaultStreak();
    for (let day = 0; day < 5; day += 1) {
      streak = registerCompletion(streak, NO_ITEMS, new Date(2026, 8, 4 + day)).streak;
    }

    expect(streak.current).toBe(5);
    expect(streak.longest).toBe(5);
  });

  it('does not inflate on multiple completions the same day', () => {
    let streak = registerCompletion(createDefaultStreak(), NO_ITEMS, new Date(2026, 8, 4, 9)).streak;
    const second = registerCompletion(streak, NO_ITEMS, new Date(2026, 8, 4, 18));

    expect(second.streak.current).toBe(1);
    expect(second.incremented).toBe(false);

    streak = second.streak;
    const third = registerCompletion(streak, NO_ITEMS, new Date(2026, 8, 4, 23, 59));
    expect(third.streak.current).toBe(1);
  });

  it('resets after a missed day with no shield', () => {
    const streak = streakOn('2026-09-04', 7);
    const result = registerCompletion(streak, NO_ITEMS, new Date(2026, 8, 7));

    expect(result.streak.current).toBe(1);
    expect(result.streak.longest).toBe(7); // the record survives
    expect(result.shieldUsed).toBe(false);
  });

  it('a shield bridges exactly one missed day', () => {
    const streak = streakOn('2026-09-04', 6);
    const result = registerCompletion(streak, WITH_SHIELD, new Date(2026, 8, 6));

    expect(result.shieldUsed).toBe(true);
    expect(result.streak.current).toBe(7);
    expect(result.streak.longest).toBe(7);
    expect(result.streak.shieldUsedOn).toBe('2026-09-06');
  });

  it('a shield does not bridge a two-day gap', () => {
    const streak = streakOn('2026-09-04', 6);
    const result = registerCompletion(streak, WITH_SHIELD, new Date(2026, 8, 8));

    expect(result.shieldUsed).toBe(false);
    expect(result.streak.current).toBe(1);
  });

  it('keeps the longest streak as a high-water mark', () => {
    let streak = streakOn('2026-09-04', 12, 12);
    streak = registerCompletion(streak, NO_ITEMS, new Date(2026, 8, 20)).streak;
    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(12);

    for (let day = 1; day < 4; day += 1) {
      streak = registerCompletion(streak, NO_ITEMS, new Date(2026, 8, 20 + day)).streak;
    }
    expect(streak.current).toBe(4);
    expect(streak.longest).toBe(12);
  });

  it('is not punished twice by a backwards clock change', () => {
    const streak = streakOn('2026-09-05', 4);
    const result = registerCompletion(streak, NO_ITEMS, new Date(2026, 8, 4));

    expect(result.streak.current).toBe(4);
    expect(result.streak.lastCompletionDate).toBe('2026-09-04');
    expect(result.incremented).toBe(false);
  });

  it('handles a month boundary', () => {
    let streak = streakOn('2026-08-31', 3);
    streak = registerCompletion(streak, NO_ITEMS, new Date(2026, 8, 1)).streak;
    expect(streak.current).toBe(4);
  });

  it('handles a year boundary', () => {
    let streak = streakOn('2026-12-31', 9);
    streak = registerCompletion(streak, NO_ITEMS, new Date(2027, 0, 1)).streak;
    expect(streak.current).toBe(10);
  });
});

describe('display streak', () => {
  it('shows the streak on the day itself and the day after', () => {
    const streak = streakOn('2026-09-04', 5);

    expect(getDisplayStreak(streak, new Date(2026, 8, 4, 20))).toBe(5);
    expect(getDisplayStreak(streak, new Date(2026, 8, 5, 8))).toBe(5);
  });

  it('shows zero once the streak has lapsed', () => {
    const streak = streakOn('2026-09-04', 5);
    expect(getDisplayStreak(streak, new Date(2026, 8, 7))).toBe(0);
  });

  it('shows zero with no completions yet', () => {
    expect(getDisplayStreak(createDefaultStreak())).toBe(0);
  });

  it('does not rewrite the stored streak', () => {
    const streak = streakOn('2026-09-04', 5);
    getDisplayStreak(streak, new Date(2026, 8, 30));
    expect(streak.current).toBe(5);
  });
});

describe('hasCompletedToday', () => {
  it('is true only on the stored date', () => {
    const streak = streakOn('2026-09-04', 1);
    expect(hasCompletedToday(streak, new Date(2026, 8, 4, 3))).toBe(true);
    expect(hasCompletedToday(streak, new Date(2026, 8, 5, 3))).toBe(false);
  });
});
