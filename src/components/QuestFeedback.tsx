import type { Quest } from '@/types';
import { CATEGORY_LABELS } from '@/data/quests';
import { useGame } from '@/app/GameProvider';

interface QuestFeedbackProps {
  quest: Quest;
  /** Slightly different wording after an abandon than after a completion. */
  variant?: 'completed' | 'abandoned';
}

/**
 * The 👍 / 👎 prompt.
 *
 * Everything it does happens on this device: one tap nudges a single category
 * score by one step, clamped to a narrow range, and that score becomes a small
 * multiplier when quests are drawn. It cannot remove a category from the pool,
 * it never leaves the browser, and it can be undone by tapping the other
 * thumb.
 */
export function QuestFeedback({ quest, variant = 'completed' }: QuestFeedbackProps): JSX.Element {
  const { state, dispatch } = useGame();
  const current = state.save.feedback.quests[quest.id];

  const rate = (vote: 1 | -1): void => {
    dispatch({ type: 'RATE_QUEST', questId: quest.id, vote });
  };

  return (
    <div className="feedback">
      <div className="feedback__label" id={`feedback-label-${quest.id}`}>
        {variant === 'abandoned' ? 'VAR DET FEL UPPDRAG?' : 'MER SÅNT HÄR?'}
      </div>
      <div
        className="feedback__buttons"
        role="group"
        aria-labelledby={`feedback-label-${quest.id}`}
      >
        <button
          type="button"
          className={`feedback__btn${current === 1 ? ' feedback__btn--on' : ''}`}
          aria-pressed={current === 1}
          onClick={() => rate(1)}
        >
          <span aria-hidden="true">👍</span> MER
        </button>
        <button
          type="button"
          className={`feedback__btn${current === -1 ? ' feedback__btn--on' : ''}`}
          aria-pressed={current === -1}
          onClick={() => rate(-1)}
        >
          <span aria-hidden="true">👎</span> MINDRE
        </button>
      </div>
      {current !== undefined && (
        <p className="feedback__note">
          {current === 1
            ? `${categoryWord(quest)} dyker upp lite oftare. Sparas bara här på enheten.`
            : `${categoryWord(quest)} dyker upp lite mer sällan — men försvinner inte.`}
        </p>
      )}
    </div>
  );
}

function categoryWord(quest: Quest): string {
  return CATEGORY_LABELS[quest.category];
}
