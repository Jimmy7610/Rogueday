import type { GameEventDefinition, LootItemId, PendingEvent, RogueDaySave } from '@/types';
import { EVENT_BY_ID, EVENT_TRIGGER_CHANCE, GAME_EVENTS } from '@/data/events';
import { LOOT_BY_ID } from '@/data/loot';
import { randomRng, weightedPick, type Rng } from '@/utils/rng';
import { addItem, openChest, removeItem } from './loot';
import { applyGold, applyXp } from './progression';

/**
 * Random events fire after a completed quest. By design nothing here can
 * seriously hurt the player - the worst outcome is a small gold nibble that
 * can also be refused.
 */
export function maybeTriggerEvent(
  save: RogueDaySave,
  now: Date = new Date(),
  rng: Rng = randomRng,
): PendingEvent | null {
  if (!rng.chance(EVENT_TRIGGER_CHANCE)) return null;

  const definition = weightedPick(
    GAME_EVENTS.map((event) => ({ ...event })),
    rng,
  );

  return {
    eventId: definition.id,
    payload: rollPayload(definition, save, rng),
    createdAt: now.toISOString(),
  };
}

const MERCHANT_STOCK: LootItemId[] = [
  'reroll_token',
  'streak_shield',
  'xp_elixir',
  'boss_key',
  'lucky_coin',
  'focus_rune',
];

function rollPayload(
  definition: GameEventDefinition,
  save: RogueDaySave,
  rng: Rng,
): Record<string, number | string> {
  switch (definition.id) {
    case 'wandering_merchant': {
      const itemId = rng.pick(MERCHANT_STOCK);
      const basePrice = { common: 40, uncommon: 60, rare: 90, epic: 140, legendary: 200 }[
        LOOT_BY_ID[itemId].rarity
      ];
      const discount = rng.int(30, 55);
      const price = Math.max(10, Math.round((basePrice * (100 - discount)) / 100));
      return { itemId, price, discount };
    }
    case 'double_or_nothing':
      return { bonusGold: rng.int(15, 45), bonusXp: rng.int(30, 90) };
    case 'lucky_drop':
      return { chestId: rng.chance(0.15) ? 'epic_chest' : 'mystery_chest' };
    case 'goblin_tax':
      // Never more than a small nibble, and never more than the player has.
      return { amount: Math.min(save.progression.gold, rng.int(3, 12)) };
    case 'mysterious_stranger':
      return {
        left: rng.pick(['lucky_coin', 'focus_rune', 'reroll_token']),
        middle: String(rng.int(25, 70)),
        right: rng.pick(['xp_elixir', 'streak_shield', 'boss_key']),
      };
    case 'ancient_shrine':
      return { cost: Math.min(save.progression.gold, rng.int(20, 45)), quests: 3 };
    default:
      return {};
  }
}

export interface EventOutcome {
  save: RogueDaySave;
  /** Swedish summary lines shown in the event result. */
  messages: string[];
  itemsGained: LootItemId[];
  goldDelta: number;
  xpDelta: number;
}

/** Apply the player's chosen branch of a pending event. */
export function resolveEvent(
  save: RogueDaySave,
  event: PendingEvent,
  choiceId: string,
  rng: Rng = randomRng,
): EventOutcome {
  const messages: string[] = [];
  const itemsGained: LootItemId[] = [];
  let goldDelta = 0;
  let xpDelta = 0;

  let next: RogueDaySave = {
    ...save,
    statistics: { ...save.statistics, eventsTriggered: save.statistics.eventsTriggered + 1 },
  };

  /**
   * Grants an item, ignoring ids that are not in the loot table. A malformed
   * payload (an old pending event, a hand-edited save) must never crash the
   * game - the player simply gets nothing.
   */
  const grantItem = (itemId: LootItemId): void => {
    if (!LOOT_BY_ID[itemId]) {
      messages.push('Handen var tom. Märkligt.');
      return;
    }
    next = { ...next, inventory: addItem(next.inventory, itemId) };
    itemsGained.push(itemId);
    next = {
      ...next,
      statistics: { ...next.statistics, lootFound: next.statistics.lootFound + 1 },
    };
  };

  const grantGold = (amount: number): void => {
    goldDelta += amount;
    next = { ...next, progression: applyGold(next.progression, amount) };
    if (amount > 0) {
      next = {
        ...next,
        statistics: { ...next.statistics, totalGoldEarned: next.statistics.totalGoldEarned + amount },
      };
    } else if (amount < 0) {
      next = {
        ...next,
        statistics: {
          ...next.statistics,
          totalGoldSpent: next.statistics.totalGoldSpent - amount,
        },
      };
    }
  };

  const grantXp = (amount: number): void => {
    xpDelta += amount;
    const result = applyXp(next.progression, amount);
    next = {
      ...next,
      progression: result.progression,
      statistics: { ...next.statistics, totalXpEarned: next.statistics.totalXpEarned + amount },
    };
  };

  switch (event.eventId) {
    case 'wandering_merchant': {
      if (choiceId === 'buy') {
        const price = Number(event.payload.price ?? 0);
        const itemId = String(event.payload.itemId) as LootItemId;
        if (!LOOT_BY_ID[itemId]) {
          messages.push('Köpmannen letar i väskan och hittar ingenting. Pinsamt.');
        } else if (next.progression.gold >= price) {
          grantGold(-price);
          grantItem(itemId);
          messages.push(`Du köpte ${LOOT_BY_ID[itemId].name} för ${price} guld.`);
        } else {
          messages.push('Du har inte råd. Köpmannen rycker på axlarna och går vidare.');
        }
      } else {
        messages.push('Du går vidare. Köpmannen ropar något om ett bättre pris nästa gång.');
      }
      break;
    }

    case 'double_or_nothing': {
      if (choiceId === 'accept') {
        const bonusGold = Number(event.payload.bonusGold ?? 0);
        const bonusXp = Number(event.payload.bonusXp ?? 0);
        grantGold(bonusGold);
        grantXp(bonusXp);
        messages.push(`Bonusmålet klarat: +${bonusXp} XP och +${bonusGold} guld.`);
      } else {
        messages.push('Du behåller det du har. Klokt val, kanske.');
      }
      break;
    }

    case 'lucky_drop': {
      const rawChestId = String(event.payload.chestId ?? 'mystery_chest') as LootItemId;
      const chestId: LootItemId = LOOT_BY_ID[rawChestId]?.isChest ? rawChestId : 'mystery_chest';
      const contents = openChest(chestId, rng);
      contents.items.forEach(grantItem);
      if (contents.gold > 0) {
        grantGold(contents.gold);
        messages.push(`+${contents.gold} guld ur kistan.`);
      }
      contents.items.forEach((itemId) => messages.push(`Du hittade ${LOOT_BY_ID[itemId].name}.`));
      if (contents.items.length === 0 && contents.gold === 0) {
        messages.push('Kistan var tom. Sådant händer.');
      }
      break;
    }

    case 'goblin_tax': {
      const amount = Number(event.payload.amount ?? 0);
      if (choiceId === 'pay') {
        grantGold(-Math.min(amount, next.progression.gold));
        messages.push(`Goblinen tar ${amount} guld och försvinner nöjd.`);
      } else {
        // Refusing always works - the event may not punish the player hard.
        messages.push('Du vägrar. Goblinen skriker förolämpat och springer iväg tomhänt.');
      }
      break;
    }

    case 'mysterious_stranger': {
      if (choiceId === 'middle') {
        const gold = Number(event.payload.middle ?? 30);
        grantGold(gold);
        messages.push(`Handen öppnas: ${gold} guld.`);
      } else {
        const itemId = String(
          choiceId === 'left' ? event.payload.left : event.payload.right,
        ) as LootItemId;
        if (LOOT_BY_ID[itemId]) {
          grantItem(itemId);
          messages.push(`Handen öppnas: ${LOOT_BY_ID[itemId].name}.`);
        } else {
          messages.push('Handen öppnas. Den är tom.');
        }
      }
      break;
    }

    case 'ancient_shrine': {
      if (choiceId === 'offer') {
        const cost = Number(event.payload.cost ?? 0);
        if (next.progression.gold >= cost && cost > 0) {
          grantGold(-cost);
          next = {
            ...next,
            buffs: {
              ...next.buffs,
              shrineXpBonusQuests: Number(event.payload.quests ?? 3),
            },
          };
          messages.push(`Stenen glöder. +30% XP på dina nästa ${event.payload.quests} uppdrag.`);
        } else {
          messages.push('Du har inget att offra. Stenen förblir tyst.');
        }
      } else {
        messages.push('Du lämnar stenen ifred. Den verkar inte bry sig.');
      }
      break;
    }

    default:
      break;
  }

  return { save: next, messages, itemsGained, goldDelta, xpDelta };
}

/** Use an inventory item outside of events (from the inventory panel). */
export interface UseItemResult {
  save: RogueDaySave;
  messages: string[];
  itemsGained: LootItemId[];
}

export function useInventoryItem(
  save: RogueDaySave,
  itemId: LootItemId,
  rng: Rng = randomRng,
): UseItemResult {
  const item = LOOT_BY_ID[itemId];
  if (!item?.usable) {
    return { save, messages: ['Det föremålet kan inte användas.'], itemsGained: [] };
  }

  const owned = save.inventory.find((entry) => entry.itemId === itemId)?.count ?? 0;
  if (owned <= 0) {
    return { save, messages: ['Du har inget sådant föremål.'], itemsGained: [] };
  }

  let next: RogueDaySave = { ...save, inventory: removeItem(save.inventory, itemId, 1) };
  const messages: string[] = [];
  const itemsGained: LootItemId[] = [];

  if (item.isChest) {
    const contents = openChest(itemId, rng);
    for (const dropped of contents.items) {
      next = { ...next, inventory: addItem(next.inventory, dropped) };
      itemsGained.push(dropped);
      messages.push(`Du fick ${LOOT_BY_ID[dropped].name}.`);
    }
    if (contents.gold > 0) {
      next = {
        ...next,
        progression: applyGold(next.progression, contents.gold),
        statistics: {
          ...next.statistics,
          totalGoldEarned: next.statistics.totalGoldEarned + contents.gold,
        },
      };
      messages.push(`+${contents.gold} guld.`);
    }
    next = {
      ...next,
      statistics: {
        ...next.statistics,
        lootFound: next.statistics.lootFound + contents.items.length,
      },
    };
    return { save: next, messages, itemsGained };
  }

  const buffKey = {
    xp_elixir: 'xpElixir',
    lucky_coin: 'luckyCoin',
    boss_key: 'bossKey',
    focus_rune: 'focusRune',
  }[itemId as string] as keyof RogueDaySave['buffs'] | undefined;

  if (buffKey) {
    next = { ...next, buffs: { ...next.buffs, [buffKey]: true } };
    messages.push(`${item.name} aktiverad. Gäller nästa avklarade uppdrag.`);
  }

  return { save: next, messages, itemsGained };
}

export function getEventDefinition(eventId: string): GameEventDefinition | undefined {
  return EVENT_BY_ID[eventId];
}
