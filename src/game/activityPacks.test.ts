import { describe, expect, it } from 'vitest';
import type { ActivityPack, ContentTag, QuestCategory, RogueDaySave } from '@/types';
import { QUESTS, CATEGORY_LABELS } from '@/data/quests';
import { BOSSES } from '@/data/bosses';
import {
  ACTIVITY_PACKS,
  FAVOURITE_PACK_LIMIT,
  FEATURED_PACK_COUNT,
  MIN_HEALTHY_POOL,
  RECENT_PACK_LIMIT,
  STANDARD_PACKS,
  getPackById,
} from '@/data/activityPacks';
import { createDefaultSave } from '@/persistence/defaults';
import { createRng } from '@/utils/rng';
import {
  DAILY_PACK_GOLD_BONUS,
  SURPRISE_DURATIONS,
  allPackPools,
  dailyPackBonusAvailable,
  favouritesFull,
  getDailyPack,
  isFavouritePack,
  matchesPack,
  orderedPacks,
  packFilters,
  packPool,
  packPoolInfo,
  packPreferenceWeight,
  packStats,
  qualifiesForDailyBonus,
  recentPacks,
  recordPackCompletion,
  rememberPack,
  rollFromPack,
  surprisePack,
  toggleFavouritePack,
  type PackContext,
} from './activityPacks';

const CONTENT_TAGS: ContentTag[] = [
  'quiet',
  'phone-free',
  'no-money',
  'family-friendly',
  'solo',
  'social',
  'creative',
  'physical',
  'outdoors',
  'indoors',
  'errand',
  'focus',
  'relaxing',
  'exploration',
  'cleaning',
  'admin',
  'screen',
  'seated',
];

/** A save with enough history that gated content behaves normally. */
function veteran(): RogueDaySave {
  const base = createDefaultSave('Packtestaren');
  return {
    ...base,
    progression: { ...base.progression, level: 30 },
    streak: { ...base.streak, current: 8 },
    statistics: { ...base.statistics, questsCompleted: 200 },
  };
}

const CONTEXT: PackContext = { secrets: { now: new Date('2026-09-09T12:00:00'), save: veteran() } };

function poolOf(pack: ActivityPack, context: PackContext = CONTEXT) {
  return packPool(pack, context);
}

const packNamed = (id: string): ActivityPack => getPackById(id)!;

/* ------------------------------------------------------------------ */
/* Definitions                                                         */
/* ------------------------------------------------------------------ */

describe('pack definitions', () => {
  it('gives every pack a unique id', () => {
    const ids = new Set(ACTIVITY_PACKS.map((pack) => pack.id));
    expect(ids.size).toBe(ACTIVITY_PACKS.length);
  });

  it('gives every pack a name, an icon and both descriptions', () => {
    for (const pack of ACTIVITY_PACKS) {
      expect(pack.name.trim().length, pack.id).toBeGreaterThan(2);
      expect(pack.icon.trim().length, pack.id).toBeGreaterThan(0);
      expect(pack.shortDescription.trim().length, pack.id).toBeGreaterThan(5);
      expect(pack.flavourText.trim().length, pack.id).toBeGreaterThan(15);
      expect(pack.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('gives every pack a unique name and sort order', () => {
    expect(new Set(ACTIVITY_PACKS.map((pack) => pack.name)).size).toBe(ACTIVITY_PACKS.length);
    expect(new Set(ACTIVITY_PACKS.map((pack) => pack.sortOrder)).size).toBe(ACTIVITY_PACKS.length);
  });

  it('references only categories that exist', () => {
    const known = new Set(Object.keys(CATEGORY_LABELS) as QuestCategory[]);
    for (const pack of ACTIVITY_PACKS) {
      for (const category of [
        ...pack.excludedCategories,
        ...pack.preferredCategories,
        ...(pack.onlyCategories ?? []),
      ]) {
        expect(known.has(category), `${pack.id} references unknown category ${category}`).toBe(true);
      }
    }
  });

  it('references only tags that exist', () => {
    for (const pack of ACTIVITY_PACKS) {
      for (const tag of [...pack.requiredTags, ...pack.excludedTags, ...pack.preferredTags]) {
        expect(CONTENT_TAGS.includes(tag), `${pack.id} references unknown tag ${tag}`).toBe(true);
      }
    }
  });

  it('never both requires and excludes the same tag', () => {
    for (const pack of ACTIVITY_PACKS) {
      for (const tag of pack.requiredTags) {
        expect(pack.excludedTags.includes(tag), `${pack.id} contradicts itself on ${tag}`).toBe(
          false,
        );
      }
    }
  });

  it('never excludes a category it also restricts itself to', () => {
    for (const pack of ACTIVITY_PACKS) {
      for (const category of pack.onlyCategories ?? []) {
        expect(pack.excludedCategories.includes(category), `${pack.id} / ${category}`).toBe(false);
      }
    }
  });

  it('declares at least one duration, energy and location', () => {
    for (const pack of ACTIVITY_PACKS) {
      expect(pack.allowedDurations.length, pack.id).toBeGreaterThan(0);
      expect(pack.allowedEnergies.length, pack.id).toBeGreaterThan(0);
      expect(pack.allowedLocations.length, pack.id).toBeGreaterThan(0);
    }
  });

  it('has enough packs to fill the featured row and then some', () => {
    expect(ACTIVITY_PACKS.length).toBeGreaterThan(FEATURED_PACK_COUNT);
    expect(STANDARD_PACKS.length).toBe(ACTIVITY_PACKS.length - 1);
  });
});

/* ------------------------------------------------------------------ */
/* Pool health                                                         */
/* ------------------------------------------------------------------ */

describe('pack pools', () => {
  it('gives every static pack a healthy pool', () => {
    const thin = STANDARD_PACKS.map((pack) => packPoolInfo(pack, CONTEXT))
      .filter((info) => info.starved)
      .map((info) => `${info.packId}=${info.total}`);

    expect(thin, `packs under ${MIN_HEALTHY_POOL}: ${thin.join(', ')}`).toEqual([]);
  });

  it('gives BOSS RUSH a healthy pool for every boss in the game', () => {
    const rush = ACTIVITY_PACKS.find((pack) => pack.dynamic === 'boss-weakness')!;
    const thin: string[] = [];

    for (const boss of BOSSES) {
      const total = packPool(rush, { ...CONTEXT, boss }).length;
      if (total < MIN_HEALTHY_POOL) thin.push(`${boss.id}=${total}`);
    }

    expect(thin, `thin boss weeks: ${thin.join(', ')}`).toEqual([]);
  });

  it('reports a pool size that matches the pool it counted', () => {
    for (const pack of STANDARD_PACKS) {
      const info = packPoolInfo(pack, CONTEXT);
      expect(info.total, pack.id).toBe(packPool(pack, CONTEXT).length);
      expect(info.packId).toBe(pack.id);
    }
  });

  it('measures every pack in one call', () => {
    expect(allPackPools(CONTEXT)).toHaveLength(ACTIVITY_PACKS.length);
  });

  it('never counts a chain step', () => {
    for (const pack of STANDARD_PACKS) {
      expect(poolOf(pack).some((quest) => quest.chainId), pack.id).toBe(false);
    }
  });

  it('keeps secret quests out for a player who has not unlocked them', () => {
    const fresh = createDefaultSave('Ny');
    const context: PackContext = { secrets: { now: new Date(), save: fresh } };
    for (const pack of STANDARD_PACKS) {
      expect(
        packPool(pack, context).some((quest) => quest.category === 'secret'),
        pack.id,
      ).toBe(false);
    }
  });

  it('keeps secret quests out entirely when no context is supplied', () => {
    for (const pack of STANDARD_PACKS) {
      expect(packPool(pack, {}).some((quest) => quest.category === 'secret'), pack.id).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Hard constraints                                                    */
/* ------------------------------------------------------------------ */

describe('pack constraints are hard', () => {
  it('never lets a quest through that breaks duration, energy or location', () => {
    for (const pack of STANDARD_PACKS) {
      for (const quest of poolOf(pack)) {
        expect(pack.allowedDurations, `${pack.id}/${quest.id}`).toContain(quest.duration);
        expect(pack.allowedEnergies, `${pack.id}/${quest.id}`).toContain(quest.energy);
        expect(
          quest.locations.some((location) => pack.allowedLocations.includes(location)),
          `${pack.id}/${quest.id}`,
        ).toBe(true);
      }
    }
  });

  it('honours requiredTags, excludedTags and category rules everywhere', () => {
    for (const pack of STANDARD_PACKS) {
      for (const quest of poolOf(pack)) {
        for (const tag of pack.requiredTags) {
          expect(quest.contentTags, `${pack.id}/${quest.id}`).toContain(tag);
        }
        for (const tag of pack.excludedTags) {
          expect(quest.contentTags, `${pack.id}/${quest.id}`).not.toContain(tag);
        }
        expect(pack.excludedCategories, `${pack.id}/${quest.id}`).not.toContain(quest.category);
        if (pack.onlyCategories) {
          expect(pack.onlyCategories, `${pack.id}/${quest.id}`).toContain(quest.category);
        }
      }
    }
  });

  it('never mixes chaos quests into a normal pack', () => {
    for (const pack of STANDARD_PACKS) {
      for (const quest of poolOf(pack)) {
        expect(quest.mode === 'normal' || quest.mode === 'any', `${pack.id}/${quest.id}`).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* The promises each pack makes to the player                          */
/* ------------------------------------------------------------------ */

describe('what each pack promises', () => {
  it('JAG ÄR HELT SLUT never offers anything demanding', () => {
    for (const quest of poolOf(packNamed('pack_exhausted'))) {
      expect(quest.energy, quest.id).toBe('low');
      expect(quest.duration, quest.id).toBeLessThanOrEqual(15);
      expect(quest.contentTags, quest.id).not.toContain('physical');
      expect(
        quest.locations.includes('home') || quest.locations.includes('anywhere'),
        quest.id,
      ).toBe(true);
    }
  });

  it('JAG HAR 5 MINUTER never offers anything longer than five minutes', () => {
    const pool = poolOf(packNamed('pack_five_minutes'));
    expect(pool.length).toBeGreaterThan(50);
    for (const quest of pool) expect(quest.duration, quest.id).toBe(5);
  });

  it('JAG HAR 5 MINUTER really does span the library', () => {
    // The pack exists to show how much fits in five minutes, so a single
    // category must not dominate it.
    const pool = poolOf(packNamed('pack_five_minutes'));
    const categories = new Set(pool.map((quest) => quest.category));
    expect(categories.size).toBeGreaterThanOrEqual(15);
  });

  it('DIGITAL DETOX contains no quest that needs a screen', () => {
    for (const quest of poolOf(packNamed('pack_detox'))) {
      expect(quest.contentTags, quest.id).not.toContain('screen');
      expect(quest.contentTags, quest.id).not.toContain('admin');
      expect(quest.category, quest.id).not.toBe('digital');
    }
  });

  it('GRATIS NÖJE requires the no-money tag on every quest', () => {
    const pool = poolOf(packNamed('pack_free_fun'));
    expect(pool.length).toBeGreaterThan(50);
    for (const quest of pool) expect(quest.contentTags, quest.id).toContain('no-money');
  });

  it('HEMMA HELA DAGEN never offers a quest that requires leaving', () => {
    // A quest listing several locations is fine as long as one of them is
    // home: the promise is "you never have to go out", not "this quest is
    // impossible outdoors".
    for (const quest of poolOf(packNamed('pack_home_all_day'))) {
      expect(
        quest.locations.includes('home') || quest.locations.includes('anywhere'),
        quest.id,
      ).toBe(true);
      expect(quest.contentTags, quest.id).not.toContain('outdoors');
      expect(quest.contentTags, quest.id).not.toContain('errand');
    }
  });

  it('UT UR HUSET only offers quests that take you outside, and none that cost money', () => {
    const pool = poolOf(packNamed('pack_get_out'));
    expect(pool.length).toBeGreaterThan(50);
    for (const quest of pool) {
      expect(quest.locations, quest.id).toContain('outside');
      expect(quest.contentTags, quest.id).toContain('no-money');
    }
  });

  it('REGNIG DAG never requires going outdoors', () => {
    for (const quest of poolOf(packNamed('pack_rainy_day'))) {
      expect(
        quest.locations.includes('home') || quest.locations.includes('anywhere'),
        quest.id,
      ).toBe(true);
      expect(quest.contentTags, quest.id).not.toContain('outdoors');
      expect(quest.contentTags, quest.id).not.toContain('errand');
    }
  });

  it('KVÄLLSLÄGE stays in and never demands high energy', () => {
    for (const quest of poolOf(packNamed('pack_evening'))) {
      expect(quest.energy, quest.id).not.toBe('high');
      expect(
        quest.locations.includes('home') || quest.locations.includes('anywhere'),
        quest.id,
      ).toBe(true);
      expect(quest.contentTags, quest.id).not.toContain('outdoors');
    }
  });

  it('STÄDRÄD offers only tidying families, at every scale', () => {
    const pool = poolOf(packNamed('pack_cleaning_raid'));
    const allowed = new Set(['cleaning', 'decluttering', 'organization', 'home']);
    for (const quest of pool) expect(allowed.has(quest.category), quest.id).toBe(true);
    // Very small and very large jobs both need to be reachable.
    for (const duration of [5, 15, 30, 60]) {
      expect(pool.filter((quest) => quest.duration === duration).length, `${duration}m`)
        .toBeGreaterThan(5);
    }
  });

  it('NÅGOT SOCIALT only offers quests involving people', () => {
    for (const quest of poolOf(packNamed('pack_social'))) {
      expect(quest.contentTags, quest.id).toContain('social');
    }
  });

  it('RENSA HUVUDET keeps the player off screens', () => {
    for (const quest of poolOf(packNamed('pack_clear_head'))) {
      expect(quest.contentTags, quest.id).not.toContain('screen');
      expect(quest.duration, quest.id).toBeLessThanOrEqual(30);
    }
  });

  it('GE MIG ENERGI never offers a seated quest or a low-energy one', () => {
    for (const quest of poolOf(packNamed('pack_energy'))) {
      expect(quest.energy, quest.id).not.toBe('low');
      expect(quest.contentTags, quest.id).not.toContain('seated');
    }
  });

  it('MINIÄVENTYR keeps chores out', () => {
    for (const quest of poolOf(packNamed('pack_mini_adventure'))) {
      expect(quest.contentTags, quest.id).not.toContain('cleaning');
      expect(quest.contentTags, quest.id).not.toContain('admin');
    }
  });

  it('KREATIV KICK only offers making and learning', () => {
    const allowed = new Set(['creative', 'learning', 'miniadventure', 'food']);
    for (const quest of poolOf(packNamed('pack_creative'))) {
      expect(allowed.has(quest.category), quest.id).toBe(true);
    }
  });

  it('SÖNDAGSRESET is about resetting, not five-minute snacks', () => {
    for (const quest of poolOf(packNamed('pack_sunday_reset'))) {
      expect(quest.duration, quest.id).toBeGreaterThanOrEqual(15);
    }
  });
});

/* ------------------------------------------------------------------ */
/* BOSS RUSH                                                           */
/* ------------------------------------------------------------------ */

describe('BOSS RUSH follows the weekly boss', () => {
  const rush = ACTIVITY_PACKS.find((pack) => pack.dynamic === 'boss-weakness')!;

  it('only offers quests the current boss is actually weak to', () => {
    for (const boss of BOSSES) {
      for (const quest of packPool(rush, { ...CONTEXT, boss })) {
        expect(boss.weaknessCategories, `${boss.id}/${quest.id}`).toContain(quest.category);
      }
    }
  });

  it('changes with the boss rather than staying still', () => {
    const first = new Set(packPool(rush, { ...CONTEXT, boss: BOSSES[0] }).map((q) => q.id));
    const other = BOSSES.find(
      (boss) => !boss.weaknessCategories.some((c) => BOSSES[0].weaknessCategories.includes(c)),
    );
    if (!other) return;
    const second = new Set(packPool(rush, { ...CONTEXT, boss: other }).map((q) => q.id));
    expect(first).not.toEqual(second);
  });

  it('offers nothing at all when there is no boss', () => {
    expect(packPool(rush, { ...CONTEXT, boss: undefined })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Rolling                                                             */
/* ------------------------------------------------------------------ */

describe('rolling from a pack', () => {
  it('produces the same three tiers as the manual path', () => {
    for (const pack of STANDARD_PACKS) {
      const result = rollFromPack({
        pack,
        save: veteran(),
        rng: createRng(`roll-${pack.id}`),
        now: new Date('2026-09-09T12:00:00'),
      });

      expect(result.empty, pack.id).toBe(false);
      expect(result.offers.map((offer) => offer.tier)).toEqual(['safe', 'wild', 'dangerous']);
      expect(result.packId).toBe(pack.id);
      expect(result.packPoolSize).toBeGreaterThan(0);
    }
  });

  it('never offers a quest outside the pack, over many rolls', () => {
    for (const pack of STANDARD_PACKS) {
      const allowed = new Set(poolOf(pack).map((quest) => quest.id));
      for (let i = 0; i < 20; i += 1) {
        const result = rollFromPack({
          pack,
          save: veteran(),
          rng: createRng(`${pack.id}-${i}`),
          now: new Date('2026-09-09T12:00:00'),
        });
        for (const offer of result.offers) {
          expect(allowed.has(offer.quest.id), `${pack.id} offered ${offer.quest.id}`).toBe(true);
        }
      }
    }
  });

  it('keeps the pack constraints even when the player dislikes everything', () => {
    const save: RogueDaySave = {
      ...veteran(),
      feedback: {
        scores: Object.fromEntries(QUESTS.map((quest) => [quest.category, -5])),
        quests: {},
        up: 0,
        down: 99,
      },
    };

    const pack = packNamed('pack_five_minutes');
    for (let i = 0; i < 15; i += 1) {
      const result = rollFromPack({ pack, save, rng: createRng(`hate-${i}`) });
      for (const offer of result.offers) expect(offer.quest.duration).toBe(5);
    }
  });

  it('keeps the pack constraints even with a full recent-quest memory', () => {
    const pack = packNamed('pack_exhausted');
    const save: RogueDaySave = {
      ...veteran(),
      recentQuestIds: poolOf(pack).map((quest) => quest.id),
    };

    const result = rollFromPack({ pack, save, rng: createRng('saturated') });
    expect(result.empty).toBe(false);
    for (const offer of result.offers) {
      expect(offer.quest.energy).toBe('low');
      expect(offer.quest.duration).toBeLessThanOrEqual(15);
    }
  });

  it('leans on its preferred categories without excluding the rest', () => {
    const pack = packNamed('pack_clear_head');
    const seen = new Map<string, number>();

    for (let i = 0; i < 120; i += 1) {
      const result = rollFromPack({ pack, save: veteran(), rng: createRng(`lean-${i}`) });
      for (const offer of result.offers) {
        seen.set(offer.quest.category, (seen.get(offer.quest.category) ?? 0) + 1);
      }
    }

    // The preferred families should be well represented...
    const preferred = pack.preferredCategories.reduce(
      (sum, category) => sum + (seen.get(category) ?? 0),
      0,
    );
    expect(preferred).toBeGreaterThan(0);
    // ...but the pack must still show variety rather than one category.
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe('packFilters', () => {
  it('is never narrower than the pack it describes', () => {
    for (const pack of ACTIVITY_PACKS) {
      const filters = packFilters(pack, 'motivated');
      expect(filters.duration, pack.id).toBe(Math.max(...pack.allowedDurations));
      for (const duration of pack.allowedDurations) {
        expect(duration, pack.id).toBeLessThanOrEqual(filters.duration);
      }
      expect(filters.mode === 'normal' || filters.mode === 'chaos').toBe(true);
    }
  });

  it('only pins a location when the pack allows exactly one', () => {
    expect(packFilters(packNamed('pack_get_out'), 'bored').location).toBe('outside');
    expect(packFilters(packNamed('pack_home_all_day'), 'bored').location).toBe('anywhere');
  });
});

describe('preference weighting', () => {
  it('never drops below one, so a preference can only lift', () => {
    for (const pack of ACTIVITY_PACKS) {
      for (const quest of QUESTS.slice(0, 200)) {
        expect(packPreferenceWeight(quest, pack), `${pack.id}/${quest.id}`).toBeGreaterThanOrEqual(
          1,
        );
      }
    }
  });

  it('lifts a quest that matches the pack over one that does not', () => {
    const pack = packNamed('pack_creative');
    const creative = QUESTS.find(
      (quest) => quest.category === 'creative' && quest.contentTags.includes('creative'),
    )!;
    const other = QUESTS.find((quest) => quest.category === 'adulting')!;
    expect(packPreferenceWeight(creative, pack)).toBeGreaterThan(
      packPreferenceWeight(other, pack),
    );
  });
});

/* ------------------------------------------------------------------ */
/* SURPRISE ME                                                         */
/* ------------------------------------------------------------------ */

describe('ÖVERRASKA MIG', () => {
  it('never hands out an hour unless the player asked for it', () => {
    const pack = surprisePack(false);
    expect(pack.allowedDurations).toEqual(SURPRISE_DURATIONS);

    for (let i = 0; i < 60; i += 1) {
      const result = rollFromPack({ pack, save: veteran(), rng: createRng(`surprise-${i}`) });
      for (const offer of result.offers) {
        expect(offer.quest.duration, offer.quest.id).toBeLessThanOrEqual(30);
      }
    }
  });

  it('allows long quests once the player turns them on', () => {
    expect(surprisePack(true).allowedDurations).toContain(60);
  });

  it('still produces the ordinary three choices', () => {
    const result = rollFromPack({
      pack: surprisePack(false),
      save: veteran(),
      rng: createRng('surprise-tiers'),
    });
    expect(result.offers.map((offer) => offer.tier)).toEqual(['safe', 'wild', 'dangerous']);
  });

  it('spreads across categories rather than repeating one', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const result = rollFromPack({
        pack: surprisePack(false),
        save: veteran(),
        rng: createRng(`variety-${i}`),
      });
      for (const offer of result.offers) seen.add(offer.quest.category);
    }
    expect(seen.size).toBeGreaterThanOrEqual(12);
  });
});

/* ------------------------------------------------------------------ */
/* DAGENS LÄGE                                                         */
/* ------------------------------------------------------------------ */

describe('DAGENS LÄGE', () => {
  it('is the same pack every time for the same day', () => {
    expect(getDailyPack('2026-09-09').id).toBe(getDailyPack('2026-09-09').id);
  });

  it('changes across the year rather than sticking to one pack', () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 60; day += 1) {
      seen.add(getDailyPack(`2026-04-${String(day % 30 || 1).padStart(2, '0')}`).id);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('never picks the pack whose pool can be empty', () => {
    for (let day = 1; day <= 28; day += 1) {
      const pack = getDailyPack(`2026-05-${String(day).padStart(2, '0')}`);
      expect(pack.dynamic, pack.id).toBeUndefined();
    }
  });

  it('offers its bonus once, and only through today’s pack', () => {
    const packs = createDefaultSave('X').packs;
    const today = '2026-09-09';
    const daily = getDailyPack(today);
    const other = ACTIVITY_PACKS.find((pack) => pack.id !== daily.id)!;

    expect(dailyPackBonusAvailable(packs, today)).toBe(true);
    expect(qualifiesForDailyBonus(packs, daily.id, today)).toBe(true);
    expect(qualifiesForDailyBonus(packs, other.id, today)).toBe(false);
    expect(qualifiesForDailyBonus(packs, null, today)).toBe(false);

    const claimed = { ...packs, dailyBonusClaimedOn: today };
    expect(dailyPackBonusAvailable(claimed, today)).toBe(false);
    expect(qualifiesForDailyBonus(claimed, daily.id, today)).toBe(false);
    // A new day opens it again.
    expect(qualifiesForDailyBonus(claimed, getDailyPack('2026-09-10').id, '2026-09-10')).toBe(true);
  });

  it('keeps the bonus modest', () => {
    expect(DAILY_PACK_GOLD_BONUS).toBeGreaterThan(0);
    expect(DAILY_PACK_GOLD_BONUS).toBeLessThanOrEqual(0.15);
  });
});

/* ------------------------------------------------------------------ */
/* Favourites, recents, stats                                          */
/* ------------------------------------------------------------------ */

describe('favourites', () => {
  const empty = () => createDefaultSave('X').packs;

  it('adds and removes', () => {
    let packs = toggleFavouritePack(empty(), 'pack_exhausted');
    expect(isFavouritePack(packs, 'pack_exhausted')).toBe(true);
    packs = toggleFavouritePack(packs, 'pack_exhausted');
    expect(isFavouritePack(packs, 'pack_exhausted')).toBe(false);
  });

  it('stops at the limit rather than silently dropping one', () => {
    let packs = empty();
    for (const pack of ACTIVITY_PACKS.slice(0, FAVOURITE_PACK_LIMIT + 3)) {
      packs = toggleFavouritePack(packs, pack.id);
    }
    expect(packs.favourites).toHaveLength(FAVOURITE_PACK_LIMIT);
    expect(favouritesFull(packs)).toBe(true);
  });

  it('ignores a pack that does not exist', () => {
    const packs = empty();
    expect(toggleFavouritePack(packs, 'pack_nonexistent')).toBe(packs);
  });

  it('puts favourites first in the hub order', () => {
    const packs = toggleFavouritePack(empty(), 'pack_free_fun');
    expect(orderedPacks(packs, 1)[0].id).toBe('pack_free_fun');
  });

  it('keeps the rest in their declared order', () => {
    const ordered = orderedPacks(empty(), 50);
    const orders = ordered.map((pack) => pack.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

describe('recents', () => {
  const empty = () => createDefaultSave('X').packs;

  it('remembers the most recent first, without duplicates', () => {
    let packs = rememberPack(empty(), 'pack_exhausted');
    packs = rememberPack(packs, 'pack_energy');
    packs = rememberPack(packs, 'pack_exhausted');
    expect(packs.recent).toEqual(['pack_exhausted', 'pack_energy']);
  });

  it('never remembers more than the limit', () => {
    let packs = empty();
    for (const pack of ACTIVITY_PACKS) packs = rememberPack(packs, pack.id);
    expect(packs.recent).toHaveLength(RECENT_PACK_LIMIT);
  });

  it('resolves to real packs', () => {
    const packs = rememberPack(empty(), 'pack_social');
    expect(recentPacks(packs).map((pack) => pack.id)).toEqual(['pack_social']);
  });
});

describe('pack stats', () => {
  it('starts empty', () => {
    const stats = packStats(createDefaultSave('X').packs);
    expect(stats.totalCompletions).toBe(0);
    expect(stats.distinctPacks).toBe(0);
    expect(stats.mostUsed).toBeNull();
  });

  it('counts completions, distinct packs and the most used one', () => {
    let packs = createDefaultSave('X').packs;
    packs = recordPackCompletion(packs, 'pack_energy', false);
    packs = recordPackCompletion(packs, 'pack_energy', false);
    packs = recordPackCompletion(packs, 'pack_social', true);

    const stats = packStats(packs);
    expect(stats.totalCompletions).toBe(3);
    expect(stats.distinctPacks).toBe(2);
    expect(stats.dailyPackCompletions).toBe(1);
    expect(stats.mostUsed?.pack.id).toBe('pack_energy');
    expect(stats.mostUsed?.count).toBe(2);
  });

  it('ignores a completion with no pack behind it', () => {
    const packs = createDefaultSave('X').packs;
    expect(recordPackCompletion(packs, null, false)).toBe(packs);
  });
});

describe('matchesPack', () => {
  it('rejects a quest the pack forbids, whatever else is true about it', () => {
    const pack = packNamed('pack_five_minutes');
    const long = QUESTS.find((quest) => quest.duration === 60 && !quest.chainId)!;
    expect(matchesPack(long, pack, CONTEXT)).toBe(false);
  });
});
