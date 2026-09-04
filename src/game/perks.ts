import type { PerkDefinition, PerkEffects, PerkState, RogueDaySave } from '@/types';
import {
  PERK_MILESTONES,
  PERKS,
  computePerkEffects,
  getPerkById,
  getPerksForLevel,
} from '@/data/perks';

/**
 * Milestone perks.
 *
 * A milestone is "owed" when the player's level has reached it but they have
 * not yet picked a perk from that level's set. Owed choices are derived from
 * level + selection rather than stored, so they survive any save shape and can
 * never be silently lost.
 */

export function getEffects(save: Pick<RogueDaySave, 'perks'>): PerkEffects {
  return computePerkEffects(save.perks?.selected ?? []);
}

/** Milestone levels the player has reached. */
export function reachedMilestones(level: number): number[] {
  return PERK_MILESTONES.filter((milestone) => milestone <= level);
}

/** Milestone levels that still owe the player a choice, lowest first. */
export function pendingMilestones(level: number, perks: PerkState): number[] {
  const chosenLevels = new Set(
    (perks?.selected ?? [])
      .map((perkId) => getPerkById(perkId)?.level)
      .filter((value): value is number => typeof value === 'number'),
  );
  return reachedMilestones(level).filter((milestone) => !chosenLevels.has(milestone));
}

export function hasPendingChoice(save: Pick<RogueDaySave, 'progression' | 'perks'>): boolean {
  return pendingMilestones(save.progression.level, save.perks).length > 0;
}

/** The three options for the next owed milestone, or an empty list. */
export function nextPerkChoice(
  save: Pick<RogueDaySave, 'progression' | 'perks'>,
): { level: number; options: PerkDefinition[] } | null {
  const [level] = pendingMilestones(save.progression.level, save.perks);
  if (level === undefined) return null;
  return { level, options: getPerksForLevel(level) };
}

export interface SelectPerkResult {
  perks: PerkState;
  /** False when the pick was rejected (unknown, locked or duplicate level). */
  ok: boolean;
  reason?: string;
}

/**
 * Choose a perk. Rejects anything the player has not actually unlocked, so a
 * hand-edited save cannot grant a level-50 perk at level 3.
 */
export function selectPerk(
  save: Pick<RogueDaySave, 'progression' | 'perks'>,
  perkId: string,
): SelectPerkResult {
  const perks = save.perks ?? { selected: [] };
  const definition = getPerkById(perkId);

  if (!definition) {
    return { perks, ok: false, reason: 'Okänd förmåga.' };
  }
  if (definition.level > save.progression.level) {
    return { perks, ok: false, reason: 'Nivån är inte uppnådd ännu.' };
  }
  if (perks.selected.includes(perkId)) {
    return { perks, ok: false, reason: 'Förmågan är redan vald.' };
  }

  const alreadyAtLevel = perks.selected.some(
    (selectedId) => getPerkById(selectedId)?.level === definition.level,
  );
  if (alreadyAtLevel) {
    return { perks, ok: false, reason: 'Du har redan valt en förmåga på den nivån.' };
  }

  return { perks: { selected: [...perks.selected, perkId] }, ok: true };
}

export interface PerkView extends PerkDefinition {
  owned: boolean;
  /** True when this level is reached but no perk has been chosen for it. */
  selectable: boolean;
  /** True when another perk was already taken at this level. */
  blocked: boolean;
}

/** Every perk with its state, for the FÖRMÅGOR panel. */
export function getPerkViews(save: Pick<RogueDaySave, 'progression' | 'perks'>): PerkView[] {
  const selected = new Set(save.perks?.selected ?? []);
  const pending = new Set(pendingMilestones(save.progression.level, save.perks));

  return PERKS.map((perk) => {
    const owned = selected.has(perk.id);
    const reached = perk.level <= save.progression.level;
    const selectable = !owned && pending.has(perk.level);
    return {
      ...perk,
      owned,
      selectable,
      blocked: reached && !owned && !selectable,
    };
  });
}

export { PERK_MILESTONES, getPerksForLevel, getPerkById };
