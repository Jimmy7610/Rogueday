import type {
  LootItemId,
  PendingEvent,
  QuestFilters,
  QuestOffer,
  RewardSummary,
  RogueDaySave,
  Settings,
} from '@/types';
import { toLocalDateKey } from '@/utils/date';
import { randomRng, type Rng } from '@/utils/rng';
import { ensureCurrentBoss } from '@/game/boss';
import { abandonQuest, completeQuest } from '@/game/completion';
import { maybeTriggerEvent, resolveEvent, useInventoryItem } from '@/game/events';
import { removeItem } from '@/game/loot';
import { buildDailyOffer, getRerollAvailability, rememberQuests, rollQuestChoices } from '@/game/questSelection';
import { createDefaultDaily } from '@/persistence/defaults';
import { loadGame, saveGame, type LoadResult } from '@/persistence/storage';

/**
 * The single authoritative application state.
 *
 * `save` is the persisted half; everything else is transient UI/session state
 * that is deliberately not written to disk. Every gameplay mutation goes
 * through an action here, which produces a new `save` and then hands it to the
 * one persistence module.
 */
export interface GameState {
  save: RogueDaySave;
  /** Offers currently on the table, if the finder modal has rolled. */
  offers: QuestOffer[] | null;
  filters: QuestFilters;
  pendingEvent: PendingEvent | null;
  lastReward: RewardSummary | null;
  loadSource: LoadResult['source'];
  loadWarnings: string[];
  /** Bumped on every successful save so views can react. */
  saveTick: number;
  saveError: string | null;
}

export const DEFAULT_FILTERS: QuestFilters = {
  duration: 15,
  energy: 'medium',
  location: 'anywhere',
  mood: 'motivated',
  mode: 'normal',
};

export type GameAction =
  | { type: 'ROLL_QUESTS'; filters: QuestFilters; rng?: Rng }
  | { type: 'REROLL'; rng?: Rng }
  | { type: 'CLOSE_OFFERS' }
  | { type: 'SET_FILTERS'; filters: Partial<QuestFilters> }
  | { type: 'ACCEPT_QUEST'; offer: QuestOffer }
  | { type: 'ACCEPT_DAILY' }
  | { type: 'COMPLETE_QUEST'; now?: Date; rng?: Rng }
  | { type: 'ABANDON_QUEST' }
  | { type: 'DISMISS_REWARD' }
  | { type: 'RESOLVE_EVENT'; choiceId: string; rng?: Rng }
  | { type: 'DISMISS_EVENT' }
  | { type: 'USE_ITEM'; itemId: LootItemId; rng?: Rng }
  | { type: 'SET_SETTINGS'; settings: Partial<Settings> }
  | { type: 'SET_PLAYER_NAME'; name: string }
  | { type: 'COMPLETE_ONBOARDING'; name: string }
  | { type: 'REPLACE_SAVE'; save: RogueDaySave; source?: LoadResult['source'] }
  | { type: 'REFRESH_TIME'; now?: Date }
  | { type: 'SAVE_OK' }
  | { type: 'SAVE_FAILED'; error: string };

/**
 * Bring a loaded save up to date with the wall clock: rotate the weekly boss
 * and refresh the daily quest slot. Pure - callers persist the result.
 */
export function reconcileWithClock(save: RogueDaySave, now: Date = new Date()): RogueDaySave {
  let next = save;

  const { boss, rotated } = ensureCurrentBoss(save.boss, now);
  if (rotated || save.boss === null) {
    next = { ...next, boss };
  }

  const today = toLocalDateKey(now);
  if (next.daily.date !== today) {
    const dailyQuest = buildDailyOffer(today);
    next = {
      ...next,
      daily: {
        ...createDefaultDaily(),
        date: today,
        questId: dailyQuest.quest.id,
        completed: false,
        // Free reroll allowance is per day; keep it if it was already used today.
        freeRerollUsedOn: next.daily.freeRerollUsedOn,
      },
    };
  }

  return next;
}

export function createInitialState(): GameState {
  const result = loadGame();
  const save = reconcileWithClock(result.save);

  return {
    save,
    offers: null,
    filters: DEFAULT_FILTERS,
    pendingEvent: null,
    lastReward: null,
    loadSource: result.source,
    loadWarnings: result.warnings,
    saveTick: 0,
    saveError: null,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.filters } };

    case 'ROLL_QUESTS': {
      const offers = rollQuestChoices({
        filters: action.filters,
        chains: state.save.questChains,
        recentQuestIds: state.save.recentQuestIds,
        ...(action.rng ? { rng: action.rng } : {}),
      });
      return { ...state, filters: action.filters, offers };
    }

    case 'REROLL': {
      const availability = getRerollAvailability(state.save);
      if (!availability.canReroll) return state;

      const offers = rollQuestChoices({
        filters: state.filters,
        chains: state.save.questChains,
        recentQuestIds: [
          ...(state.offers?.map((offer) => offer.quest.id) ?? []),
          ...state.save.recentQuestIds,
        ],
        ...(action.rng ? { rng: action.rng } : {}),
      });

      const today = toLocalDateKey();
      const save: RogueDaySave = {
        ...state.save,
        inventory: availability.usesToken
          ? removeItem(state.save.inventory, 'reroll_token', 1)
          : state.save.inventory,
        daily: availability.usesFreeDaily
          ? { ...state.save.daily, freeRerollUsedOn: today }
          : state.save.daily,
        statistics: {
          ...state.save.statistics,
          rerollsUsed: state.save.statistics.rerollsUsed + 1,
        },
      };

      return { ...state, save, offers };
    }

    case 'CLOSE_OFFERS':
      return { ...state, offers: null };

    case 'ACCEPT_QUEST': {
      const save: RogueDaySave = {
        ...state.save,
        activeQuest: { offer: action.offer, acceptedAt: new Date().toISOString() },
        recentQuestIds: rememberQuests(
          state.save.recentQuestIds,
          state.offers?.map((offer) => offer.quest.id) ?? [action.offer.quest.id],
        ),
      };
      return { ...state, save, offers: null };
    }

    case 'ACCEPT_DAILY': {
      const today = toLocalDateKey();
      if (state.save.daily.completed && state.save.daily.date === today) return state;
      const offer = buildDailyOffer(today);
      const save: RogueDaySave = {
        ...state.save,
        activeQuest: { offer, acceptedAt: new Date().toISOString() },
      };
      return { ...state, save, offers: null };
    }

    case 'COMPLETE_QUEST': {
      const active = state.save.activeQuest;
      if (!active) return state;

      const now = action.now ?? new Date();
      const rng = action.rng ?? randomRng;

      const { save, reward } = completeQuest(state.save, active.offer, now, rng);
      const pendingEvent = maybeTriggerEvent(save, now, rng);

      return { ...state, save, lastReward: reward, pendingEvent };
    }

    case 'ABANDON_QUEST': {
      if (!state.save.activeQuest) return state;
      return { ...state, save: abandonQuest(state.save) };
    }

    case 'DISMISS_REWARD':
      return { ...state, lastReward: null };

    case 'RESOLVE_EVENT': {
      if (!state.pendingEvent) return state;
      const outcome = resolveEvent(
        state.save,
        state.pendingEvent,
        action.choiceId,
        action.rng ?? randomRng,
      );
      return { ...state, save: outcome.save, pendingEvent: null };
    }

    case 'DISMISS_EVENT':
      return { ...state, pendingEvent: null };

    case 'USE_ITEM': {
      const result = useInventoryItem(state.save, action.itemId, action.rng ?? randomRng);
      return { ...state, save: result.save };
    }

    case 'SET_SETTINGS':
      return {
        ...state,
        save: { ...state.save, settings: { ...state.save.settings, ...action.settings } },
      };

    case 'SET_PLAYER_NAME': {
      const name = action.name.trim().slice(0, 24);
      if (!name) return state;
      return { ...state, save: { ...state.save, player: { ...state.save.player, name } } };
    }

    case 'COMPLETE_ONBOARDING': {
      const name = action.name.trim().slice(0, 24) || state.save.player.name;
      return {
        ...state,
        save: {
          ...state.save,
          player: { ...state.save.player, name },
          onboardingComplete: true,
        },
      };
    }

    case 'REPLACE_SAVE':
      return {
        ...state,
        save: reconcileWithClock(action.save),
        offers: null,
        pendingEvent: null,
        lastReward: null,
        loadSource: action.source ?? state.loadSource,
        loadWarnings: [],
        saveError: null,
      };

    case 'REFRESH_TIME':
      return { ...state, save: reconcileWithClock(state.save, action.now ?? new Date()) };

    case 'SAVE_OK':
      return { ...state, saveTick: state.saveTick + 1, saveError: null };

    case 'SAVE_FAILED':
      return { ...state, saveError: action.error };

    default:
      return state;
  }
}

/** Actions after which the game must autosave. */
const PERSISTING_ACTIONS = new Set<GameAction['type']>([
  'REROLL',
  'ACCEPT_QUEST',
  'ACCEPT_DAILY',
  'COMPLETE_QUEST',
  'ABANDON_QUEST',
  'RESOLVE_EVENT',
  'USE_ITEM',
  'SET_SETTINGS',
  'SET_PLAYER_NAME',
  'COMPLETE_ONBOARDING',
  'REPLACE_SAVE',
]);

export function shouldPersist(action: GameAction): boolean {
  return PERSISTING_ACTIONS.has(action.type);
}

export function persist(save: RogueDaySave): { ok: boolean; error?: string } {
  const result = saveGame(save);
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Okänt sparfel.' };
}
