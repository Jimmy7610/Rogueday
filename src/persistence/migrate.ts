import type { RogueDaySave } from '@/types';
import { SCHEMA_VERSION } from './defaults';

type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations run in order from the save's own version up to SCHEMA_VERSION.
 * Key `n` upgrades a version-`n` save to version `n + 1`.
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
