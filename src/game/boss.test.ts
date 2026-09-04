import { describe, expect, it } from 'vitest';
import { BOSSES, getBossById } from '@/data/bosses';
import { getWeekKey } from '@/utils/date';
import {
  applyBossDamage,
  createBossState,
  ensureCurrentBoss,
  getBossForWeek,
  getBossHpPercent,
  getDamageToday,
} from './boss';

describe('boss roster', () => {
  it('has at least 12 bosses', () => {
    expect(BOSSES.length).toBeGreaterThanOrEqual(12);
  });

  it('gives every boss complete data', () => {
    for (const boss of BOSSES) {
      expect(boss.id).toBeTruthy();
      expect(boss.name.length).toBeGreaterThan(0);
      expect(boss.subtitle.length).toBeGreaterThan(0);
      expect(boss.description.length).toBeGreaterThan(5);
      expect(boss.flavourText.length).toBeGreaterThan(5);
      expect(boss.maxHp).toBeGreaterThan(500);
      expect(boss.icon).toBeTruthy();
      expect(boss.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(boss.reward.xp).toBeGreaterThan(0);
      expect(boss.reward.gold).toBeGreaterThan(0);
      expect(boss.reward.badgeId).toBeTruthy();
      expect(boss.reward.chest).toBeTruthy();
    }
  });

  it('has unique ids and names', () => {
    expect(new Set(BOSSES.map((boss) => boss.id)).size).toBe(BOSSES.length);
    expect(new Set(BOSSES.map((boss) => boss.name)).size).toBe(BOSSES.length);
  });
});

describe('weekly rotation', () => {
  it('is deterministic for a given week', () => {
    expect(getBossForWeek('2026-09-07').id).toBe(getBossForWeek('2026-09-07').id);
    expect(getBossForWeek('2026-01-05').id).toBe(getBossForWeek('2026-01-05').id);
  });

  it('rotates across weeks', () => {
    const ids = new Set(
      Array.from({ length: 30 }, (_, index) => {
        const monday = new Date(2026, 0, 5 + index * 7);
        return getBossForWeek(getWeekKey(monday)).id;
      }),
    );
    expect(ids.size).toBeGreaterThan(4);
  });

  it('week keys always land on a Monday', () => {
    for (let day = 0; day < 21; day += 1) {
      const date = new Date(2026, 8, 1 + day);
      const weekKey = getWeekKey(date);
      const monday = new Date(`${weekKey}T00:00:00`);
      expect(monday.getDay()).toBe(1);
    }
  });

  it('every day in the same week resolves to the same boss', () => {
    const monday = new Date(2026, 8, 7);
    const ids = new Set(
      Array.from({ length: 7 }, (_, offset) => {
        const date = new Date(2026, 8, 7 + offset);
        return getBossForWeek(getWeekKey(date)).id;
      }),
    );

    expect(ids.size).toBe(1);
    expect(getWeekKey(monday)).toBe(getWeekKey(new Date(2026, 8, 13)));
  });

  it('ensureCurrentBoss keeps the state within a week and rotates after it', () => {
    const monday = new Date(2026, 8, 7, 10, 0, 0);
    const existing = createBossState(getWeekKey(monday));
    existing.currentHp -= 500;

    const same = ensureCurrentBoss(existing, new Date(2026, 8, 10, 12, 0, 0));
    expect(same.rotated).toBe(false);
    expect(same.boss.currentHp).toBe(existing.currentHp);

    const nextWeek = ensureCurrentBoss(existing, new Date(2026, 8, 14, 9, 0, 0));
    expect(nextWeek.rotated).toBe(true);
    expect(nextWeek.boss.currentHp).toBe(nextWeek.boss.maxHp);
    expect(nextWeek.boss.weekKey).not.toBe(existing.weekKey);
  });

  it('creates a boss when there is none', () => {
    const result = ensureCurrentBoss(null, new Date(2026, 8, 7));
    expect(result.rotated).toBe(true);
    expect(result.boss.currentHp).toBe(result.boss.maxHp);
    expect(result.boss.defeated).toBe(false);
  });
});

describe('damage', () => {
  it('reduces HP and tracks the totals', () => {
    const boss = createBossState('2026-09-07');
    const result = applyBossDamage(boss, 300, new Date(2026, 8, 7, 12));

    expect(result.boss.currentHp).toBe(boss.maxHp - 300);
    expect(result.boss.totalDamage).toBe(300);
    expect(result.boss.questsContributed).toBe(1);
    expect(result.damageDealt).toBe(300);
    expect(result.defeated).toBe(false);
  });

  it('accumulates damage per local day', () => {
    let boss = createBossState('2026-09-07');
    boss = applyBossDamage(boss, 100, new Date(2026, 8, 7, 9)).boss;
    boss = applyBossDamage(boss, 150, new Date(2026, 8, 7, 20)).boss;
    boss = applyBossDamage(boss, 75, new Date(2026, 8, 8, 9)).boss;

    expect(getDamageToday(boss, new Date(2026, 8, 7, 23))).toBe(250);
    expect(getDamageToday(boss, new Date(2026, 8, 8, 1))).toBe(75);
    expect(boss.totalDamage).toBe(325);
    expect(boss.questsContributed).toBe(3);
  });

  it('never drops below zero and marks the boss defeated', () => {
    const boss = createBossState('2026-09-07');
    const result = applyBossDamage(boss, boss.maxHp + 5000, new Date(2026, 8, 7));

    expect(result.boss.currentHp).toBe(0);
    expect(result.defeated).toBe(true);
    expect(result.boss.defeated).toBe(true);
    expect(result.boss.defeatedAt).toBeTruthy();
    // Overkill is not counted as damage dealt.
    expect(result.damageDealt).toBe(boss.maxHp);
    expect(result.boss.totalDamage).toBe(boss.maxHp);
    expect(result.defeatedBoss?.id).toBe(boss.bossId);
  });

  it('ignores further damage once defeated', () => {
    let boss = createBossState('2026-09-07');
    boss = applyBossDamage(boss, boss.maxHp, new Date(2026, 8, 7)).boss;

    const after = applyBossDamage(boss, 500, new Date(2026, 8, 8));

    expect(after.damageDealt).toBe(0);
    expect(after.boss.currentHp).toBe(0);
    expect(after.boss.questsContributed).toBe(boss.questsContributed);
    expect(after.defeatedBoss).toBeNull();
  });

  it('treats negative damage as zero', () => {
    const boss = createBossState('2026-09-07');
    const result = applyBossDamage(boss, -100, new Date(2026, 8, 7));
    expect(result.boss.currentHp).toBe(boss.maxHp);
  });
});

describe('hp percentage', () => {
  it('maps to 0..1', () => {
    const boss = createBossState('2026-09-07');
    expect(getBossHpPercent(boss)).toBe(1);

    const half = applyBossDamage(boss, Math.floor(boss.maxHp / 2), new Date()).boss;
    expect(getBossHpPercent(half)).toBeCloseTo(0.5, 1);

    expect(getBossHpPercent(null)).toBe(0);
  });
});

describe('boss lookups', () => {
  it('resolves every reward badge to a real boss', () => {
    for (const boss of BOSSES) {
      expect(getBossById(boss.id)).toBe(boss);
    }
    expect(getBossById('nope')).toBeUndefined();
  });
});
