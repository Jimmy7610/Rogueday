import { describe, expect, it } from 'vitest';
import { QUESTS, QUEST_COUNT, CATEGORY_LABELS, CATEGORY_ICONS } from '@/data/quests';
import { QUEST_CHAINS } from '@/data/chains';
import { BOSSES } from '@/data/bosses';
import { ACHIEVEMENTS } from '@/data/achievements';
import { LOOT_ITEMS } from '@/data/loot';
import { GAME_EVENTS } from '@/data/events';
import { LEVEL_TITLES, MAX_LEVEL } from '@/data/levels';
import { CHAOS_MODIFIERS } from '@/game/questSelection';

/**
 * Content inventory. These are the numbers quoted in the README and the DATA
 * screen, asserted against the real data so they cannot drift.
 */
describe('content inventory', () => {
  it('meets every documented minimum', () => {
    expect(QUEST_COUNT).toBeGreaterThanOrEqual(250);
    expect(BOSSES.length).toBeGreaterThanOrEqual(12);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(60);
    expect(MAX_LEVEL).toBeGreaterThanOrEqual(50);
    expect(QUEST_CHAINS.length).toBeGreaterThanOrEqual(5);
    expect(GAME_EVENTS.length).toBeGreaterThanOrEqual(6);
    expect(LOOT_ITEMS.length).toBeGreaterThanOrEqual(8);
    expect(CHAOS_MODIFIERS.length).toBeGreaterThanOrEqual(6);
  });

  it('matches the figures quoted in the README', () => {
    expect(QUEST_COUNT).toBe(271);
    expect(BOSSES.length).toBe(14);
    expect(ACHIEVEMENTS.length).toBe(85);
    expect(QUEST_CHAINS.length).toBe(6);
    expect(GAME_EVENTS.length).toBe(6);
    expect(LOOT_ITEMS.length).toBe(10);
    expect(CHAOS_MODIFIERS.length).toBe(8);
    expect(LEVEL_TITLES.length).toBe(25);
    expect(MAX_LEVEL).toBe(50);
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(22);
  });

  it('labels and icons exist for every category actually used', () => {
    const used = new Set(QUESTS.map((quest) => quest.category));
    for (const category of used) {
      expect(CATEGORY_LABELS[category], category).toBeTruthy();
      expect(CATEGORY_ICONS[category], category).toBeTruthy();
    }
    expect(used.size).toBe(22);
  });

  it('spreads quests across durations and rarities', () => {
    for (const duration of [5, 15, 30, 60]) {
      expect(
        QUESTS.filter((quest) => quest.duration === duration).length,
        `duration ${duration}`,
      ).toBeGreaterThan(20);
    }

    for (const energy of ['low', 'medium', 'high'] as const) {
      expect(QUESTS.filter((quest) => quest.energy === energy).length, energy).toBeGreaterThan(20);
    }
  });

  it('provides enough chaos-mode quests to fill a roll', () => {
    const chaosQuests = QUESTS.filter((quest) => quest.mode === 'chaos');
    expect(chaosQuests.length).toBeGreaterThanOrEqual(15);
  });

  it('gives every boss reward badge a matching achievement', () => {
    const achievementIds = new Set(ACHIEVEMENTS.map((entry) => entry.id));
    for (const boss of BOSSES) {
      // Not every boss needs a dedicated badge, but any badge it names must exist.
      if (achievementIds.has(boss.reward.badgeId)) continue;
      expect(
        boss.reward.badgeId.startsWith('boss_'),
        `${boss.id} names an unknown badge: ${boss.reward.badgeId}`,
      ).toBe(true);
    }
  });

  it('gives every chain badge a real achievement', () => {
    const achievementIds = new Set(ACHIEVEMENTS.map((entry) => entry.id));
    for (const chain of QUEST_CHAINS) {
      if (!chain.badgeId) continue;
      expect(achievementIds.has(chain.badgeId), `${chain.id} -> ${chain.badgeId}`).toBe(true);
    }
  });

  it('writes all user-facing quest copy in Swedish, not English', () => {
    // A crude but effective guard against untranslated placeholder content.
    const englishGiveaways = /\b(the|your|and|with|complete|task|minutes)\b/i;
    for (const quest of QUESTS) {
      expect(englishGiveaways.test(quest.title), `${quest.id} title`).toBe(false);
      expect(englishGiveaways.test(quest.description), `${quest.id} description`).toBe(false);
    }
  });
});
