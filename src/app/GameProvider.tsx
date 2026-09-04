import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { RogueDaySave } from '@/types';
import { msUntilDailyReset } from '@/utils/date';
import {
  createInitialState,
  gameReducer,
  persist,
  shouldPersist,
  type GameAction,
  type GameState,
} from './gameStore';

interface GameContextValue {
  state: GameState;
  dispatch: (action: GameAction) => void;
  /** Force an immediate save of the current state. */
  saveNow: () => boolean;
  /** Replace the entire save (import / reset) and persist it at once. */
  replaceSave: (save: RogueDaySave, persistImmediately?: boolean) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }): JSX.Element {
  // The initial state is produced by loading storage FIRST. Defaults are only
  // constructed inside loadGame when no valid save exists, so a fresh default
  // can never overwrite an existing save.
  const [state, rawDispatch] = useReducer(gameReducer, undefined, createInitialState);

  // Keep a ref in sync so the autosave effect always sees the newest save
  // without re-subscribing.
  const saveRef = useRef(state.save);
  saveRef.current = state.save;

  const pendingPersist = useRef(false);

  const dispatch = useCallback((action: GameAction) => {
    if (shouldPersist(action)) pendingPersist.current = true;
    rawDispatch(action);
  }, []);

  // Autosave after any action that changed persistent state.
  useEffect(() => {
    if (!pendingPersist.current) return;
    pendingPersist.current = false;
    const result = persist(state.save);
    if (result.ok) {
      rawDispatch({ type: 'SAVE_OK' });
    } else {
      rawDispatch({ type: 'SAVE_FAILED', error: result.error ?? 'Okänt sparfel.' });
    }
  }, [state.save]);

  const saveNow = useCallback((): boolean => {
    const result = persist(saveRef.current);
    if (result.ok) rawDispatch({ type: 'SAVE_OK' });
    else rawDispatch({ type: 'SAVE_FAILED', error: result.error ?? 'Okänt sparfel.' });
    return result.ok;
  }, []);

  const replaceSave = useCallback((save: RogueDaySave, persistImmediately = true) => {
    if (persistImmediately) pendingPersist.current = true;
    rawDispatch({ type: 'REPLACE_SAVE', save });
  }, []);

  // Roll the daily quest / weekly boss over when the local day changes while
  // the tab stays open.
  useEffect(() => {
    let timeout: number;
    const schedule = (): void => {
      timeout = window.setTimeout(
        () => {
          rawDispatch({ type: 'REFRESH_TIME' });
          schedule();
        },
        Math.min(msUntilDailyReset() + 1000, 2 ** 31 - 1),
      );
    };
    schedule();
    return () => window.clearTimeout(timeout);
  }, []);

  // Re-check the clock when the tab regains focus, so a laptop that slept
  // overnight sees the new day immediately.
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') rawDispatch({ type: 'REFRESH_TIME' });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Last-chance save if the tab is closed mid-action.
  useEffect(() => {
    const onHide = (): void => {
      persist(saveRef.current);
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({ state, dispatch, saveNow, replaceSave }),
    [state, dispatch, saveNow, replaceSave],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used inside <GameProvider>');
  return context;
}

export function useSave(): RogueDaySave {
  return useGame().state.save;
}

/** Small helper for transient toasts (achievements, save errors). */
export function useToasts(): {
  toasts: { id: number; text: string; icon: string }[];
  push: (text: string, icon?: string) => void;
} {
  const [toasts, setToasts] = useState<{ id: number; text: string; icon: string }[]>([]);
  const nextId = useRef(1);

  const push = useCallback((text: string, icon = '🏆') => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current, { id, text, icon }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  return { toasts, push };
}
