import { beforeEach, describe, expect, it } from 'vitest';
import type { RogueDaySave } from '@/types';
import { completeQuest } from '@/game/completion';
import { getMarketView, purchaseOffer } from '@/game/market';
import { selectPerk } from '@/game/perks';
import { createTimer } from '@/game/timer';
import { loadGame, saveGame } from '@/persistence/storage';
import { createInitialState } from '@/app/gameStore';
import { makeOffer, makeSave, NO_LUCK_RNG } from './helpers';

/**
 * The regression suite that guards the failure the previous prototype had:
 * progression that vanished on refresh.
 *
 * Every test here destroys the in-memory state completely and rebuilds it the
 * same way a real page load does - through loadGame / createInitialState.
 */
describe('full reload persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('persists complete progression across full reload', () => {
    /* 1. Fresh game. */
    let state: RogueDaySave | null = makeSave(new Date('2026-09-04T10:00:00'));
    const startingBossHp = state.boss?.currentHp ?? 0;
    expect(startingBossHp).toBeGreaterThan(0);

    /* 2. Complete a quest. */
    const first = completeQuest(
      state,
      makeOffer('ad_inbox_raid'),
      new Date('2026-09-04T10:30:00'),
      NO_LUCK_RNG,
    );
    state = first.save;

    const xpAfterFirst = state.progression.totalXp;
    const goldAfterFirst = state.progression.gold;
    const bossHpAfterFirst = state.boss?.currentHp ?? 0;
    const achievementsAfterFirst = state.achievements.length;

    expect(xpAfterFirst).toBeGreaterThan(0);
    expect(bossHpAfterFirst).toBeLessThan(startingBossHp);
    expect(achievementsAfterFirst).toBeGreaterThan(0); // FÖRSTA BLODET

    /* 3. Save. */
    expect(saveGame(state).ok).toBe(true);

    /* 4. Destroy the in-memory state. */
    state = null;

    /* 5. Load from storage, exactly like a page refresh does. */
    const reloadedOnce = loadGame();
    state = reloadedOnce.save;

    expect(reloadedOnce.source).toBe('main');

    /* 6-9. Verify everything survived. */
    expect(state.progression.totalXp).toBe(xpAfterFirst); // XP
    expect(state.progression.gold).toBe(goldAfterFirst); // gold
    expect(state.history).toHaveLength(1); // history
    expect(state.history[0].questId).toBe('ad_inbox_raid');
    expect(state.statistics.questsCompleted).toBe(1); // statistics
    expect(state.statistics.totalMinutes).toBe(15);
    expect(state.boss?.currentHp).toBe(bossHpAfterFirst); // boss HP
    expect(state.achievements).toHaveLength(achievementsAfterFirst); // achievements
    expect(state.streak.current).toBe(1); // streak

    /* 10. Complete a second quest on the loaded state. */
    const second = completeQuest(
      state,
      makeOffer('home_dish_mountain'),
      new Date('2026-09-05T09:00:00'),
      NO_LUCK_RNG,
    );
    state = second.save;

    const xpAfterSecond = state.progression.totalXp;
    const bossHpAfterSecond = state.boss?.currentHp ?? 0;

    expect(xpAfterSecond).toBeGreaterThan(xpAfterFirst);
    expect(bossHpAfterSecond).toBeLessThan(bossHpAfterFirst);

    /* 11. Save again. */
    expect(saveGame(state).ok).toBe(true);

    /* 12. Reload again. */
    state = null;
    const reloadedTwice = loadGame();
    state = reloadedTwice.save;

    /* 13. BOTH history records must still be there. */
    expect(state.history).toHaveLength(2);
    expect(state.history.map((entry) => entry.questId)).toEqual([
      'home_dish_mountain',
      'ad_inbox_raid',
    ]);

    expect(state.progression.totalXp).toBe(xpAfterSecond);
    expect(state.statistics.questsCompleted).toBe(2);
    expect(state.boss?.currentHp).toBe(bossHpAfterSecond);
    expect(state.streak.current).toBe(2);
    expect(state.streak.longest).toBe(2);
  });

  it('survives ten reloads without losing a single record', () => {
    let save = makeSave(new Date('2026-09-04T08:00:00'));
    saveGame(save);

    for (let day = 0; day < 10; day += 1) {
      const reloaded = loadGame();
      save = reloaded.save;

      const result = completeQuest(
        save,
        makeOffer('home_trash_run'),
        new Date(2026, 8, 4 + day, 12, 0, 0),
        NO_LUCK_RNG,
      );
      save = result.save;
      expect(saveGame(save).ok).toBe(true);
    }

    const final = loadGame();

    expect(final.save.history).toHaveLength(10);
    expect(final.save.statistics.questsCompleted).toBe(10);
    expect(final.save.streak.current).toBe(10);
    expect(final.save.streak.longest).toBe(10);
    expect(final.save.progression.totalXp).toBeGreaterThan(0);
  });

  it('createInitialState reads the stored save rather than starting over', () => {
    const save = makeSave(new Date('2026-09-04T10:00:00'));
    const completed = completeQuest(
      save,
      makeOffer('walk_block_loop'),
      new Date('2026-09-04T11:00:00'),
      NO_LUCK_RNG,
    ).save;
    saveGame(completed);

    // This is what the React provider calls on mount.
    const state = createInitialState();

    expect(state.loadSource).toBe('main');
    expect(state.save.history).toHaveLength(1);
    expect(state.save.progression.totalXp).toBe(completed.progression.totalXp);
    expect(state.save.statistics.questsCompleted).toBe(1);
  });

  it('boss damage accumulates correctly across reloads', () => {
    let save = makeSave(new Date('2026-09-07T09:00:00')); // a Monday
    const maxHp = save.boss?.maxHp ?? 0;
    let expectedDamage = 0;

    for (let index = 0; index < 5; index += 1) {
      save = loadGame().save.history.length > 0 || index > 0 ? loadGame().save : save;

      // A boss-neutral quest, so five hits accumulate without killing the
      // rebalanced boss part-way through the loop.
      const offer = makeOffer('ad_inbox_raid');
      const result = completeQuest(
        save,
        offer,
        new Date(2026, 8, 7 + index, 10, 0, 0),
        NO_LUCK_RNG,
      );
      expectedDamage += result.reward.bossDamage;
      save = result.save;
      saveGame(save);
    }

    const final = loadGame().save;

    expect(final.boss?.totalDamage).toBe(expectedDamage);
    expect(final.boss?.currentHp).toBe(maxHp - expectedDamage);
    expect(final.boss?.questsContributed).toBe(5);
    expect(final.statistics.totalBossDamage).toBe(expectedDamage);
  });

  it('achievements keep their unlock timestamps across reloads', () => {
    let save = makeSave(new Date('2026-09-04T10:00:00'));
    save = completeQuest(
      save,
      makeOffer('home_bed_fortress'),
      new Date('2026-09-04T10:05:00'),
      NO_LUCK_RNG,
    ).save;
    saveGame(save);

    const firstUnlock = save.achievements[0];
    expect(firstUnlock).toBeDefined();

    const reloaded = loadGame().save;
    const sameUnlock = reloaded.achievements.find((entry) => entry.id === firstUnlock.id);

    expect(sameUnlock).toBeDefined();
    expect(sameUnlock?.unlockedAt).toBe(firstUnlock.unlockedAt);

    // A second completion must not re-stamp an already-unlocked achievement.
    const later = completeQuest(
      reloaded,
      makeOffer('home_trash_run'),
      new Date('2026-09-05T10:00:00'),
      NO_LUCK_RNG,
    ).save;

    const stillSame = later.achievements.find((entry) => entry.id === firstUnlock.id);
    expect(stillSame?.unlockedAt).toBe(firstUnlock.unlockedAt);
  });

  it('settings and player name survive a reload', () => {
    const save = makeSave();
    save.player.name = 'Kaosriddaren';
    save.settings = {
      sound: true,
      reducedMotion: true,
      animations: false,
      highContrast: true,
    };
    saveGame(save);

    const reloaded = loadGame().save;

    expect(reloaded.player.name).toBe('Kaosriddaren');
    expect(reloaded.settings.sound).toBe(true);
    expect(reloaded.settings.highContrast).toBe(true);
    expect(reloaded.settings.animations).toBe(false);
  });

  it('inventory and quest chain progress survive a reload', () => {
    let save = makeSave(new Date('2026-09-04T10:00:00'));

    save = completeQuest(
      save,
      makeOffer('chain_drawer_1'),
      new Date('2026-09-04T10:10:00'),
      NO_LUCK_RNG,
    ).save;
    save.inventory = [
      { itemId: 'reroll_token', count: 3 },
      { itemId: 'xp_elixir', count: 1 },
    ];
    saveGame(save);

    const reloaded = loadGame().save;

    expect(reloaded.questChains.forgotten_drawer?.completedSteps).toBe(1);
    expect(reloaded.questChains.forgotten_drawer?.completed).toBe(false);
    expect(reloaded.inventory).toHaveLength(2);
    expect(reloaded.inventory.find((entry) => entry.itemId === 'reroll_token')?.count).toBe(3);
  });
});

/**
 * V2 state must survive a reload exactly as v1 state does.
 */
describe('V2 state across a full reload', () => {
  beforeEach(() => window.localStorage.clear());

  it('market purchases survive a reload and cannot be repeated', () => {
    let save: RogueDaySave = makeSave();
    save.progression.gold = 3000;

    const featured = getMarketView(save).offers.find((offer) => offer.featured)!;
    const bought = purchaseOffer(save, featured.offerId);
    expect(bought.ok).toBe(true);
    save = bought.save;

    const goldAfter = save.progression.gold;
    saveGame(save);

    const reloaded = loadGame().save;

    expect(reloaded.progression.gold).toBe(goldAfter);
    expect(reloaded.market.purchased[featured.offerId]).toBe(1);
    expect(reloaded.statistics.marketPurchases).toBe(1);
    expect(
      reloaded.inventory.find((entry) => entry.itemId === featured.itemId)?.count,
    ).toBe(1);

    // The refreshed view still shows it sold out - no infinite restock.
    const view = getMarketView(reloaded).offers.find(
      (offer) => offer.offerId === featured.offerId,
    )!;
    expect(view.soldOut).toBe(true);

    const again = purchaseOffer(reloaded, featured.offerId);
    expect(again.ok).toBe(false);
  });

  it('selected perks survive a reload and keep applying', () => {
    let save: RogueDaySave = makeSave();
    save.progression.level = 10;
    save.perks = selectPerk(save, 'fortune_5').perks;
    save.perks = selectPerk({ ...save, perks: save.perks }, 'slayer_10').perks;

    saveGame(save);
    const reloaded = loadGame().save;

    expect(reloaded.perks.selected).toEqual(['fortune_5', 'slayer_10']);

    // The effect is still live after the reload.
    const plain = makeSave();
    const offer = makeOffer('ad_inbox_raid');
    const withPerk = completeQuest(reloaded, offer, new Date('2026-09-04T12:00:00'), NO_LUCK_RNG);
    const without = completeQuest(plain, offer, new Date('2026-09-04T12:00:00'), NO_LUCK_RNG);

    expect(withPerk.reward.gold).toBeGreaterThan(without.reward.gold);
  });

  it('an active quest keeps its challenge and timer across a reload', () => {
    const save: RogueDaySave = makeSave();
    const offer = {
      ...makeOffer('ad_inbox_raid'),
      challenge: {
        id: 'danger_speed_12',
        name: 'TOLV MINUTER',
        requirement: 'Klara det på 12 minuter.',
        tier: 'dangerous' as const,
        rewardMultiplier: 1.6,
        timerMinutes: 12,
      },
    };

    // Local wall-clock time; the stored stamp is its UTC form.
    const startedAt = new Date('2026-09-04T12:00:00');
    save.activeQuest = {
      offer,
      acceptedAt: startedAt.toISOString(),
      timer: createTimer(12, startedAt),
    };

    saveGame(save);
    const reloaded = loadGame().save;

    expect(reloaded.activeQuest?.offer.challenge?.id).toBe('danger_speed_12');
    expect(reloaded.activeQuest?.offer.challenge?.requirement).toBe(
      'Klara det på 12 minuter.',
    );
    expect(reloaded.activeQuest?.timer?.targetMs).toBe(12 * 60000);
    expect(reloaded.activeQuest?.timer?.runningSince).toBe(startedAt.toISOString());
  });

  it('boss phase history survives a reload so a phase never repeats', () => {
    let save: RogueDaySave = makeSave();
    save.boss = { ...save.boss!, currentHp: Math.floor(save.boss!.maxHp * 0.7) };

    const result = completeQuest(
      save,
      makeOffer('clean_floor_deep'),
      new Date('2026-09-04T12:00:00'),
      NO_LUCK_RNG,
    );
    save = result.save;
    expect(save.boss!.phasesSeen.length).toBeGreaterThan(0);
    const seen = [...save.boss!.phasesSeen];

    saveGame(save);
    const reloaded = loadGame().save;

    expect(reloaded.boss?.phasesSeen).toEqual(seen);

    // The same phase does not fire again after the reload.
    const next = completeQuest(
      reloaded,
      makeOffer('home_trash_run'),
      new Date('2026-09-05T12:00:00'),
      NO_LUCK_RNG,
    );
    for (const phase of next.reward.boss?.phasesTriggered ?? []) {
      expect(seen).not.toContain(phase.threshold);
    }
  });

  it('an event follow-up survives a reload and can still be claimed', () => {
    const save: RogueDaySave = makeSave();
    save.eventFollowUp = {
      id: 'followup_1',
      eventId: 'double_or_nothing',
      title: 'FEM SAKER PÅ PLATS',
      description: 'Lägg tillbaka fem saker.',
      rewardXp: 60,
      rewardGold: 30,
      createdAt: '2026-09-04T12:00:00.000Z',
      expiresOn: '2026-09-05',
    };

    saveGame(save);
    const reloaded = loadGame().save;

    expect(reloaded.eventFollowUp?.title).toBe('FEM SAKER PÅ PLATS');
    expect(reloaded.eventFollowUp?.rewardXp).toBe(60);
  });

  it('the new statistics counters survive a reload', () => {
    let save: RogueDaySave = makeSave();
    save.statistics.marketPurchases = 4;
    save.statistics.timedChallengesWon = 3;
    save.statistics.weaknessHits = 11;
    save.statistics.followUpsCompleted = 2;

    saveGame(save);
    save = loadGame().save;

    expect(save.statistics.marketPurchases).toBe(4);
    expect(save.statistics.timedChallengesWon).toBe(3);
    expect(save.statistics.weaknessHits).toBe(11);
    expect(save.statistics.followUpsCompleted).toBe(2);
  });
});
