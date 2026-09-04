import type {
  EventFollowUp,
  EventResult,
  GameEventDefinition,
  ItemRevealState,
  LootItemId,
  PendingEvent,
  RogueDaySave,
} from '@/types';
import {
  EVENT_BY_ID,
  EVENT_TRIGGER_CHANCE,
  FOLLOW_UP_OBJECTIVES,
  GAME_EVENTS,
} from '@/data/events';
import { LOOT_BY_ID } from '@/data/loot';
import { addDays, toLocalDateKey } from '@/utils/date';
import { createId, randomRng, weightedPick, type Rng } from '@/utils/rng';
import { addItem, openChest, removeItem } from './loot';
import { applyGold, applyXp } from './progression';

/**
 * Random events fire after a completed quest. By design nothing here can
 * seriously hurt the player - the worst outcome is a small gold nibble that
 * can also be avoided entirely.
 *
 * Every resolution returns an `EventResult` describing exactly what happened,
 * so the outcome is shown rather than silently folded into the save.
 */
export function maybeTriggerEvent(
  save: RogueDaySave,
  now: Date = new Date(),
  rng: Rng = randomRng,
): PendingEvent | null {
  if (!rng.chance(EVENT_TRIGGER_CHANCE)) return null;

  // Never stack a second bonus objective on top of an unclaimed one.
  const available = GAME_EVENTS.filter(
    (event) => !(event.id === 'double_or_nothing' && save.eventFollowUp),
  );
  if (available.length === 0) return null;

  const definition = weightedPick(
    available.map((event) => ({ ...event })),
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
    case 'double_or_nothing': {
      const objective = rng.int(0, FOLLOW_UP_OBJECTIVES.length - 1);
      return {
        objective,
        bonusGold: rng.int(15, 45),
        bonusXp: rng.int(30, 90),
      };
    }
    case 'lucky_drop':
      return { chestId: rng.chance(0.15) ? 'epic_chest' : 'mystery_chest' };
    case 'goblin_tax':
      // Never more than a small nibble, and never more than the player has.
      return {
        amount: Math.min(save.progression.gold, rng.int(3, 12)),
        // Whether the paperwork actually contains a mistake. Deciding it here
        // means the outcome is fixed before the player chooses.
        flawed: rng.chance(0.6) ? 1 : 0,
        refund: rng.int(8, 22),
      };
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
  /** Everything the player needs to see, in one object. */
  result: EventResult;
}

/** Apply the player's chosen branch of a pending event. */
export function resolveEvent(
  save: RogueDaySave,
  event: PendingEvent,
  choiceId: string,
  rng: Rng = randomRng,
  now: Date = new Date(),
): EventOutcome {
  const definition = EVENT_BY_ID[event.eventId];
  const messages: string[] = [];
  const itemsGained: LootItemId[] = [];
  let goldDelta = 0;
  // Events never grant XP directly any more: the only XP path is claiming a
  // follow-up objective, which is handled in claimFollowUp.
  const xpDelta = 0;
  let followUp: EventFollowUp | undefined;

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
        // Accepting no longer hands out free rewards - it creates a real,
        // optional bonus objective that has to be done to pay out.
        const index = Number(event.payload.objective ?? 0);
        const objective =
          FOLLOW_UP_OBJECTIVES[index] ?? FOLLOW_UP_OBJECTIVES[0];

        followUp = {
          id: createId('followup'),
          eventId: 'double_or_nothing',
          title: objective.title,
          description: objective.description,
          rewardXp: Number(event.payload.bonusXp ?? 40),
          rewardGold: Number(event.payload.bonusGold ?? 20),
          createdAt: now.toISOString(),
          expiresOn: addDays(toLocalDateKey(now), 1),
        };

        next = { ...next, eventFollowUp: followUp };
        messages.push(`Vadet gäller: ${objective.title}.`);
        messages.push('Klara det innan dagen är slut så betalar rösten ut.');
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
      const amount = Math.min(Number(event.payload.amount ?? 0), next.progression.gold);

      if (choiceId === 'pay') {
        // Paying is no longer strictly worse: the goblin leaves something.
        grantGold(-amount);
        messages.push(`Goblinen tar ${amount} guld och stämplar ditt formulär.`);
        if (rng.chance(0.5)) {
          grantItem('reroll_token');
          messages.push('Den rotar i säcken och räcker dig ett mynt. "Kvitto."');
        } else {
          messages.push('Den försvinner nöjd runt hörnet.');
        }
      } else if (choiceId === 'outsmart') {
        const flawed = Number(event.payload.flawed ?? 0) === 1;
        if (flawed) {
          const refund = Number(event.payload.refund ?? 10);
          grantGold(refund);
          messages.push('Formuläret är daterat "i förrgår" och undertecknat "Goblin".');
          messages.push(`Den blir generad och betalar dig ${refund} guld för besväret.`);
        } else {
          grantGold(-amount);
          messages.push('Papperen är faktiskt i ordning. Irriterande nog.');
          messages.push(`Du betalar ${amount} guld.`);
        }
      } else {
        messages.push('Du går bara förbi. Goblinen ropar efter dig utan övertygelse.');
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

  return {
    save: next,
    result: {
      eventId: event.eventId,
      choiceId,
      title: definition?.name ?? 'HÄNDELSE',
      messages,
      goldDelta,
      xpDelta,
      itemsGained,
      ...(followUp ? { followUp } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Follow-up objectives                                                */
/* ------------------------------------------------------------------ */

/** Drop a bonus objective once its day has passed. Silent and unpunishing. */
export function expireFollowUp(
  followUp: EventFollowUp | null,
  now: Date = new Date(),
): EventFollowUp | null {
  if (!followUp) return null;
  return toLocalDateKey(now) > followUp.expiresOn ? null : followUp;
}

export interface FollowUpOutcome {
  ok: boolean;
  save: RogueDaySave;
  result: EventResult;
}

/** Claim the DOUBLE OR NOTHING bonus after actually doing the extra objective. */
export function claimFollowUp(save: RogueDaySave): FollowUpOutcome {
  const followUp = save.eventFollowUp;

  if (!followUp) {
    return {
      ok: false,
      save,
      result: {
        eventId: 'double_or_nothing',
        choiceId: 'claim',
        title: 'INGET VAD',
        messages: ['Det finns inget bonusmål att lösa in.'],
        goldDelta: 0,
        xpDelta: 0,
        itemsGained: [],
      },
    };
  }

  const xpResult = applyXp(save.progression, followUp.rewardXp);
  const progression = applyGold(xpResult.progression, followUp.rewardGold);

  const next: RogueDaySave = {
    ...save,
    progression,
    eventFollowUp: null,
    statistics: {
      ...save.statistics,
      totalXpEarned: save.statistics.totalXpEarned + followUp.rewardXp,
      totalGoldEarned: save.statistics.totalGoldEarned + followUp.rewardGold,
      followUpsCompleted: save.statistics.followUpsCompleted + 1,
    },
  };

  return {
    ok: true,
    save: next,
    result: {
      eventId: followUp.eventId,
      choiceId: 'claim',
      title: 'VADET VUNNET',
      messages: [`${followUp.title} avklarat.`, 'Rösten betalar ut, precis som den lovade.'],
      goldDelta: followUp.rewardGold,
      xpDelta: followUp.rewardXp,
      itemsGained: [],
    },
  };
}

/* ------------------------------------------------------------------ */
/* Using items                                                         */
/* ------------------------------------------------------------------ */

export interface UseItemResult {
  ok: boolean;
  save: RogueDaySave;
  messages: string[];
  itemsGained: LootItemId[];
  /** Transient presentation state for the reveal animation. */
  reveal: ItemRevealState | null;
}

/**
 * Use an inventory item.
 *
 * The inventory and gold changes are applied here and persisted immediately;
 * the returned `reveal` is presentation only and is never written to the save.
 */
export function useInventoryItem(
  save: RogueDaySave,
  itemId: LootItemId,
  rng: Rng = randomRng,
): UseItemResult {
  const item = LOOT_BY_ID[itemId];
  if (!item?.usable) {
    return {
      ok: false,
      save,
      messages: ['Det föremålet kan inte användas.'],
      itemsGained: [],
      reveal: null,
    };
  }

  const owned = save.inventory.find((entry) => entry.itemId === itemId)?.count ?? 0;
  if (owned <= 0) {
    return {
      ok: false,
      save,
      messages: ['Du har inget sådant föremål.'],
      itemsGained: [],
      reveal: null,
    };
  }

  let next: RogueDaySave = { ...save, inventory: removeItem(save.inventory, itemId, 1) };
  const messages: string[] = [];
  const itemsGained: LootItemId[] = [];
  let goldGained = 0;

  if (item.isChest) {
    const contents = openChest(itemId, rng);
    for (const dropped of contents.items) {
      next = { ...next, inventory: addItem(next.inventory, dropped) };
      itemsGained.push(dropped);
      messages.push(`Du fick ${LOOT_BY_ID[dropped].name}.`);
    }
    if (contents.gold > 0) {
      goldGained = contents.gold;
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

    return {
      ok: true,
      save: next,
      messages,
      itemsGained,
      reveal: {
        sourceItemId: itemId,
        title: 'KISTA ÖPPNAD',
        itemsGained,
        goldGained,
        messages,
        isChest: true,
      },
    };
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

  return {
    ok: true,
    save: next,
    messages,
    itemsGained,
    reveal: {
      sourceItemId: itemId,
      title: 'AKTIVERAD',
      itemsGained: [],
      goldGained: 0,
      messages,
      isChest: false,
    },
  };
}

export function getEventDefinition(eventId: string): GameEventDefinition | undefined {
  return EVENT_BY_ID[eventId];
}
