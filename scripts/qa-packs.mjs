/**
 * Dev-only QA sweep for activity packs.
 *
 * Rolls each pack many times against the real engine and checks that every
 * offer honours the pack's hard constraints, that the results are varied
 * rather than repetitive, and that nothing comes back empty.
 *
 * Usage: npm run qa:packrolls
 */
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const { ACTIVITY_PACKS } = await server.ssrLoadModule('/src/data/activityPacks.ts');
const { rollFromPack, packPool, surprisePack } = await server.ssrLoadModule('/src/game/activityPacks.ts');
const { createDefaultSave } = await server.ssrLoadModule('/src/persistence/defaults.ts');
const { createRng } = await server.ssrLoadModule('/src/utils/rng.ts');
const { createBossState } = await server.ssrLoadModule('/src/game/boss.ts');
await server.close();

const ROLLS = 40;

const base = createDefaultSave('QA');
const save = {
  ...base,
  progression: { ...base.progression, level: 30 },
  streak: { ...base.streak, current: 10 },
  statistics: { ...base.statistics, questsCompleted: 250 },
  boss: createBossState('2026-09-07'),
};

let violations = 0;
let empties = 0;

function check(pack, label = pack.name) {
  const allowed = new Set(
    packPool(pack, {
      boss: undefined,
      secrets: { now: new Date(), save },
      chains: save.questChains,
    }).map((q) => q.id),
  );

  const categories = new Map();
  const durations = new Map();
  const seen = new Set();
  let offers = 0;

  for (let i = 0; i < ROLLS; i += 1) {
    const result = rollFromPack({ pack, save, rng: createRng(`qa-${pack.id}-${i}`) });
    if (result.empty) { empties += 1; continue; }

    for (const offer of result.offers) {
      offers += 1;
      const q = offer.quest;
      seen.add(q.id);
      categories.set(q.category, (categories.get(q.category) ?? 0) + 1);
      durations.set(q.duration, (durations.get(q.duration) ?? 0) + 1);

      const ok =
        pack.allowedDurations.includes(q.duration) &&
        pack.allowedEnergies.includes(q.energy) &&
        q.locations.some((l) => pack.allowedLocations.includes(l)) &&
        pack.requiredTags.every((t) => q.contentTags.includes(t)) &&
        !pack.excludedTags.some((t) => q.contentTags.includes(t)) &&
        !pack.excludedCategories.includes(q.category) &&
        (!pack.onlyCategories || pack.onlyCategories.includes(q.category));

      if (!ok) {
        violations += 1;
        console.log(`   !! ${q.id} (${q.duration}m ${q.energy} ${q.locations}) breaks ${pack.id}`);
      }
    }
  }

  const dur = [5, 15, 30, 60]
    .filter((d) => durations.has(d))
    .map((d) => `${d}m:${durations.get(d)}`)
    .join(' ');
  const topCats = [...categories]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([c, n]) => `${c}(${n})`)
    .join(' ');

  console.log(`${pack.icon} ${label.padEnd(20)} pool:${String(allowed.size).padStart(4)}  distinct offered:${String(seen.size).padStart(4)}/${offers}`);
  console.log(`   ${dur}`);
  console.log(`   ${topCats}\n`);
}

console.log(`=== PACK ROLL QA (${ROLLS} rolls each, 3 offers per roll) ===\n`);
for (const pack of ACTIVITY_PACKS) {
  if (pack.dynamic) continue;
  check(pack);
}
check(surprisePack(false), 'ÖVERRASKA MIG');

console.log(`hard-constraint violations: ${violations}`);
console.log(`empty rolls: ${empties}`);
process.exit(violations === 0 && empties === 0 ? 0 : 1);
