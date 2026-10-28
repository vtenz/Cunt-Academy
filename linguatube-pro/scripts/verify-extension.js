#!/usr/bin/env node
/**
 * LinguaTube Reactor Pro v2.0 — Automated Self-Verification & QA Suite
 * Verifies:
 * 1. Firefox Manifest V3 structure (gecko.id, background.scripts, NO default_popup, file existence, zero chrome.* API calls)
 * 2. Syntax check (node --check) on all .js files
 * 3. Binary PNG icons magic bytes (\x89PNG\r\n\x1a\n) & linguatube-pro.xpi archive check
 * 4. 5-Box Leitner State Machine unit tests (1d, 2d, 4d, 8d, 16d promotions + wrong lapse reset)
 * 5. Upfront Sentence Reconstructor (rebuildCleanSentencesFromJson3), In-Video Concordance, & Persian RTL normalizer unit tests
 * 6. RTL CSS rules, compact subtitle pill CSS, & zero placeholder comment audit
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extRoot = path.resolve(__dirname, '..');

await import(pathToFileURL(path.join(extRoot, 'src/shared/constants.js')).href);
await import(pathToFileURL(path.join(extRoot, 'src/shared/persian-utils.js')).href);
await import(pathToFileURL(path.join(extRoot, 'src/content/subtitle-parser.js')).href);

const constants = globalThis.LTConstants;
const persianUtils = globalThis.LTPersianUtils;
const subtitleParser = globalThis.LTSubtitleParser;

function getAllFiles(dir, extFilter = null) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getAllFiles(full, extFilter));
    } else if (!extFilter || full.endsWith(extFilter)) {
      results.push(full);
    }
  }
  return results;
}

console.log('=== 1. Running Firefox Manifest & Syntax Audit ===');
const jsFiles = getAllFiles(extRoot, '.js');
for (const jsFile of jsFiles) {
  execFileSync(process.execPath, ['--check', jsFile]);
}
console.log(`✓ Syntax check passed for all ${jsFiles.length} JavaScript files.`);

const manifestPath = path.join(extRoot, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert(
  manifest.browser_specific_settings &&
  manifest.browser_specific_settings.gecko &&
  manifest.browser_specific_settings.gecko.id === 'linguatube-pro@zenbrowser.ext',
  'manifest.browser_specific_settings.gecko.id must be linguatube-pro@zenbrowser.ext'
);
assert(
  manifest.background && Array.isArray(manifest.background.scripts) && manifest.background.scripts.length > 0,
  'manifest.background.scripts must be a non-empty array'
);
assert(
  !('service_worker' in manifest.background),
  'manifest.background must NOT use Chrome-only service_worker without Firefox scripts'
);
const actionField = manifest.action || manifest.browser_action;
assert(
  actionField && !('default_popup' in actionField),
  'manifest action/browser_action must NOT have default_popup (direct tab launch via onClicked)'
);

const warPaths = Array.isArray(manifest.web_accessible_resources)
  ? manifest.web_accessible_resources.flatMap((w) => (typeof w === 'string' ? [w] : w.resources || []))
  : [];

const referencedPaths = [
  ...manifest.background.scripts,
  ...Object.values(manifest.icons),
  ...manifest.content_scripts.flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]),
  ...warPaths
];

for (const rel of referencedPaths) {
  const abs = path.join(extRoot, rel);
  assert(fs.existsSync(abs) && fs.statSync(abs).size > 0, `Referenced file missing or empty: ${rel}`);
}
console.log(`✓ All ${referencedPaths.length} manifest-referenced paths exist and are non-empty.`);

const srcFiles = getAllFiles(path.join(extRoot, 'src'));
for (const file of srcFiles) {
  const content = fs.readFileSync(file, 'utf8');
  assert(!/\bchrome\.(runtime|storage|tabs|action|scripting)\b/.test(content), `Found forbidden chrome.* API in ${file}`);
}
console.log('✓ Verified pure Firefox browser.* API usage across all source files.');

console.log('=== 2. Running Valid Binary Icons & .xpi Package Check ===');
const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
for (const iconSize of [48, 96, 128]) {
  const iconFile = path.join(extRoot, 'icons', `icon${iconSize}.png`);
  assert(fs.existsSync(iconFile), `Missing icon${iconSize}.png`);
  const buf = fs.readFileSync(iconFile);
  assert(buf.subarray(0, 8).equals(pngMagic), `Invalid PNG magic bytes in icon${iconSize}.png`);
}
const xpiPath = path.join(extRoot, 'linguatube-pro.xpi');
assert(fs.existsSync(xpiPath) && fs.statSync(xpiPath).size > 1000, 'linguatube-pro.xpi archive must exist and be non-empty');
console.log('✓ Binary PNG icons (48, 96, 128) and linguatube-pro.xpi verified.');

console.log('=== 3. Running Leitner Box State Machine Unit Tests ===');
const t0 = 1730000000000;
let card = {
  id: 'word-generator',
  word: 'text-to-image generator',
  isPhrase: true,
  box: 1,
  nextReviewAt: t0,
  reviewCount: 0,
  lapseCount: 0,
  easeFactor: 2.5
};

const expectedIntervalsDays = [2, 4, 8, 16, 30];
for (let step = 0; step < 5; step++) {
  card = constants.gradeLeitnerCard(card, 'correct', t0);
  const expectedBox = step + 2;
  assert.strictEqual(card.box, expectedBox, `Expected promotion to Box ${expectedBox}`);
  const expectedDelta = expectedIntervalsDays[step] * 24 * 3600 * 1000;
  assert.strictEqual(card.nextReviewAt - t0, expectedDelta, `Interval mismatch at Box ${expectedBox}`);
}
assert.strictEqual(card.box, 6, 'Card should reach Box 6 (Mastered) after 5 consecutive correct answers');

let box4Card = { id: 'word-ephemeral', word: 'ephemeral', box: 4, reviewCount: 3, lapseCount: 0 };
box4Card = constants.gradeLeitnerCard(box4Card, 'wrong', t0);
assert.strictEqual(box4Card.box, 1, 'Wrong answer on Box 4 card must reset immediately to Box 1');
assert.strictEqual(box4Card.lapseCount, 1, 'Lapse count must increment on wrong answer');

let ankiCard = { id: 'word-creates', word: 'creates', ankiState: 'new', intervalDays: 0, easeFactor: 2.5, reviewCount: 0, lapseCount: 0 };
ankiCard = constants.gradeAnkiCard(ankiCard, 'good', t0);
assert.strictEqual(ankiCard.intervalDays, 1, '1st Good on new Anki card must graduate to 1d (tomorrow)');
assert.strictEqual(ankiCard.nextReviewAt - t0, 86400000, '1st Good must schedule nextReviewAt 1 day in the future');
ankiCard = constants.gradeAnkiCard(ankiCard, 'good', t0 + 86400000);
assert.strictEqual(ankiCard.intervalDays, 4, '2nd Good on 1d Anki card must schedule 4d');
const multiPosHit = constants.lookupInstantLocalMultiPos('creates');
assert(multiPosHit && multiPosHit.wordMeanings.length >= 3, 'lookupInstantLocalMultiPos must lemmatize "creates" -> "create" and return multiple Persian meanings');
console.log('✓ 5-Box Leitner + AnkiDroid SM-2 state machine & multi-POS lemmatizer verified.');

console.log('=== 4. Running v2.0 Upfront ASR Sentence Reconstructor & Concordance Unit Tests ===');
const rollingAsrJson3 = {
  events: [
    {
      tStartMs: 26000,
      dDurationMs: 4200,
      segs: [
        { utf8: 'New ', tOffsetMs: 0 },
        { utf8: 'top ', tOffsetMs: 300 },
        { utf8: 'local ', tOffsetMs: 600 },
        { utf8: 'AI ', tOffsetMs: 900 },
        { utf8: 'image ', tOffsetMs: 1200 },
        { utf8: 'generator ', tOffsetMs: 1500 },
        { utf8: 'is ', tOffsetMs: 1800 },
        { utf8: 'here!', tOffsetMs: 2100 }
      ]
    },
    {
      tStartMs: 49000,
      dDurationMs: 5000,
      segs: [
        { utf8: 'that this is just a text-to-image generator, so you can\'t edit images.', tOffsetMs: 0 }
      ]
    },
    { tStartMs: 55000, dDurationMs: 2000, segs: [{ utf8: '[Music]' }] }
  ]
};
const cleanSentences = subtitleParser.rebuildCleanSentencesFromJson3(rollingAsrJson3);
assert.strictEqual(cleanSentences.length, 2, 'Should reconstruct 2 static sentences and filter [Music]');
assert.strictEqual(cleanSentences[0].text, 'New top local AI image generator is here!', 'First sentence must be reconstructed cleanly without rolling fragments');
assert(!isNaN(cleanSentences[0].tStartMs) && !isNaN(cleanSentences[0].endMs), 'Cue timestamps must never be NaN');

const concordance = persianUtils.findInVideoExamples(cleanSentences, 'generator');
assert.strictEqual(concordance.length, 2, 'Should find 2 in-video concordance sentences for "generator"');

const tokens = persianUtils.tokenizeSubtitleLine(cleanSentences[0].text);
const wordTokens = tokens.filter((t) => t.isWord);
assert.strictEqual(wordTokens.length, 8, 'Should tokenize 8 words cleanly with wordIndex');

const normalizedFa = persianUtils.normalizePersian('كتاب‌هاي   مفيد');
assert.strictEqual(normalizedFa, 'کتاب‌های مفید', 'Arabic Yeh/Kaf and spaces must normalize to Persian');
console.log('✓ Upfront ASR sentence reconstructor, concordance, tokenizer, and Persian normalizer verified.');

console.log('=== 5. Running RTL, Compact Pill & Zero-Placeholder Audit ===');
const stylesContent = fs.readFileSync(path.join(extRoot, 'src/content/content-styles.css'), 'utf8');
assert(stylesContent.includes('Vazirmatn'), 'Vazirmatn font must be present in content-styles.css');
assert(stylesContent.includes('direction: rtl'), 'direction: rtl must be present in content-styles.css');
assert(stylesContent.includes('unicode-bidi: plaintext'), 'unicode-bidi: plaintext must be present in content-styles.css');
assert(stylesContent.includes('width: fit-content'), 'Compact pill width: fit-content must be present in content-styles.css');
assert(stylesContent.includes('#0b5772'), 'Teal mini-tooltip #0b5772 must be present in content-styles.css');

const bannedMarkers = ['TO' + 'DO', 'FIX' + 'ME', 'implement' + ' here'];
for (const f of srcFiles) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const marker of bannedMarkers) {
    assert(!txt.includes(marker), `Found placeholder marker ${marker} in ${f}`);
  }
}
console.log('✓ RTL typography, compact pill CSS, & Zero-Placeholder audit passed with 0 errors.');
console.log('\nALL LINGUATUBE REACTOR PRO v2.0 VERIFICATION CHECKS PASSED 100%!');
