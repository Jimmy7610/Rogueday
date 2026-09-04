import { beforeEach, describe, expect, it } from 'vitest';
import type { QuestFilters, RogueDaySave } from '@/types';
import { QUESTS } from '@/data/quests';
import { BOSSES, getBossById } from '@/data/bosses';
import { ALL_CHALLENGES, eligibleChallenges } from '@/data/challenges';
import { PERKS, PERK_MILESTONES, computePerkEffects } from '@/data/perks';
import { createRng } from '@/utils/rng';
import { toLocalDateKey } from '@/utils/date';
import {
  applyBossDamage,
  createBossState,
  ensureCurrentBoss,
  getTriggeredPhases,
  getWeaknessInfo,
  rescaleBossToDefinition,
} from './boss';
import { completeQuest } from './completion';
import { buildDailyStock, getMarketView, purchaseOffer, reconcileMarket } from './market';
import { getPerkViews, nextPerkChoice, pendingMilestones, selectPerk } from './perks';
import { CHAOS_MODIFIERS, buildQuestPoolDetailed, matchesHardConstraints, rollQuestChoices } from './questSelection';
import { getStreakStatus } from './streak';
import {
  beatTheClock,
  createTimer,
  elapsedMs,
  formatTimer,
  hasExpired,
  pauseTimer,
  remainingMs,
  resetTimer,
  resumeTimer,
  sanitiseTimer,
} from './timer';
import { makeOffer, makeSave, NO_LUCK_RNG } from '@/test/helpers';

const AT = new Date('2026-09-04T14:00:00');

/* ================================================================== */
/* Strict filters                                                      */
/* ================================================================== */

describe('hard constraints are never relaxed', () => {
  it('an impossible combination returns nothing rather than something wrong', () => {
    // Chaos mode + 5 minutes + low energy + outside is deliberately narrow.
    const filters: QuestFilters = {
      duration: 5,
      energy: 'low',
      location: 'outside',
      mood: 'stressed',
      mode: 'chaos',
    };

    const result = rollQuestChoices({
      filters,
      chains: {},
      recentQuestIds: [],
      rng: createRng('impossible'),
    });

    // Whatever comes back, it must obey the hard constraints. If nothing can,
    // the result is explicitly empty.
    if (result.empty) {
      expect(result.offers).toEqual([]);
    } else {
      for (const offer of result.offers) {
        expect(matchesHardConstraints(offer.quest, filters)).toBe(true);
      }
    }
  });

  it('never hands a high-energy quest to a low-energy player', () => {
    const filters: QuestFilters = {
      duration: 60,
      energy: 'low',
      location: 'anywhere',
      mood: 'bored',
      mode: 'normal',
    };

    for (let seed = 0; seed < 120; seed += 1) {
      const { offers } = rollQuestChoices({
        filters,
        chains: {},
        recentQuestIds: QUESTS.map((quest) => quest.id), // force the fallback path
        rng: createRng(`energy-${seed}`),
      });
      for (const offer of offers) {
        expect(offer.quest.energy, `${offer.quest.id}`).toBe('low');
      }
    }
  });

  it('never hands an outdoor-only quest to a player at home', () => {
    const filters: QuestFilters = {
      duration: 60,
      energy: 'high',
      location: 'home',
      mood: 'adventurous',
      mode: 'normal',
    };

    for (let seed = 0; seed < 120; seed += 1) {
      const { offers } = rollQuestChoices({
        filters,
        chains: {},
        recentQuestIds: QUESTS.map((quest) => quest.id),
        rng: createRng(`loc-${seed}`),
      });
      for (const offer of offers) {
        const locations = offer.quest.locations;
        expect(
          locations.includes('home') || locations.includes('anywhere'),
          `${offer.quest.id} locations=${locations.join('/')}`,
        ).toBe(true);
      }
    }
  });

  it('never hands a 60-minute quest to a player with 15 minutes', () => {
    const filters: QuestFilters = {
      duration: 15,
      energy: 'high',
      location: 'anywhere',
      mood: 'motivated',
      mode: 'normal',
    };

    for (let seed = 0; seed < 120; seed += 1) {
      const { offers } = rollQuestChoices({
        filters,
        chains: {},
        recentQuestIds: QUESTS.map((quest) => quest.id),
        rng: createRng(`dur-${seed}`),
      });
      for (const offer of offers) {
        expect(offer.quest.duration).toBeLessThanOrEqual(15);
      }
    }
  });

  it('relaxes mood only as a last resort, and says so', () => {
    // A mood with very few matching quests at this narrow setting.
    const filters: QuestFilters = {
      duration: 5,
      energy: 'low',
      location: 'outside',
      mood: 'motivated',
      mode: 'normal',
    };

    const strict = buildQuestPoolDetailed({ filters, chains: {}, recentQuestIds: [] });

    // Whatever the pool, hard constraints hold and the flag is honest.
    for (const quest of strict.quests) {
      expect(matchesHardConstraints(quest, filters)).toBe(true);
    }
    if (strict.moodRelaxed) {
      expect(strict.quests.some((quest) => !quest.moods.includes('motivated'))).toBe(true);
    }
  });

  it('the chaos music modifier no longer suggests high volume', () => {
    const music = CHAOS_MODIFIERS.find((modifier) => modifier.id === 'music_only');
    expect(music).toBeDefined();
    expect(music!.description).not.toMatch(/hög volym/i);
    expect(music!.description).toMatch(/energi/i);
  });

  it('no chaos modifier suggests anything unsafe', () => {
    for (const modifier of CHAOS_MODIFIERS) {
      expect(modifier.description).not.toMatch(/hög volym|maxvolym|så högt/i);
    }
  });
});

/* ================================================================== */
/* Challenge modifiers                                                 */
/* ================================================================== */

describe('safe / wild / dangerous', () => {
  it('SAFE never carries a challenge', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const { offers } = rollQuestChoices({
        filters: { duration: 60, energy: 'high', location: 'anywhere', mood: 'motivated', mode: 'normal' },
        chains: {},
        recentQuestIds: [],
        rng: createRng(`safe-${seed}`),
      });
      expect(offers[0].tier).toBe('safe');
      expect(offers[0].challenge).toBeUndefined();
    }
  });

  it('WILD and DANGEROUS carry a visible challenge', () => {
    let wildWith = 0;
    let dangerousWith = 0;

    for (let seed = 0; seed < 40; seed += 1) {
      const { offers } = rollQuestChoices({
        filters: { duration: 60, energy: 'high', location: 'anywhere', mood: 'motivated', mode: 'normal' },
        chains: {},
        recentQuestIds: [],
        rng: createRng(`tier-${seed}`),
      });
      if (offers[1].challenge) wildWith += 1;
      if (offers[2].challenge) dangerousWith += 1;
    }

    expect(wildWith).toBe(40);
    expect(dangerousWith).toBe(40);
  });

  it('a riskier tier is never worth less than a safer one', () => {
    // Regression: each tier draws a different quest, so without ordering the
    // picks a DANGEROUS 5-minute quest could pay less than a SAFE 30-minute
    // one - which breaks the whole risk/reward promise.
    for (let seed = 0; seed < 200; seed += 1) {
      const { offers } = rollQuestChoices({
        filters: {
          duration: 60,
          energy: 'high',
          location: 'anywhere',
          mood: 'motivated',
          mode: 'normal',
        },
        chains: {},
        recentQuestIds: [],
        rng: createRng(`order-${seed}`),
      });

      const [safe, wild, dangerous] = offers;
      expect(wild.xp, `seed ${seed}: wild ${wild.xp} < safe ${safe.xp}`).toBeGreaterThanOrEqual(
        safe.xp,
      );
      expect(
        dangerous.xp,
        `seed ${seed}: dangerous ${dangerous.xp} < wild ${wild.xp}`,
      ).toBeGreaterThanOrEqual(wild.xp);
    }
  });

  it('the same ordering holds for gold', () => {
    for (let seed = 0; seed < 120; seed += 1) {
      const { offers } = rollQuestChoices({
        filters: {
          duration: 30,
          energy: 'medium',
          location: 'anywhere',
          mood: 'bored',
          mode: 'normal',
        },
        chains: {},
        recentQuestIds: [],
        rng: createRng(`gold-${seed}`),
      });

      expect(offers[1].gold).toBeGreaterThanOrEqual(offers[0].gold);
      expect(offers[2].gold).toBeGreaterThanOrEqual(offers[1].gold);
    }
  });

  it('a challenge states its requirement in plain Swedish', () => {
    for (const challenge of ALL_CHALLENGES) {
      expect(challenge.name.length).toBeGreaterThan(2);
      expect(challenge.requirement.length).toBeGreaterThan(10);
      expect(challenge.requirement).toMatch(/[a-zåäö]/i);
    }
  });

  it('wild pays 20-35% more and dangerous 50-75% more', () => {
    for (const challenge of ALL_CHALLENGES) {
      if (challenge.tier === 'wild') {
        expect(challenge.rewardMultiplier).toBeGreaterThanOrEqual(1.2);
        expect(challenge.rewardMultiplier).toBeLessThanOrEqual(1.35);
      } else {
        expect(challenge.rewardMultiplier).toBeGreaterThanOrEqual(1.5);
        expect(challenge.rewardMultiplier).toBeLessThanOrEqual(1.75);
      }
    }
  });

  it('a timed challenge never demands more time than the quest allows', () => {
    for (const quest of QUESTS) {
      for (const tier of ['wild', 'dangerous'] as const) {
        for (const challenge of eligibleChallenges(quest, tier)) {
          if (challenge.timerMinutes) {
            expect(challenge.timerMinutes).toBeLessThanOrEqual(quest.duration);
          }
        }
      }
    }
  });

  it('the accepted challenge is stored on the offer, so a reload cannot change it', () => {
    const { offers } = rollQuestChoices({
      filters: { duration: 60, energy: 'high', location: 'anywhere', mood: 'motivated', mode: 'normal' },
      chains: {},
      recentQuestIds: [],
      rng: createRng('stored'),
    });

    const dangerous = offers[2];
    const serialised = JSON.parse(JSON.stringify(dangerous));

    expect(serialised.challenge.id).toBe(dangerous.challenge!.id);
    expect(serialised.challenge.requirement).toBe(dangerous.challenge!.requirement);
  });

  it('only a mystery challenge hides the objective', () => {
    for (const challenge of ALL_CHALLENGES) {
      if (challenge.hidesObjective) {
        expect(challenge.id).toMatch(/mystery/);
      }
    }
  });
});

/* ================================================================== */
/* Focus timer                                                         */
/* ================================================================== */

describe('focus timer', () => {
  it('derives elapsed time from timestamps, not from ticks', () => {
    const start = new Date('2026-09-04T10:00:00');
    const timer = createTimer(10, start);

    expect(elapsedMs(timer, start)).toBe(0);
    expect(elapsedMs(timer, new Date('2026-09-04T10:05:00'))).toBe(5 * 60000);
    // Jumping ahead - as a backgrounded tab does - is measured correctly.
    expect(elapsedMs(timer, new Date('2026-09-04T10:59:00'))).toBe(59 * 60000);
  });

  it('counts down toward the target', () => {
    const start = new Date('2026-09-04T10:00:00');
    const timer = createTimer(12, start);

    expect(remainingMs(timer, start)).toBe(12 * 60000);
    expect(remainingMs(timer, new Date('2026-09-04T10:11:00'))).toBe(60000);
    expect(hasExpired(timer, new Date('2026-09-04T10:11:00'))).toBe(false);
    expect(hasExpired(timer, new Date('2026-09-04T10:12:01'))).toBe(true);
  });

  it('pauses and resumes without losing or inventing time', () => {
    const start = new Date('2026-09-04T10:00:00');
    let timer = createTimer(null, start);

    timer = pauseTimer(timer, new Date('2026-09-04T10:03:00'));
    expect(timer.runningSince).toBeNull();
    expect(elapsedMs(timer, new Date('2026-09-04T10:30:00'))).toBe(3 * 60000);

    timer = resumeTimer(timer, new Date('2026-09-04T10:30:00'));
    expect(elapsedMs(timer, new Date('2026-09-04T10:32:00'))).toBe(5 * 60000);
  });

  it('resets to zero but keeps the target', () => {
    const timer = createTimer(12, new Date('2026-09-04T10:00:00'));
    const reset = resetTimer(timer, new Date('2026-09-04T10:20:00'));

    expect(reset.accumulatedMs).toBe(0);
    expect(reset.targetMs).toBe(12 * 60000);
    expect(elapsedMs(reset, new Date('2026-09-04T10:20:00'))).toBe(0);
  });

  it('never reports negative elapsed time when the clock moves backwards', () => {
    const timer = createTimer(10, new Date('2026-09-04T10:00:00'));
    expect(elapsedMs(timer, new Date('2026-09-04T09:00:00'))).toBe(0);
  });

  it('formats as minutes and seconds', () => {
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(65000)).toBe('1:05');
    expect(formatTimer(12 * 60000)).toBe('12:00');
    expect(formatTimer(-5000)).toBe('0:00');
  });

  it('beating the clock is measured against the stored target', () => {
    const start = new Date('2026-09-04T10:00:00');
    const active = {
      offer: makeOffer('digi_inbox_raid'),
      acceptedAt: start.toISOString(),
      timer: createTimer(12, start),
    };

    expect(beatTheClock(active, new Date('2026-09-04T10:09:00'))).toBe(true);
    expect(beatTheClock(active, new Date('2026-09-04T10:13:00'))).toBe(false);
    // No timer at all is simply not a timed run.
    expect(beatTheClock({ offer: active.offer, acceptedAt: active.acceptedAt })).toBe(false);
  });

  it('repairs a corrupt stored timer instead of producing nonsense', () => {
    expect(sanitiseTimer(null)).toBeUndefined();
    expect(sanitiseTimer('nope')).toBeUndefined();

    const repaired = sanitiseTimer({
      runningSince: 'not-a-date',
      accumulatedMs: -500,
      targetMs: 'x',
    });

    expect(repaired).toEqual({ runningSince: null, accumulatedMs: 0, targetMs: null });
  });

  it('missing the time costs nothing at all', () => {
    const save = makeSave();
    const offer = makeOffer('digi_inbox_raid');
    const timed = {
      ...offer,
      challenge: {
        id: 'danger_speed_12',
        name: 'TOLV MINUTER',
        requirement: 'Klara det på 12 minuter.',
        tier: 'dangerous' as const,
        rewardMultiplier: 1.6,
        timerMinutes: 12,
      },
    };

    const missed = completeQuest(
      save,
      timed,
      AT,
      NO_LUCK_RNG,
      {
        offer: timed,
        acceptedAt: AT.toISOString(),
        timer: createTimer(12, new Date('2026-09-04T13:00:00')), // long expired
      },
    );

    expect(missed.reward.timeBonus).toBe(false);
    expect(missed.save.history).toHaveLength(1);
    expect(missed.reward.totalXp).toBeGreaterThan(0);
    expect(missed.save.streak.current).toBe(1); // streak untouched
  });

  it('beating the time grants a visible bonus line', () => {
    const save = makeSave();
    const offer = makeOffer('digi_inbox_raid');
    const timed = {
      ...offer,
      challenge: {
        id: 'danger_speed_12',
        name: 'TOLV MINUTER',
        requirement: 'Klara det på 12 minuter.',
        tier: 'dangerous' as const,
        rewardMultiplier: 1.6,
        timerMinutes: 12,
      },
    };

    const won = completeQuest(save, timed, AT, NO_LUCK_RNG, {
      offer: timed,
      acceptedAt: AT.toISOString(),
      timer: createTimer(12, new Date('2026-09-04T13:55:00')), // 5 minutes in
    });

    expect(won.reward.timeBonus).toBe(true);
    expect(won.reward.lines.some((line) => line.id === 'time')).toBe(true);
    expect(won.save.statistics.timedChallengesWon).toBe(1);
  });
});

/* ================================================================== */
/* Market                                                              */
/* ================================================================== */

describe('market', () => {
  beforeEach(() => window.localStorage.clear());

  it('is deterministic for a given local date', () => {
    const a = buildDailyStock('2026-09-04');
    const b = buildDailyStock('2026-09-04');

    expect(a).toEqual(b);
  });

  it('changes from day to day', () => {
    const days = Array.from({ length: 14 }, (_, index) =>
      JSON.stringify(buildDailyStock(`2026-09-${String(index + 1).padStart(2, '0')}`)),
    );
    expect(new Set(days).size).toBeGreaterThan(8);
  });

  it('stocks five or six items with exactly one featured bargain', () => {
    for (let day = 1; day <= 28; day += 1) {
      const stock = buildDailyStock(`2026-03-${String(day).padStart(2, '0')}`);

      expect(stock.length).toBeGreaterThanOrEqual(5);
      expect(stock.length).toBeLessThanOrEqual(6);
      expect(stock.filter((offer) => offer.featured)).toHaveLength(1);
      expect(new Set(stock.map((offer) => offer.itemId)).size).toBe(stock.length);
    }
  });

  it('prices sit in the documented ranges', () => {
    const bands: Record<string, [number, number]> = {
      reroll_token: [35, 55],
      focus_rune: [50, 70],
      lucky_coin: [60, 80],
      streak_shield: [90, 120],
      xp_elixir: [110, 150],
      boss_key: [130, 175],
      mystery_chest: [175, 240],
    };

    for (let day = 1; day <= 28; day += 1) {
      for (const offer of buildDailyStock(`2026-05-${String(day).padStart(2, '0')}`)) {
        const [min, max] = bands[offer.itemId];
        // The listed price is the band; the shown price may be discounted.
        expect(offer.price).toBeGreaterThan(0);
        expect(offer.price).toBeLessThanOrEqual(max);
        if (offer.discountPercent === 0) {
          expect(offer.price).toBeGreaterThanOrEqual(min);
        }
      }
    }
  });

  it('buying deducts gold and adds the item', () => {
    const save = makeSave();
    save.progression.gold = 1000;

    const { offers } = getMarketView(save);
    const offer = offers[0];

    const result = purchaseOffer(save, offer.offerId);

    expect(result.ok).toBe(true);
    expect(result.save.progression.gold).toBe(1000 - offer.finalPrice);
    expect(
      result.save.inventory.find((entry) => entry.itemId === offer.itemId)?.count,
    ).toBe(1);
    expect(result.save.statistics.marketPurchases).toBe(1);
    expect(result.save.statistics.totalGoldSpent).toBe(offer.finalPrice);
  });

  it('refuses when the player cannot afford it', () => {
    const save = makeSave();
    save.progression.gold = 1;

    const { offers } = getMarketView(save);
    const result = purchaseOffer(save, offers[0].offerId);

    expect(result.ok).toBe(false);
    expect(result.save).toBe(save);
    expect(result.message).toMatch(/inte råd/);
  });

  it('a single-copy item cannot be bought twice, even after a reload', () => {
    let save: RogueDaySave = makeSave();
    save.progression.gold = 5000;

    const featured = getMarketView(save).offers.find((offer) => offer.featured)!;
    expect(featured.stock).toBe(1);

    const first = purchaseOffer(save, featured.offerId);
    expect(first.ok).toBe(true);
    save = first.save;

    const second = purchaseOffer(save, featured.offerId);
    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/slutsåld/i);

    // Re-deriving the view (as a refresh does) still shows it as sold out.
    const view = getMarketView(save).offers.find((offer) => offer.offerId === featured.offerId)!;
    expect(view.soldOut).toBe(true);
    expect(view.remaining).toBe(0);
  });

  it('restocks when the local day changes', () => {
    const stale = { date: '2026-09-03', purchased: { 'x': 1 } };
    const fresh = reconcileMarket(stale, new Date(2026, 8, 4));

    expect(fresh.date).toBe('2026-09-04');
    expect(fresh.purchased).toEqual({});
  });

  it('keeps today’s purchases when the day has not changed', () => {
    const today = toLocalDateKey(new Date(2026, 8, 4));
    const market = { date: today, purchased: { a: 1 } };

    expect(reconcileMarket(market, new Date(2026, 8, 4, 23))).toBe(market);
  });

  it('perk discounts reduce what the player actually pays', () => {
    const save = makeSave();
    save.progression.gold = 5000;
    const base = getMarketView(save).offers[0];

    save.perks = { selected: ['fortune_15'] }; // 10% off
    const discounted = getMarketView(save).offers[0];

    expect(discounted.finalPrice).toBeLessThan(base.finalPrice);

    const result = purchaseOffer(save, discounted.offerId);
    expect(result.pricePaid).toBe(discounted.finalPrice);
  });
});

/* ================================================================== */
/* Perks                                                               */
/* ================================================================== */

describe('perks', () => {
  it('offers exactly three themed choices at every milestone', () => {
    for (const level of PERK_MILESTONES) {
      const atLevel = PERKS.filter((perk) => perk.level === level);
      expect(atLevel, `level ${level}`).toHaveLength(3);
      expect(new Set(atLevel.map((perk) => perk.theme))).toEqual(
        new Set(['momentum', 'fortune', 'slayer']),
      );
    }
  });

  it('owes a choice as soon as a milestone is reached', () => {
    const save = makeSave();
    save.progression.level = 4;
    expect(pendingMilestones(save.progression.level, save.perks)).toEqual([]);

    save.progression.level = 5;
    expect(pendingMilestones(save.progression.level, save.perks)).toEqual([5]);

    save.progression.level = 12;
    expect(pendingMilestones(save.progression.level, save.perks)).toEqual([5, 10]);
  });

  it('selecting a perk clears that milestone', () => {
    const save = makeSave();
    save.progression.level = 10;

    const first = selectPerk(save, 'momentum_5');
    expect(first.ok).toBe(true);
    save.perks = first.perks;

    expect(pendingMilestones(10, save.perks)).toEqual([10]);
    expect(nextPerkChoice(save)?.level).toBe(10);
  });

  it('refuses a perk the player has not unlocked', () => {
    const save = makeSave();
    save.progression.level = 5;

    const result = selectPerk(save, 'slayer_50');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/nivån/i);
    expect(result.perks.selected).toEqual([]);
  });

  it('refuses a second perk at the same milestone', () => {
    const save = makeSave();
    save.progression.level = 5;
    save.perks = selectPerk(save, 'momentum_5').perks;

    const second = selectPerk(save, 'fortune_5');
    expect(second.ok).toBe(false);
    expect(second.perks.selected).toEqual(['momentum_5']);
  });

  it('aggregates effects from every chosen perk', () => {
    const effects = computePerkEffects(['fortune_5', 'fortune_20', 'slayer_5', 'momentum_15']);

    expect(effects.goldBonus).toBeCloseTo(0.18, 5);
    expect(effects.bossDamageBonus).toBeCloseTo(0.08, 5);
    expect(effects.extraFreeRerolls).toBe(1);
  });

  it('caps the merchant discount so the market never becomes free', () => {
    const effects = computePerkEffects(['fortune_15', 'fortune_30', 'fortune_45']);
    expect(effects.merchantDiscount).toBeLessThanOrEqual(0.4);
  });

  it('a gold perk measurably increases the gold from a completion', () => {
    const plain = makeSave();
    const buffed = makeSave();
    buffed.perks = { selected: ['fortune_5'] };

    const offer = makeOffer('digi_inbox_raid');
    const a = completeQuest(plain, offer, AT, NO_LUCK_RNG);
    const b = completeQuest(buffed, offer, AT, NO_LUCK_RNG);

    expect(b.reward.gold).toBeGreaterThan(a.reward.gold);
  });

  it('a slayer perk measurably increases boss damage', () => {
    const plain = makeSave();
    const buffed = makeSave();
    buffed.perks = { selected: ['slayer_5'] };

    const offer = makeOffer('digi_inbox_raid');
    const a = completeQuest(plain, offer, AT, NO_LUCK_RNG);
    const b = completeQuest(buffed, offer, AT, NO_LUCK_RNG);

    expect(b.reward.bossDamage).toBeGreaterThan(a.reward.bossDamage);
  });

  it('the first-quest perk applies only to the day’s first completion', () => {
    let save = makeSave();
    save.perks = { selected: ['momentum_5'] };

    const offer = makeOffer('digi_inbox_raid');
    const first = completeQuest(save, offer, AT, NO_LUCK_RNG);
    save = first.save;
    const second = completeQuest(save, offer, AT, NO_LUCK_RNG);

    expect(first.reward.xp).toBeGreaterThan(second.reward.xp);
  });

  it('perk views report owned, selectable and blocked correctly', () => {
    const save = makeSave();
    save.progression.level = 10;
    save.perks = { selected: ['momentum_5'] };

    const views = getPerkViews(save);
    const owned = views.find((view) => view.id === 'momentum_5')!;
    const blocked = views.find((view) => view.id === 'fortune_5')!;
    const open = views.find((view) => view.id === 'fortune_10')!;
    const locked = views.find((view) => view.id === 'fortune_50')!;

    expect(owned.owned).toBe(true);
    expect(blocked.blocked).toBe(true);
    expect(open.selectable).toBe(true);
    expect(locked.selectable).toBe(false);
    expect(locked.blocked).toBe(false);
  });
});

/* ================================================================== */
/* Boss weaknesses and phases                                          */
/* ================================================================== */

describe('boss weaknesses', () => {
  it('every boss declares at least two weaknesses and three phases', () => {
    for (const boss of BOSSES) {
      expect(boss.weaknessCategories.length, boss.name).toBeGreaterThanOrEqual(2);
      expect(boss.phases, boss.name).toHaveLength(3);
      expect(boss.phases.map((phase) => phase.threshold)).toEqual([0.75, 0.5, 0.25]);
      for (const phase of boss.phases) {
        expect(phase.message.length, boss.name).toBeGreaterThan(10);
      }
    }
  });

  it('a boss is never weak and resistant to the same category', () => {
    for (const boss of BOSSES) {
      const overlap = boss.weaknessCategories.filter((category) =>
        boss.resistanceCategories.includes(category),
      );
      expect(overlap, boss.name).toEqual([]);
    }
  });

  it('weakness multiplies damage, resistance dampens it', () => {
    const boss = getBossById('laundry_mountain')!;

    expect(getWeaknessInfo(boss, 'cleaning').multiplier).toBe(1.25);
    expect(getWeaknessInfo(boss, 'cleaning').weak).toBe(true);
    expect(getWeaknessInfo(boss, 'walking').multiplier).toBe(1);

    const scroll = getBossById('scroll_demon')!;
    expect(getWeaknessInfo(scroll, 'digital').multiplier).toBe(0.85);
    expect(getWeaknessInfo(scroll, 'digital').resistant).toBe(true);
  });

  it('slayer perks widen the weakness bonus', () => {
    const boss = getBossById('laundry_mountain')!;
    expect(getWeaknessInfo(boss, 'cleaning', 0.1).multiplier).toBeCloseTo(1.35, 5);
  });
});

describe('boss phases', () => {
  it('fires a phase when HP crosses its threshold', () => {
    const boss = getBossById('laundry_mountain')!;
    const triggered = getTriggeredPhases(boss, 1000, 700, []);

    expect(triggered).toHaveLength(1);
    expect(triggered[0].threshold).toBe(0.75);
  });

  it('fires every threshold crossed by one big hit, highest first', () => {
    const boss = getBossById('laundry_mountain')!;
    const triggered = getTriggeredPhases(boss, 1000, 200, []);

    expect(triggered.map((phase) => phase.threshold)).toEqual([0.75, 0.5, 0.25]);
  });

  it('never repeats a phase that has already been seen', () => {
    const boss = getBossById('laundry_mountain')!;
    expect(getTriggeredPhases(boss, 1000, 700, [0.75])).toEqual([]);
    expect(getTriggeredPhases(boss, 1000, 400, [0.75])).toHaveLength(1);
  });

  it('records phases on the boss state exactly once', () => {
    let state = createBossState('2026-09-07');
    state = { ...state, bossId: 'laundry_mountain', currentHp: 1000, maxHp: 1000 };

    const first = applyBossDamage(state, 300, AT);
    expect(first.phasesTriggered).toHaveLength(1);
    expect(first.boss.phasesSeen).toEqual([0.75]);

    const second = applyBossDamage(first.boss, 50, AT);
    expect(second.phasesTriggered).toEqual([]);
    expect(second.boss.phasesSeen).toEqual([0.75]);

    const third = applyBossDamage(second.boss, 300, AT);
    expect(third.phasesTriggered).toHaveLength(1);
    expect(third.boss.phasesSeen).toEqual([0.75, 0.5]);
  });

  it('surfaces triggered phases through a completion', () => {
    const save = makeSave();
    save.boss = { ...save.boss!, currentHp: save.boss!.maxHp };

    // Enough damage in one go to cross the first threshold.
    let next = save;
    let sawPhase = false;
    for (let index = 0; index < 12 && !sawPhase; index += 1) {
      const result = completeQuest(next, makeOffer('clean_floor_deep'), AT, NO_LUCK_RNG);
      next = result.save;
      if (result.reward.boss && result.reward.boss.phasesTriggered.length > 0) sawPhase = true;
    }

    expect(sawPhase).toBe(true);
  });
});

/* ================================================================== */
/* Reward accounting                                                   */
/* ================================================================== */

describe('rebalanced boss rescaling', () => {
  it('keeps the remaining fraction when maxHp changes between versions', () => {
    const definition = getBossById('laundry_mountain')!;

    // A v1 save mid-week: old pool of 2200, just over half of it gone.
    const stale = {
      ...createBossState('2026-09-07'),
      bossId: 'laundry_mountain',
      currentHp: 1100,
      maxHp: 2200,
    };

    const rescaled = rescaleBossToDefinition(stale);

    expect(rescaled.maxHp).toBe(definition.maxHp);
    // Half the health was left before, and half is left after.
    expect(rescaled.currentHp / rescaled.maxHp).toBeCloseTo(0.5, 2);
  });

  it('is idempotent once the totals already agree', () => {
    const fresh = createBossState('2026-09-07');
    expect(rescaleBossToDefinition(fresh)).toBe(fresh);
  });

  it('leaves a defeated boss defeated', () => {
    const dead = {
      ...createBossState('2026-09-07'),
      bossId: 'laundry_mountain',
      currentHp: 0,
      maxHp: 2200,
      defeated: true,
    };

    const rescaled = rescaleBossToDefinition(dead);
    expect(rescaled.currentHp).toBe(0);
    expect(rescaled.defeated).toBe(true);
  });

  it('never leaves current HP above the new maximum', () => {
    const overfull = {
      ...createBossState('2026-09-07'),
      bossId: 'laundry_mountain',
      currentHp: 2200,
      maxHp: 2200,
    };

    const rescaled = rescaleBossToDefinition(overfull);
    expect(rescaled.currentHp).toBeLessThanOrEqual(rescaled.maxHp);
  });

  it('ensureCurrentBoss heals a stale pool without rotating the boss', () => {
    const stale = {
      ...createBossState('2026-09-07'),
      bossId: 'laundry_mountain',
      currentHp: 1100,
      maxHp: 2200,
    };

    const result = ensureCurrentBoss(stale, new Date(2026, 8, 9));

    expect(result.rotated).toBe(false);
    expect(result.boss.bossId).toBe('laundry_mountain');
    expect(result.boss.maxHp).toBe(getBossById('laundry_mountain')!.maxHp);
  });
});

describe('reward breakdown', () => {
  it('the lines always sum to the reported totals', () => {
    const save = makeSave();
    const { reward } = completeQuest(save, makeOffer('digi_inbox_raid'), AT, NO_LUCK_RNG);

    const xpSum = reward.lines.reduce((sum, line) => sum + line.xp, 0);
    const goldSum = reward.lines.reduce((sum, line) => sum + line.gold, 0);

    expect(xpSum).toBe(reward.totalXp);
    expect(goldSum).toBe(reward.totalGold);
  });

  it('the totals equal the actual change in progression', () => {
    const save = makeSave();
    const xpBefore = save.progression.totalXp;
    const goldBefore = save.progression.gold;

    const { save: next, reward } = completeQuest(
      save,
      makeOffer('digi_inbox_raid'),
      AT,
      NO_LUCK_RNG,
    );

    expect(next.progression.totalXp - xpBefore).toBe(reward.totalXp);
    expect(next.progression.gold - goldBefore).toBe(reward.totalGold);
  });

  it('accounts for boss, chain and badge rewards in the same statement', () => {
    let save = makeSave();
    save.boss = { ...save.boss!, currentHp: 5 }; // dies this hit

    // Two chain steps done, so the third completes the chain.
    save = completeQuest(save, makeOffer('chain_drawer_1'), AT, NO_LUCK_RNG).save;
    save = completeQuest(save, makeOffer('chain_drawer_2'), AT, NO_LUCK_RNG).save;

    const xpBefore = save.progression.totalXp;
    const goldBefore = save.progression.gold;

    const { save: next, reward } = completeQuest(
      save,
      makeOffer('chain_drawer_3'),
      AT,
      NO_LUCK_RNG,
    );

    const labels = reward.lines.map((line) => line.label);
    expect(labels).toContain('UPPDRAG');
    expect(labels).toContain('KEDJEBONUS');

    expect(next.progression.totalXp - xpBefore).toBe(reward.totalXp);
    expect(next.progression.gold - goldBefore).toBe(reward.totalGold);
  });

  it('a boss kill is itemised rather than silently added', () => {
    const save = makeSave();
    save.boss = { ...save.boss!, currentHp: 5 };

    const xpBefore = save.progression.totalXp;
    const { save: next, reward } = completeQuest(
      save,
      makeOffer('clean_floor_deep'),
      AT,
      NO_LUCK_RNG,
    );

    const bossLine = reward.lines.find((line) => line.id === 'boss');
    expect(bossLine).toBeDefined();
    expect(bossLine!.xp).toBeGreaterThan(0);
    expect(next.progression.totalXp - xpBefore).toBe(reward.totalXp);
  });

  it('reports the boss hit with before and after HP', () => {
    const save = makeSave();
    const before = save.boss!.currentHp;

    const { reward } = completeQuest(save, makeOffer('clean_floor_deep'), AT, NO_LUCK_RNG);

    expect(reward.boss).not.toBeNull();
    expect(reward.boss!.hpBefore).toBe(before);
    expect(reward.boss!.hpAfter).toBe(before - reward.bossDamage);
    expect(reward.boss!.damage).toBe(reward.bossDamage);
  });

  it('reports newly unlocked perk milestones', () => {
    const save = makeSave();
    // One XP short of level 5's threshold is fiddly; jump straight there.
    save.progression = { level: 4, xp: 0, totalXp: 2000, gold: 0 };

    let next = save;
    let unlocked: number[] = [];
    for (let index = 0; index < 30 && unlocked.length === 0; index += 1) {
      const result = completeQuest(next, makeOffer('clean_floor_deep'), AT, NO_LUCK_RNG);
      next = result.save;
      unlocked = result.reward.perkChoicesUnlocked;
    }

    expect(unlocked).toContain(5);
  });
});

/* ================================================================== */
/* Streak display                                                      */
/* ================================================================== */

describe('streak status', () => {
  it('shows the live streak while it is alive', () => {
    const status = getStreakStatus(
      { current: 4, longest: 9, lastCompletionDate: '2026-09-04', shieldUsedOn: null },
      [],
      new Date(2026, 8, 4, 20),
    );

    expect(status.tone).toBe('hot');
    expect(status.label).toBe('4 DAGAR');
    expect(status.atRisk).toBe(false);
  });

  it('says the streak is at risk when a shield can still save it', () => {
    const status = getStreakStatus(
      { current: 6, longest: 9, lastCompletionDate: '2026-09-04', shieldUsedOn: null },
      [{ itemId: 'streak_shield', count: 1 }],
      new Date(2026, 8, 6, 10),
    );

    expect(status.tone).toBe('risk');
    expect(status.label).toBe('SVIT I FARA');
    expect(status.atRisk).toBe(true);
    expect(status.icon).toBe('🛡️');
  });

  it('falls back to no streak without a shield', () => {
    const status = getStreakStatus(
      { current: 6, longest: 9, lastCompletionDate: '2026-09-04', shieldUsedOn: null },
      [],
      new Date(2026, 8, 6, 10),
    );

    expect(status.tone).toBe('cold');
    expect(status.label).toBe('INGEN SVIT');
  });

  it('never uses shaming language', () => {
    const labels = [
      getStreakStatus({ current: 0, longest: 0, lastCompletionDate: null, shieldUsedOn: null }, []),
      getStreakStatus(
        { current: 3, longest: 3, lastCompletionDate: '2026-09-04', shieldUsedOn: null },
        [{ itemId: 'streak_shield', count: 1 }],
        new Date(2026, 8, 6),
      ),
    ].map((status) => status.label);

    for (const label of labels) {
      expect(label).not.toMatch(/misslyck|förlorad|bruten|dålig/i);
    }
  });
});
