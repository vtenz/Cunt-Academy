import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeAnkiCard,
  gradeLeitnerCard,
  computeAnkiNextIntervals,
  computeAnkiDeckCounts,
  getDueAnkiQueue,
  updateCardBackContent,
  lookupComprehensiveLocalDictionary,
  rebuildCleanSentencesFromJson3,
  findInVideoExamples,
  tokenizeSubtitleLine,
  normalizePersian,
  resolveWordVisualCategory,
  computePhrasePumpPipelineCounts,
  buildContextualGrammarAnalysisFa,
  generatePrintableTranscriptHtml,
  generateTranscriptCsv,
  detectCollocationAtWord,
  DEFAULT_LR_SETTINGS,
  INITIAL_SEED_CARDS,
  DEMO_DUAL_SUBTITLES,
  DAY_MS,
  MINUTE_MS,
  type LeitnerCard,
} from './linguatubeLogic.ts';

test('AnkiDroid SM-2 State Machine schedules 1d -> 4d -> 10d and removes graded cards from today due queue', () => {
  const t0 = Date.now();
  let card: LeitnerCard = {
    ...INITIAL_SEED_CARDS[0],
    ankiState: 'new',
    intervalDays: 0,
    box: 1,
    easeFactor: 2.5,
    nextReviewAt: t0 - 1000,
    status: 'learning',
  };

  // Preview on New card: Again <10m, Hard 1d, Good 1d, Easy 4d
  const preview1 = computeAnkiNextIntervals(card);
  assert.equal(preview1.goodDays, 1);
  assert.equal(preview1.easyDays, 4);

  // First Good -> graduates to 1d (tomorrow)
  card = gradeAnkiCard(card, 'good', t0);
  assert.equal(card.intervalDays, 1);
  assert.equal(card.ankiState, 'review');
  assert.equal(card.nextReviewAt, t0 + 1 * DAY_MS);

  // Immediately after grading Good, card is NO LONGER in today's due queue!
  const dueTodayAfterFirstReview = getDueAnkiQueue([card], t0, 'all', false);
  assert.equal(dueTodayAfterFirstReview.length, 0);

  // Fast-forward 1 day: second Good -> 4 days
  const t1 = t0 + 1 * DAY_MS;
  const preview2 = computeAnkiNextIntervals(card);
  assert.equal(preview2.goodDays, 4);
  card = gradeAnkiCard(card, 'good', t1);
  assert.equal(card.intervalDays, 4);
  assert.equal(card.nextReviewAt, t1 + 4 * DAY_MS);

  // Fast-forward 4 days: third Good -> round(4 * easeFactor) = 10 days
  const t2 = t1 + 4 * DAY_MS;
  card = gradeAnkiCard(card, 'good', t2);
  assert.ok(card.intervalDays && card.intervalDays >= 10);

  // Grading Again resets intervalDays to 0 and schedules in 10 minutes
  card = gradeLeitnerCard(card, 'again', t2);
  assert.equal(card.intervalDays, 0);
  assert.equal(card.ankiState, 'relearning');
  assert.equal(card.nextReviewAt, t2 + 10 * MINUTE_MS);
});

test('updateCardBackContent edits Persian translation, custom notes, and context sentences cleanly', () => {
  const original = INITIAL_SEED_CARDS[0];
  const updated = updateCardBackContent(original, {
    translationFa: 'پشت سر گذاشتن، تجربه کردن، استقامت کردن',
    customNotesFa: 'یادداشت شخصی من برای پشت کارت آنکی',
    contextSentenceFa: 'ما در حال تجربه یک تحول بزرگ هستیم.',
  });
  assert.equal(updated.translationFa, 'پشت سر گذاشتن، تجربه کردن، استقامت کردن');
  assert.equal(updated.customNotesFa, 'یادداشت شخصی من برای پشت کارت آنکی');
  assert.equal(updated.contextSentenceFa, 'ما در حال تجربه یک تحول بزرگ هستیم.');
});

test('computeAnkiDeckCounts and computePhrasePumpPipelineCounts compute accurate due & pipeline counts', () => {
  const now = Date.now();
  const ankiCounts = computeAnkiDeckCounts(INITIAL_SEED_CARDS, now);
  assert.equal(ankiCounts.newCount, 1);
  assert.equal(ankiCounts.learningCount, 1);
  assert.equal(ankiCounts.reviewDueCount, 2);
  assert.equal(ankiCounts.totalDueToday, 4);
  assert.equal(ankiCounts.scheduledFutureCount, 3);

  const pipelineCounts = computePhrasePumpPipelineCounts(INITIAL_SEED_CARDS, now);
  assert.equal(pipelineCounts.markedCount, 2);
  assert.equal(pipelineCounts.learningNowCount, 3);
  assert.equal(pipelineCounts.learnedCount, 2);
  assert.equal(pipelineCounts.dueUrgentCount, 4);
});

test('lookupComprehensiveLocalDictionary returns multi-POS meanings and lemmatizes inflected words', () => {
  const res1 = lookupComprehensiveLocalDictionary('creates');
  assert.equal(res1.lemma, 'create');
  assert.ok(res1.posEntries.length >= 2);
  assert.ok(res1.translationFa.includes('خلق کردن'));

  const res2 = lookupComprehensiveLocalDictionary('prompt');
  assert.equal(res2.posEntries.length, 3); // noun, verb, adjective
});

test('detectCollocationAtWord detects 2-word and 3-word phrasal verbs and collocations', () => {
  const words = ['We', 'are', 'going', 'through', 'a', 'revolution', 'with', 'most', 'people'];
  const c1 = detectCollocationAtWord(words, 2);
  assert.ok(c1);
  assert.equal(c1.phrase, 'going through');
  assert.ok(c1.meaningFa.includes('پشت سر گذاشتن'));

  const c2 = detectCollocationAtWord(words, 8);
  assert.ok(c2);
  assert.equal(c2.phrase, 'most people');
  assert.ok(c2.meaningFa.includes('اکثر مردم'));
});

test('resolveWordVisualCategory classifies Known, Suggested, Learning, and Ignored tokens', () => {
  const knownCat = resolveWordVisualCategory('the', undefined, DEFAULT_LR_SETTINGS);
  assert.equal(knownCat, 'known');

  const suggestedCat = resolveWordVisualCategory('resilient', undefined, DEFAULT_LR_SETTINGS);
  assert.equal(suggestedCat, 'suggested');

  const learningCat = resolveWordVisualCategory('generator', INITIAL_SEED_CARDS[1], DEFAULT_LR_SETTINGS);
  assert.equal(learningCat, 'learning');
});

test('buildContextualGrammarAnalysisFa and transcript exporters work accurately', () => {
  const analysis = buildContextualGrammarAnalysisFa(
    'going',
    'We are going through a revolution right now.',
    'phrasal verb',
    'پشت سر گذاشتن'
  );
  assert.ok(analysis.includes('phrasal verb'));
  assert.ok(analysis.includes('going through'));

  const html = generatePrintableTranscriptHtml('Demo Study Video', DEMO_DUAL_SUBTITLES);
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('New top local AI image generator is here!'));

  const csv = generateTranscriptCsv(DEMO_DUAL_SUBTITLES);
  assert.ok(csv.startsWith('Index,Timestamp,English Subtitle,Persian Translation'));
});

test('rebuildCleanSentencesFromJson3 interpolates block captions proportionally so split sentences do not desync', () => {
  const cues = rebuildCleanSentencesFromJson3({
    events: [
      {
        tStartMs: 10000,
        dDurationMs: 6000,
        // Multi-sentence block caption without tOffsetMs
        segs: [
          {
            utf8: 'First sentence has five words. Second sentence starts much later here.',
          },
        ],
      },
      {
        tStartMs: 17000,
        dDurationMs: 1000,
        segs: [{ utf8: '[Music]' }],
      },
    ],
  });
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'First sentence has five words.');
  assert.equal(cues[1].text, 'Second sentence starts much later here.');
  // Second sentence must start roughly halfway through the 6000ms block (~12400ms), NOT at 10200ms!
  assert.ok(cues[1].tStartMs >= 12000, `Expected second cue startMs >= 12000, got ${cues[1].tStartMs}`);
  assert.equal(findInVideoExamples(DEMO_DUAL_SUBTITLES, 'generator').length, 3);
  assert.equal(tokenizeSubtitleLine('text-to-image generator').filter((t) => t.isWord).length, 2);
  assert.equal(normalizePersian('كتاب‌هاي مفيد'), 'کتاب‌های مفید');
});
