import { beforeEach, describe, expect, it } from 'vitest';
import type { RogueDaySave } from '@/types';
import { completeQuest } from '@/game/completion';
import { createDefaultSave, SCHEMA_VERSION } from './defaults';
import { migrateSave } from './migrate';
import {
  BACKUP_KEY,
  SAVE_KEY,
  exportSave,
  importSave,
  loadGame,
  readDiagnostics,
  resetGame,
  saveGame,
  testSaveRoundTrip,
} from './storage';
import { mergeWithDefaults, validateSave } from './validate';
import { makeOffer, makeSave, NO_LUCK_RNG } from '@/test/helpers';

describe('save serialization', () => {
  beforeEach(() => window.localStorage.clear());

  it('writes to the single documented key', () => {
    const save = makeSave();
    const result = saveGame(save);

    expect(result.ok).toBe(true);
    expect(window.localStorage.getItem(SAVE_KEY)).not.toBeNull();
  });

  it('round-trips every persistent field', () => {
    const save = makeSave();
    save.progression.gold = 321;
    save.player.name = 'Nattvandraren';
    saveGame(save);

    const loaded = loadGame();

    expect(loaded.source).toBe('main');
    expect(loaded.save.progression.gold).toBe(321);
    expect(loaded.save.player.name).toBe('Nattvandraren');
    expect(loaded.save.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('increments save count and stamps the write time', () => {
    const save = makeSave();
    saveGame(save);
    saveGame(save);

    const stored = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? '{}') as RogueDaySave;
    expect(stored.metadata.saveCount).toBe(2);
    expect(stored.metadata.lastSavedAt).toBeTruthy();
  });
});

describe('startup order', () => {
  beforeEach(() => window.localStorage.clear());

  it('never overwrites an existing save with defaults on load', () => {
    const save = makeSave();
    save.progression.totalXp = 5000;
    save.progression.level = 9;
    saveGame(save);

    const before = window.localStorage.getItem(SAVE_KEY);
    const loaded = loadGame();
    const after = window.localStorage.getItem(SAVE_KEY);

    // loadGame must be read-only.
    expect(after).toBe(before);
    expect(loaded.save.progression.totalXp).toBe(5000);
    expect(loaded.save.progression.level).toBe(9);
  });

  it('returns a fresh game when storage is empty, without writing', () => {
    const loaded = loadGame();

    expect(loaded.source).toBe('fresh');
    expect(loaded.recovered).toBe(false);
    expect(loaded.save.progression.level).toBe(1);
    expect(window.localStorage.getItem(SAVE_KEY)).toBeNull();
  });
});

describe('backup and corruption recovery', () => {
  beforeEach(() => window.localStorage.clear());

  it('promotes the previous save to the backup slot before writing', () => {
    const save = makeSave();
    save.progression.gold = 10;
    saveGame(save);

    save.progression.gold = 99;
    saveGame(save);

    const backup = JSON.parse(window.localStorage.getItem(BACKUP_KEY) ?? '{}') as RogueDaySave;
    const main = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? '{}') as RogueDaySave;

    expect(backup.progression.gold).toBe(10);
    expect(main.progression.gold).toBe(99);
  });

  it('recovers from the backup when the main save is corrupt', () => {
    const save = makeSave();
    save.progression.gold = 250;
    saveGame(save);
    save.progression.gold = 260;
    saveGame(save); // gold 250 now lives in the backup slot

    window.localStorage.setItem(SAVE_KEY, '{ this is not json');

    const loaded = loadGame();

    expect(loaded.source).toBe('backup');
    expect(loaded.recovered).toBe(true);
    expect(loaded.save.progression.gold).toBe(250);
    expect(loaded.warnings.join(' ')).toContain('säkerhetskopian');
  });

  it('falls back to a fresh game when both slots are corrupt, without throwing', () => {
    window.localStorage.setItem(SAVE_KEY, 'not json at all');
    window.localStorage.setItem(BACKUP_KEY, '{{{');

    const loaded = loadGame();

    expect(loaded.source).toBe('fresh');
    expect(loaded.save.progression.level).toBe(1);
    expect(loaded.warnings.length).toBeGreaterThan(0);
  });

  it('survives a save that is valid JSON but the wrong shape', () => {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([1, 2, 3]));

    const loaded = loadGame();
    expect(loaded.save.progression.level).toBe(1);
  });

  it('repairs a save that is missing whole sections', () => {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        player: { name: 'Halvsparad' },
        progression: { level: 4, xp: 20, totalXp: 900, gold: 44 },
      }),
    );

    const loaded = loadGame();

    expect(loaded.save.player.name).toBe('Halvsparad');
    expect(loaded.save.progression.level).toBe(4);
    expect(loaded.save.history).toEqual([]);
    expect(loaded.save.statistics.questsCompleted).toBe(0);
    expect(loaded.save.settings).toBeDefined();
  });
});

describe('validation', () => {
  it('accepts a default save', () => {
    expect(validateSave(createDefaultSave()).valid).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(validateSave(null).valid).toBe(false);
    expect(validateSave('nope').valid).toBe(false);
    expect(validateSave(42).valid).toBe(false);
  });

  it('rejects a save from a future schema version', () => {
    const future = { ...createDefaultSave(), schemaVersion: SCHEMA_VERSION + 5 };
    const result = validateSave(future);

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('nyare version');
  });

  it('flags malformed history entries', () => {
    const broken = { ...createDefaultSave(), history: [{ nope: true }] };
    const result = validateSave(broken);

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('historikposter');
  });

  it('mergeWithDefaults keeps present data and fills the rest', () => {
    const merged = mergeWithDefaults({
      player: { name: 'Kvar' },
      progression: { level: 7, xp: 10, totalXp: 3000, gold: 88 },
      history: [{ questId: 'x', xpEarned: 5, title: 'T' }],
    });

    expect(merged.player.name).toBe('Kvar');
    expect(merged.progression.level).toBe(7);
    expect(merged.history).toHaveLength(1);
    expect(merged.achievements).toEqual([]);
    expect(merged.statistics.questsByRarity.common).toBe(0);
  });

  it('clamps negative numbers rather than trusting them', () => {
    const merged = mergeWithDefaults({
      progression: { level: -3, xp: -10, totalXp: -50, gold: -99 },
    });

    expect(merged.progression.level).toBe(1);
    expect(merged.progression.xp).toBe(0);
    expect(merged.progression.gold).toBe(0);
  });
});

describe('migration', () => {
  it('upgrades a version-0 prototype save', () => {
    const legacy = { level: 3, xp: 40, totalXp: 700, gold: 25, history: [] };
    const result = migrateSave(legacy as unknown as Record<string, unknown>);

    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe(0);
    expect(result.save.schemaVersion).toBe(SCHEMA_VERSION);

    const merged = mergeWithDefaults(result.save);
    expect(merged.progression.level).toBe(3);
    expect(merged.progression.totalXp).toBe(700);
    expect(merged.progression.gold).toBe(25);
  });

  it('leaves a current-version save untouched', () => {
    const current = createDefaultSave() as unknown as Record<string, unknown>;
    const result = migrateSave(current);

    expect(result.migrated).toBe(false);
    expect(result.save).toBe(current);
  });

  it('loads a legacy save end-to-end through localStorage', () => {
    window.localStorage.clear();
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ level: 6, xp: 12, totalXp: 2100, gold: 77 }),
    );

    const loaded = loadGame();

    expect(loaded.migrated).toBe(true);
    expect(loaded.save.progression.level).toBe(6);
    expect(loaded.save.progression.totalXp).toBe(2100);
  });
});

describe('export and import', () => {
  beforeEach(() => window.localStorage.clear());

  it('exports valid JSON with a dated filename', () => {
    const save = makeSave();
    save.progression.gold = 512;
    const payload = exportSave(save);

    expect(payload.filename).toMatch(/^rogue-day-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(payload.json).progression.gold).toBe(512);
  });

  it('imports an exported file back into an equivalent save', () => {
    const save = makeSave();
    save.progression.totalXp = 4321;
    save.history = [
      {
        entryId: 'h1',
        questId: 'home_bed_fortress',
        title: 'SÄNGENS ÅTERUPPBYGGNAD',
        category: 'home',
        rarity: 'common',
        difficulty: 'easy',
        duration: 5,
        xpEarned: 16,
        goldEarned: 3,
        bossDamage: 25,
        completedAt: new Date().toISOString(),
        completedDate: '2026-09-04',
        mode: 'normal',
        isDaily: false,
      },
    ];

    const payload = exportSave(save);
    const result = importSave(payload.json);

    expect(result.ok).toBe(true);
    expect(result.save?.progression.totalXp).toBe(4321);
    expect(result.save?.history).toHaveLength(1);
  });

  it('rejects invalid JSON', () => {
    const result = importSave('{ nope');
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('JSON');
  });

  it('rejects a JSON array', () => {
    expect(importSave('[1,2,3]').ok).toBe(false);
  });

  it('rejects a save from a newer schema version', () => {
    const future = JSON.stringify({ ...createDefaultSave(), schemaVersion: 99 });
    const result = importSave(future);

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('nyare version');
  });

  it('repairs a partial but usable backup on import', () => {
    const result = importSave(
      JSON.stringify({ schemaVersion: 1, player: { name: 'Delvis' }, progression: { level: 2, xp: 0, totalXp: 100, gold: 5 } }),
    );

    expect(result.ok).toBe(true);
    expect(result.save?.player.name).toBe('Delvis');
    expect(result.save?.statistics).toBeDefined();
  });
});

describe('reset', () => {
  it('removes both slots and returns a fresh game', () => {
    const save = makeSave();
    saveGame(save);
    saveGame(save);

    expect(window.localStorage.getItem(SAVE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(BACKUP_KEY)).not.toBeNull();

    const fresh = resetGame();

    expect(window.localStorage.getItem(SAVE_KEY)).toBeNull();
    expect(window.localStorage.getItem(BACKUP_KEY)).toBeNull();
    expect(fresh.progression.level).toBe(1);
    expect(fresh.history).toEqual([]);
  });
});

describe('diagnostics and self-test', () => {
  beforeEach(() => window.localStorage.clear());

  it('reports the stored values, not the in-memory ones', () => {
    const save = makeSave();
    save.progression.totalXp = 1234;
    saveGame(save);

    // Mutate in memory only.
    save.progression.totalXp = 999999;

    const diagnostics = readDiagnostics();
    expect(diagnostics.storedTotalXp).toBe(1234);
    expect(diagnostics.hasSave).toBe(true);
    expect(diagnostics.key).toBe(SAVE_KEY);
  });

  it('the save self-test passes for a real save', () => {
    const save = makeSave();
    const { save: completed } = completeQuest(
      save,
      makeOffer('home_bed_fortress'),
      new Date(),
      NO_LUCK_RNG,
    );

    const result = testSaveRoundTrip(completed);

    expect(result.passed).toBe(true);
    expect(result.message).toBe('SPARNINGSTEST GODKÄNT');
    expect(result.checks.every((check) => check.ok)).toBe(true);
  });
});
