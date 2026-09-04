import { describe, expect, it } from 'vitest';
import { LOOT_ITEMS, LOOT_BY_ID } from '@/data/loot';
import { GAME_EVENTS } from '@/data/events';
import { createRng } from '@/utils/rng';
import {
  addItem,
  addItems,
  consumeBuffs,
  countItem,
  hasItem,
  openChest,
  removeItem,
  rollLootChance,
  rollQuestLoot,
} from './loot';
import { maybeTriggerEvent, resolveEvent, useInventoryItem } from './events';
import { ALWAYS_RNG, makeSave, NO_LUCK_RNG } from '@/test/helpers';

describe('loot catalogue', () => {
  it('defines every documented item', () => {
    for (const id of [
      'reroll_token',
      'streak_shield',
      'lucky_coin',
      'xp_elixir',
      'boss_key',
      'mystery_chest',
      'epic_chest',
      'legendary_chest',
    ]) {
      expect(LOOT_BY_ID[id as keyof typeof LOOT_BY_ID], id).toBeDefined();
    }
  });

  it('gives every item complete data', () => {
    for (const item of LOOT_ITEMS) {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(5);
      expect(item.icon).toBeTruthy();
    }
  });
});

describe('drop chances', () => {
  it('rises with rarity', () => {
    const chances = (['common', 'uncommon', 'rare', 'epic', 'legendary'] as const).map((rarity) =>
      rollLootChance(rarity, false),
    );

    for (let index = 1; index < chances.length; index += 1) {
      expect(chances[index]).toBeGreaterThan(chances[index - 1]);
    }
    expect(chances[4]).toBe(1);
  });

  it('a lucky coin improves the odds but never exceeds one', () => {
    expect(rollLootChance('common', true)).toBeGreaterThan(rollLootChance('common', false));
    expect(rollLootChance('legendary', true)).toBe(1);
  });

  it('returns an item when the roll succeeds and nothing when it fails', () => {
    expect(rollQuestLoot('common', false, ALWAYS_RNG).items.length).toBe(1);
    expect(rollQuestLoot('common', false, NO_LUCK_RNG).items).toEqual([]);
  });

  it('drops land within the documented table over many rolls', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 400; seed += 1) {
      const result = rollQuestLoot('legendary', true, createRng(`drop-${seed}`));
      result.items.forEach((item) => seen.add(item));
    }

    expect(seen.size).toBeGreaterThan(4);
    for (const item of seen) {
      expect(LOOT_BY_ID[item as keyof typeof LOOT_BY_ID]).toBeDefined();
    }
  });
});

describe('chests', () => {
  it('a gold pouch yields gold, not items', () => {
    const result = openChest('gold_pouch', createRng('pouch'));
    expect(result.items).toEqual([]);
    expect(result.gold).toBeGreaterThan(0);
  });

  it('a mystery chest yields one item', () => {
    expect(openChest('mystery_chest', createRng('m')).items).toHaveLength(1);
  });

  it('an epic chest yields two items', () => {
    expect(openChest('epic_chest', createRng('e')).items).toHaveLength(2);
  });

  it('a legendary chest yields three items and gold', () => {
    const result = openChest('legendary_chest', createRng('l'));
    expect(result.items).toHaveLength(3);
    expect(result.gold).toBeGreaterThan(0);
  });

  it('chests never contain other chests', () => {
    for (const chestId of ['mystery_chest', 'epic_chest', 'legendary_chest'] as const) {
      for (let seed = 0; seed < 60; seed += 1) {
        const result = openChest(chestId, createRng(`${chestId}-${seed}`));
        for (const item of result.items) {
          expect(LOOT_BY_ID[item].isChest, `${chestId} -> ${item}`).toBe(false);
        }
      }
    }
  });
});

describe('inventory', () => {
  it('adds, stacks, counts and removes', () => {
    let inventory = addItem([], 'reroll_token');
    expect(countItem(inventory, 'reroll_token')).toBe(1);

    inventory = addItem(inventory, 'reroll_token', 2);
    expect(countItem(inventory, 'reroll_token')).toBe(3);
    expect(inventory).toHaveLength(1);

    inventory = removeItem(inventory, 'reroll_token', 1);
    expect(countItem(inventory, 'reroll_token')).toBe(2);

    inventory = removeItem(inventory, 'reroll_token', 5);
    expect(inventory).toHaveLength(0);
    expect(hasItem(inventory, 'reroll_token')).toBe(false);
  });

  it('adds several items at once', () => {
    const inventory = addItems([], ['reroll_token', 'reroll_token', 'xp_elixir']);
    expect(countItem(inventory, 'reroll_token')).toBe(2);
    expect(countItem(inventory, 'xp_elixir')).toBe(1);
  });

  it('never mutates the input array', () => {
    const original = [{ itemId: 'reroll_token' as const, count: 1 }];
    addItem(original, 'reroll_token');
    expect(original[0].count).toBe(1);
  });
});

describe('buffs', () => {
  it('one-shot buffs clear and the shrine counter decrements', () => {
    const consumed = consumeBuffs({
      xpElixir: true,
      luckyCoin: true,
      bossKey: true,
      focusRune: true,
      shrineXpBonusQuests: 3,
    });

    expect(consumed.xpElixir).toBe(false);
    expect(consumed.luckyCoin).toBe(false);
    expect(consumed.bossKey).toBe(false);
    expect(consumed.focusRune).toBe(false);
    expect(consumed.shrineXpBonusQuests).toBe(2);
  });

  it('the shrine counter never goes negative', () => {
    const consumed = consumeBuffs({
      xpElixir: false,
      luckyCoin: false,
      bossKey: false,
      focusRune: false,
      shrineXpBonusQuests: 0,
    });
    expect(consumed.shrineXpBonusQuests).toBe(0);
  });
});

describe('using items', () => {
  it('activates a buff and consumes the item', () => {
    const save = makeSave();
    save.inventory = [{ itemId: 'xp_elixir', count: 2 }];

    const result = useInventoryItem(save, 'xp_elixir', createRng('use'));

    expect(result.save.buffs.xpElixir).toBe(true);
    expect(countItem(result.save.inventory, 'xp_elixir')).toBe(1);
  });

  it('opens a chest into its contents', () => {
    const save = makeSave();
    save.inventory = [{ itemId: 'mystery_chest', count: 1 }];

    const result = useInventoryItem(save, 'mystery_chest', createRng('chest'));

    expect(countItem(result.save.inventory, 'mystery_chest')).toBe(0);
    expect(result.itemsGained.length).toBe(1);
    expect(result.save.statistics.lootFound).toBe(1);
  });

  it('refuses when the item is not owned', () => {
    const save = makeSave();
    const result = useInventoryItem(save, 'xp_elixir', createRng('none'));

    expect(result.save).toBe(save);
    expect(result.messages[0]).toContain('inget sådant');
  });

  it('refuses non-usable items', () => {
    const save = makeSave();
    save.inventory = [{ itemId: 'reroll_token', count: 1 }];

    const result = useInventoryItem(save, 'reroll_token', createRng('n'));
    expect(result.save).toBe(save);
    expect(countItem(save.inventory, 'reroll_token')).toBe(1);
  });
});

describe('random events', () => {
  it('every event has choices and complete copy', () => {
    for (const event of GAME_EVENTS) {
      expect(event.title.length).toBeGreaterThan(3);
      expect(event.description.length).toBeGreaterThan(10);
      expect(event.choices.length).toBeGreaterThan(0);
      expect(event.weight).toBeGreaterThan(0);
    }
  });

  it('fires only sometimes', () => {
    const save = makeSave();
    expect(maybeTriggerEvent(save, new Date(), NO_LUCK_RNG)).toBeNull();
    expect(maybeTriggerEvent(save, new Date(), ALWAYS_RNG)).not.toBeNull();
  });

  it('the goblin tax never takes more gold than the player has', () => {
    const save = makeSave();
    save.progression.gold = 2;

    for (let seed = 0; seed < 40; seed += 1) {
      const event = maybeTriggerEvent(save, new Date(), {
        ...ALWAYS_RNG,
        int: (_min: number, max: number) => max,
      });
      if (event?.eventId !== 'goblin_tax') continue;
      expect(Number(event.payload.amount)).toBeLessThanOrEqual(2);
    }
  });

  it('refusing the goblin costs nothing', () => {
    const save = makeSave();
    save.progression.gold = 100;

    const event = { eventId: 'goblin_tax' as const, payload: { amount: 10 }, createdAt: '' };
    const outcome = resolveEvent(save, event, 'refuse', createRng('r'));

    expect(outcome.save.progression.gold).toBe(100);
    expect(outcome.goldDelta).toBe(0);
  });

  it('paying the goblin costs exactly the stated amount', () => {
    const save = makeSave();
    save.progression.gold = 100;

    const event = { eventId: 'goblin_tax' as const, payload: { amount: 10 }, createdAt: '' };
    const outcome = resolveEvent(save, event, 'pay', createRng('p'));

    expect(outcome.save.progression.gold).toBe(90);
  });

  it('the merchant refuses the sale when the player cannot pay', () => {
    const save = makeSave();
    save.progression.gold = 5;

    const event = {
      eventId: 'wandering_merchant' as const,
      payload: { itemId: 'xp_elixir', price: 50, discount: 40 },
      createdAt: '',
    };
    const outcome = resolveEvent(save, event, 'buy', createRng('b'));

    expect(outcome.save.progression.gold).toBe(5);
    expect(outcome.itemsGained).toEqual([]);
    expect(outcome.messages[0]).toContain('inte råd');
  });

  it('the merchant sells when the player can pay', () => {
    const save = makeSave();
    save.progression.gold = 80;

    const event = {
      eventId: 'wandering_merchant' as const,
      payload: { itemId: 'xp_elixir', price: 50, discount: 40 },
      createdAt: '',
    };
    const outcome = resolveEvent(save, event, 'buy', createRng('b'));

    expect(outcome.save.progression.gold).toBe(30);
    expect(outcome.itemsGained).toEqual(['xp_elixir']);
    expect(outcome.save.statistics.totalGoldSpent).toBe(50);
  });

  it('the shrine grants an XP bonus for a cost', () => {
    const save = makeSave();
    save.progression.gold = 100;

    const event = {
      eventId: 'ancient_shrine' as const,
      payload: { cost: 30, quests: 3 },
      createdAt: '',
    };
    const outcome = resolveEvent(save, event, 'offer', createRng('s'));

    expect(outcome.save.progression.gold).toBe(70);
    expect(outcome.save.buffs.shrineXpBonusQuests).toBe(3);
  });

  it('the lucky drop always gives something', () => {
    const save = makeSave();
    const event = {
      eventId: 'lucky_drop' as const,
      payload: { chestId: 'mystery_chest' },
      createdAt: '',
    };
    const outcome = resolveEvent(save, event, 'take', createRng('d'));

    expect(outcome.itemsGained.length + outcome.goldDelta).toBeGreaterThan(0);
  });

  it('double or nothing only ever adds', () => {
    const save = makeSave();
    const before = save.progression.gold;

    const event = {
      eventId: 'double_or_nothing' as const,
      payload: { bonusGold: 30, bonusXp: 60 },
      createdAt: '',
    };

    const accepted = resolveEvent(save, event, 'accept', createRng('a'));
    expect(accepted.save.progression.gold).toBe(before + 30);
    expect(accepted.xpDelta).toBe(60);

    const declined = resolveEvent(save, event, 'decline', createRng('a'));
    expect(declined.save.progression.gold).toBe(before);
  });

  it('records the event in the statistics', () => {
    const save = makeSave();
    const event = { eventId: 'goblin_tax' as const, payload: { amount: 5 }, createdAt: '' };
    const outcome = resolveEvent(save, event, 'refuse', createRng('x'));

    expect(outcome.save.statistics.eventsTriggered).toBe(1);
  });

  it('no event branch can take the player below zero gold', () => {
    for (const event of GAME_EVENTS) {
      for (const choice of event.choices) {
        const save = makeSave();
        save.progression.gold = 0;

        const pending = maybeTriggerEvent(save, new Date(), ALWAYS_RNG);
        const payload = pending?.eventId === event.id ? pending.payload : { amount: 5, cost: 5, price: 5 };

        const outcome = resolveEvent(
          save,
          { eventId: event.id, payload, createdAt: '' },
          choice.id,
          createRng('safety'),
        );

        expect(outcome.save.progression.gold, `${event.id}/${choice.id}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
