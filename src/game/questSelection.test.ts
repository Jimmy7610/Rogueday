import { describe, expect, it } from 'vitest';
import type { QuestFilters } from '@/types';
import { QUESTS, QUEST_COUNT, findDuplicateQuestIds, getQuestById } from '@/data/quests';
import { QUEST_CHAINS } from '@/data/chains';
import { createRng } from '@/utils/rng';
import {
  advanceChain,
  buildDailyOffer,
  buildQuestPool,
  computeBossDamage,
  getDailyQuestForDate,
  getRerollAvailability,
  isChainQuestAvailable,
  matchesFilters,
  rememberQuests,
  rollQuestChoices,
} from './questSelection';
import { makeSave } from '@/test/helpers';

const BASE: QuestFilters = {
  duration: 60,
  energy: 'high',
  location: 'anywhere',
  mood: 'motivated',
  mode: 'normal',
};

describe('quest library integrity', () => {
  it('ships at least 250 quests', () => {
    expect(QUEST_COUNT).toBeGreaterThanOrEqual(250);
  });

  it('has no duplicate ids', () => {
    expect(findDuplicateQuestIds()).toEqual([]);
  });

  it('gives every quest complete metadata', () => {
    for (const quest of QUESTS) {
      expect(quest.id, `${quest.id} id`).toBeTruthy();
      expect(quest.title.length, `${quest.id} title`).toBeGreaterThan(0);
      expect(quest.description.length, `${quest.id} description`).toBeGreaterThan(5);
      expect(quest.flavourText.length, `${quest.id} flavour`).toBeGreaterThan(5);
      expect([5, 15, 30, 60], `${quest.id} duration`).toContain(quest.duration);
      expect(quest.locations.length, `${quest.id} locations`).toBeGreaterThan(0);
      expect(quest.moods.length, `${quest.id} moods`).toBeGreaterThan(0);
      expect(quest.baseXp, `${quest.id} xp`).toBeGreaterThan(0);
      expect(quest.baseGold, `${quest.id} gold`).toBeGreaterThan(0);
      expect(Array.isArray(quest.tags), `${quest.id} tags`).toBe(true);
    }
  });

  it('has genuinely distinct titles and descriptions', () => {
    const titles = new Set(QUESTS.map((quest) => quest.title));
    const descriptions = new Set(QUESTS.map((quest) => quest.description));

    // Chain steps intentionally share a title stem but never a full title.
    expect(titles.size).toBe(QUESTS.length);
    expect(descriptions.size).toBe(QUESTS.length);
  });

  it('covers every category', () => {
    const categories = new Set(QUESTS.map((quest) => quest.category));
    expect(categories.size).toBeGreaterThanOrEqual(20);
  });

  it('contains no unsafe content', () => {
    // Whole-word patterns so ordinary Swedish words never trip the check while
    // genuinely unsafe topics still do.
    const banned = [
      /\bkör bil\b/,
      /\brattfull\b/,
      /\beld(a|en|ar)?\b/,
      /\bbrinn\w*/,
      /\bvapen\w*/,
      // "stjäl tid" is a harmless Swedish idiom, so only real theft is banned.
      /\bsnatta\w*/,
      /\bstöld\w*/,
      /\bstjäl (något|en |ett |saker|från)/,
      /\bolaglig\w*/,
      /\bgör intrång\b/,
      /\bsvält\w*/,
      /\bmedicin\w*/,
      /\btablett\w*/,
      /\bdrog(er|en)?\b/,
      /\balkohol\w*/,
      /\bsprit\b/,
      /\btrakasser\w*/,
      /\bhöghöjd\w*/,
      /\bklättra på taket\b/,
      /\bfasta\b/,
      /\bdiet\w*/,
      /\bmaraton(lopp)?\b/,
    ];

    for (const quest of QUESTS) {
      const text = `${quest.title} ${quest.description} ${quest.flavourText}`.toLowerCase();
      for (const pattern of banned) {
        expect(pattern.test(text), `${quest.id} matches ${pattern}`).toBe(false);
      }
    }
  });
});

describe('matchesFilters', () => {
  it('never returns a quest longer than the available time', () => {
    const filters: QuestFilters = { ...BASE, duration: 5 };
    const matching = QUESTS.filter((quest) => matchesFilters(quest, filters));

    expect(matching.length).toBeGreaterThan(0);
    expect(matching.every((quest) => quest.duration <= 5)).toBe(true);
  });

  it('never demands more energy than the player has', () => {
    const filters: QuestFilters = { ...BASE, energy: 'low' };
    const matching = QUESTS.filter((quest) => matchesFilters(quest, filters));

    expect(matching.length).toBeGreaterThan(0);
    expect(matching.every((quest) => quest.energy === 'low')).toBe(true);
  });

  it('respects a home-only request', () => {
    const filters: QuestFilters = { ...BASE, location: 'home' };
    const matching = QUESTS.filter((quest) => matchesFilters(quest, filters));

    expect(matching.length).toBeGreaterThan(0);
    expect(
      matching.every(
        (quest) => quest.locations.includes('home') || quest.locations.includes('anywhere'),
      ),
    ).toBe(true);
    // An outdoor-only quest must never slip through.
    expect(matching.some((quest) => quest.locations.length === 1 && quest.locations[0] === 'outside')).toBe(
      false,
    );
  });

  it('respects mood', () => {
    const filters: QuestFilters = { ...BASE, mood: 'stressed' };
    const matching = QUESTS.filter((quest) => matchesFilters(quest, filters));

    expect(matching.length).toBeGreaterThan(0);
    expect(matching.every((quest) => quest.moods.includes('stressed'))).toBe(true);
  });

  it('keeps chaos quests out of normal mode and vice versa', () => {
    const normal = QUESTS.filter((quest) => matchesFilters(quest, { ...BASE, mode: 'normal' }));
    expect(normal.every((quest) => quest.mode !== 'chaos')).toBe(true);

    const chaos = QUESTS.filter((quest) => matchesFilters(quest, { ...BASE, mode: 'chaos' }));
    expect(chaos.every((quest) => quest.mode !== 'normal')).toBe(true);
    expect(chaos.length).toBeGreaterThan(0);
  });

  it('the spec example is honoured: 5 min / low energy / home', () => {
    const filters: QuestFilters = {
      duration: 5,
      energy: 'low',
      location: 'home',
      mood: 'bored',
      mode: 'normal',
    };

    const pool = buildQuestPool({ filters, chains: {}, recentQuestIds: [] });

    expect(pool.length).toBeGreaterThan(0);
    for (const quest of pool) {
      expect(quest.duration).toBeLessThanOrEqual(5);
      expect(quest.energy).toBe('low');
      expect(
        quest.locations.includes('home') || quest.locations.includes('anywhere'),
      ).toBe(true);
    }
  });
});

describe('rollQuestChoices', () => {
  it('always returns exactly three offers, one per tier', () => {
    const { offers } = rollQuestChoices({
      filters: BASE,
      chains: {},
      recentQuestIds: [],
      rng: createRng('choices'),
    });

    expect(offers).toHaveLength(3);
    expect(offers.map((offer) => offer.tier)).toEqual(['safe', 'wild', 'dangerous']);
  });

  it('every offered quest respects the filters', () => {
    const filters: QuestFilters = {
      duration: 15,
      energy: 'low',
      location: 'home',
      mood: 'stressed',
      mode: 'normal',
    };

    for (let seed = 0; seed < 60; seed += 1) {
      const { offers } = rollQuestChoices({
        filters,
        chains: {},
        recentQuestIds: [],
        rng: createRng(`seed-${seed}`),
      });

      for (const offer of offers) {
        expect(matchesFilters(offer.quest, filters), `${offer.quest.id} @seed ${seed}`).toBe(true);
      }
    }
  });

  it('riskier tiers pay better on average', () => {
    let safeTotal = 0;
    let wildTotal = 0;
    let dangerousTotal = 0;

    for (let seed = 0; seed < 120; seed += 1) {
      const { offers } = rollQuestChoices({
        filters: BASE,
        chains: {},
        recentQuestIds: [],
        rng: createRng(`reward-${seed}`),
      });
      safeTotal += offers[0].xp;
      wildTotal += offers[1].xp;
      dangerousTotal += offers[2].xp;
    }

    expect(wildTotal).toBeGreaterThan(safeTotal);
    expect(dangerousTotal).toBeGreaterThan(wildTotal);
  });

  it('avoids recently seen quests when the pool allows it', () => {
    const filters: QuestFilters = { ...BASE, duration: 60 };
    const pool = buildQuestPool({ filters, chains: {}, recentQuestIds: [] });
    const recent = pool.slice(0, 10).map((quest) => quest.id);

    const fresh = buildQuestPool({ filters, chains: {}, recentQuestIds: recent });

    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.some((quest) => recent.includes(quest.id))).toBe(false);
  });

  it('falls back gracefully when everything has been seen recently', () => {
    const filters: QuestFilters = {
      duration: 5,
      energy: 'low',
      location: 'home',
      mood: 'stressed',
      mode: 'normal',
    };
    const everything = QUESTS.map((quest) => quest.id);

    const pool = buildQuestPool({ filters, chains: {}, recentQuestIds: everything });
    expect(pool.length).toBeGreaterThan(0);

    const { offers } = rollQuestChoices({
      filters,
      chains: {},
      recentQuestIds: everything,
      rng: createRng('exhausted'),
    });
    expect(offers).toHaveLength(3);
  });

  it('applies chaos modifiers only in chaos mode', () => {
    const normalOffers = Array.from({ length: 30 }, (_, index) =>
      rollQuestChoices({
        filters: { ...BASE, mode: 'normal' },
        chains: {},
        recentQuestIds: [],
        rng: createRng(`n-${index}`),
      }).offers,
    ).flat();
    expect(normalOffers.every((offer) => offer.modifier === undefined)).toBe(true);

    const chaosOffers = Array.from({ length: 30 }, (_, index) =>
      rollQuestChoices({
        filters: { ...BASE, mode: 'chaos' },
        chains: {},
        recentQuestIds: [],
        rng: createRng(`c-${index}`),
      }).offers,
    ).flat();
    expect(chaosOffers.some((offer) => offer.modifier !== undefined)).toBe(true);
    // Dangerous chaos offers always carry a modifier.
    expect(
      chaosOffers.filter((offer) => offer.tier === 'dangerous').every((offer) => offer.modifier),
    ).toBe(true);
  });
});

describe('rememberQuests', () => {
  it('puts the newest ids first and de-duplicates', () => {
    const result = rememberQuests(['b', 'c'], ['a', 'b']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('caps the memory length', () => {
    const many = Array.from({ length: 80 }, (_, index) => `q${index}`);
    expect(rememberQuests([], many).length).toBeLessThanOrEqual(40);
  });
});

describe('boss damage scaling', () => {
  it('a common five-minute quest lands around 25', () => {
    const quest = QUESTS.find((entry) => entry.duration === 5 && entry.difficulty === 'medium');
    expect(quest).toBeDefined();
    expect(computeBossDamage(quest!, 'common')).toBe(25);
  });

  it('a legendary hour-long quest exceeds 250', () => {
    const quest = QUESTS.find((entry) => entry.duration === 60 && entry.difficulty === 'hard');
    expect(quest).toBeDefined();
    expect(computeBossDamage(quest!, 'legendary')).toBeGreaterThanOrEqual(250);
  });

  it('damage rises monotonically with rarity', () => {
    const quest = QUESTS.find((entry) => entry.duration === 30)!;
    const values = (['common', 'uncommon', 'rare', 'epic', 'legendary'] as const).map((rarity) =>
      computeBossDamage(quest, rarity),
    );

    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThan(values[index - 1]);
    }
  });

  it('damage rises with duration', () => {
    const byDuration = [5, 15, 30, 60].map((duration) => {
      const quest = QUESTS.find((entry) => entry.duration === duration)!;
      return computeBossDamage(quest, 'common');
    });

    expect(byDuration[1]).toBeGreaterThan(byDuration[0]);
    expect(byDuration[2]).toBeGreaterThan(byDuration[1]);
    expect(byDuration[3]).toBeGreaterThan(byDuration[2]);
  });
});

describe('daily quest', () => {
  it('is stable for a given date', () => {
    const a = getDailyQuestForDate('2026-09-04');
    const b = getDailyQuestForDate('2026-09-04');
    const c = getDailyQuestForDate('2026-09-04');

    expect(a.id).toBe(b.id);
    expect(b.id).toBe(c.id);
  });

  it('differs across dates', () => {
    const ids = new Set(
      Array.from({ length: 30 }, (_, index) =>
        getDailyQuestForDate(`2026-09-${String(index + 1).padStart(2, '0')}`).id,
      ),
    );
    // Not required to be all-unique, but it must not be a single stuck quest.
    expect(ids.size).toBeGreaterThan(10);
  });

  it('never picks a chain step or a chaos-only quest', () => {
    for (let day = 1; day <= 28; day += 1) {
      const quest = getDailyQuestForDate(`2026-03-${String(day).padStart(2, '0')}`);
      expect(quest.chainId).toBeUndefined();
      expect(quest.mode).not.toBe('chaos');
    }
  });

  it('builds a stable offer with identical rewards', () => {
    const first = buildDailyOffer('2026-09-04');
    const second = buildDailyOffer('2026-09-04');

    expect(first.quest.id).toBe(second.quest.id);
    expect(first.xp).toBe(second.xp);
    expect(first.gold).toBe(second.gold);
    expect(first.rarity).toBe(second.rarity);
    expect(first.isDaily).toBe(true);
  });
});

describe('quest chains', () => {
  it('every chain references quests that exist, in order', () => {
    for (const chain of QUEST_CHAINS) {
      expect(chain.questIds.length).toBeGreaterThan(1);
      chain.questIds.forEach((questId, index) => {
        const quest = getQuestById(questId);
        expect(quest, `${questId} missing`).toBeDefined();
        expect(quest?.chainId).toBe(chain.id);
        expect(quest?.chainStep).toBe(index + 1);
      });
    }
  });

  it('only the next unfinished step is available', () => {
    const chain = QUEST_CHAINS[0];
    const step1 = getQuestById(chain.questIds[0])!;
    const step2 = getQuestById(chain.questIds[1])!;

    expect(isChainQuestAvailable(step1, {})).toBe(true);
    expect(isChainQuestAvailable(step2, {})).toBe(false);

    const afterStep1 = {
      [chain.id]: {
        chainId: chain.id,
        completedSteps: 1,
        completedQuestIds: [step1.id],
        completed: false,
      },
    };

    expect(isChainQuestAvailable(step1, afterStep1)).toBe(false);
    expect(isChainQuestAvailable(step2, afterStep1)).toBe(true);
  });

  it('advances step by step and reports completion once', () => {
    const chain = QUEST_CHAINS.find((entry) => entry.id === 'forgotten_drawer')!;
    let chains = {};
    let completedId: string | null = null;

    chain.questIds.forEach((questId, index) => {
      const result = advanceChain(chains, getQuestById(questId)!, '2026-09-04T10:00:00.000Z');
      chains = result.chains;
      completedId = result.completedChainId;

      const progress = (chains as Record<string, { completedSteps: number; completed: boolean }>)[
        chain.id
      ];
      expect(progress.completedSteps).toBe(index + 1);
      expect(progress.completed).toBe(index === chain.questIds.length - 1);
    });

    expect(completedId).toBe(chain.id);
  });

  it('ignores a repeated completion of the same step', () => {
    const chain = QUEST_CHAINS[0];
    const quest = getQuestById(chain.questIds[0])!;

    const first = advanceChain({}, quest, '2026-09-04T10:00:00.000Z');
    const second = advanceChain(first.chains, quest, '2026-09-04T11:00:00.000Z');

    expect(second.chains[chain.id].completedSteps).toBe(1);
    expect(second.completedChainId).toBeNull();
  });

  it('a completed chain stops offering steps', () => {
    const chain = QUEST_CHAINS[0];
    const chains = {
      [chain.id]: {
        chainId: chain.id,
        completedSteps: chain.questIds.length,
        completedQuestIds: chain.questIds,
        completed: true,
      },
    };

    for (const questId of chain.questIds) {
      expect(isChainQuestAvailable(getQuestById(questId)!, chains)).toBe(false);
    }
  });
});

describe('rerolls', () => {
  it('spends a token when one is owned', () => {
    const save = makeSave();
    save.inventory = [{ itemId: 'reroll_token', count: 2 }];

    const availability = getRerollAvailability(save, '2026-09-04');

    expect(availability.canReroll).toBe(true);
    expect(availability.usesToken).toBe(true);
    expect(availability.usesFreeDaily).toBe(false);
  });

  it('grants one free reroll per local day when no token is owned', () => {
    const save = makeSave();
    save.inventory = [];

    const first = getRerollAvailability(save, '2026-09-04');
    expect(first.canReroll).toBe(true);
    expect(first.usesFreeDaily).toBe(true);

    save.daily.freeRerollUsedOn = '2026-09-04';
    const second = getRerollAvailability(save, '2026-09-04');
    expect(second.canReroll).toBe(false);

    // The next day the free reroll is back.
    const nextDay = getRerollAvailability(save, '2026-09-05');
    expect(nextDay.canReroll).toBe(true);
  });
});
