import type { RogueDaySave } from '@/types';
import { isValidDateKey } from '@/utils/date';
import { sanitiseTimer } from '@/game/timer';
import { FEEDBACK_LIMIT } from '@/game/feedback';
import {
  APP_VERSION,
  SCHEMA_VERSION,
  createDefaultBuffs,
  createDefaultDaily,
  createDefaultFeedback,
  createDefaultMarket,
  createDefaultPerks,
  createDefaultProgression,
  createDefaultSave,
  createDefaultSettings,
  createDefaultStatistics,
  createDefaultStreak,
} from './defaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Structural validation. Deliberately strict about the things that would
 * corrupt gameplay (progression, history shape) and lenient about everything
 * that `mergeWithDefaults` can safely repair.
 */
export function validateSave(candidate: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(candidate)) {
    return { valid: false, errors: ['Sparfilen är inte ett objekt.'] };
  }

  if (!isFiniteNumber(candidate.schemaVersion)) {
    errors.push('schemaVersion saknas eller är ogiltig.');
  } else if (candidate.schemaVersion > SCHEMA_VERSION) {
    errors.push(
      `Sparfilen kommer från en nyare version (${candidate.schemaVersion} > ${SCHEMA_VERSION}).`,
    );
  }

  if (!isObject(candidate.player) || typeof candidate.player.name !== 'string') {
    errors.push('player.name saknas eller är ogiltig.');
  }

  if (!isObject(candidate.progression)) {
    errors.push('progression saknas.');
  } else {
    const progression = candidate.progression;
    if (!isFiniteNumber(progression.level) || progression.level < 1) {
      errors.push('progression.level är ogiltig.');
    }
    if (!isFiniteNumber(progression.xp) || progression.xp < 0) {
      errors.push('progression.xp är ogiltig.');
    }
    if (!isFiniteNumber(progression.totalXp) || progression.totalXp < 0) {
      errors.push('progression.totalXp är ogiltig.');
    }
    if (!isFiniteNumber(progression.gold) || progression.gold < 0) {
      errors.push('progression.gold är ogiltig.');
    }
  }

  if (!Array.isArray(candidate.history)) {
    errors.push('history är inte en lista.');
  } else {
    const malformed = candidate.history.filter(
      (entry) =>
        !isObject(entry) ||
        typeof entry.questId !== 'string' ||
        typeof entry.title !== 'string' ||
        !isFiniteNumber(entry.xpEarned),
    );
    if (malformed.length > 0) {
      errors.push(`${malformed.length} historikposter har fel format.`);
    }
  }

  if (!Array.isArray(candidate.achievements)) {
    errors.push('achievements är inte en lista.');
  }

  if (candidate.boss !== null && candidate.boss !== undefined) {
    if (!isObject(candidate.boss)) {
      errors.push('boss har fel format.');
    } else if (
      typeof candidate.boss.bossId !== 'string' ||
      !isFiniteNumber(candidate.boss.currentHp) ||
      !isFiniteNumber(candidate.boss.maxHp)
    ) {
      errors.push('boss saknar obligatoriska fält.');
    }
  }

  if (candidate.statistics !== undefined && !isObject(candidate.statistics)) {
    errors.push('statistics har fel format.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Restore an in-progress quest, keeping the accepted deal exactly as it was.
 * The timer is sanitised separately so broken stamps cannot produce nonsense
 * elapsed times.
 */
/**
 * v3 feedback. Scores are clamped on the way in so a hand-edited or corrupted
 * backup can never turn the weighting into something that hides content.
 */
function mergeFeedback(value: unknown): RogueDaySave['feedback'] {
  const base = createDefaultFeedback();
  if (!isObject(value)) return base;

  const scores: RogueDaySave['feedback']['scores'] = {};
  if (isObject(value.scores)) {
    for (const [key, score] of Object.entries(value.scores)) {
      if (!isFiniteNumber(score)) continue;
      scores[key as keyof typeof scores] = Math.max(-FEEDBACK_LIMIT, Math.min(FEEDBACK_LIMIT, score));
    }
  }

  const quests: RogueDaySave['feedback']['quests'] = {};
  if (isObject(value.quests)) {
    for (const [questId, vote] of Object.entries(value.quests)) {
      if (vote === 1 || vote === -1) quests[questId] = vote;
    }
  }

  return {
    scores,
    quests,
    up: isFiniteNumber(value.up) ? Math.max(0, Math.round(value.up)) : 0,
    down: isFiniteNumber(value.down) ? Math.max(0, Math.round(value.down)) : 0,
  };
}

function mergeActiveQuest(value: unknown): RogueDaySave['activeQuest'] {
  if (!isObject(value) || !isObject(value.offer)) return null;
  const timer = sanitiseTimer(value.timer);
  const active = { ...value } as unknown as NonNullable<RogueDaySave['activeQuest']>;
  if (timer) active.timer = timer;
  else delete active.timer;
  return active;
}

/**
 * Fill in anything a save is missing without ever discarding data that is
 * present. Used both after loading and after importing a backup.
 */
export function mergeWithDefaults(partial: Record<string, unknown>): RogueDaySave {
  const base = createDefaultSave();

  const player = isObject(partial.player) ? partial.player : {};
  const progression = isObject(partial.progression) ? partial.progression : {};
  const statistics = isObject(partial.statistics) ? partial.statistics : {};
  const streak = isObject(partial.streak) ? partial.streak : {};
  const daily = isObject(partial.daily) ? partial.daily : {};
  const settings = isObject(partial.settings) ? partial.settings : {};
  const buffs = isObject(partial.buffs) ? partial.buffs : {};
  const metadata = isObject(partial.metadata) ? partial.metadata : {};

  const defaultStatistics = createDefaultStatistics();

  const merged: RogueDaySave = {
    schemaVersion: isFiniteNumber(partial.schemaVersion) ? partial.schemaVersion : SCHEMA_VERSION,
    player: {
      name: typeof player.name === 'string' && player.name.trim() ? player.name : base.player.name,
      createdAt: typeof player.createdAt === 'string' ? player.createdAt : base.player.createdAt,
    },
    progression: {
      ...createDefaultProgression(),
      ...(isFiniteNumber(progression.level) ? { level: Math.max(1, progression.level) } : {}),
      ...(isFiniteNumber(progression.xp) ? { xp: Math.max(0, progression.xp) } : {}),
      ...(isFiniteNumber(progression.totalXp) ? { totalXp: Math.max(0, progression.totalXp) } : {}),
      ...(isFiniteNumber(progression.gold) ? { gold: Math.max(0, progression.gold) } : {}),
    },
    inventory: Array.isArray(partial.inventory)
      ? (partial.inventory.filter(
          (entry) => isObject(entry) && typeof entry.itemId === 'string' && isFiniteNumber(entry.count),
        ) as RogueDaySave['inventory'])
      : [],
    buffs: { ...createDefaultBuffs(), ...(buffs as object) },
    history: Array.isArray(partial.history)
      ? (partial.history.filter(
          (entry) =>
            isObject(entry) && typeof entry.questId === 'string' && isFiniteNumber(entry.xpEarned),
        ) as RogueDaySave['history'])
      : [],
    achievements: Array.isArray(partial.achievements)
      ? (partial.achievements.filter(
          (entry) => isObject(entry) && typeof entry.id === 'string',
        ) as RogueDaySave['achievements'])
      : [],
    boss:
      isObject(partial.boss) && typeof partial.boss.bossId === 'string'
        ? ({
            damageByDate: {},
            questsContributed: 0,
            totalDamage: 0,
            defeated: false,
            ...partial.boss,
            phasesSeen: Array.isArray((partial.boss as Record<string, unknown>).phasesSeen)
              ? ((partial.boss as Record<string, unknown>).phasesSeen as unknown[]).filter(
                  (value): value is number => typeof value === 'number',
                )
              : [],
          } as RogueDaySave['boss'])
        : null,
    bossHistory: Array.isArray(partial.bossHistory)
      ? (partial.bossHistory.filter(
          (entry) => isObject(entry) && typeof entry.bossId === 'string',
        ) as RogueDaySave['bossHistory'])
      : [],
    questChains: isObject(partial.questChains)
      ? (partial.questChains as RogueDaySave['questChains'])
      : {},
    statistics: {
      ...defaultStatistics,
      ...(statistics as object),
      questsByCategory: isObject(statistics.questsByCategory)
        ? (statistics.questsByCategory as Record<string, number>)
        : {},
      questsByRarity: {
        ...defaultStatistics.questsByRarity,
        ...(isObject(statistics.questsByRarity) ? (statistics.questsByRarity as object) : {}),
      },
      questsByDuration: isObject(statistics.questsByDuration)
        ? (statistics.questsByDuration as Record<string, number>)
        : {},
      completionDates: isObject(statistics.completionDates)
        ? (statistics.completionDates as Record<string, number>)
        : {},
    },
    daily: {
      ...createDefaultDaily(),
      ...(daily as object),
      date: isValidDateKey(daily.date) ? daily.date : null,
    },
    streak: {
      ...createDefaultStreak(),
      ...(streak as object),
      lastCompletionDate: isValidDateKey(streak.lastCompletionDate)
        ? streak.lastCompletionDate
        : null,
    },
    settings: { ...createDefaultSettings(), ...(settings as object) },
    market: isObject(partial.market)
      ? {
          ...createDefaultMarket(),
          date: isValidDateKey((partial.market as Record<string, unknown>).date)
            ? ((partial.market as Record<string, unknown>).date as string)
            : null,
          purchased: isObject((partial.market as Record<string, unknown>).purchased)
            ? ((partial.market as Record<string, unknown>).purchased as Record<string, number>)
            : {},
        }
      : createDefaultMarket(),
    perks: isObject(partial.perks)
      ? {
          selected: Array.isArray((partial.perks as Record<string, unknown>).selected)
            ? ((partial.perks as Record<string, unknown>).selected as unknown[]).filter(
                (id): id is string => typeof id === 'string',
              )
            : [],
        }
      : createDefaultPerks(),
    eventFollowUp:
      isObject(partial.eventFollowUp) && typeof partial.eventFollowUp.id === 'string'
        ? (partial.eventFollowUp as unknown as RogueDaySave['eventFollowUp'])
        : null,
    activeQuest: mergeActiveQuest(partial.activeQuest),
    recentQuestIds: Array.isArray(partial.recentQuestIds)
      ? partial.recentQuestIds.filter((id): id is string => typeof id === 'string')
      : [],
    feedback: mergeFeedback(partial.feedback),
    onboardingComplete: partial.onboardingComplete === true,
    metadata: {
      createdAt:
        typeof metadata.createdAt === 'string' ? metadata.createdAt : base.metadata.createdAt,
      lastSavedAt:
        typeof metadata.lastSavedAt === 'string' ? metadata.lastSavedAt : base.metadata.lastSavedAt,
      saveCount: isFiniteNumber(metadata.saveCount) ? metadata.saveCount : 0,
      appVersion: typeof metadata.appVersion === 'string' ? metadata.appVersion : APP_VERSION,
    },
  };

  return merged;
}
