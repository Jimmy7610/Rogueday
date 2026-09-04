import type { RogueDaySave } from '@/types';
import { toLocalDateKey } from '@/utils/date';
import { APP_VERSION, SCHEMA_VERSION, createDefaultSave } from './defaults';
import { migrateSave } from './migrate';
import { mergeWithDefaults, validateSave } from './validate';

/**
 * The ONLY module in RogueDay that talks to localStorage.
 *
 * Everything else mutates the single authoritative game state and then calls
 * `saveGame`. There are no scattered setItem calls anywhere else in the app.
 */

export const SAVE_KEY = 'rogueDay.save.v1';
export const BACKUP_KEY = 'rogueDay.save.backup';

export type LoadSource = 'main' | 'backup' | 'fresh';

export interface LoadResult {
  save: RogueDaySave;
  source: LoadSource;
  /** True when a save existed and was read successfully. */
  recovered: boolean;
  migrated: boolean;
  warnings: string[];
}

/** Guarded storage access - private mode and disabled storage must not crash. */
function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__rogueday_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isStorageAvailable(): boolean {
  return getStorage() !== null;
}

function readKey(key: string): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeKey(key: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Parse + validate + migrate + merge. Returns null when unusable. */
function parseCandidate(
  raw: string | null,
  warnings: string[],
  label: string,
): { save: RogueDaySave; migrated: boolean } | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnings.push(`${label}: JSON gick inte att tolka.`);
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    warnings.push(`${label}: sparfilen är inte ett objekt.`);
    return null;
  }

  const migration = migrateSave(parsed as Record<string, unknown>);
  const validation = validateSave(migration.save);

  if (!validation.valid) {
    // Structural problems that merging cannot fix -> reject this candidate.
    const fatal = validation.errors.filter(
      (error) => error.includes('nyare version') || error.includes('inte ett objekt'),
    );
    if (fatal.length > 0) {
      warnings.push(`${label}: ${fatal.join(' ')}`);
      return null;
    }
    warnings.push(`${label}: ${validation.errors.join(' ')} Fälten återställdes till standard.`);
  }

  return {
    save: mergeWithDefaults(migration.save),
    migrated: migration.migrated,
  };
}

/**
 * Load the authoritative save.
 *
 * Startup order: defaults -> read main -> parse -> validate -> migrate ->
 * merge missing defaults. If the main save is unusable the backup is tried
 * before falling back to a fresh game. Nothing is written during load.
 */
export function loadGame(): LoadResult {
  const warnings: string[] = [];

  const main = parseCandidate(readKey(SAVE_KEY), warnings, 'Huvudsparfil');
  if (main) {
    return {
      save: main.save,
      source: 'main',
      recovered: true,
      migrated: main.migrated,
      warnings,
    };
  }

  const backup = parseCandidate(readKey(BACKUP_KEY), warnings, 'Säkerhetskopia');
  if (backup) {
    warnings.push('Huvudsparfilen var skadad - säkerhetskopian återställdes.');
    return {
      save: backup.save,
      source: 'backup',
      recovered: true,
      migrated: backup.migrated,
      warnings,
    };
  }

  return {
    save: createDefaultSave(),
    source: 'fresh',
    recovered: false,
    migrated: false,
    warnings,
  };
}

export interface SaveResult {
  ok: boolean;
  bytes: number;
  savedAt: string;
  error?: string;
}

/**
 * Atomic-ish write: the previous valid main save is copied to the backup slot
 * before the new payload replaces it, so a failed or partial write can never
 * leave the player with nothing.
 */
export function saveGame(state: RogueDaySave): SaveResult {
  const savedAt = new Date().toISOString();

  const payload: RogueDaySave = {
    ...state,
    schemaVersion: SCHEMA_VERSION,
    metadata: {
      ...state.metadata,
      lastSavedAt: savedAt,
      saveCount: state.metadata.saveCount + 1,
      appVersion: APP_VERSION,
    },
  };

  let serialised: string;
  try {
    serialised = JSON.stringify(payload);
  } catch (error) {
    return {
      ok: false,
      bytes: 0,
      savedAt,
      error: `Kunde inte serialisera sparfilen: ${String(error)}`,
    };
  }

  // Step 1: promote the current main save to backup (only if it parses).
  const currentMain = readKey(SAVE_KEY);
  if (currentMain) {
    try {
      JSON.parse(currentMain);
      writeKey(BACKUP_KEY, currentMain);
    } catch {
      /* A corrupt main save is not worth backing up. */
    }
  }

  // Step 2: write the new main save.
  const ok = writeKey(SAVE_KEY, serialised);
  if (!ok) {
    return {
      ok: false,
      bytes: serialised.length,
      savedAt,
      error: 'localStorage är inte tillgängligt eller fullt.',
    };
  }

  // Reflect the persisted metadata back into the caller's object so the UI
  // and the stored copy never drift apart.
  state.metadata.lastSavedAt = savedAt;
  state.metadata.saveCount = payload.metadata.saveCount;
  state.metadata.appVersion = APP_VERSION;

  return { ok: true, bytes: serialised.length, savedAt };
}

/** Read the raw stored string, for diagnostics. */
export function readRawSave(): string | null {
  return readKey(SAVE_KEY);
}

export function readRawBackup(): string | null {
  return readKey(BACKUP_KEY);
}

/** Remove both slots and hand back a brand new game. */
export function resetGame(): RogueDaySave {
  removeKey(SAVE_KEY);
  removeKey(BACKUP_KEY);
  return createDefaultSave();
}

export interface ExportPayload {
  save: RogueDaySave;
  filename: string;
  json: string;
}

export function exportSave(state: RogueDaySave): ExportPayload {
  const json = JSON.stringify(state, null, 2);
  return {
    save: state,
    filename: `rogue-day-backup-${toLocalDateKey()}.json`,
    json,
  };
}

export interface ImportResult {
  ok: boolean;
  save?: RogueDaySave;
  errors: string[];
}

/** Validate and normalise an uploaded backup before it replaces progress. */
export function importSave(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: ['Filen innehåller inte giltig JSON.'] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, errors: ['Filen innehåller ingen RogueDay-sparfil.'] };
  }

  const migration = migrateSave(parsed as Record<string, unknown>);
  const validation = validateSave(migration.save);

  const fatal = validation.errors.filter(
    (error) => error.includes('nyare version') || error.includes('inte ett objekt'),
  );
  if (fatal.length > 0) {
    return { ok: false, errors: fatal };
  }

  return { ok: true, save: mergeWithDefaults(migration.save), errors: validation.errors };
}

export interface SaveDiagnostics {
  storageAvailable: boolean;
  key: string;
  backupKey: string;
  hasSave: boolean;
  hasBackup: boolean;
  schemaVersion: number | null;
  appVersion: string | null;
  lastSavedAt: string | null;
  saveCount: number | null;
  bytes: number;
  backupBytes: number;
  storedTotalXp: number | null;
  storedLevel: number | null;
  storedHistoryCount: number | null;
  storedAchievementCount: number | null;
  storedBossHp: number | null;
  storedBossName: string | null;
  parseError: string | null;
}

/** Everything the DATA screen's diagnostics panel needs, read from storage. */
export function readDiagnostics(): SaveDiagnostics {
  const raw = readRawSave();
  const backup = readRawBackup();

  const diagnostics: SaveDiagnostics = {
    storageAvailable: isStorageAvailable(),
    key: SAVE_KEY,
    backupKey: BACKUP_KEY,
    hasSave: raw !== null,
    hasBackup: backup !== null,
    schemaVersion: null,
    appVersion: null,
    lastSavedAt: null,
    saveCount: null,
    bytes: raw ? new Blob([raw]).size : 0,
    backupBytes: backup ? new Blob([backup]).size : 0,
    storedTotalXp: null,
    storedLevel: null,
    storedHistoryCount: null,
    storedAchievementCount: null,
    storedBossHp: null,
    storedBossName: null,
    parseError: null,
  };

  if (!raw) return diagnostics;

  try {
    const parsed = JSON.parse(raw) as Partial<RogueDaySave>;
    diagnostics.schemaVersion = parsed.schemaVersion ?? null;
    diagnostics.appVersion = parsed.metadata?.appVersion ?? null;
    diagnostics.lastSavedAt = parsed.metadata?.lastSavedAt ?? null;
    diagnostics.saveCount = parsed.metadata?.saveCount ?? null;
    diagnostics.storedTotalXp = parsed.progression?.totalXp ?? null;
    diagnostics.storedLevel = parsed.progression?.level ?? null;
    diagnostics.storedHistoryCount = parsed.history?.length ?? null;
    diagnostics.storedAchievementCount = parsed.achievements?.length ?? null;
    diagnostics.storedBossHp = parsed.boss?.currentHp ?? null;
    diagnostics.storedBossName = parsed.boss?.bossId ?? null;
  } catch (error) {
    diagnostics.parseError = String(error);
  }

  return diagnostics;
}

export interface SaveTestResult {
  passed: boolean;
  checks: { label: string; expected: string; actual: string; ok: boolean }[];
  message: string;
}

/**
 * Write the current state, read it straight back out of localStorage and
 * compare the values that matter. Backs the "TESTA SPARNING" button.
 */
export function testSaveRoundTrip(state: RogueDaySave): SaveTestResult {
  const writeResult = saveGame(state);
  if (!writeResult.ok) {
    return {
      passed: false,
      checks: [],
      message: writeResult.error ?? 'Sparningen misslyckades.',
    };
  }

  const raw = readRawSave();
  if (!raw) {
    return {
      passed: false,
      checks: [],
      message: 'Ingenting hittades i localStorage efter sparning.',
    };
  }

  let parsed: RogueDaySave;
  try {
    parsed = JSON.parse(raw) as RogueDaySave;
  } catch (error) {
    return {
      passed: false,
      checks: [],
      message: `Sparfilen gick inte att läsa tillbaka: ${String(error)}`,
    };
  }

  const checks = [
    {
      label: 'Total XP',
      expected: String(state.progression.totalXp),
      actual: String(parsed.progression?.totalXp),
      ok: parsed.progression?.totalXp === state.progression.totalXp,
    },
    {
      label: 'Nivå',
      expected: String(state.progression.level),
      actual: String(parsed.progression?.level),
      ok: parsed.progression?.level === state.progression.level,
    },
    {
      label: 'Guld',
      expected: String(state.progression.gold),
      actual: String(parsed.progression?.gold),
      ok: parsed.progression?.gold === state.progression.gold,
    },
    {
      label: 'Historikposter',
      expected: String(state.history.length),
      actual: String(parsed.history?.length),
      ok: parsed.history?.length === state.history.length,
    },
    {
      label: 'Märken',
      expected: String(state.achievements.length),
      actual: String(parsed.achievements?.length),
      ok: parsed.achievements?.length === state.achievements.length,
    },
    {
      label: 'Boss-HP',
      expected: String(state.boss?.currentHp ?? '-'),
      actual: String(parsed.boss?.currentHp ?? '-'),
      ok: (parsed.boss?.currentHp ?? null) === (state.boss?.currentHp ?? null),
    },
    {
      label: 'Spelarnamn',
      expected: state.player.name,
      actual: String(parsed.player?.name),
      ok: parsed.player?.name === state.player.name,
    },
  ];

  const failed = checks.filter((check) => !check.ok);

  return {
    passed: failed.length === 0,
    checks,
    message:
      failed.length === 0
        ? 'SPARNINGSTEST GODKÄNT'
        : `SPARNINGSTEST MISSLYCKADES: ${failed.map((c) => c.label).join(', ')}`,
  };
}
