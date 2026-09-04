import { useEffect, useState } from 'react';
import type { ActiveQuestState } from '@/types';
import { useGame } from '@/app/GameProvider';
import { elapsedMs, formatTimer, isRunning, remainingMs } from '@/game/timer';

interface FocusTimerProps {
  active: ActiveQuestState;
}

/**
 * Optional focus timer.
 *
 * The displayed value is recomputed from wall-clock timestamps on every tick,
 * so a throttled or backgrounded tab cannot make it drift. The interval exists
 * only to repaint.
 */
export function FocusTimer({ active }: FocusTimerProps): JSX.Element {
  const { dispatch } = useGame();
  const timer = active.timer;

  // Repaint once a second while running; the value itself comes from Date.now().
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!timer || !isRunning(timer)) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [timer?.runningSince, timer]);

  const challengeMinutes = active.offer.challenge?.timerMinutes ?? null;

  if (!timer) {
    return (
      <div className="timer timer--idle">
        <div className="timer__row">
          <span className="timer__label">
            {challengeMinutes
              ? `UTMANINGEN GER DIG ${challengeMinutes} MINUTER`
              : 'FOKUSTIMER (VALFRI)'}
          </span>
        </div>
        <button
          type="button"
          className="btn btn--block"
          onClick={() => dispatch({ type: 'START_TIMER' })}
        >
          STARTA FOKUSTIMER ⏱
        </button>
        {!challengeMinutes && (
          <p className="timer__hint">
            Helt frivillig. Den påverkar aldrig din belöning negativt.
          </p>
        )}
      </div>
    );
  }

  const now = new Date();
  const running = isRunning(timer);
  const remaining = remainingMs(timer, now);
  const countdown = remaining !== null;
  const expired = countdown && remaining <= 0;
  const value = countdown ? Math.max(0, remaining) : elapsedMs(timer, now);

  const percent =
    countdown && timer.targetMs
      ? Math.max(0, Math.min(100, (Math.max(0, remaining) / timer.targetMs) * 100))
      : null;

  const classes = ['timer'];
  if (countdown) classes.push('timer--challenge');
  if (expired) classes.push('timer--expired');
  else if (countdown && remaining < 60000) classes.push('timer--urgent');

  return (
    <div className={classes.join(' ')}>
      <div className="timer__row">
        <span className="timer__label">
          {countdown ? (expired ? 'TIDEN UTE' : 'TID KVAR') : 'FOKUSTID'}
        </span>
        <span className="timer__state">{running ? 'PÅGÅR' : 'PAUSAD'}</span>
      </div>

      <div
        className="timer__value"
        role="timer"
        aria-live="off"
        aria-label={
          countdown
            ? `${formatTimer(value)} kvar av utmaningen`
            : `${formatTimer(value)} fokustid`
        }
      >
        {formatTimer(value)}
      </div>

      {percent !== null && (
        <div className="bar timer__bar" aria-hidden="true">
          <div className="bar__fill" style={{ width: `${percent}%` }} />
        </div>
      )}

      {expired && (
        <p className="timer__hint">
          Ingen fara — uppdraget går fortfarande att slutföra som vanligt. Du missar bara
          tidsbonusen.
        </p>
      )}

      <div className="timer__actions">
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => dispatch({ type: 'TOGGLE_TIMER' })}
        >
          {running ? 'PAUSA' : 'FORTSÄTT'}
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => dispatch({ type: 'RESET_TIMER' })}
        >
          NOLLSTÄLL
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => dispatch({ type: 'STOP_TIMER' })}
        >
          DÖLJ
        </button>
      </div>
    </div>
  );
}
