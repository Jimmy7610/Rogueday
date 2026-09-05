/**
 * Dev-only: pool size and shape for every activity pack.
 *
 * Usage: npm run qa:packs
 */
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const { ACTIVITY_PACKS, MIN_HEALTHY_POOL } = await server.ssrLoadModule('/src/data/activityPacks.ts');
const { packPool } = await server.ssrLoadModule('/src/game/activityPacks.ts');
const { BOSSES } = await server.ssrLoadModule('/src/data/bosses.ts');
const { createDefaultSave } = await server.ssrLoadModule('/src/persistence/defaults.ts');
await server.close();

const veteran = (() => {
  const base = createDefaultSave('QA');
  return {
    ...base,
    progression: { ...base.progression, level: 30 },
    streak: { ...base.streak, current: 10 },
    statistics: { ...base.statistics, questsCompleted: 200 },
  };
})();

console.log('=== ACTIVITY PACK POOLS ===\n');
console.log(`healthy threshold: ${MIN_HEALTHY_POOL}\n`);

let smallest = Infinity;
let smallestId = '';

for (const pack of ACTIVITY_PACKS) {
  if (pack.dynamic === 'boss-weakness') continue;
  const context = { secrets: { now: new Date(), save: veteran } };
  const pool = packPool(pack, context);
  const flag = pool.length < MIN_HEALTHY_POOL ? ' !!' : '';
  console.log(`${pack.icon} ${pack.name.padEnd(20)} ${String(pool.length).padStart(4)}${flag}`);
  if (pool.length < smallest) { smallest = pool.length; smallestId = pack.name; }

  const dur = [5, 15, 30, 60].map((d) => `${d}m:${pool.filter((q) => q.duration === d).length}`);
  const cats = new Map();
  for (const q of pool) cats.set(q.category, (cats.get(q.category) ?? 0) + 1);
  const top = [...cats].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, n]) => `${c}(${n})`);
  console.log(`   ${dur.join('  ')}`);
  console.log(`   ${top.join(' ')}\n`);
}

console.log('=== BOSS RUSH, per boss ===\n');
const rush = ACTIVITY_PACKS.find((p) => p.dynamic === 'boss-weakness');
for (const boss of BOSSES) {
  const pool = packPool(rush, { boss, secrets: { now: new Date(), save: veteran } });
  const flag = pool.length < MIN_HEALTHY_POOL ? ' !!' : '';
  console.log(
    `  ${boss.name.padEnd(24)} ${String(pool.length).padStart(4)}${flag}   weak: ${boss.weaknessCategories.join(', ')}`,
  );
  if (pool.length < smallest) { smallest = pool.length; smallestId = `BOSS RUSH / ${boss.name}`; }
}

console.log(`\nsmallest pool anywhere: ${smallest} (${smallestId})`);
process.exit(smallest >= MIN_HEALTHY_POOL ? 0 : 1);
