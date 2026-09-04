/**
 * Development-only quest library coverage report.
 *
 *   npm run coverage
 *
 * Prints the duration x energy x location matrix plus per-category, per-mood
 * and per-rarity counts, so weak cells can be filled with real quests rather
 * than by loosening the filters.
 *
 * Reads the compiled library through vite-node so it sees exactly what the game
 * sees - no duplicate parsing logic to drift out of sync.
 */

import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const server = await createServer({
  root,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
  appType: 'custom',
});

const { QUESTS } = await server.ssrLoadModule('/src/data/quests.ts');
const { matchesHardConstraints, matchesMood } = await server.ssrLoadModule(
  '/src/game/questSelection.ts',
);

const DURATIONS = [5, 15, 30, 60];
const ENERGIES = ['low', 'medium', 'high'];
const LOCATIONS = ['home', 'outside', 'anywhere'];
const MOODS = ['bored', 'stressed', 'motivated', 'adventurous'];

/** How many quests a real player with these filters would actually be offered. */
function poolFor(duration, energy, location, mood, mode = 'normal') {
  const filters = { duration, energy, location, mood, mode };
  return QUESTS.filter(
    (quest) => matchesHardConstraints(quest, filters) && matchesMood(quest, filters),
  ).length;
}

const bar = (n, warn) => {
  const mark = n === 0 ? '!!' : n < warn ? ' *' : '  ';
  return `${String(n).padStart(5)}${mark}`;
};

const count = (predicate) => QUESTS.filter(predicate).length;
const tally = (keyOf) => {
  const map = new Map();
  for (const quest of QUESTS) {
    for (const key of [].concat(keyOf(quest))) {
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};

console.log(`\n=== ROGUEDAY QUEST COVERAGE ===\n`);
console.log(`Total quests: ${QUESTS.length}\n`);

/* ---- headline splits ---- */

console.log('BY DURATION');
for (const d of DURATIONS) console.log(`  ${String(d).padStart(2)} min  ${count((q) => q.duration === d)}`);

console.log('\nBY ENERGY');
for (const e of ENERGIES) console.log(`  ${e.padEnd(7)} ${count((q) => q.energy === e)}`);

console.log('\nBY LOCATION (a quest may allow several)');
for (const l of LOCATIONS) console.log(`  ${l.padEnd(9)} ${count((q) => q.locations.includes(l))}`);

console.log('\nBY MODE');
for (const m of ['normal', 'chaos', 'any']) console.log(`  ${m.padEnd(7)} ${count((q) => q.mode === m)}`);

console.log('\nBY RARITY');
for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary']) {
  console.log(`  ${r.padEnd(10)} ${count((q) => q.rarity === r)}`);
}

console.log('\nBY MOOD (a quest may allow several)');
for (const m of MOODS) console.log(`  ${m.padEnd(12)} ${count((q) => q.moods.includes(m))}`);

console.log('\nBY CATEGORY');
for (const [category, n] of tally((q) => q.category)) {
  console.log(`  ${category.padEnd(14)} ${n}`);
}

/* ---- the matrix that actually matters ---- */

console.log('\n\n=== PLAYABLE POOL: duration x energy x location (worst mood) ===');
console.log('  "!!" = empty, " *" = thin (<8). Worst-case across the four moods.\n');

let worst = Infinity;
let worstCell = '';
const weak = [];

for (const duration of DURATIONS) {
  console.log(`  ${duration} MIN`);
  for (const energy of ENERGIES) {
    const cells = LOCATIONS.map((location) => {
      const perMood = MOODS.map((mood) => poolFor(duration, energy, location, mood));
      const min = Math.min(...perMood);
      if (min < worst) {
        worst = min;
        worstCell = `${duration}m/${energy}/${location}`;
      }
      if (min < 8) weak.push({ duration, energy, location, min, perMood });
      return bar(min, 8);
    });
    console.log(`    ${energy.padEnd(7)} home:${cells[0]}  outside:${cells[1]}  anywhere:${cells[2]}`);
  }
}

console.log(`\n  Weakest cell overall: ${worstCell} = ${worst} quests`);

if (weak.length > 0) {
  console.log(`\n  ${weak.length} thin cells needing content:`);
  for (const cell of weak.slice(0, 40)) {
    console.log(
      `    ${cell.duration}m / ${cell.energy} / ${cell.location}  min=${cell.min}  per-mood=[${cell.perMood.join(', ')}]`,
    );
  }
}

/* ---- chaos matrix ---- */

console.log('\n=== CHAOS POOL: duration x energy (any location, worst mood) ===\n');
for (const duration of DURATIONS) {
  const row = ENERGIES.map((energy) => {
    const perMood = MOODS.map((mood) => poolFor(duration, energy, 'anywhere', mood, 'chaos'));
    return `${energy}:${bar(Math.min(...perMood), 4)}`;
  });
  console.log(`  ${String(duration).padStart(2)} min  ${row.join('  ')}`);
}

console.log('');
await server.close();
