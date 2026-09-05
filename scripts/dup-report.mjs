/**
 * Dev-only distinctness audit for the quest library.
 *
 * Two passes:
 *   1. Exact collisions on id, title, objective and flavour text.
 *   2. A Jaccard similarity sweep over every pair of standalone quests,
 *      comparing title + objective as bags of content words with numbers and
 *      Swedish stopwords removed. Anything at or above the threshold is a
 *      candidate for "same activity, reworded".
 *
 * Chain steps are excluded from the similarity pass - they deliberately echo
 * each other, one step at a time.
 *
 * Usage: node scripts/dup-report.mjs [threshold]   (default 0.50)
 */
import { createServer } from 'vite';

const THRESHOLD = Number(process.argv[2] ?? 0.5);

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const { QUESTS } = await server.ssrLoadModule('/src/data/quests.ts');
await server.close();

/* ---------------------------- exact collisions --------------------------- */

function collisions(label, keyOf) {
  const groups = new Map();
  for (const quest of QUESTS) {
    const key = keyOf(quest);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(quest.id);
  }
  const dupes = [...groups.values()].filter((ids) => ids.length > 1);
  console.log(`${label}: ${dupes.length} collision group(s)`);
  for (const ids of dupes) console.log(`  ${ids.join(', ')}`);
  return dupes.length;
}

console.log('=== EXACT COLLISIONS ===\n');
let problems = 0;
problems += collisions('ids        ', (q) => q.id);
problems += collisions('titles     ', (q) => q.title.trim().toLowerCase());
problems += collisions('objectives ', (q) => q.description.trim().toLowerCase());
problems += collisions('flavour    ', (q) => q.flavourText.trim().toLowerCase());

/* --------------------------- similarity sweep ---------------------------- */

const STOPWORDS = new Set(
  ('och att en ett den det de som i på av för med till om är var du din ditt dig sig så inte men ' +
    'eller vad hur när där här bara helt bra ny nya mer minst gör göra gå ta lägg ha vid från ' +
    'under över efter innan sedan igen alla allt något några lite mycket').split(' '),
);

const NUMBER_WORDS =
  /\b(en|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio|femton|tjugo|trettio|femtio|hundra|\d+)\b/g;

function contentWords(quest) {
  const text = `${quest.title} ${quest.description}`
    .toLowerCase()
    .replace(NUMBER_WORDS, ' ')
    .replace(/[^a-zåäöé\s]/g, ' ');
  return new Set(text.split(/\s+/).filter((word) => word.length > 2 && !STOPWORDS.has(word)));
}

function jaccard(a, b) {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

const standalone = QUESTS.filter((quest) => !quest.chainId).map((quest) => ({
  quest,
  words: contentWords(quest),
}));

console.log(`\n=== SIMILARITY SWEEP (threshold ${THRESHOLD}) ===\n`);

let pairs = 0;
for (let i = 0; i < standalone.length; i += 1) {
  for (let j = i + 1; j < standalone.length; j += 1) {
    const score = jaccard(standalone[i].words, standalone[j].words);
    if (score < THRESHOLD) continue;
    pairs += 1;
    console.log(`${score.toFixed(2)}  ${standalone[i].quest.id}  ::  ${standalone[i].quest.description}`);
    console.log(`      ${standalone[j].quest.id}  ::  ${standalone[j].quest.description}`);
  }
}

console.log(`\npairs at or above ${THRESHOLD}: ${pairs}`);
console.log(`quests compared: ${standalone.length} (chain steps excluded)`);

problems += pairs;
process.exit(problems === 0 ? 0 : 1);
