import type { RogueDaySave } from '@/types';
import { SCHEMA_VERSION } from './defaults';

type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Migrations run in order from the save's own version up to SCHEMA_VERSION.
 * Key `n` upgrades a version-`n` save to version `n + 1`.
 *
 * Every migration is additive: it may introduce new fields, but it must never
 * drop or rewrite a value the player already earned.
 *
 * Version 0 covers pre-schema prototype saves that had no version marker.
 */
const MIGRATIONS: Record<number, Migration> = {
  0: (save) => ({
    ...save,
    schemaVersion: 1,
    // The prototype stored a flat xp number and no boss/chain state.
    progression:
      typeof save.progression === 'object' && save.progression !== null
        ? save.progression
        : {
            level: typeof save.level === 'number' ? save.level : 1,
            xp: typeof save.xp === 'number' ? save.xp : 0,
            totalXp: typeof save.totalXp === 'number' ? save.totalXp : 0,
            gold: typeof save.gold === 'number' ? save.gold : 0,
          },
    questChains: save.questChains ?? {},
    bossHistory: save.bossHistory ?? [],
    recentQuestIds: save.recentQuestIds ?? [],
  }),

  /**
   * v1 -> v2: the depth pass.
   *
   * Adds the market, milestone perks, event follow-ups, boss phase tracking and
   * the new statistics counters. Everything a v1 player earned - XP, level,
   * gold, history, boss state, boss history, achievements, streak, inventory,
   * chains, statistics, settings and name - is carried through untouched.
   */
  1: (save) => {
    const statistics = asObject(save.statistics);
    const boss = save.boss;

    return {
      ...save,
      schemaVersion: 2,

      // New v2 sections, only ever added.
      market: save.market ?? { date: null, purchased: {} },
      perks: save.perks ?? { selected: [] },
      eventFollowUp: save.eventFollowUp ?? null,

      // A v1 boss has no phase history. Treat every phase as unseen so the
      // player still gets the reactions for the rest of the week, rather than
      // pretending they already happened.
      boss:
        typeof boss === 'object' && boss !== null && !Array.isArray(boss)
          ? { ...(boss as Record<string, unknown>), phasesSeen: (boss as Record<string, unknown>).phasesSeen ?? [] }
          : boss ?? null,

      statistics: {
        ...statistics,
        marketPurchases: statistics.marketPurchases ?? 0,
        timedChallengesWon: statistics.timedChallengesWon ?? 0,
        weaknessHits: statistics.weaknessHits ?? 0,
        followUpsCompleted: statistics.followUpsCompleted ?? 0,
      },
    };
  },
};

export interface MigrationResult {
  save: Record<string, unknown>;
  migrated: boolean;
  fromVersion: number;
  toVersion: number;
}

export function migrateSave(raw: Record<string, unknown>): MigrationResult {
  const fromVersion =
    typeof raw.schemaVersion === 'number' && Number.isFinite(raw.schemaVersion)
      ? raw.schemaVersion
      : 0;

  if (fromVersion >= SCHEMA_VERSION) {
    return { save: raw, migrated: false, fromVersion, toVersion: fromVersion };
  }

  let current = raw;
  let version = fromVersion;

  while (version < SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      // No path defined: stamp the current version and let mergeWithDefaults
      // fill the gaps rather than throwing away the player's progress.
      current = { ...current, schemaVersion: SCHEMA_VERSION };
      break;
    }
    current = migration(current);
    version += 1;
    current = { ...current, schemaVersion: version };
  }

  return { save: current, migrated: true, fromVersion, toVersion: SCHEMA_VERSION };
}

export function needsMigration(save: Pick<RogueDaySave, 'schemaVersion'>): boolean {
  return save.schemaVersion < SCHEMA_VERSION;
}
