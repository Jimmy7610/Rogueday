import type { FeedbackState, Quest, QuestCategory } from '@/types';

/**
 * Thumbs-up / thumbs-down weighting.
 *
 * Entirely local and entirely arithmetic - no model, no server, no profile.
 * A reaction nudges one category's score by a single step. The score is
 * clamped hard, and the weight it produces is clamped again, so the strongest
 * possible dislike still leaves a category clearly in the pool.
 *
 * The design rule: one click must never be able to hide anything.
 */

/** Scores are clamped to this range in both directions. */
export const FEEDBACK_LIMIT = 5;

/** One reaction moves a category's score by this much. */
export const FEEDBACK_STEP = 1;

/** A fully disliked category is still offered, just less often. */
export const MIN_FEEDBACK_WEIGHT = 0.55;
export const MAX_FEEDBACK_WEIGHT = 1.5;

export type Vote = 1 | -1;

function clampScore(score: number): number {
  return Math.max(-FEEDBACK_LIMIT, Math.min(FEEDBACK_LIMIT, score));
}

/**
 * Apply one reaction.
 *
 * Re-voting the same way on the same quest is a no-op, and changing your mind
 * moves the score back by the same step it moved forward, so the state can
 * never drift from repeated clicking.
 */
export function applyFeedback(state: FeedbackState, quest: Quest, vote: Vote): FeedbackState {
  const previous = state.quests[quest.id];
  if (previous === vote) return state;

  const category = quest.category;
  const current = state.scores[category] ?? 0;

  // Undo the earlier vote's contribution before applying the new one.
  const undone = previous ? current - previous * FEEDBACK_STEP : current;
  const next = clampScore(undone + vote * FEEDBACK_STEP);

  return {
    scores: { ...state.scores, [category]: next },
    quests: { ...state.quests, [quest.id]: vote },
    up: state.up + (vote === 1 ? 1 : 0),
    down: state.down + (vote === -1 ? 1 : 0),
  };
}

/**
 * The multiplier a category's score contributes to selection weight.
 *
 * Linear in the score and clamped on both sides. At the extremes a liked
 * category is offered about 2.7x as often as a disliked one - noticeable, but
 * far from exclusive.
 */
export function feedbackWeight(scores: FeedbackState['scores'], category: QuestCategory): number {
  const score = scores[category] ?? 0;
  const raw = 1 + (score / FEEDBACK_LIMIT) * 0.5;
  return Math.max(MIN_FEEDBACK_WEIGHT, Math.min(MAX_FEEDBACK_WEIGHT, raw));
}

/** Has the player reacted to this quest already? */
export function feedbackFor(state: FeedbackState, questId: string): Vote | undefined {
  return state.quests[questId];
}
