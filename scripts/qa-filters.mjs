/**
 * Dev-only QA sweep.
 *
 * Rolls real offers for every filter combination the V3 brief calls out and
 * asserts, against the compiled library, that each offer actually satisfies
 * the player's stated duration, energy, location and mode.
 */
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const sel = await server.ssrLoadModule('/src/game/questSelection.ts');
const rngmod = await server.ssrLoadModule('/src/utils/rng.ts');

const COMBOS = [
  [5, 'low', 'home'],
  [5, 'low', 'outside'],
  [15, 'medium', 'anywhere'],
  [30, 'high', 'outside'],
  [60, 'medium', 'home'],
  [60, 'high', 'outside'],
];
const MOODS = ['bored', 'stressed', 'motivated', 'adventurous'];
const MODES = ['normal', 'chaos'];
const RANK = { low: 0, medium: 1, high: 2 };

let checks = 0;
let violations = 0;
let empties = 0;
let moodRelaxations = 0;

for (const mode of MODES) {
  console.log(`\n=== ${mode.toUpperCase()} ===`);
  for (const [duration, energy, location] of COMBOS) {
    const line = [];
    for (const mood of MOODS) {
      const filters = { duration, energy, location, mood, mode };
      let poolSize = 0;
      let relaxed = false;
      for (let i = 0; i < 12; i += 1) {
        const r = sel.rollQuestChoices({
          filters,
          chains: {},
          recentQuestIds: [],
          rng: rngmod.createRng(`qa-${mode}-${duration}-${energy}-${location}-${mood}-${i}`),
        });
        if (r.empty) { empties += 1; continue; }
        poolSize = r.poolSize;
        if (r.moodRelaxed) relaxed = true;
        for (const offer of r.offers) {
          checks += 1;
          const q = offer.quest;
          const okDur = q.duration <= duration;
          const okEnergy = RANK[q.energy] <= RANK[energy];
          const okLoc = location === 'anywhere' || q.locations.includes(location) || q.locations.includes('anywhere');
          const okMode = q.mode === 'any' || q.mode === mode;
          if (!(okDur && okEnergy && okLoc && okMode)) {
            violations += 1;
            console.log(`  !! ${q.id} violates ${duration}/${energy}/${location}/${mode}`);
          }
        }
      }
      if (relaxed) moodRelaxations += 1;
      line.push(`${mood.slice(0, 4)}:${String(poolSize).padStart(4)}${relaxed ? '~' : ' '}`);
    }
    console.log(`  ${String(duration).padStart(2)}m ${energy.padEnd(6)} ${location.padEnd(8)} ${line.join('  ')}`);
  }
}

console.log(`\noffers checked: ${checks}`);
console.log(`hard-constraint violations: ${violations}`);
console.log(`empty rolls: ${empties}`);
console.log(`rolls that had to relax mood ("~"): ${moodRelaxations}`);

await server.close();
process.exit(violations === 0 && empties === 0 ? 0 : 1);
