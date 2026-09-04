import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatCountdown,
  formatMinutes,
  fromLocalDateKey,
  getWeekKey,
  isValidDateKey,
  msUntilDailyReset,
  msUntilWeeklyReset,
  toLocalDateKey,
} from './date';
import { createRng, hashString, weightedPick } from './rng';

describe('local date keys', () => {
  it('formats as local YYYY-MM-DD, never UTC', () => {
    // 00:30 local on the 4th is still the 3rd in UTC for positive offsets,
    // and the key must follow the local calendar.
    expect(toLocalDateKey(new Date(2026, 8, 4, 0, 30))).toBe('2026-09-04');
    expect(toLocalDateKey(new Date(2026, 8, 4, 23, 59))).toBe('2026-09-04');
    expect(toLocalDateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toLocalDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('round-trips through fromLocalDateKey', () => {
    for (const key of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      expect(toLocalDateKey(fromLocalDateKey(key))).toBe(key);
    }
  });

  it('validates keys strictly', () => {
    expect(isValidDateKey('2026-09-04')).toBe(true);
    expect(isValidDateKey('2026-9-4')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('')).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
    expect(isValidDateKey(20260904)).toBe(false);
  });
});

describe('day arithmetic', () => {
  it('counts whole days between keys', () => {
    expect(daysBetween('2026-09-04', '2026-09-05')).toBe(1);
    expect(daysBetween('2026-09-04', '2026-09-04')).toBe(0);
    expect(daysBetween('2026-09-05', '2026-09-04')).toBe(-1);
    expect(daysBetween('2026-09-01', '2026-10-01')).toBe(30);
  });

  it('crosses month and year boundaries', () => {
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2); // leap year
  });

  it('adds days across boundaries', () => {
    expect(addDays('2026-09-04', 1)).toBe('2026-09-05');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-09-04', -4)).toBe('2026-08-31');
  });

  it('survives a DST transition without drifting a day', () => {
    // Late-March and late-October Sundays are the European DST switches.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('week keys', () => {
  it('always resolves to the Monday of that week', () => {
    // 2026-09-04 is a Friday.
    expect(getWeekKey(new Date(2026, 8, 4))).toBe('2026-08-31');
    // Sunday belongs to the week that started the previous Monday.
    expect(getWeekKey(new Date(2026, 8, 6))).toBe('2026-08-31');
    // The following Monday starts a new week.
    expect(getWeekKey(new Date(2026, 8, 7))).toBe('2026-09-07');
  });

  it('is stable for every day inside one week', () => {
    const keys = Array.from({ length: 7 }, (_, offset) =>
      getWeekKey(new Date(2026, 8, 7 + offset)),
    );
    expect(new Set(keys).size).toBe(1);
  });

  it('produces a Monday for arbitrary dates', () => {
    for (let day = 0; day < 60; day += 1) {
      const key = getWeekKey(new Date(2026, 0, 1 + day));
      expect(fromLocalDateKey(key).getDay()).toBe(1);
    }
  });
});

describe('countdowns', () => {
  it('daily reset is within a day and positive', () => {
    const ms = msUntilDailyReset(new Date(2026, 8, 4, 22, 0, 0));
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(86400000);
  });

  it('weekly reset is within a week and positive', () => {
    const ms = msUntilWeeklyReset(new Date(2026, 8, 4, 12, 0, 0));
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(7 * 86400000);
  });

  it('formats countdowns in Swedish units', () => {
    expect(formatCountdown(0)).toBe('0m');
    expect(formatCountdown(90 * 60000)).toBe('1h 30m');
    expect(formatCountdown(2 * 86400000 + 3 * 3600000)).toBe('2d 3h 0m');
  });

  it('formats minutes readably', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(80)).toBe('1 h 20 min');
  });
});

describe('deterministic rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng('seed');
    const b = createRng('seed');
    const first = Array.from({ length: 20 }, () => a.next());
    const second = Array.from({ length: 20 }, () => b.next());
    expect(first).toEqual(second);
  });

  it('produces different sequences for different seeds', () => {
    expect(createRng('a').next()).not.toBe(createRng('b').next());
  });

  it('stays inside [0,1)', () => {
    const rng = createRng('range');
    for (let index = 0; index < 500; index += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('int is inclusive on both ends', () => {
    const rng = createRng('int');
    const seen = new Set<number>();
    for (let index = 0; index < 500; index += 1) seen.add(rng.int(1, 3));

    expect(seen).toEqual(new Set([1, 2, 3]));
    expect(rng.int(5, 5)).toBe(5);
    expect(rng.int(7, 2)).toBe(7);
  });

  it('shuffle keeps every element and does not mutate the input', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = createRng('shuffle').shuffle(source);

    expect(shuffled).toHaveLength(source.length);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(source);
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('hashString is stable and distinct', () => {
    expect(hashString('rogueday')).toBe(hashString('rogueday'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('weightedPick respects the weights', () => {
    const items = [
      { id: 'heavy', weight: 95 },
      { id: 'light', weight: 5 },
    ];
    const rng = createRng('weights');

    let heavy = 0;
    for (let index = 0; index < 2000; index += 1) {
      if (weightedPick(items, rng).id === 'heavy') heavy += 1;
    }

    expect(heavy / 2000).toBeGreaterThan(0.85);
  });
});
