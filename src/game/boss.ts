import type { BossDefinition, BossPhase, BossState, QuestCategory } from '@/types';
import {
  BOSSES,
  RESISTANCE_MULTIPLIER,
  WEAKNESS_MULTIPLIER,
  getBossById,
} from '@/data/bosses';
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
    phasesSeen: [],
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
  /** HP before this hit, for the attack readout. */
  hpBefore: number;
  /** Phase lines crossed by this hit, in the order they were passed. */
  phasesTriggered: BossPhase[];
}

/* ------------------------------------------------------------------ */
/* Weakness / resistance                                               */
/* ------------------------------------------------------------------ */

export interface WeaknessInfo {
  /** Total multiplier to apply, 1 when the category is neutral. */
  multiplier: number;
  weak: boolean;
  resistant: boolean;
}

/**
 * How hard a quest of this category hits the given boss.
 *
 * `weaknessBonusExtra` comes from Slayer perks and is added on top of the base
 * +25%, so a specialised player genuinely feels their build.
 */
export function getWeaknessInfo(
  boss: BossDefinition | undefined,
  category: QuestCategory,
  weaknessBonusExtra = 0,
): WeaknessInfo {
  if (!boss) return { multiplier: 1, weak: false, resistant: false };

  if (boss.weaknessCategories.includes(category)) {
    return {
      multiplier: WEAKNESS_MULTIPLIER + Math.max(0, weaknessBonusExtra),
      weak: true,
      resistant: false,
    };
  }

  if (boss.resistanceCategories.includes(category)) {
    return { multiplier: RESISTANCE_MULTIPLIER, weak: false, resistant: true };
  }

  return { multiplier: 1, weak: false, resistant: false };
}

/**
 * Phase lines crossed when HP falls from `before` to `after`.
 *
 * A threshold only fires if it has not already been recorded in `phasesSeen`,
 * so a phase reveal happens exactly once per boss per week even across reloads.
 */
export function getTriggeredPhases(
  boss: BossDefinition | undefined,
  maxHp: number,
  hpAfter: number,
  phasesSeen: number[],
): BossPhase[] {
  if (!boss || maxHp <= 0) return [];
  const fractionAfter = hpAfter / maxHp;
  const seen = new Set(phasesSeen);

  return boss.phases
    .filter((phase) => !seen.has(phase.threshold) && fractionAfter <= phase.threshold)
    .sort((a, b) => b.threshold - a.threshold);
}

/** Apply damage from a completed quest. Never reduces HP below zero. */
export function applyBossDamage(
  boss: BossState,
  damage: number,
  now: Date = new Date(),
): BossDamageResult {
  if (boss.defeated) {
    return {
      boss,
      damageDealt: 0,
      defeated: true,
      justDefeated: false,
      defeatedBoss: null,
      hpBefore: boss.currentHp,
      phasesTriggered: [],
    };
  }

  const amount = Math.max(0, Math.round(damage));
  const dateKey = toLocalDateKey(now);
  const currentHp = Math.max(0, boss.currentHp - amount);
  const defeated = currentHp <= 0;
  const actualDamage = boss.currentHp - currentHp;

  const definition = getBossById(boss.bossId);
  const phasesTriggered = getTriggeredPhases(definition, boss.maxHp, currentHp, boss.phasesSeen);

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
    phasesSeen: [...boss.phasesSeen, ...phasesTriggered.map((phase) => phase.threshold)],
    ...(defeated ? { defeatedAt: now.toISOString() } : {}),
  };

  return {
    boss: updated,
    damageDealt: actualDamage,
    defeated,
    justDefeated: defeated,
    defeatedBoss: defeated ? (definition ?? null) : null,
    hpBefore: boss.currentHp,
    phasesTriggered,
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

/** The phase line most recently revealed, for the boss screen. */
export function getLatestPhase(boss: BossState | null): BossPhase | null {
  if (!boss || boss.phasesSeen.length === 0) return null;
  const definition = getBossById(boss.bossId);
  if (!definition) return null;
  const lowest = Math.min(...boss.phasesSeen);
  return definition.phases.find((phase) => phase.threshold === lowest) ?? null;
}

export { getBossById, WEAKNESS_MULTIPLIER, RESISTANCE_MULTIPLIER };
