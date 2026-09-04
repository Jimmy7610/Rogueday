import type { BossDefinition, BossState } from '@/types';
import { BOSSES, getBossById } from '@/data/bosses';
import { createRng } from '@/utils/rng';
import { getWeekKey, toLocalDateKey } from '@/utils/date';

/**
 * Weekly boss rotation.
 *
 * The week's boss is derived deterministically from the local Monday date, so
 * every device computes the same boss for the same week without a server.
 */
export function getBossForWeek(weekKey: string): BossDefinition {
  const rng = createRng(`rogueday-boss-${weekKey}`);
  return BOSSES[rng.int(0, BOSSES.length - 1)];
}

export function createBossState(weekKey: string): BossState {
  const boss = getBossForWeek(weekKey);
  return {
    bossId: boss.id,
    weekKey,
    currentHp: boss.maxHp,
    maxHp: boss.maxHp,
    defeated: false,
    totalDamage: 0,
    questsContributed: 0,
    damageByDate: {},
  };
}

/**
 * Return the boss state for the current week, creating a fresh one when the
 * week has rolled over. The previous week's state is never mutated here -
 * callers persist the returned value.
 */
export function ensureCurrentBoss(
  existing: BossState | null,
  now: Date = new Date(),
): { boss: BossState; rotated: boolean } {
  const weekKey = getWeekKey(now);

  if (existing && existing.weekKey === weekKey) {
    return { boss: existing, rotated: false };
  }

  return { boss: createBossState(weekKey), rotated: true };
}

export interface BossDamageResult {
  boss: BossState;
  damageDealt: number;
  /** The boss is dead - which may already have been true before this hit. */
  defeated: boolean;
  /** True only for the hit that actually killed the boss. */
  justDefeated: boolean;
  /** Definition of the boss that was just defeated, if any. */
  defeatedBoss: BossDefinition | null;
}

/** Apply damage from a completed quest. Never reduces HP below zero. */
export function applyBossDamage(
  boss: BossState,
  damage: number,
  now: Date = new Date(),
): BossDamageResult {
  if (boss.defeated) {
    return { boss, damageDealt: 0, defeated: true, justDefeated: false, defeatedBoss: null };
  }

  const amount = Math.max(0, Math.round(damage));
  const dateKey = toLocalDateKey(now);
  const currentHp = Math.max(0, boss.currentHp - amount);
  const defeated = currentHp <= 0;
  const actualDamage = boss.currentHp - currentHp;

  const updated: BossState = {
    ...boss,
    currentHp,
    defeated,
    totalDamage: boss.totalDamage + actualDamage,
    questsContributed: boss.questsContributed + 1,
    damageByDate: {
      ...boss.damageByDate,
      [dateKey]: (boss.damageByDate[dateKey] ?? 0) + actualDamage,
    },
    ...(defeated ? { defeatedAt: now.toISOString() } : {}),
  };

  return {
    boss: updated,
    damageDealt: actualDamage,
    defeated,
    justDefeated: defeated,
    defeatedBoss: defeated ? (getBossById(boss.bossId) ?? null) : null,
  };
}

export function getDamageToday(boss: BossState | null, now: Date = new Date()): number {
  if (!boss) return 0;
  return boss.damageByDate[toLocalDateKey(now)] ?? 0;
}

export function getBossHpPercent(boss: BossState | null): number {
  if (!boss || boss.maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, boss.currentHp / boss.maxHp));
}

export { getBossById };
