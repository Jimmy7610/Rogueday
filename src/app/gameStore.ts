import type {
  EventResult,
  ItemRevealState,
  LootItemId,
  PendingEvent,
  Quest,
  QuestFilters,
  QuestOffer,
  RewardSummary,
  RogueDaySave,
  Settings,
} from '@/types';
import { toLocalDateKey } from '@/utils/date';
import { randomRng, type Rng } from '@/utils/rng';
import { getBossById } from '@/data/bosses';
import { getQuestById } from '@/data/quests';
import { applyFeedback } from '@/game/feedback';
import { ensureCurrentBoss } from '@/game/boss';
import { abandonQuest, completeQuest } from '@/game/completion';
import {
  claimFollowUp,
  expireFollowUp,
  maybeTriggerEvent,
  resolveEvent,
  useInventoryItem,
} from '@/game/events';
import { removeItem } from '@/game/loot';
import { purchaseOffer, reconcileMarket } from '@/game/market';
import { getEffects, selectPerk } from '@/game/perks';
import { buildDailyOffer, getRerollAvailability, rememberQuests, rollQuestChoices } from '@/game/questSelection';
import { createTimer, pauseTimer, resetTimer, resumeTimer } from '@/game/timer';
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
  /** True when mood had to be relaxed to fill the current offers. */
  offersMoodRelaxed: boolean;
  /** True when the last roll found nothing matching the hard constraints. */
  offersEmpty: boolean;
  filters: QuestFilters;
  pendingEvent: PendingEvent | null;
  /** Outcome of the event the player just resolved, shown before it closes. */
  eventResult: EventResult | null;
  /** Transient chest / purchase reveal. Never persisted. */
  itemReveal: ItemRevealState | null;
  /** Transient message shown by the market. */
  marketMessage: { text: string; ok: boolean } | null;
  lastReward: RewardSummary | null;
  /**
   * The quest the player just finished or abandoned, so the thumbs-up/down
   * prompt knows what it is rating. Never persisted.
   */
  lastQuest: Quest | null;
  /** How that quest ended, so the prompt can word itself correctly. */
  lastQuestOutcome: 'completed' | 'abandoned' | null;
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
  | { type: 'RATE_QUEST'; questId: string; vote: 1 | -1 }
  | { type: 'DISMISS_REWARD' }
  | { type: 'RESOLVE_EVENT'; choiceId: string; rng?: Rng }
  | { type: 'DISMISS_EVENT' }
  | { type: 'USE_ITEM'; itemId: LootItemId; rng?: Rng }
  | { type: 'DISMISS_ITEM_REVEAL' }
  | { type: 'DISMISS_EVENT_RESULT' }
  | { type: 'START_TIMER'; minutes?: number | null; now?: Date }
  | { type: 'TOGGLE_TIMER'; now?: Date }
  | { type: 'RESET_TIMER'; now?: Date }
  | { type: 'STOP_TIMER' }
  | { type: 'BUY_OFFER'; offerId: string; now?: Date }
  | { type: 'CLEAR_MARKET_MESSAGE' }
  | { type: 'SELECT_PERK'; perkId: string }
  | { type: 'CLAIM_FOLLOW_UP'; now?: Date }
  | { type: 'DISMISS_FOLLOW_UP' }
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
  // Also adopt a rescaled (rebalanced) boss, not only a rotated one.
  if (rotated || save.boss === null || boss !== save.boss) {
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

  // Yesterday's market stock and purchase record no longer apply.
  const market = reconcileMarket(next.market, now);
  if (market !== next.market) next = { ...next, market };

  // An unclaimed bonus objective quietly lapses rather than nagging forever.
  const followUp = expireFollowUp(next.eventFollowUp, now);
  if (followUp !== next.eventFollowUp) next = { ...next, eventFollowUp: followUp };

  return next;
}

export function createInitialState(): GameState {
  const result = loadGame();
  const save = reconcileWithClock(result.save);

  return {
    save,
    offers: null,
    offersMoodRelaxed: false,
    offersEmpty: false,
    filters: DEFAULT_FILTERS,
    pendingEvent: null,
    eventResult: null,
    itemReveal: null,
    marketMessage: null,
    lastReward: null,
    lastQuest: null,
    lastQuestOutcome: null,
    loadSource: result.source,
    loadWarnings: result.warnings,
    saveTick: 0,
    saveError: null,
  };
}

/** The week's boss definition, for weakness hints on offers. */
function currentBossDefinition(save: RogueDaySave) {
  return save.boss ? getBossById(save.boss.bossId) : undefined;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.filters } };

    case 'ROLL_QUESTS': {
      const result = rollQuestChoices({
        filters: action.filters,
        chains: state.save.questChains,
        recentQuestIds: state.save.recentQuestIds,
        feedback: state.save.feedback,
        secrets: { now: new Date(), save: state.save },
        boss: currentBossDefinition(state.save),
        effects: getEffects(state.save),
        ...(action.rng ? { rng: action.rng } : {}),
      });
      return {
        ...state,
        filters: action.filters,
        offers: result.empty ? null : result.offers,
        offersMoodRelaxed: result.moodRelaxed,
        offersEmpty: result.empty,
      };
    }

    case 'REROLL': {
      const availability = getRerollAvailability(state.save);
      if (!availability.canReroll) return state;

      const result = rollQuestChoices({
        filters: state.filters,
        chains: state.save.questChains,
        recentQuestIds: [
          ...(state.offers?.map((offer) => offer.quest.id) ?? []),
          ...state.save.recentQuestIds,
        ],
        feedback: state.save.feedback,
        secrets: { now: new Date(), save: state.save },
        boss: currentBossDefinition(state.save),
        effects: getEffects(state.save),
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

      return {
        ...state,
        save,
        offers: result.empty ? null : result.offers,
        offersMoodRelaxed: result.moodRelaxed,
        offersEmpty: result.empty,
      };
    }

    case 'CLOSE_OFFERS':
      return { ...state, offers: null, offersEmpty: false, offersMoodRelaxed: false };

    case 'ACCEPT_QUEST': {
      const save: RogueDaySave = {
        ...state.save,
        activeQuest: { offer: action.offer, acceptedAt: new Date().toISOString() },
        recentQuestIds: rememberQuests(
          state.save.recentQuestIds,
          state.offers?.map((offer) => offer.quest.id) ?? [action.offer.quest.id],
        ),
      };
      return { ...state, save, offers: null, lastQuest: null, lastQuestOutcome: null };
    }

    case 'ACCEPT_DAILY': {
      const today = toLocalDateKey();
      if (state.save.daily.completed && state.save.daily.date === today) return state;
      const offer = buildDailyOffer(today);
      const save: RogueDaySave = {
        ...state.save,
        activeQuest: { offer, acceptedAt: new Date().toISOString() },
      };
      return { ...state, save, offers: null, lastQuest: null, lastQuestOutcome: null };
    }

    case 'COMPLETE_QUEST': {
      const active = state.save.activeQuest;
      if (!active) return state;

      const now = action.now ?? new Date();
      const rng = action.rng ?? randomRng;

      const { save, reward } = completeQuest(state.save, active.offer, now, rng, active);
      const pendingEvent = maybeTriggerEvent(save, now, rng);

      return {
        ...state,
        save,
        lastReward: reward,
        lastQuest: active.offer.quest,
        lastQuestOutcome: 'completed',
        pendingEvent,
        eventResult: null,
      };
    }

    case 'ABANDON_QUEST': {
      const active = state.save.activeQuest;
      if (!active) return state;
      return {
        ...state,
        save: abandonQuest(state.save),
        lastQuest: active.offer.quest,
        lastQuestOutcome: 'abandoned',
      };
    }

    /**
     * One thumbs-up or thumbs-down. Local, tiny, and reversible: it nudges a
     * single category score and nothing else. See src/game/feedback.ts.
     */
    case 'RATE_QUEST': {
      const quest = getQuestById(action.questId);
      if (!quest) return state;
      const feedback = applyFeedback(state.save.feedback, quest, action.vote);
      if (feedback === state.save.feedback) return state;
      return { ...state, save: { ...state.save, feedback } };
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
      // The event closes only after the player has seen what it did.
      return {
        ...state,
        save: outcome.save,
        pendingEvent: null,
        eventResult: outcome.result,
      };
    }

    case 'DISMISS_EVENT':
      return { ...state, pendingEvent: null };

    case 'DISMISS_EVENT_RESULT':
      return { ...state, eventResult: null };

    case 'USE_ITEM': {
      const result = useInventoryItem(state.save, action.itemId, action.rng ?? randomRng);
      if (!result.ok) return { ...state, marketMessage: { text: result.messages[0] ?? '', ok: false } };
      // The inventory and gold changes are applied immediately; the reveal is
      // purely presentational and is never persisted.
      return { ...state, save: result.save, itemReveal: result.reveal };
    }

    case 'DISMISS_ITEM_REVEAL':
      return { ...state, itemReveal: null };

    /* ---------------- focus timer ---------------- */

    case 'START_TIMER': {
      const active = state.save.activeQuest;
      if (!active) return state;
      const now = action.now ?? new Date();
      const minutes =
        action.minutes === undefined
          ? (active.offer.challenge?.timerMinutes ?? null)
          : action.minutes;
      return {
        ...state,
        save: { ...state.save, activeQuest: { ...active, timer: createTimer(minutes, now) } },
      };
    }

    case 'TOGGLE_TIMER': {
      const active = state.save.activeQuest;
      if (!active?.timer) return state;
      const now = action.now ?? new Date();
      const timer = active.timer.runningSince
        ? pauseTimer(active.timer, now)
        : resumeTimer(active.timer, now);
      return { ...state, save: { ...state.save, activeQuest: { ...active, timer } } };
    }

    case 'RESET_TIMER': {
      const active = state.save.activeQuest;
      if (!active?.timer) return state;
      return {
        ...state,
        save: {
          ...state.save,
          activeQuest: { ...active, timer: resetTimer(active.timer, action.now ?? new Date()) },
        },
      };
    }

    case 'STOP_TIMER': {
      const active = state.save.activeQuest;
      if (!active?.timer) return state;
      const { timer: _timer, ...rest } = active;
      return { ...state, save: { ...state.save, activeQuest: rest } };
    }

    /* ---------------- market ---------------- */

    case 'BUY_OFFER': {
      const result = purchaseOffer(state.save, action.offerId, action.now ?? new Date());
      if (!result.ok) {
        return { ...state, marketMessage: { text: result.message, ok: false } };
      }
      return {
        ...state,
        save: result.save,
        marketMessage: { text: result.message, ok: true },
        itemReveal: {
          sourceItemId: result.itemId!,
          title: 'KÖPT',
          itemsGained: [result.itemId!],
          goldGained: -(result.pricePaid ?? 0),
          messages: [result.message],
          isChest: false,
        },
      };
    }

    case 'CLEAR_MARKET_MESSAGE':
      return { ...state, marketMessage: null };

    /* ---------------- perks ---------------- */

    case 'SELECT_PERK': {
      const result = selectPerk(state.save, action.perkId);
      if (!result.ok) return state;
      return { ...state, save: { ...state.save, perks: result.perks } };
    }

    /* ---------------- event follow-up ---------------- */

    case 'CLAIM_FOLLOW_UP': {
      const outcome = claimFollowUp(state.save);
      if (!outcome.ok) return state;
      return { ...state, save: outcome.save, eventResult: outcome.result };
    }

    case 'DISMISS_FOLLOW_UP':
      return { ...state, save: { ...state.save, eventFollowUp: null } };

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
        offersEmpty: false,
        offersMoodRelaxed: false,
        pendingEvent: null,
        eventResult: null,
        itemReveal: null,
        marketMessage: null,
        lastReward: null,
        lastQuest: null,
        lastQuestOutcome: null,
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
  'RATE_QUEST',
  'RESOLVE_EVENT',
  'USE_ITEM',
  'START_TIMER',
  'TOGGLE_TIMER',
  'RESET_TIMER',
  'STOP_TIMER',
  'BUY_OFFER',
  'SELECT_PERK',
  'CLAIM_FOLLOW_UP',
  'DISMISS_FOLLOW_UP',
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
