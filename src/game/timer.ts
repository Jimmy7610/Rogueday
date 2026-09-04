import type { ActiveQuestState, FocusTimerState } from '@/types';

/**
 * Focus timer.
 *
 * Elapsed time is always derived from wall-clock timestamps, never from a
 * decrementing counter. That makes it immune to backgrounded tabs, throttled
 * intervals, React re-renders and reloads: the UI ticks only to repaint, and
 * the number it paints is recomputed from `Date.now()` every time.
 *
 * The timer is entirely optional. Nothing here can cost the player anything.
 */

export function createTimer(targetMinutes: number | null, now: Date = new Date()): FocusTimerState {
  return {
    runningSince: now.toISOString(),
    accumulatedMs: 0,
    targetMs: targetMinutes === null ? null : Math.round(targetMinutes * 60000),
  };
}

/** Milliseconds of focus time banked so far. */
export function elapsedMs(timer: FocusTimerState, now: Date = new Date()): number {
  const banked = Math.max(0, timer.accumulatedMs);
  if (!timer.runningSince) return banked;

  const started = Date.parse(timer.runningSince);
  if (Number.isNaN(started)) return banked;

  // A clock moved backwards must never produce negative elapsed time.
  return banked + Math.max(0, now.getTime() - started);
}

export function isRunning(timer: FocusTimerState): boolean {
  return timer.runningSince !== null;
}

/** Milliseconds left of a target, or null for a free-running timer. */
export function remainingMs(timer: FocusTimerState, now: Date = new Date()): number | null {
  if (timer.targetMs === null) return null;
  return timer.targetMs - elapsedMs(timer, now);
}

export function hasExpired(timer: FocusTimerState, now: Date = new Date()): boolean {
  const remaining = remainingMs(timer, now);
  return remaining !== null && remaining <= 0;
}

export function pauseTimer(timer: FocusTimerState, now: Date = new Date()): FocusTimerState {
  if (!timer.runningSince) return timer;
  return {
    ...timer,
    accumulatedMs: elapsedMs(timer, now),
    runningSince: null,
  };
}

export function resumeTimer(timer: FocusTimerState, now: Date = new Date()): FocusTimerState {
  if (timer.runningSince) return timer;
  return { ...timer, runningSince: now.toISOString() };
}

export function toggleTimer(timer: FocusTimerState, now: Date = new Date()): FocusTimerState {
  return isRunning(timer) ? pauseTimer(timer, now) : resumeTimer(timer, now);
}

export function resetTimer(timer: FocusTimerState, now: Date = new Date()): FocusTimerState {
  return {
    runningSince: now.toISOString(),
    accumulatedMs: 0,
    targetMs: timer.targetMs,
  };
}

/**
 * Did the player beat a timed challenge?
 *
 * Only meaningful when the offer carries a timed challenge. Missing the time
 * costs nothing at all - it simply means no bonus.
 */
export function beatTheClock(
  active: ActiveQuestState | null,
  now: Date = new Date(),
): boolean {
  if (!active?.timer) return false;
  const target = active.timer.targetMs;
  if (target === null) return false;
  return elapsedMs(active.timer, now) <= target;
}

/** Bonus granted for beating a timed challenge. */
export const TIME_BONUS_XP_FRACTION = 0.2;
export const TIME_BONUS_GOLD_FRACTION = 0.15;
export const TIME_BONUS_DAMAGE_FRACTION = 0.15;

/** "12:34" for a millisecond duration; negative clamps to zero. */
export function formatTimer(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
}

/**
 * A stored timer is only trustworthy if its stamps parse. A hand-edited or
 * partially-written save falls back to a fresh, paused timer instead of
 * producing nonsense numbers.
 */
export function sanitiseTimer(timer: unknown): FocusTimerState | undefined {
  if (typeof timer !== 'object' || timer === null) return undefined;
  const candidate = timer as Partial<FocusTimerState>;

  const accumulatedMs =
    typeof candidate.accumulatedMs === 'number' && Number.isFinite(candidate.accumulatedMs)
      ? Math.max(0, candidate.accumulatedMs)
      : 0;

  const targetMs =
    typeof candidate.targetMs === 'number' && Number.isFinite(candidate.targetMs)
      ? candidate.targetMs
      : null;

  const runningSince =
    typeof candidate.runningSince === 'string' && !Number.isNaN(Date.parse(candidate.runningSince))
      ? candidate.runningSince
      : null;

  return {
    runningSince,
    accumulatedMs,
    targetMs,
    ...(typeof candidate.beatenAt === 'string' ? { beatenAt: candidate.beatenAt } : {}),
  };
}
