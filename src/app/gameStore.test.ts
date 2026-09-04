import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultSave } from '@/persistence/defaults';
import { loadGame, saveGame } from '@/persistence/storage';
import { createRng } from '@/utils/rng';
import { getWeekKey, toLocalDateKey } from '@/utils/date';
import {
  DEFAULT_FILTERS,
  createInitialState,
  gameReducer,
  reconcileWithClock,
  shouldPersist,
  type GameState,
} from './gameStore';
import { makeOffer, makeSave } from '@/test/helpers';

function stateFrom(save = makeSave()): GameState {
  return {
    save,
    offers: null,
    filters: DEFAULT_FILTERS,
    pendingEvent: null,
    lastReward: null,
    loadSource: 'fresh',
    loadWarnings: [],
    saveTick: 0,
    saveError: null,
  };
}

describe('reconcileWithClock', () => {
  it('creates a boss when there is none', () => {
    const reconciled = reconcileWithClock(createDefaultSave(), new Date(2026, 8, 7));
    expect(reconciled.boss).not.toBeNull();
    expect(reconciled.boss?.weekKey).toBe(getWeekKey(new Date(2026, 8, 7)));
  });

  it('keeps the boss and its damage inside the same week', () => {
    const save = makeSave(new Date(2026, 8, 7, 10));
    save.boss!.currentHp -= 400;

    const reconciled = reconcileWithClock(save, new Date(2026, 8, 10, 10));

    expect(reconciled.boss?.currentHp).toBe(save.boss!.currentHp);
    expect(reconciled.boss?.bossId).toBe(save.boss!.bossId);
  });

  it('rotates the boss at the week boundary', () => {
    const save = makeSave(new Date(2026, 8, 7, 10));
    save.boss!.currentHp = 100;

    const reconciled = reconcileWithClock(save, new Date(2026, 8, 14, 10));

    expect(reconciled.boss?.weekKey).not.toBe(save.boss!.weekKey);
    expect(reconciled.boss?.currentHp).toBe(reconciled.boss?.maxHp);
  });

  it('sets a daily quest for the current local day', () => {
    const reconciled = reconcileWithClock(createDefaultSave(), new Date(2026, 8, 4, 9));

    expect(reconciled.daily.date).toBe('2026-09-04');
    expect(reconciled.daily.questId).toBeTruthy();
    expect(reconciled.daily.completed).toBe(false);
  });

  it('rolls the daily quest over at midnight and clears completion', () => {
    const save = makeSave(new Date(2026, 8, 4, 9));
    save.daily.completed = true;

    const nextDay = reconcileWithClock(save, new Date(2026, 8, 5, 9));

    expect(nextDay.daily.date).toBe('2026-09-05');
    expect(nextDay.daily.completed).toBe(false);
  });

  it('does not reset the daily quest within the same day', () => {
    const save = makeSave(new Date(2026, 8, 4, 9));
    save.daily.completed = true;
    const questId = save.daily.questId;

    const later = reconcileWithClock(save, new Date(2026, 8, 4, 23));

    expect(later.daily.questId).toBe(questId);
    expect(later.daily.completed).toBe(true);
  });

  it('never touches history or progression', () => {
    const save = makeSave(new Date(2026, 8, 4));
    save.progression.totalXp = 900;
    save.history = [
      {
        entryId: 'h',
        questId: 'q',
        title: 'T',
        category: 'home',
        rarity: 'common',
        difficulty: 'easy',
        duration: 5,
        xpEarned: 10,
        goldEarned: 2,
        bossDamage: 20,
        completedAt: new Date().toISOString(),
        completedDate: '2026-09-04',
        mode: 'normal',
        isDaily: false,
      },
    ];

    const reconciled = reconcileWithClock(save, new Date(2026, 9, 1));

    expect(reconciled.history).toHaveLength(1);
    expect(reconciled.progression.totalXp).toBe(900);
  });
});

describe('reducer', () => {
  beforeEach(() => window.localStorage.clear());

  it('ROLL_QUESTS produces three offers matching the filters', () => {
    const next = gameReducer(stateFrom(), {
      type: 'ROLL_QUESTS',
      filters: { ...DEFAULT_FILTERS, duration: 5, energy: 'low' },
      rng: createRng('roll'),
    });

    expect(next.offers).toHaveLength(3);
    expect(next.offers!.every((offer) => offer.quest.duration <= 5)).toBe(true);
    expect(next.filters.duration).toBe(5);
  });

  it('SET_FILTERS merges partial updates', () => {
    const next = gameReducer(stateFrom(), { type: 'SET_FILTERS', filters: { mood: 'bored' } });
    expect(next.filters.mood).toBe('bored');
    expect(next.filters.duration).toBe(DEFAULT_FILTERS.duration);
  });

  it('ACCEPT_QUEST stores the active quest and clears the offers', () => {
    const offer = makeOffer('home_bed_fortress');
    let state = gameReducer(stateFrom(), {
      type: 'ROLL_QUESTS',
      filters: DEFAULT_FILTERS,
      rng: createRng('a'),
    });
    state = gameReducer(state, { type: 'ACCEPT_QUEST', offer });

    expect(state.save.activeQuest?.offer.offerId).toBe(offer.offerId);
    expect(state.offers).toBeNull();
    expect(state.save.recentQuestIds.length).toBeGreaterThan(0);
  });

  it('COMPLETE_QUEST records progress and clears the active quest', () => {
    const offer = makeOffer('home_bed_fortress');
    let state = stateFrom();
    state = gameReducer(state, { type: 'ACCEPT_QUEST', offer });
    state = gameReducer(state, {
      type: 'COMPLETE_QUEST',
      now: new Date(2026, 8, 4, 12),
      rng: { ...createRng('c'), chance: () => false },
    });

    expect(state.save.activeQuest).toBeNull();
    expect(state.save.history).toHaveLength(1);
    expect(state.lastReward).not.toBeNull();
    expect(state.save.progression.totalXp).toBeGreaterThan(0);
  });

  it('COMPLETE_QUEST is a no-op with no active quest', () => {
    const state = stateFrom();
    expect(gameReducer(state, { type: 'COMPLETE_QUEST' })).toBe(state);
  });

  it('ABANDON_QUEST clears without granting anything', () => {
    let state = stateFrom();
    state = gameReducer(state, { type: 'ACCEPT_QUEST', offer: makeOffer('home_bed_fortress') });
    state = gameReducer(state, { type: 'ABANDON_QUEST' });

    expect(state.save.activeQuest).toBeNull();
    expect(state.save.history).toHaveLength(0);
    expect(state.save.statistics.questsAbandoned).toBe(1);
  });

  it('REROLL spends a token and produces new offers', () => {
    const save = makeSave();
    save.inventory = [{ itemId: 'reroll_token', count: 1 }];

    let state = gameReducer(stateFrom(save), {
      type: 'ROLL_QUESTS',
      filters: DEFAULT_FILTERS,
      rng: createRng('r1'),
    });
    state = gameReducer(state, { type: 'REROLL', rng: createRng('r2') });

    expect(state.save.inventory.find((entry) => entry.itemId === 'reroll_token')).toBeUndefined();
    expect(state.save.statistics.rerollsUsed).toBe(1);
    expect(state.offers).toHaveLength(3);
  });

  it('REROLL falls back to the free daily allowance', () => {
    const save = makeSave();
    save.inventory = [];

    let state = gameReducer(stateFrom(save), {
      type: 'ROLL_QUESTS',
      filters: DEFAULT_FILTERS,
      rng: createRng('f1'),
    });
    state = gameReducer(state, { type: 'REROLL', rng: createRng('f2') });

    expect(state.save.daily.freeRerollUsedOn).toBe(toLocalDateKey());

    // A second reroll the same day is refused.
    const before = state;
    state = gameReducer(state, { type: 'REROLL', rng: createRng('f3') });
    expect(state).toBe(before);
  });

  it('ACCEPT_DAILY starts the deterministic daily quest', () => {
    const save = makeSave();
    const state = gameReducer(stateFrom(save), { type: 'ACCEPT_DAILY' });

    expect(state.save.activeQuest?.offer.isDaily).toBe(true);
    expect(state.save.activeQuest?.offer.quest.id).toBe(save.daily.questId);
  });

  it('SET_SETTINGS merges settings', () => {
    const state = gameReducer(stateFrom(), {
      type: 'SET_SETTINGS',
      settings: { highContrast: true },
    });

    expect(state.save.settings.highContrast).toBe(true);
    expect(state.save.settings.sound).toBe(false);
  });

  it('SET_PLAYER_NAME trims, caps and ignores blanks', () => {
    let state = gameReducer(stateFrom(), { type: 'SET_PLAYER_NAME', name: '  Nattvandraren  ' });
    expect(state.save.player.name).toBe('Nattvandraren');

    const before = state;
    state = gameReducer(state, { type: 'SET_PLAYER_NAME', name: '   ' });
    expect(state).toBe(before);

    state = gameReducer(state, { type: 'SET_PLAYER_NAME', name: 'x'.repeat(60) });
    expect(state.save.player.name).toHaveLength(24);
  });

  it('COMPLETE_ONBOARDING marks it done and keeps the name', () => {
    const state = gameReducer(stateFrom(), {
      type: 'COMPLETE_ONBOARDING',
      name: 'Kaosriddaren',
    });

    expect(state.save.onboardingComplete).toBe(true);
    expect(state.save.player.name).toBe('Kaosriddaren');
  });

  it('REPLACE_SAVE swaps the whole save and reconciles the clock', () => {
    const imported = createDefaultSave('Importerad');
    imported.progression.totalXp = 7777;

    const state = gameReducer(stateFrom(), { type: 'REPLACE_SAVE', save: imported });

    expect(state.save.player.name).toBe('Importerad');
    expect(state.save.progression.totalXp).toBe(7777);
    expect(state.save.boss).not.toBeNull(); // reconciled
    expect(state.offers).toBeNull();
    expect(state.lastReward).toBeNull();
  });

  it('DISMISS_REWARD and DISMISS_EVENT clear transient state only', () => {
    let state = stateFrom();
    state = gameReducer(state, { type: 'ACCEPT_QUEST', offer: makeOffer('home_bed_fortress') });
    state = gameReducer(state, {
      type: 'COMPLETE_QUEST',
      rng: { ...createRng('d'), chance: () => false },
    });

    const historyLength = state.save.history.length;
    state = gameReducer(state, { type: 'DISMISS_REWARD' });

    expect(state.lastReward).toBeNull();
    expect(state.save.history).toHaveLength(historyLength);
  });
});

describe('autosave policy', () => {
  it('persists after every gameplay-changing action', () => {
    for (const type of [
      'ACCEPT_QUEST',
      'ACCEPT_DAILY',
      'COMPLETE_QUEST',
      'ABANDON_QUEST',
      'REROLL',
      'RESOLVE_EVENT',
      'USE_ITEM',
      'SET_SETTINGS',
      'SET_PLAYER_NAME',
      'COMPLETE_ONBOARDING',
      'REPLACE_SAVE',
    ] as const) {
      expect(shouldPersist({ type } as never), type).toBe(true);
    }
  });

  it('does not persist purely visual actions', () => {
    for (const type of ['ROLL_QUESTS', 'SET_FILTERS', 'CLOSE_OFFERS', 'DISMISS_REWARD'] as const) {
      expect(shouldPersist({ type } as never), type).toBe(false);
    }
  });
});

describe('createInitialState', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts fresh when storage is empty', () => {
    const state = createInitialState();
    expect(state.loadSource).toBe('fresh');
    expect(state.save.onboardingComplete).toBe(false);
  });

  it('restores a stored save', () => {
    const save = makeSave();
    save.progression.gold = 4242;
    save.onboardingComplete = true;
    saveGame(save);

    const state = createInitialState();

    expect(state.loadSource).toBe('main');
    expect(state.save.progression.gold).toBe(4242);
    expect(state.save.onboardingComplete).toBe(true);
  });

  it('does not write to storage during construction', () => {
    createInitialState();
    expect(loadGame().source).toBe('fresh');
  });
});
