import { describe, expect, it } from 'vitest';
import type { RogueDaySave } from '@/types';
import { getQuestById } from '@/data/quests';
import { CHAIN_BY_ID } from '@/data/chains';
import { getBossById } from '@/data/bosses';
import { abandonQuest, completeQuest } from './completion';
import { getRerollAvailability } from './questSelection';
import { ALWAYS_RNG, makeOffer, makeSave, NO_LUCK_RNG } from '@/test/helpers';

const AT = new Date('2026-09-04T14:00:00');

describe('completeQuest rewards', () => {
  it('grants the offer XP and gold', () => {
    const save = makeSave();
    const offer = makeOffer('digi_inbox_raid');
    const { save: next, reward } = completeQuest(save, offer, AT, NO_LUCK_RNG);

    expect(reward.xp).toBe(offer.xp);
    expect(reward.gold).toBe(offer.gold);
    expect(next.progression.totalXp).toBe(offer.xp);
    expect(next.progression.gold).toBeGreaterThanOrEqual(offer.gold);
  });

  it('appends a complete history record', () => {
    const save = makeSave();
    const offer = makeOffer('home_dish_mountain');
    const { save: next } = completeQuest(save, offer, AT, NO_LUCK_RNG);

    expect(next.history).toHaveLength(1);
    const entry = next.history[0];

    expect(entry.questId).toBe('home_dish_mountain');
    expect(entry.title).toBe(offer.quest.title);
    expect(entry.category).toBe(offer.quest.category);
    expect(entry.rarity).toBe(offer.rarity);
    expect(entry.difficulty).toBe(offer.quest.difficulty);
    expect(entry.duration).toBe(offer.quest.duration);
    expect(entry.xpEarned).toBe(offer.xp);
    expect(entry.goldEarned).toBe(offer.gold);
    expect(entry.bossDamage).toBeGreaterThan(0);
    expect(entry.completedDate).toBe('2026-09-04');
    expect(entry.entryId).toBeTruthy();
  });

  it('puts the newest history record first', () => {
    let save = makeSave();
    save = completeQuest(save, makeOffer('home_bed_fortress'), AT, NO_LUCK_RNG).save;
    save = completeQuest(save, makeOffer('home_trash_run'), AT, NO_LUCK_RNG).save;

    expect(save.history[0].questId).toBe('home_trash_run');
    expect(save.history[1].questId).toBe('home_bed_fortress');
  });

  it('clears the active quest', () => {
    const save = makeSave();
    const offer = makeOffer('home_bed_fortress');
    save.activeQuest = { offer, acceptedAt: AT.toISOString() };

    const { save: next } = completeQuest(save, offer, AT, NO_LUCK_RNG);
    expect(next.activeQuest).toBeNull();
  });

  it('updates every statistic', () => {
    const save = makeSave();
    const offer = makeOffer('digi_inbox_raid');
    const { save: next } = completeQuest(save, offer, AT, NO_LUCK_RNG);
    const stats = next.statistics;

    expect(stats.questsCompleted).toBe(1);
    expect(stats.questsByCategory.digital).toBe(1);
    expect(stats.questsByRarity[offer.rarity]).toBe(1);
    expect(stats.questsByDuration['15']).toBe(1);
    expect(stats.totalMinutes).toBe(15);
    expect(stats.totalXpEarned).toBeGreaterThanOrEqual(offer.xp);
    expect(stats.totalBossDamage).toBeGreaterThan(0);
    expect(stats.completionDates['2026-09-04']).toBe(1);
  });

  it('counts several completions on the same day', () => {
    let save = makeSave();
    save = completeQuest(save, makeOffer('home_bed_fortress'), AT, NO_LUCK_RNG).save;
    save = completeQuest(save, makeOffer('home_trash_run'), AT, NO_LUCK_RNG).save;
    save = completeQuest(save, makeOffer('home_towel_swap'), AT, NO_LUCK_RNG).save;

    expect(save.statistics.completionDates['2026-09-04']).toBe(3);
    expect(save.statistics.questsCompleted).toBe(3);
  });

  it('applies daily bonus rewards', () => {
    const save = makeSave();
    const plain = makeOffer('home_dish_mountain');
    const daily = makeOffer('home_dish_mountain', { isDaily: true });

    const plainResult = completeQuest(save, plain, AT, NO_LUCK_RNG);
    const dailyResult = completeQuest(save, daily, AT, NO_LUCK_RNG);

    expect(dailyResult.reward.xp).toBeGreaterThan(plainResult.reward.xp);
    expect(dailyResult.reward.dailyBonus).toBe(true);
    expect(dailyResult.save.daily.completed).toBe(true);
    expect(dailyResult.save.statistics.dailyQuestsCompleted).toBe(1);
  });

  it('flags chaos completions', () => {
    const save = makeSave();
    const offer = makeOffer('home_dish_mountain', {
      modifier: {
        id: 'cursed',
        name: 'FÖRBANNAT',
        description: 'Utan att sätta dig.',
        rewardMultiplier: 1.3,
      },
    });

    const { save: next } = completeQuest(save, offer, AT, NO_LUCK_RNG);

    expect(next.history[0].mode).toBe('chaos');
    expect(next.statistics.chaosQuests).toBe(1);
  });

  it('counts epic and legendary completions separately', () => {
    let save = makeSave();
    save = completeQuest(save, makeOffer('home_bed_fortress', { rarity: 'epic' }), AT, NO_LUCK_RNG)
      .save;
    save = completeQuest(
      save,
      makeOffer('home_trash_run', { rarity: 'legendary' }),
      AT,
      NO_LUCK_RNG,
    ).save;

    expect(save.statistics.epicQuests).toBe(1);
    expect(save.statistics.legendaryQuests).toBe(1);
    expect(save.statistics.questsByRarity.epic).toBe(1);
    expect(save.statistics.questsByRarity.legendary).toBe(1);
  });
});

describe('completeQuest boss interaction', () => {
  it('damages the weekly boss', () => {
    const save = makeSave();
    const startingHp = save.boss!.currentHp;
    // A category the test week's boss is neutral to, so the base damage lands
    // unmodified. Weakness scaling has its own tests below.
    const offer = makeOffer('digi_inbox_raid');
    const boss = getBossById(save.boss!.bossId)!;
    expect(boss.weaknessCategories).not.toContain('digital');
    expect(boss.resistanceCategories).not.toContain('digital');

    const { save: next, reward } = completeQuest(save, offer, AT, NO_LUCK_RNG);

    expect(reward.bossDamage).toBe(offer.bossDamage);
    expect(next.boss!.currentHp).toBe(startingHp - offer.bossDamage);
    expect(next.boss!.questsContributed).toBe(1);
  });

  it('doubles damage with a boss key', () => {
    const save = makeSave();
    save.buffs.bossKey = true;
    const offer = makeOffer('digi_inbox_raid');

    const { reward } = completeQuest(save, offer, AT, NO_LUCK_RNG);
    expect(reward.bossDamage).toBe(offer.bossDamage * 2);
  });

  it('a quest in a weakness category hits 25% harder', () => {
    const save = makeSave();
    const boss = getBossById(save.boss!.bossId)!;
    // The week's boss in the test fixture is weak to cleaning.
    expect(boss.weaknessCategories).toContain('cleaning');

    const offer = makeOffer('clean_floor_deep');
    const { reward } = completeQuest(save, offer, AT, NO_LUCK_RNG);

    expect(reward.bossDamage).toBe(Math.round(offer.bossDamage * 1.25));
    expect(reward.boss?.weaknessHit).toBe(true);
    expect(reward.boss?.weaknessMultiplier).toBeCloseTo(1.25, 5);
  });

  it('records a weakness hit in the statistics', () => {
    const save = makeSave();
    const { save: next } = completeQuest(save, makeOffer('clean_floor_deep'), AT, NO_LUCK_RNG);
    expect(next.statistics.weaknessHits).toBe(1);

    const neutral = completeQuest(next, makeOffer('digi_inbox_raid'), AT, NO_LUCK_RNG);
    expect(neutral.save.statistics.weaknessHits).toBe(1);
  });

  it('grants the boss reward and history entry on defeat', () => {
    const save = makeSave();
    save.boss!.currentHp = 10;
    const definition = getBossById(save.boss!.bossId)!;

    const { save: next, reward } = completeQuest(
      save,
      makeOffer('clean_floor_deep'),
      AT,
      NO_LUCK_RNG,
    );

    expect(reward.bossDefeated).toBe(true);
    expect(next.boss!.defeated).toBe(true);
    expect(next.bossHistory).toHaveLength(1);
    expect(next.bossHistory[0].bossId).toBe(definition.id);
    expect(next.bossHistory[0].rewardXp).toBe(definition.reward.xp);
    expect(next.statistics.bossesDefeated).toBe(1);
    // The boss chest is added to the inventory.
    expect(
      next.inventory.some((entry) => entry.itemId === definition.reward.chest),
    ).toBe(true);
  });

  it('does not re-award an already defeated boss', () => {
    let save = makeSave();
    save.boss!.currentHp = 10;
    save = completeQuest(save, makeOffer('clean_floor_deep'), AT, NO_LUCK_RNG).save;

    const second = completeQuest(save, makeOffer('home_trash_run'), AT, NO_LUCK_RNG);

    expect(second.reward.bossDefeated).toBe(false);
    expect(second.save.bossHistory).toHaveLength(1);
    expect(second.save.statistics.bossesDefeated).toBe(1);
  });
});

describe('completeQuest buffs', () => {
  it('the XP elixir adds 25 percent and is consumed', () => {
    const save = makeSave();
    const offer = makeOffer('home_dish_mountain');
    const base = completeQuest(save, offer, AT, NO_LUCK_RNG).reward.xp;

    const buffed = makeSave();
    buffed.buffs.xpElixir = true;
    const result = completeQuest(buffed, offer, AT, NO_LUCK_RNG);

    expect(result.reward.xp).toBe(Math.round(base * 1.25));
    expect(result.save.buffs.xpElixir).toBe(false);
  });

  it('the focus rune adds gold and is consumed', () => {
    const save = makeSave();
    save.buffs.focusRune = true;
    const offer = makeOffer('home_dish_mountain');

    const result = completeQuest(save, offer, AT, NO_LUCK_RNG);

    expect(result.reward.gold).toBe(Math.round(offer.gold * 1.15));
    expect(result.save.buffs.focusRune).toBe(false);
  });

  it('the shrine bonus counts down across quests', () => {
    let save = makeSave();
    save.buffs.shrineXpBonusQuests = 2;

    save = completeQuest(save, makeOffer('home_bed_fortress'), AT, NO_LUCK_RNG).save;
    expect(save.buffs.shrineXpBonusQuests).toBe(1);

    save = completeQuest(save, makeOffer('home_trash_run'), AT, NO_LUCK_RNG).save;
    expect(save.buffs.shrineXpBonusQuests).toBe(0);

    save = completeQuest(save, makeOffer('home_towel_swap'), AT, NO_LUCK_RNG).save;
    expect(save.buffs.shrineXpBonusQuests).toBe(0);
  });
});

describe('completeQuest loot', () => {
  it('finds loot when the roll succeeds', () => {
    const save = makeSave();
    const { save: next, reward } = completeQuest(
      save,
      makeOffer('home_dish_mountain'),
      AT,
      ALWAYS_RNG,
    );

    expect(reward.loot.length).toBeGreaterThan(0);
    expect(next.inventory.length).toBeGreaterThan(0);
    expect(next.statistics.lootFound).toBe(reward.loot.length);
  });

  it('finds nothing when the roll fails', () => {
    const save = makeSave();
    const { reward } = completeQuest(save, makeOffer('home_dish_mountain'), AT, NO_LUCK_RNG);
    expect(reward.loot).toEqual([]);
  });

  it('legendary quests always drop loot', () => {
    const save = makeSave();
    const offer = makeOffer('home_dish_mountain', { rarity: 'legendary' });

    // Even a maximally unlucky RNG: legendary drop chance is 1.0.
    const { reward } = completeQuest(save, offer, AT, {
      ...NO_LUCK_RNG,
      chance: (probability: number) => probability >= 1,
    });

    expect(reward.loot.length).toBeGreaterThan(0);
  });
});

describe('completeQuest chains', () => {
  it('records chain progress step by step', () => {
    let save = makeSave();
    const chain = CHAIN_BY_ID.forgotten_drawer;

    save = completeQuest(save, makeOffer(chain.questIds[0]), AT, NO_LUCK_RNG).save;
    expect(save.questChains.forgotten_drawer.completedSteps).toBe(1);
    expect(save.questChains.forgotten_drawer.completed).toBe(false);

    save = completeQuest(save, makeOffer(chain.questIds[1]), AT, NO_LUCK_RNG).save;
    expect(save.questChains.forgotten_drawer.completedSteps).toBe(2);
  });

  it('grants the chain bonus on the final step', () => {
    let save = makeSave();
    const chain = CHAIN_BY_ID.forgotten_drawer;

    save = completeQuest(save, makeOffer(chain.questIds[0]), AT, NO_LUCK_RNG).save;
    save = completeQuest(save, makeOffer(chain.questIds[1]), AT, NO_LUCK_RNG).save;

    const xpBefore = save.progression.totalXp;
    const final = completeQuest(save, makeOffer(chain.questIds[2]), AT, NO_LUCK_RNG);

    expect(final.reward.chainCompleted?.id).toBe(chain.id);
    expect(final.save.questChains.forgotten_drawer.completed).toBe(true);
    expect(final.save.statistics.chainsCompleted).toBe(1);
    expect(final.save.progression.totalXp).toBeGreaterThanOrEqual(
      xpBefore + chain.bonusXp,
    );
    expect(
      final.save.inventory.some((entry) => entry.itemId === chain.chestReward),
    ).toBe(true);
  });
});

describe('completeQuest achievements', () => {
  it('unlocks FÖRSTA BLODET on the first completion', () => {
    const save = makeSave();
    const { save: next, reward } = completeQuest(
      save,
      makeOffer('home_bed_fortress'),
      AT,
      NO_LUCK_RNG,
    );

    expect(reward.achievements.map((entry) => entry.id)).toContain('first_blood');
    expect(next.achievements.map((entry) => entry.id)).toContain('first_blood');
  });

  it('does not unlock the same achievement twice', () => {
    let save = makeSave();
    save = completeQuest(save, makeOffer('home_bed_fortress'), AT, NO_LUCK_RNG).save;
    const second = completeQuest(save, makeOffer('home_trash_run'), AT, NO_LUCK_RNG);

    expect(second.reward.achievements.map((entry) => entry.id)).not.toContain('first_blood');
    expect(second.save.achievements.filter((entry) => entry.id === 'first_blood')).toHaveLength(1);
  });

  it('pays out achievement rewards into progression', () => {
    const save = makeSave();
    const { save: next, reward } = completeQuest(
      save,
      makeOffer('home_bed_fortress'),
      AT,
      NO_LUCK_RNG,
    );

    const achievementGold = reward.achievements.reduce(
      (sum, achievement) => sum + (achievement.rewardGold ?? 0),
      0,
    );

    expect(next.progression.gold).toBe(reward.gold + achievementGold);
  });
});

describe('abandonQuest', () => {
  it('clears the quest and records the abandonment', () => {
    const save: RogueDaySave = makeSave();
    save.activeQuest = { offer: makeOffer('home_bed_fortress'), acceptedAt: AT.toISOString() };

    const next = abandonQuest(save);

    expect(next.activeQuest).toBeNull();
    expect(next.statistics.questsAbandoned).toBe(1);
    expect(next.history).toHaveLength(0);
    expect(next.progression.totalXp).toBe(0);
  });
});

describe('recent quest memory', () => {
  it('remembers completed quests so they are not immediately re-offered', () => {
    const save = makeSave();
    const { save: next } = completeQuest(save, makeOffer('home_bed_fortress'), AT, NO_LUCK_RNG);

    expect(next.recentQuestIds[0]).toBe('home_bed_fortress');
  });
});

describe('reroll accounting', () => {
  it('a used token is no longer available', () => {
    const save = makeSave();
    save.inventory = [{ itemId: 'reroll_token', count: 1 }];

    expect(getRerollAvailability(save, '2026-09-04').usesToken).toBe(true);

    save.inventory = [];
    save.daily.freeRerollUsedOn = '2026-09-04';
    expect(getRerollAvailability(save, '2026-09-04').canReroll).toBe(false);
  });
});

describe('quest lookups used by completion', () => {
  it('every quest referenced by the tests exists', () => {
    for (const id of [
      'digi_inbox_raid',
      'home_dish_mountain',
      'home_bed_fortress',
      'home_trash_run',
      'clean_floor_deep',
    ]) {
      expect(getQuestById(id), id).toBeDefined();
    }
  });
});
