import { describe, expect, it } from 'vitest';
import type { Mood, Quest, QuestDuration, QuestFilters, QuestLocation } from '@/types';
import { QUESTS, QUEST_COUNT, CATEGORY_LABELS } from '@/data/quests';
import { CHAIN_BY_ID, QUEST_CHAINS } from '@/data/chains';
import { ALL_MOODS } from '@/data/questFactory';
import { matchesHardConstraints, matchesFilters } from '@/game/questSelection';

const DURATIONS: QuestDuration[] = [5, 15, 30, 60];
const ENERGIES = ['low', 'medium', 'high'] as const;
const LOCATIONS: QuestLocation[] = ['home', 'outside', 'anywhere'];
const MOODS: Mood[] = ALL_MOODS;

const CONTENT_TAGS = new Set([
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
]);

function poolFor(filters: QuestFilters): Quest[] {
  return QUESTS.filter((quest) => !quest.chainId && matchesFilters(quest, filters));
}

/* ------------------------------------------------------------------ */
/* Size and uniqueness                                                 */
/* ------------------------------------------------------------------ */

describe('v3 quest library size', () => {
  it('holds at least a thousand playable activities', () => {
    expect(QUEST_COUNT).toBeGreaterThanOrEqual(1000);
  });

  it('has a unique id for every quest', () => {
    const ids = new Set(QUESTS.map((quest) => quest.id));
    expect(ids.size).toBe(QUESTS.length);
  });

  it('has no duplicate titles', () => {
    const seen = new Map<string, string>();
    for (const quest of QUESTS) {
      const key = quest.title.trim().toLowerCase();
      expect(seen.has(key), `${quest.id} repeats the title of ${seen.get(key)}`).toBe(false);
      seen.set(key, quest.id);
    }
  });

  it('has no duplicate descriptions', () => {
    const seen = new Map<string, string>();
    for (const quest of QUESTS) {
      const key = quest.description.trim().toLowerCase();
      expect(seen.has(key), `${quest.id} repeats the objective of ${seen.get(key)}`).toBe(false);
      seen.set(key, quest.id);
    }
  });

  it('has no duplicate title + objective pairs', () => {
    const pairs = new Set(
      QUESTS.map((quest) => `${quest.title.toLowerCase()}::${quest.description.toLowerCase()}`),
    );
    expect(pairs.size).toBe(QUESTS.length);
  });

  it('writes a distinct flavour line for almost every quest', () => {
    // A handful of shared one-liners would be forgivable; wholesale reuse is
    // the signature of padded content, so the bar is deliberately high.
    const flavours = new Set(QUESTS.map((quest) => quest.flavourText.trim().toLowerCase()));
    expect(flavours.size).toBeGreaterThanOrEqual(Math.floor(QUESTS.length * 0.98));
  });
});

/* ------------------------------------------------------------------ */
/* Metadata correctness                                                */
/* ------------------------------------------------------------------ */

describe('v3 quest metadata', () => {
  it('gives every quest valid, non-empty core metadata', () => {
    for (const quest of QUESTS) {
      expect(DURATIONS, quest.id).toContain(quest.duration);
      expect(ENERGIES, quest.id).toContain(quest.energy);
      expect(quest.locations.length, quest.id).toBeGreaterThan(0);
      expect(quest.moods.length, quest.id).toBeGreaterThan(0);
      expect(quest.title.trim().length, quest.id).toBeGreaterThan(2);
      expect(quest.description.trim().length, quest.id).toBeGreaterThan(10);
      expect(quest.flavourText.trim().length, quest.id).toBeGreaterThan(5);
      expect(CATEGORY_LABELS[quest.category], quest.id).toBeTruthy();
      expect(quest.baseXp, quest.id).toBeGreaterThan(0);
      expect(quest.baseGold, quest.id).toBeGreaterThan(0);
    }
  });

  it('uses only known location values, and never mixes anywhere with a specific place', () => {
    for (const quest of QUESTS) {
      for (const location of quest.locations) {
        expect(LOCATIONS, quest.id).toContain(location);
      }
      if (quest.locations.includes('anywhere')) {
        expect(quest.locations, `${quest.id} is both anywhere and somewhere`).toHaveLength(1);
      }
    }
  });

  it('uses only known moods, without duplicates', () => {
    for (const quest of QUESTS) {
      expect(new Set(quest.moods).size, quest.id).toBe(quest.moods.length);
      for (const mood of quest.moods) {
        expect(MOODS, quest.id).toContain(mood);
      }
    }
  });

  it('uses only known content tags', () => {
    for (const quest of QUESTS) {
      for (const tag of quest.contentTags) {
        expect(CONTENT_TAGS.has(tag), `${quest.id} has unknown tag ${tag}`).toBe(true);
      }
      expect(new Set(quest.contentTags).size, quest.id).toBe(quest.contentTags.length);
    }
  });

  it('never tags an outdoor-only quest as indoors, or the reverse', () => {
    for (const quest of QUESTS) {
      if (quest.locations.length === 1 && quest.locations[0] === 'outside') {
        expect(quest.contentTags.includes('indoors'), `${quest.id}`).toBe(false);
      }
      if (quest.locations.length === 1 && quest.locations[0] === 'home') {
        expect(quest.contentTags.includes('outdoors'), `${quest.id}`).toBe(false);
      }
    }
  });

  it('keeps duration and energy honest against each other', () => {
    for (const quest of QUESTS) {
      // A five-minute quest cannot be an extreme undertaking, and an hour of
      // high-energy work cannot be filed as easy.
      if (quest.duration === 5) expect(quest.difficulty, quest.id).not.toBe('extreme');
      if (quest.duration === 60 && quest.energy === 'high') {
        expect(quest.difficulty, quest.id).not.toBe('easy');
      }
    }
  });

  it('does not put every mood on every quest', () => {
    // Moods are a preference signal. If most of the library accepted all four
    // they would carry no information at all.
    const allFour = QUESTS.filter((quest) => quest.moods.length === 4);
    expect(allFour.length / QUESTS.length).toBeLessThan(0.55);
  });

  it('keeps every mood well supplied', () => {
    for (const mood of MOODS) {
      const count = QUESTS.filter((quest) => quest.moods.includes(mood)).length;
      expect(count, mood).toBeGreaterThanOrEqual(200);
    }
  });

  it('reserves chaos mode for chaos-flavoured content, and keeps it deep', () => {
    const chaos = QUESTS.filter((quest) => quest.mode === 'chaos');
    expect(chaos.length).toBeGreaterThanOrEqual(100);
    for (const quest of chaos) {
      expect(quest.category, quest.id).toBe('chaos');
    }
  });

  it('keeps legendary and secret content genuinely rare', () => {
    const legendary = QUESTS.filter((quest) => quest.rarity === 'legendary');
    expect(legendary.length).toBeGreaterThanOrEqual(20);
    expect(legendary.length / QUESTS.length).toBeLessThan(0.1);
  });
});

/* ------------------------------------------------------------------ */
/* Chains                                                              */
/* ------------------------------------------------------------------ */

describe('v3 chain integrity', () => {
  it('numbers every chain step from one, without gaps', () => {
    for (const chain of QUEST_CHAINS) {
      const steps = QUESTS.filter((quest) => quest.chainId === chain.id)
        .map((quest) => quest.chainStep)
        .sort((a, b) => (a ?? 0) - (b ?? 0));

      expect(steps.length, chain.id).toBe(chain.questIds.length);
      steps.forEach((step, index) => {
        expect(step, `${chain.id} step ${index}`).toBe(index + 1);
      });
    }
  });

  it('points every chain quest at a chain that exists', () => {
    for (const quest of QUESTS) {
      if (!quest.chainId) continue;
      expect(CHAIN_BY_ID[quest.chainId], quest.id).toBeTruthy();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Coverage: the matrix the player can actually reach                  */
/* ------------------------------------------------------------------ */

describe('v3 coverage matrix', () => {
  it('never leaves a duration x energy x location x mood combination empty', () => {
    const thin: string[] = [];

    for (const duration of DURATIONS) {
      for (const energy of ENERGIES) {
        for (const location of LOCATIONS) {
          for (const mood of MOODS) {
            const pool = poolFor({ duration, energy, location, mood, mode: 'normal' });
            if (pool.length < 8) thin.push(`${duration}m/${energy}/${location}/${mood} = ${pool.length}`);
          }
        }
      }
    }

    expect(thin, `thin combinations:\n${thin.join('\n')}`).toEqual([]);
  });

  it('gives chaos mode a real pool in every combination too', () => {
    const thin: string[] = [];

    for (const duration of DURATIONS) {
      for (const energy of ENERGIES) {
        for (const mood of MOODS) {
          const pool = poolFor({ duration, energy, location: 'anywhere', mood, mode: 'chaos' });
          if (pool.length < 5) thin.push(`${duration}m/${energy}/${mood} = ${pool.length}`);
        }
      }
    }

    expect(thin, `thin chaos combinations:\n${thin.join('\n')}`).toEqual([]);
  });

  it('offers real depth in every major category', () => {
    const counts = new Map<string, number>();
    for (const quest of QUESTS) {
      counts.set(quest.category, (counts.get(quest.category) ?? 0) + 1);
    }
    for (const [category, count] of counts) {
      expect(count, `category ${category}`).toBeGreaterThanOrEqual(15);
    }
    expect(counts.size).toBe(Object.keys(CATEGORY_LABELS).length);
  });

  it('never lets a hard constraint be violated, in any combination', () => {
    for (const duration of DURATIONS) {
      for (const energy of ENERGIES) {
        for (const location of LOCATIONS) {
          const filters: QuestFilters = {
            duration,
            energy,
            location,
            mood: 'motivated',
            mode: 'normal',
          };
          for (const quest of QUESTS.filter((entry) => matchesHardConstraints(entry, filters))) {
            expect(quest.duration, quest.id).toBeLessThanOrEqual(duration);
            if (location !== 'anywhere') {
              expect(
                quest.locations.includes(location) || quest.locations.includes('anywhere'),
                quest.id,
              ).toBe(true);
            }
          }
        }
      }
    }
  });
});
