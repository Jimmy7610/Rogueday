import { describe, expect, it } from 'vitest';
import type { FeedbackState, QuestFilters } from '@/types';
import { QUESTS, getQuestById } from '@/data/quests';
import { createRng } from '@/utils/rng';
import {
  CATEGORY_WINDOW,
  MIN_CATEGORY_WEIGHT,
  RECENT_MEMORY,
  categoryWeights,
  matchesHardConstraints,
  rememberQuests,
  rollQuestChoices,
  weightedSample,
} from './questSelection';
import {
  FEEDBACK_LIMIT,
  MAX_FEEDBACK_WEIGHT,
  MIN_FEEDBACK_WEIGHT,
  applyFeedback,
  feedbackWeight,
} from './feedback';
import { createDefaultFeedback } from '@/persistence/defaults';

const BASE: QuestFilters = {
  duration: 30,
  energy: 'medium',
  location: 'anywhere',
  mood: 'motivated',
  mode: 'normal',
};

/* ------------------------------------------------------------------ */
/* Anti-repetition 2.0                                                 */
/* ------------------------------------------------------------------ */

describe('anti-repetition memory', () => {
  it('remembers a deeper window than v2 did', () => {
    expect(RECENT_MEMORY).toBeGreaterThanOrEqual(40);
    expect(RECENT_MEMORY).toBeLessThanOrEqual(60);
  });

  it('caps the memory at exactly the documented depth', () => {
    const many = QUESTS.slice(0, RECENT_MEMORY + 40).map((quest) => quest.id);
    expect(rememberQuests([], many)).toHaveLength(RECENT_MEMORY);
  });

  it('keeps the most recent ids and drops the oldest', () => {
    const ids = QUESTS.slice(0, RECENT_MEMORY + 5).map((quest) => quest.id);
    const remembered = rememberQuests(ids.slice(5), ids.slice(0, 5));
    expect(remembered[0]).toBe(ids[0]);
    expect(remembered).not.toContain(ids[RECENT_MEMORY + 4]);
  });
});

describe('category variety pressure', () => {
  it('down-weights a category that dominated the recent window', () => {
    const cleaning = QUESTS.filter((quest) => quest.category === 'cleaning').slice(0, 6);
    const weights = categoryWeights(cleaning.map((quest) => quest.id));

    expect(weights.get('cleaning')).toBeLessThan(1);
    // A category that has not appeared at all is simply absent - weight 1.
    expect(weights.get('food')).toBeUndefined();
  });

  it('never drives a weight to zero, however repetitive the history', () => {
    const one = QUESTS.find((quest) => quest.category === 'cleaning')!;
    const weights = categoryWeights(Array.from({ length: 40 }, () => one.id));
    expect(weights.get('cleaning')).toBeGreaterThanOrEqual(MIN_CATEGORY_WEIGHT);
    expect(weights.get('cleaning')).toBeGreaterThan(0);
  });

  it('only looks at the most recent slice of history', () => {
    const cleaning = QUESTS.filter((quest) => quest.category === 'cleaning').slice(0, 3);
    const food = QUESTS.filter((quest) => quest.category === 'food').slice(0, CATEGORY_WINDOW);

    // Cleaning sits behind a full window of food, so it is out of scope.
    const weights = categoryWeights([...food, ...cleaning].map((quest) => quest.id));
    expect(weights.get('cleaning')).toBeUndefined();
    expect(weights.get('food')).toBeLessThan(1);
  });

  it('ignores ids that are not quests', () => {
    expect(categoryWeights(['not-a-quest', 'also-not'])).toEqual(new Map());
  });

  it('produces more variety across many rolls than a fixed history would', () => {
    const rng = createRng('variety');
    let recent: string[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < 25; i += 1) {
      const result = rollQuestChoices({
        filters: BASE,
        chains: {},
        recentQuestIds: recent,
        rng,
      });
      for (const offer of result.offers) seen.add(offer.quest.category);
      recent = rememberQuests(
        recent,
        result.offers.map((offer) => offer.quest.id),
      );
    }

    expect(seen.size).toBeGreaterThanOrEqual(8);
  });
});

describe('weightedSample', () => {
  const pool = QUESTS.slice(0, 20);

  it('returns the requested number of distinct quests', () => {
    const picks = weightedSample(pool, 3, createRng('a'), () => 1);
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((quest) => quest.id)).size).toBe(3);
  });

  it('still fills the draw when the pool is smaller than the request', () => {
    const picks = weightedSample(pool.slice(0, 2), 3, createRng('b'), () => 1);
    expect(picks).toHaveLength(3);
  });

  it('favours heavier quests without ever excluding lighter ones', () => {
    const favourite = pool[0];
    const counts = new Map<string, number>();

    for (let i = 0; i < 400; i += 1) {
      const [pick] = weightedSample(
        pool,
        1,
        createRng(`w-${i}`),
        (quest) => (quest.id === favourite.id ? 10 : 1),
      );
      counts.set(pick.id, (counts.get(pick.id) ?? 0) + 1);
    }

    expect(counts.get(favourite.id)).toBeGreaterThan(400 / pool.length);
    // Everything else still shows up.
    expect(counts.size).toBeGreaterThan(pool.length / 2);
  });

  it('never returns a quest that was not in the pool', () => {
    const ids = new Set(pool.map((quest) => quest.id));
    for (const quest of weightedSample(pool, 3, createRng('c'), () => Math.random())) {
      expect(ids.has(quest.id)).toBe(true);
    }
  });
});

describe('weighting never overrides a hard constraint', () => {
  it('respects duration, energy, location and mode under any feedback', () => {
    const hostile: FeedbackState = {
      scores: Object.fromEntries(QUESTS.map((quest) => [quest.category, -FEEDBACK_LIMIT])),
      quests: {},
      up: 0,
      down: 0,
    };

    const combos: QuestFilters[] = [
      { duration: 5, energy: 'low', location: 'home', mood: 'stressed', mode: 'normal' },
      { duration: 5, energy: 'low', location: 'outside', mood: 'bored', mode: 'normal' },
      { duration: 15, energy: 'medium', location: 'anywhere', mood: 'motivated', mode: 'normal' },
      { duration: 30, energy: 'high', location: 'outside', mood: 'adventurous', mode: 'normal' },
      { duration: 60, energy: 'medium', location: 'home', mood: 'stressed', mode: 'chaos' },
    ];

    for (const filters of combos) {
      const result = rollQuestChoices({
        filters,
        chains: {},
        recentQuestIds: QUESTS.slice(0, RECENT_MEMORY).map((quest) => quest.id),
        feedback: hostile,
        rng: createRng(`hard-${filters.duration}-${filters.location}`),
      });

      expect(result.empty, JSON.stringify(filters)).toBe(false);
      expect(result.offers).toHaveLength(3);
      for (const offer of result.offers) {
        expect(matchesHardConstraints(offer.quest, filters), offer.quest.id).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Local thumbs-up / thumbs-down                                       */
/* ------------------------------------------------------------------ */

describe('feedback', () => {
  const quest = getQuestById('home_bed_fortress')!;

  it('starts empty', () => {
    const state = createDefaultFeedback();
    expect(state.scores).toEqual({});
    expect(state.up).toBe(0);
    expect(state.down).toBe(0);
  });

  it('records a thumbs-up against the quest category', () => {
    const next = applyFeedback(createDefaultFeedback(), quest, 1);
    expect(next.scores[quest.category]).toBe(1);
    expect(next.quests[quest.id]).toBe(1);
    expect(next.up).toBe(1);
  });

  it('is a no-op when the same vote is repeated', () => {
    const once = applyFeedback(createDefaultFeedback(), quest, 1);
    expect(applyFeedback(once, quest, 1)).toBe(once);
  });

  it('undoes the previous vote when the player changes their mind', () => {
    const up = applyFeedback(createDefaultFeedback(), quest, 1);
    const down = applyFeedback(up, quest, -1);
    expect(down.scores[quest.category]).toBe(-1);
    expect(down.quests[quest.id]).toBe(-1);
  });

  it('clamps the score in both directions', () => {
    let state = createDefaultFeedback();
    const sameCategory = QUESTS.filter((entry) => entry.category === quest.category).slice(0, 20);
    for (const entry of sameCategory) state = applyFeedback(state, entry, -1);
    expect(state.scores[quest.category]).toBeGreaterThanOrEqual(-FEEDBACK_LIMIT);

    for (const entry of sameCategory) state = applyFeedback(state, entry, 1);
    expect(state.scores[quest.category]).toBeLessThanOrEqual(FEEDBACK_LIMIT);
  });

  it('keeps the weight inside a narrow band, so nothing is ever hidden', () => {
    expect(feedbackWeight({}, 'cleaning')).toBe(1);
    expect(feedbackWeight({ cleaning: -FEEDBACK_LIMIT }, 'cleaning')).toBe(MIN_FEEDBACK_WEIGHT);
    expect(feedbackWeight({ cleaning: FEEDBACK_LIMIT }, 'cleaning')).toBe(MAX_FEEDBACK_WEIGHT);
    expect(feedbackWeight({ cleaning: -999 }, 'cleaning')).toBeGreaterThan(0.5);
  });

  it('still offers a category the player disliked as hard as possible', () => {
    const hated: FeedbackState = {
      scores: { cleaning: -FEEDBACK_LIMIT },
      quests: {},
      up: 0,
      down: 12,
    };

    let sawCleaning = false;
    for (let i = 0; i < 60 && !sawCleaning; i += 1) {
      const result = rollQuestChoices({
        filters: BASE,
        chains: {},
        recentQuestIds: [],
        feedback: hated,
        rng: createRng(`hate-${i}`),
      });
      sawCleaning = result.offers.some((offer) => offer.quest.category === 'cleaning');
    }

    expect(sawCleaning).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Performance                                                         */
/* ------------------------------------------------------------------ */

describe('performance with a thousand quests', () => {
  it('rolls three offers well inside a frame budget', () => {
    const rng = createRng('perf');
    const recent = QUESTS.slice(0, RECENT_MEMORY).map((quest) => quest.id);

    const started = performance.now();
    for (let i = 0; i < 200; i += 1) {
      rollQuestChoices({ filters: BASE, chains: {}, recentQuestIds: recent, rng });
    }
    const perRoll = (performance.now() - started) / 200;

    // A roll happens on a button press, so anything under a frame is ample.
    expect(perRoll).toBeLessThan(16);
  });
});
