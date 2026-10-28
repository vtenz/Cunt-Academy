export interface PosEntry {
  pos: string;
  terms: string[];
}

export interface TatoebaExample {
  en: string;
  fa: string;
  source: 'Tatoeba' | 'Corpus';
}

export type AnkiCardState = 'new' | 'learning' | 'review' | 'relearning';
export type AnkiGrade = 'again' | 'hard' | 'good' | 'easy' | 'correct' | 'wrong';

export interface LeitnerCard {
  id: string;
  word: string;
  lemma: string;
  isPhrase?: boolean;
  status?: 'learning' | 'known' | 'ignored';
  pumpStage?: 'marked' | 'learning_now' | 'learned' | 'ignored';
  ankiState?: AnkiCardState;
  intervalDays?: number;
  learningStep?: number;
  customNotesFa?: string;
  cefr?: string;
  freqTag?: string;
  rank?: number;
  phonetic: string;
  translationFa: string;
  miniMeaningsFa?: string[];
  aiExplanationFa?: string;
  posEntries: PosEntry[];
  englishDefinition: string;
  contextSentenceEn: string;
  contextSentenceFa: string;
  tatoebaExamples?: TatoebaExample[];
  videoId: string;
  videoTitle: string;
  videoTimestampSec: number;
  box: number; // 1 = New/Relearning, 2 = 1d..2d, 3 = 3d..6d, 4 = 7d..15d, 5 = 16d..29d, 6 = 30d+ (Mature)
  nextReviewAt: number;
  lastReviewedAt: number;
  reviewCount: number;
  lapseCount: number;
  easeFactor: number;
  createdAt: number;
}

export interface SavedSentence {
  id: string;
  sentenceEn: string;
  sentenceFa: string;
  videoId: string;
  videoTitle: string;
  timestampSec: number;
  createdAt: number;
}

export interface WordTimingSegment {
  index: number;
  word: string;
  startMs: number;
  endMs: number;
}

export interface SubtitleCue {
  id: string;
  tStartMs: number;
  dDurationMs: number;
  endMs: number;
  textEn: string;
  textFa: string;
  words?: WordTimingSegment[];
}

export interface TokenizedWord {
  text: string;
  isWord: boolean;
  cleanWord: string;
  wordIndex: number;
}

export interface WordColorPalette {
  known: string;
  suggested: string;
  learning: string;
  ignored: string;
  special: string;
  unranked: string;
}

export const WORD_COLOR_PRESETS: Record<'default-lr' | 'kevin-hunting', { label: string; colors: WordColorPalette }> = {
  'default-lr': {
    label: 'Language Reactor Default (Green Known / Orange Target / Purple Ignore)',
    colors: {
      known: '#3cd670',
      suggested: '#ff9800',
      learning: '#ff9800',
      ignored: '#b388ff',
      special: '#4dd0e1',
      unranked: '#ffffff',
    },
  },
  'kevin-hunting': {
    label: "Kevin's Word Hunting Mode (Green Known / Red Target / Blackout Ignore)",
    colors: {
      known: '#2ecc71',
      suggested: '#ff3b30',
      learning: '#ff3b30',
      ignored: '#26262e',
      special: '#38bdf8',
      unranked: '#f4f4f5',
    },
  },
};

export interface LanguageReactorSettings {
  lrEnabled: boolean;
  hidePlaybackBar: boolean;
  showMachineTranslation: boolean;
  showHumanTranslation: boolean;
  showTransliterations: 'none' | 'romanization' | 'ipa';
  hideSubtitles: 'disabled' | 'blur_translation' | 'subtitle_then_translation' | 'hide_l2' | 'hide_both';
  vocabularyHighlighting: 'Disabled' | 'Underline' | 'Text' | 'Background' | 'Blur';
  vocabOutline: boolean;
  wordColorPreset: 'default-lr' | 'kevin-hunting' | 'custom';
  wordColors: WordColorPalette;
  suggestedToKnownRatio: number;
  vocabLevel: number;
  wordColorKnown: boolean;
  wordColorLearning: boolean;
  wordColorUncommon: boolean;
  rightClickAction: 'toggle_known_learning' | 'save_known' | 'save_learning' | 'none';
  showMiniDictionary: boolean;
  dictionaryMouseHover: boolean;
  hoverPauseAtCueEnd: boolean;
  showSubtitleControls: boolean;
  showSubtitlesListView: boolean;
  useArrowKeys: boolean;
  speakWordOnClick: boolean;
  autoPauseAfterCue: boolean;
  // Trancy Word-by-Word & Subtitle Styling
  wordByWordHighlight: boolean;
  subtitleBgOpacity: number; // 0..100
  subtitleBgBlur: boolean;
  subtitleFontSizePercent: number; // 70..160
  translationFontSizePercent: number; // 70..160
  subtitleFontColor: string;
  translationFontColor: string;
  subtitleFontFamily: string;
  subtitleFontBold: boolean;
  subtitleTextStyle: 'shadow' | 'outline' | 'raised' | 'netflix' | 'none';
  translationPriority: boolean;
  subtitlePosition: {
    custom: boolean;
    xPercent: number;
    bottomPx: number;
  };
  aiPromptLanguage: string;
}

export const DEFAULT_LR_SETTINGS: LanguageReactorSettings = {
  lrEnabled: true,
  hidePlaybackBar: true,
  showMachineTranslation: true,
  showHumanTranslation: true,
  showTransliterations: 'none',
  hideSubtitles: 'disabled',
  vocabularyHighlighting: 'Disabled',
  vocabOutline: false,
  wordColorPreset: 'default-lr',
  wordColors: { ...WORD_COLOR_PRESETS['default-lr'].colors },
  suggestedToKnownRatio: 1.0,
  vocabLevel: 2500,
  wordColorKnown: true,
  wordColorLearning: true,
  wordColorUncommon: true,
  rightClickAction: 'toggle_known_learning',
  showMiniDictionary: true,
  dictionaryMouseHover: false,
  hoverPauseAtCueEnd: true,
  showSubtitleControls: true,
  showSubtitlesListView: false,
  useArrowKeys: true,
  speakWordOnClick: true,
  autoPauseAfterCue: false,
  wordByWordHighlight: true,
  subtitleBgOpacity: 75,
  subtitleBgBlur: true,
  subtitleFontSizePercent: 100,
  translationFontSizePercent: 95,
  subtitleFontColor: '#ffffff',
  translationFontColor: '#fde047',
  subtitleFontFamily: 'Inter',
  subtitleFontBold: true,
  subtitleTextStyle: 'shadow',
  translationPriority: false,
  subtitlePosition: {
    custom: false,
    xPercent: 50,
    bottomPx: 62,
  },
  aiPromptLanguage: 'Persian',
};

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 3600 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const LEITNER_INTERVALS_MS: Record<number, number> = {
  1: 1 * DAY_MS,
  2: 4 * DAY_MS,
  3: 10 * DAY_MS,
  4: 25 * DAY_MS,
  5: 60 * DAY_MS,
  6: 120 * DAY_MS,
};

export const LEITNER_BOX_META: Array<{
  box: number;
  titleFa: string;
  stageEn: string;
  intervalFa: string;
  accentColor: string;
}> = [
  { box: 1, titleFa: 'Marked to Learn (خانه ۱)', stageEn: 'Marked to Learn', intervalFa: 'مرور فوری در PhrasePump', accentColor: 'amber' },
  { box: 2, titleFa: 'Learning Now — گام ۱ (خانه ۲)', stageEn: 'Learning Now (2d)', intervalFa: 'فاصله مرور: ۲ روز', accentColor: 'purple' },
  { box: 3, titleFa: 'Learning Now — گام ۲ (خانه ۳)', stageEn: 'Learning Now (4d)', intervalFa: 'فاصله مرور: ۴ روز', accentColor: 'purple' },
  { box: 4, titleFa: 'Learning Now — گام ۳ (خانه ۴)', stageEn: 'Learning Now (8d)', intervalFa: 'فاصله مرور: ۸ روز', accentColor: 'purple' },
  { box: 5, titleFa: 'Learned — تثبیت اولیه (خانه ۵)', stageEn: 'Learned (16d)', intervalFa: 'فاصله مرور: ۱۶ روز', accentColor: 'emerald' },
  { box: 6, titleFa: 'Learned & Mastered (سبز دائمی)', stageEn: 'Mastered (30d)', intervalFa: 'حافظه بلندمدت (۳۰ روز)', accentColor: 'emerald' },
];

export const PHRASAL_AND_COLLOCATION_MAP: Record<string, string> = {
  'most people': 'اکثر مردم، بیشتر افراد',
  'going through': 'پشت سر گذاشتن، تجربه کردن، عبور کردن از',
  'go through': 'تجربه کردن، بررسی کردن، پشت سر گذاشتن',
  'it is not': 'اینطور نیست، نیست',
  'right now': 'همین الان، در حال حاضر',
  '24 hours': '۲۴ ساعت، شبانه‌روز',
  'somewhere in between': 'جایی در این میان، حد وسط',
  'in between': 'در این میان، مابین',
  'come up with': 'ابداع کردن، به ذهن رسیدن، پیشنهاد دادن',
  'text-to-image generator': 'مولد متن به تصویر، سیستم تبدیل متن به عکس',
  'open-source image generator': 'مولد تصویر متن‌باز',
  'local ai image generator': 'مولد تصویر هوش مصنوعی محلی',
  'spaced repetition': 'تکرار با فاصله (سیستم حافظه بلندمدت)',
  'short-term memories': 'خاطرات کوتاه‌مدت',
  'effortless fluency': 'روانی بی‌دردسر در گفتار',
  'figure out': 'سر درآوردن، فهمیدن، حل کردن',
  'find out': 'فهمیدن، کشف کردن، متوجه شدن',
  'look forward to': 'مشتاقانه منتظر بودن',
  'give up': 'تسلیم شدن، دست کشیدن از',
  'turn out': 'از آب درآمدن، مشخص شدن',
  'point out': 'اشاره کردن، خاطرنشان کردن',
  'end up': 'در نهایت کار کسی به جایی رسیدن',
  'deal with': 'سروکار داشتن با، رسیدگی کردن به',
};

export interface DetectedCollocation {
  phrase: string;
  meaningFa: string;
  startIndex: number;
  endIndex: number;
}

export function detectCollocationAtWord(
  wordArray: string[],
  hoveredWordIndex: number
): DetectedCollocation | null {
  if (!Array.isArray(wordArray) || hoveredWordIndex < 0 || hoveredWordIndex >= wordArray.length) {
    return null;
  }
  const cleanWords = wordArray.map((w) =>
    String(w || '')
      .toLowerCase()
      .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
  );

  // Check 3-word windows containing hoveredWordIndex
  for (let start = Math.max(0, hoveredWordIndex - 2); start <= hoveredWordIndex; start++) {
    if (start + 2 < cleanWords.length) {
      const tri = `${cleanWords[start]} ${cleanWords[start + 1]} ${cleanWords[start + 2]}`;
      if (PHRASAL_AND_COLLOCATION_MAP[tri]) {
        return {
          phrase: wordArray.slice(start, start + 3).join(' '),
          meaningFa: PHRASAL_AND_COLLOCATION_MAP[tri],
          startIndex: start,
          endIndex: start + 2,
        };
      }
    }
  }

  // Check 2-word windows containing hoveredWordIndex
  for (let start = Math.max(0, hoveredWordIndex - 1); start <= hoveredWordIndex; start++) {
    if (start + 1 < cleanWords.length) {
      const bi = `${cleanWords[start]} ${cleanWords[start + 1]}`;
      if (PHRASAL_AND_COLLOCATION_MAP[bi]) {
        return {
          phrase: wordArray.slice(start, start + 2).join(' '),
          meaningFa: PHRASAL_AND_COLLOCATION_MAP[bi],
          startIndex: start,
          endIndex: start + 1,
        };
      }
    }
  }

  return null;
}

const CORE_RANK_MAP: Record<string, number> = {
  the: 1, be: 2, to: 3, of: 4, and: 5, a: 6, in: 7, that: 8, have: 9, i: 10,
  it: 11, for: 12, not: 13, on: 14, with: 15, as: 17, you: 18, do: 19, at: 20,
  this: 21, but: 22, by: 24, from: 25, they: 26, we: 27, can: 53, when: 51,
  so: 41, up: 42, if: 44, first: 88, new: 92, top: 240, here: 120, just: 57,
  most: 95, people: 65, going: 115, through: 135, revolution: 1450, right: 85, now: 58,
  somewhere: 890, between: 165, probably: 390, fall: 410,
  night: 145, sleep: 310, sand: 1120, miles: 980, inhabited: 4250, country: 290,
  shipwrecked: 6400, sailor: 3100, raft: 4800, ocean: 950, sunrise: 3200,
  local: 680, ai: 850, image: 720, images: 720, generator: 2650, brand: 1450,
  open: 340, source: 890, fast: 480, weights: 2350, detailed: 1950, prompt: 2800,
  resilient: 3850, creates: 1100, authentic: 2600, art: 540, spaced: 3900,
  repetition: 3400, transforms: 2950, ephemeral: 6900, short: 410, term: 690,
  memories: 1850, into: 62, effortless: 4700, fluency: 3600, edit: 1250,
};

export function estimateWordRank(rawWord: string): number {
  const clean = String(rawWord || '').toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  if (!clean) return 5000;
  if (CORE_RANK_MAP[clean]) return CORE_RANK_MAP[clean];
  return Math.min(8500, Math.max(400, clean.length * 520));
}

export function getWordDifficultyMeta(rawWord: string): { rank: number; cefr: string; freqTag: string } {
  const rank = estimateWordRank(rawWord);
  if (rank <= 1000) return { rank, cefr: 'A1', freqTag: 'tag 1k' };
  if (rank <= 2200) return { rank, cefr: 'A2', freqTag: 'tag 2k' };
  if (rank <= 3800) return { rank, cefr: 'B1', freqTag: 'tag 3k' };
  if (rank <= 6000) return { rank, cefr: 'B2', freqTag: 'tag 5k' };
  return { rank, cefr: 'C1', freqTag: 'tag 8k' };
}

export function resolveWordVisualCategory(
  rawWord: string,
  savedCard: LeitnerCard | undefined,
  settings: LanguageReactorSettings
): 'known' | 'suggested' | 'learning' | 'ignored' | 'unranked' {
  const clean = String(rawWord || '').toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  if (!clean) return 'unranked';

  if (savedCard) {
    if (savedCard.status === 'known' || savedCard.box >= 6) return 'known';
    if (savedCard.status === 'ignored') return 'ignored';
    return 'learning';
  }

  const rank = estimateWordRank(clean);
  const knownThreshold = settings.vocabLevel || 2500;
  const ratio = Number(settings.suggestedToKnownRatio || 1.0);
  const suggestedCap = Math.round(knownThreshold * (1 + ratio * 0.85));

  if (rank <= knownThreshold) return 'known';
  if (rank <= suggestedCap) return 'suggested';
  return 'unranked';
}

export function computePhrasePumpPipelineCounts(
  cards: LeitnerCard[],
  nowMs: number = Date.now()
): {
  markedCount: number;
  suggestedCount: number;
  learningNowCount: number;
  learnedCount: number;
  ignoredCount: number;
  dueUrgentCount: number;
} {
  let markedCount = 0;
  let learningNowCount = 0;
  let learnedCount = 0;
  let ignoredCount = 0;
  let dueUrgentCount = 0;

  for (const c of cards) {
    if (c.status === 'ignored') {
      ignoredCount += 1;
      continue;
    }
    if (c.status === 'known' || c.box >= 5) {
      learnedCount += 1;
    } else if (c.box >= 2 && c.box <= 4) {
      learningNowCount += 1;
    } else {
      markedCount += 1;
    }

    if (c.status !== 'known' && c.box <= 5 && (c.nextReviewAt || 0) <= nowMs) {
      dueUrgentCount += 1;
    }
  }

  return {
    markedCount,
    suggestedCount: 14,
    learningNowCount,
    learnedCount,
    ignoredCount,
    dueUrgentCount,
  };
}

export function buildContextualGrammarAnalysisFa(
  word: string,
  sentenceEn: string,
  pos: string,
  translationFa: string
): string {
  const clean = String(word || '').toLowerCase().trim();
  const meta = getWordDifficultyMeta(clean);
  const parts: string[] = [
    `نقش دستوری: ${pos || (/\s+/.test(clean) ? 'phrasal verb / idiom' : 'واژه')} (سطح ${meta.cefr} • ${meta.freqTag})`,
  ];
  if (translationFa) {
    parts.push(`معنی در این بافت: «${translationFa}»`);
  }
  if (sentenceEn) {
    const words = sentenceEn.split(/\s+/);
    const idx = words.findIndex((w) => w.toLowerCase().replace(/[^a-z0-9'-]/g, '') === clean);
    if (idx !== -1) {
      const detected = detectCollocationAtWord(
        words.map((w) => w.replace(/[^a-zA-Z0-9'-]/g, '')),
        idx
      );
      if (detected) {
        parts.push(`ترکیب تشخیص‌داده‌شده (Collocation): "${detected.phrase}" (${detected.meaningFa})`);
      }
    }
  }
  return parts.join(' — ');
}

export function generatePrintableTranscriptHtml(
  videoTitle: string,
  cues: SubtitleCue[]
): string {
  const rows = cues
    .map(
      (c, i) => `
      <tr>
        <td class="num">${i + 1}.</td>
        <td class="time">${formatTimestamp(c.tStartMs / 1000)}</td>
        <td class="en">${c.textEn}</td>
        <td class="fa" dir="rtl">${c.textFa}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${videoTitle} — Cunt Academy Printable Transcript</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 32px; color: #18181b; }
    h1 { font-size: 20px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 10px 12px; border-bottom: 1px solid #e4e4e7; vertical-align: top; font-size: 15px; }
    td.num, td.time { width: 52px; color: #71717a; font-family: monospace; font-size: 13px; }
    td.en { width: 45%; font-weight: 500; }
    td.fa { width: 45%; color: #27272a; }
  </style>
</head>
<body>
  <h1>${videoTitle}</h1>
  <table><tbody>${rows}</tbody></table>
</body>
</html>`;
}

export function generateTranscriptCsv(cues: SubtitleCue[]): string {
  const header = 'Index,Timestamp,English Subtitle,Persian Translation';
  const lines = cues.map((c, i) =>
    [
      i + 1,
      formatTimestamp(c.tStartMs / 1000),
      `"${String(c.textEn || '').replace(/"/g, '""')}"`,
      `"${String(c.textFa || '').replace(/"/g, '""')}"`,
    ].join(',')
  );
  return [header, ...lines].join('\n');
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function normalizePersian(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\u064A|\u0649|\u06CC/g, 'ی')
    .replace(/\u0643|\u06A9/g, 'ک')
    .replace(/\u0629/g, 'ه')
    .replace(/\u0623|\u0625|\u0622/g, 'ا')
    .replace(/\u200C+/g, '\u200C')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeForQuizComparison(str: string): string {
  return normalizePersian(str)
    .toLowerCase()
    .replace(/\u200C/g, ' ')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()؟،«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toPersianDigits(value: string | number): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] || d);
}

export function formatTimestamp(seconds: number): string {
  const totalSec = Math.max(0, Math.floor(Number(seconds) || 0));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const paddedMins = String(mins).padStart(2, '0');
  const paddedSecs = String(secs).padStart(2, '0');
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${paddedMins}:${paddedSecs}`;
  }
  return `${paddedMins}:${paddedSecs}`;
}

export function tokenizeSubtitleLine(text: string): TokenizedWord[] {
  if (!text || typeof text !== 'string') return [];
  const tokens: TokenizedWord[] = [];
  const regex = /([A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?:[-'][A-Za-z0-9]+)*)|([^A-Za-zÀ-ÖØ-öø-ÿ0-9]+)/g;
  let match: RegExpExecArray | null;
  let wordIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      tokens.push({
        text: match[1],
        isWord: true,
        cleanWord: match[1].toLowerCase().replace(/^['-]+|['-]+$/g, ''),
        wordIndex: wordIndex++,
      });
    } else if (match[2]) {
      tokens.push({
        text: match[2],
        isWord: false,
        cleanWord: '',
        wordIndex: -1,
      });
    }
  }
  return tokens;
}

export interface AnkiNextIntervalPreview {
  againLabel: string;
  hardLabel: string;
  goodLabel: string;
  easyLabel: string;
  againDays: number;
  hardDays: number;
  goodDays: number;
  easyDays: number;
  againMs: number;
  hardMs: number;
  goodMs: number;
  easyMs: number;
}

export function mapIntervalDaysToBox(intervalDays: number): number {
  if (intervalDays <= 0) return 1;
  if (intervalDays <= 2) return 2;
  if (intervalDays <= 6) return 3;
  if (intervalDays <= 15) return 4;
  if (intervalDays <= 29) return 5;
  return 6;
}

export function computeAnkiNextIntervals(card: LeitnerCard): AnkiNextIntervalPreview {
  const ease = Math.max(1.3, Math.min(3.2, Number(card.easeFactor) || 2.5));
  const rawIvl =
    typeof card.intervalDays === 'number'
      ? card.intervalDays
      : card.box <= 1
        ? 0
        : card.box === 2
          ? 1
          : card.box === 3
            ? 4
            : card.box === 4
              ? 10
              : 25;

  // New or Learning / Relearning card (intervalDays === 0)
  if (rawIvl <= 0 || card.ankiState === 'new' || card.ankiState === 'learning' || card.ankiState === 'relearning') {
    return {
      againLabel: '< 10m (دوباره)',
      hardLabel: '1d (فردا)',
      goodLabel: '1d (فردا)',
      easyLabel: '4d (۴ روز دیگر)',
      againDays: 0,
      hardDays: 1,
      goodDays: 1,
      easyDays: 4,
      againMs: 10 * MINUTE_MS,
      hardMs: 1 * DAY_MS,
      goodMs: 1 * DAY_MS,
      easyMs: 4 * DAY_MS,
    };
  }

  // First graduated review card (intervalDays === 1 -> second review goes to 4 days in Anki SM-2)
  if (rawIvl === 1) {
    return {
      againLabel: '< 10m (ریست)',
      hardLabel: '2d (۲ روز دیگر)',
      goodLabel: '4d (۴ روز دیگر)',
      easyLabel: '7d (۷ روز دیگر)',
      againDays: 0,
      hardDays: 2,
      goodDays: 4,
      easyDays: 7,
      againMs: 10 * MINUTE_MS,
      hardMs: 2 * DAY_MS,
      goodMs: 4 * DAY_MS,
      easyMs: 7 * DAY_MS,
    };
  }

  // Subsequent Anki SM-2 review intervals: Good = ivl * easeFactor, Hard = ivl * 1.2, Easy = ivl * easeFactor * 1.3
  const hardDays = Math.max(rawIvl + 1, Math.round(rawIvl * 1.2));
  const goodDays = Math.max(hardDays + 1, Math.round(rawIvl * ease));
  const easyDays = Math.max(goodDays + 2, Math.round(rawIvl * ease * 1.3));

  return {
    againLabel: '< 10m (ریست)',
    hardLabel: `${hardDays}d (${toPersianDigits(hardDays)} روز دیگر)`,
    goodLabel: `${goodDays}d (${toPersianDigits(goodDays)} روز دیگر)`,
    easyLabel: `${easyDays}d (${toPersianDigits(easyDays)} روز دیگر)`,
    againDays: 0,
    hardDays,
    goodDays,
    easyDays,
    againMs: 10 * MINUTE_MS,
    hardMs: hardDays * DAY_MS,
    goodMs: goodDays * DAY_MS,
    easyMs: easyDays * DAY_MS,
  };
}

export function gradeAnkiCard(
  card: LeitnerCard,
  rawGrade: AnkiGrade,
  nowMs: number = Date.now()
): LeitnerCard {
  const grade: 'again' | 'hard' | 'good' | 'easy' =
    rawGrade === 'wrong' ? 'again' : rawGrade === 'correct' ? 'good' : rawGrade;
  const preview = computeAnkiNextIntervals(card);
  const currentEase = Math.max(1.3, Math.min(3.2, Number(card.easeFactor) || 2.5));

  const updated: LeitnerCard = {
    ...card,
    lastReviewedAt: nowMs,
    reviewCount: (Number(card.reviewCount) || 0) + 1,
  };

  if (grade === 'again') {
    updated.ankiState = 'relearning';
    updated.intervalDays = 0;
    updated.learningStep = 0;
    updated.box = 1;
    updated.status = 'learning';
    updated.pumpStage = 'marked';
    updated.nextReviewAt = nowMs + preview.againMs;
    updated.lapseCount = (Number(card.lapseCount) || 0) + 1;
    updated.easeFactor = Math.max(1.3, Number((currentEase - 0.2).toFixed(2)));
  } else if (grade === 'hard') {
    const nextDays = preview.hardDays;
    const nextBox = mapIntervalDaysToBox(nextDays);
    updated.ankiState = 'review';
    updated.intervalDays = nextDays;
    updated.box = nextBox;
    updated.status = nextBox >= 6 ? 'known' : 'learning';
    updated.pumpStage = nextBox >= 5 ? 'learned' : 'learning_now';
    updated.nextReviewAt = nowMs + preview.hardMs;
    updated.easeFactor = Math.max(1.3, Number((currentEase - 0.15).toFixed(2)));
  } else if (grade === 'good') {
    const nextDays = preview.goodDays;
    const nextBox = mapIntervalDaysToBox(nextDays);
    updated.ankiState = 'review';
    updated.intervalDays = nextDays;
    updated.box = nextBox;
    updated.status = nextBox >= 6 ? 'known' : 'learning';
    updated.pumpStage = nextBox >= 5 ? 'learned' : 'learning_now';
    updated.nextReviewAt = nowMs + preview.goodMs;
    updated.easeFactor = Math.min(3.2, Number((currentEase + 0.05).toFixed(2)));
  } else {
    // easy
    const nextDays = preview.easyDays;
    const nextBox = mapIntervalDaysToBox(nextDays);
    updated.ankiState = 'review';
    updated.intervalDays = nextDays;
    updated.box = nextBox;
    updated.status = nextBox >= 6 ? 'known' : 'learning';
    updated.pumpStage = nextBox >= 5 ? 'learned' : 'learning_now';
    updated.nextReviewAt = nowMs + preview.easyMs;
    updated.easeFactor = Math.min(3.2, Number((currentEase + 0.15).toFixed(2)));
  }

  return updated;
}

export function gradeLeitnerCard(
  card: LeitnerCard,
  grade: AnkiGrade,
  nowMs: number = Date.now()
): LeitnerCard {
  return gradeAnkiCard(card, grade, nowMs);
}

export function updateCardBackContent(
  card: LeitnerCard,
  patch: {
    translationFa?: string;
    customNotesFa?: string;
    contextSentenceEn?: string;
    contextSentenceFa?: string;
    aiExplanationFa?: string;
    miniMeaningsFa?: string[];
  }
): LeitnerCard {
  const cleanTranslation =
    patch.translationFa !== undefined ? patch.translationFa.trim() : card.translationFa;
  return {
    ...card,
    translationFa: cleanTranslation || card.translationFa,
    customNotesFa:
      patch.customNotesFa !== undefined ? patch.customNotesFa.trim() : card.customNotesFa,
    contextSentenceEn:
      patch.contextSentenceEn !== undefined
        ? patch.contextSentenceEn.trim()
        : card.contextSentenceEn,
    contextSentenceFa:
      patch.contextSentenceFa !== undefined
        ? patch.contextSentenceFa.trim()
        : card.contextSentenceFa,
    aiExplanationFa:
      patch.aiExplanationFa !== undefined ? patch.aiExplanationFa.trim() : card.aiExplanationFa,
    miniMeaningsFa:
      patch.miniMeaningsFa !== undefined ? patch.miniMeaningsFa : card.miniMeaningsFa,
  };
}

export function computeAnkiDeckCounts(
  cards: LeitnerCard[],
  nowMs: number = Date.now()
): {
  newCount: number;
  learningCount: number;
  reviewDueCount: number;
  totalDueToday: number;
  scheduledFutureCount: number;
  nextDueTimestampMs: number | null;
} {
  let newCount = 0;
  let learningCount = 0;
  let reviewDueCount = 0;
  let scheduledFutureCount = 0;
  let nextDueTimestampMs: number | null = null;

  for (const c of cards) {
    if (c.status === 'ignored') continue;
    const isDue = (c.nextReviewAt || 0) <= nowMs;
    const ivl = typeof c.intervalDays === 'number' ? c.intervalDays : c.box <= 1 ? 0 : c.box;

    if (!isDue) {
      scheduledFutureCount += 1;
      if (nextDueTimestampMs === null || c.nextReviewAt < nextDueTimestampMs) {
        nextDueTimestampMs = c.nextReviewAt;
      }
      continue;
    }

    if ((c.reviewCount || 0) === 0 || c.ankiState === 'new') {
      newCount += 1;
    } else if (c.ankiState === 'learning' || c.ankiState === 'relearning' || ivl <= 0) {
      learningCount += 1;
    } else {
      reviewDueCount += 1;
    }
  }

  return {
    newCount,
    learningCount,
    reviewDueCount,
    totalDueToday: newCount + learningCount + reviewDueCount,
    scheduledFutureCount,
    nextDueTimestampMs,
  };
}

export function getDueAnkiQueue(
  cards: LeitnerCard[],
  nowMs: number = Date.now(),
  stageFilter: 'all' | 'marked' | 'learning_now' | 'learned' = 'all',
  customStudyAhead: boolean = false
): LeitnerCard[] {
  const activePool = cards.filter((c) => c.status !== 'ignored');

  if (stageFilter === 'marked') {
    const list = activePool.filter((c) => c.box === 1 && c.status !== 'known');
    return customStudyAhead ? list : list.filter((c) => (c.nextReviewAt || 0) <= nowMs);
  }
  if (stageFilter === 'learning_now') {
    const list = activePool.filter((c) => c.box >= 2 && c.box <= 4 && c.status !== 'known');
    return customStudyAhead ? list : list.filter((c) => (c.nextReviewAt || 0) <= nowMs);
  }
  if (stageFilter === 'learned') {
    const list = activePool.filter((c) => c.status === 'known' || c.box >= 5);
    return customStudyAhead ? list : list.filter((c) => (c.nextReviewAt || 0) <= nowMs);
  }

  // Strictly return ONLY due cards (`nextReviewAt <= nowMs`) so cards scheduled for tomorrow/4d NEVER repeat immediately!
  const dueNow = activePool
    .filter((c) => (c.nextReviewAt || 0) <= nowMs)
    .sort((a, b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0));

  if (dueNow.length > 0 || !customStudyAhead) {
    return dueNow;
  }

  // Only when user explicitly activates "Custom Study / Review Ahead" after finishing today's deck:
  return [...activePool].sort((a, b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0));
}

export function rebuildCleanSentencesFromJson3(json3Data: {
  events?: Array<{
    tStartMs?: number;
    dDurationMs?: number;
    aAppend?: number;
    segs?: Array<{ utf8?: string; tOffsetMs?: number }>;
  }>;
}): Array<{ id: string; tStartMs: number; dDurationMs: number; endMs: number; text: string; words: WordTimingSegment[] }> {
  if (!json3Data || !Array.isArray(json3Data.events)) return [];

  // Filter valid events with non-empty text segments and sort by tStartMs
  const validEvents = json3Data.events
    .filter((ev) => {
      if (!ev || typeof ev.tStartMs !== 'number' || Number.isNaN(ev.tStartMs)) return false;
      if (!Array.isArray(ev.segs) || ev.segs.length === 0) return false;
      if (
        ev.aAppend === 1 &&
        ev.segs.every((s) => !s || !s.utf8 || s.utf8.trim() === '')
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => (a.tStartMs || 0) - (b.tStartMs || 0));

  if (validEvents.length === 0) return [];

  const wordTokens: Array<{ word: string; startMs: number; endMs: number }> = [];

  for (let i = 0; i < validEvents.length; i++) {
    const ev = validEvents[i];
    const nextEv = validEvents[i + 1];
    const baseStartMs = Math.max(0, Math.round(ev.tStartMs || 0));
    const rawDurationMs =
      typeof ev.dDurationMs === 'number' && !Number.isNaN(ev.dDurationMs) && ev.dDurationMs > 0
        ? Math.round(ev.dDurationMs)
        : 2800;

    // Clamp effective event duration so rolling ASR windows (e.g. dDurationMs=6000 while next event is 1800ms later)
    // do not skew word interpolation or overlap the next event
    const maxAllowedDur =
      nextEv && typeof nextEv.tStartMs === 'number' && nextEv.tStartMs > baseStartMs + 150
        ? Math.min(rawDurationMs, Math.max(400, Math.round(nextEv.tStartMs - baseStartMs)))
        : rawDurationMs;
    const eventEndMs = baseStartMs + maxAllowedDur;

    // Collect all words inside this event along with any explicit tOffsetMs
    const eventWords: Array<{ word: string; explicitOffsetMs: number | null }> = [];
    let hasExplicitNonZeroOffset = false;

    for (let s = 0; s < (ev.segs || []).length; s++) {
      const seg = ev.segs![s];
      if (!seg || typeof seg.utf8 !== 'string') continue;
      const cleaned = seg.utf8.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!cleaned || /^\[.*\]$/.test(cleaned) || /^[♪♫\s]+$/.test(cleaned)) continue;

      const hasOffset = typeof seg.tOffsetMs === 'number' && !Number.isNaN(seg.tOffsetMs) && seg.tOffsetMs > 0;
      if (hasOffset) hasExplicitNonZeroOffset = true;
      const segOffset =
        typeof seg.tOffsetMs === 'number' && !Number.isNaN(seg.tOffsetMs)
          ? Math.max(0, Math.round(seg.tOffsetMs))
          : null;

      const pieces = cleaned.split(/\s+/).filter(Boolean);
      for (let p = 0; p < pieces.length; p++) {
        eventWords.push({
          word: pieces[p],
          explicitOffsetMs: p === 0 ? segOffset : null,
        });
      }
    }

    if (eventWords.length === 0) continue;

    if (hasExplicitNonZeroOffset) {
      // ASR word-by-word timed segments
      let lastKnownMs = baseStartMs;
      for (let wIdx = 0; wIdx < eventWords.length; wIdx++) {
        const item = eventWords[wIdx];
        const wStart =
          item.explicitOffsetMs !== null
            ? baseStartMs + item.explicitOffsetMs
            : lastKnownMs + 120;
        lastKnownMs = wStart;
        const nextExplicit =
          wIdx + 1 < eventWords.length && eventWords[wIdx + 1].explicitOffsetMs !== null
            ? baseStartMs + (eventWords[wIdx + 1].explicitOffsetMs as number)
            : Math.min(eventEndMs, wStart + 420);
        const wEnd = Math.max(wStart + 140, nextExplicit);
        wordTokens.push({ word: item.word, startMs: wStart, endMs: wEnd });
      }
    } else {
      // Block/manual caption event without per-word tOffsetMs: distribute timestamps proportionally across maxAllowedDur!
      const totalChars = Math.max(
        1,
        eventWords.reduce((acc, it) => acc + it.word.length, 0)
      );
      let runningChars = 0;
      for (let wIdx = 0; wIdx < eventWords.length; wIdx++) {
        const item = eventWords[wIdx];
        const fracStart = runningChars / totalChars;
        runningChars += item.word.length;
        const fracEnd = runningChars / totalChars;
        const wStart = Math.round(baseStartMs + fracStart * maxAllowedDur);
        const wEnd = Math.max(wStart + 140, Math.round(baseStartMs + fracEnd * maxAllowedDur));
        wordTokens.push({ word: item.word, startMs: wStart, endMs: wEnd });
      }
    }
  }

  if (wordTokens.length === 0) return [];
  wordTokens.sort((a, b) => a.startMs - b.startMs);

  const dedupedWords: typeof wordTokens = [];
  for (const tok of wordTokens) {
    const prev = dedupedWords[dedupedWords.length - 1];
    if (
      prev &&
      prev.word.toLowerCase() === tok.word.toLowerCase() &&
      Math.abs(tok.startMs - prev.startMs) < 950
    ) {
      prev.endMs = Math.max(prev.endMs, tok.endMs);
      continue;
    }
    dedupedWords.push(tok);
  }

  const MAX_WORDS_PER_CUE = 13;
  const MAX_CHARS_PER_CUE = 76;
  const PAUSE_SPLIT_MS = 650;

  const sentences: Array<{
    id: string;
    tStartMs: number;
    dDurationMs: number;
    endMs: number;
    text: string;
    words: WordTimingSegment[];
  }> = [];
  let bucket: typeof wordTokens = [];
  let bucketCharLen = 0;

  const flushBucket = () => {
    if (bucket.length === 0) return;
    const text = bucket
      .map((item) => item.word)
      .join(' ')
      .replace(/\s+([,.;!?])/g, '$1')
      .trim();
    if (!text) {
      bucket = [];
      bucketCharLen = 0;
      return;
    }
    const startMs = bucket[0].startMs;
    const lastWordEnd = bucket[bucket.length - 1].endMs;
    const endMs = Math.max(startMs + 900, lastWordEnd);
    sentences.push({
      id: `cue-${startMs}-${sentences.length}`,
      tStartMs: startMs,
      dDurationMs: endMs - startMs,
      endMs,
      text,
      words: bucket.map((w, idx) => ({
        index: idx,
        word: w.word,
        startMs: w.startMs,
        endMs: w.endMs,
      })),
    });
    bucket = [];
    bucketCharLen = 0;
  };

  for (const currentWord of dedupedWords) {
    if (bucket.length > 0) {
      const prevWord = bucket[bucket.length - 1];
      const gapMs = currentWord.startMs - prevWord.endMs;
      if (gapMs >= PAUSE_SPLIT_MS) {
        flushBucket();
      }
    }

    bucket.push(currentWord);
    bucketCharLen += currentWord.word.length + 1;

    const endsWithPunctuation = /[.!?]["')\]]*$/.test(currentWord.word);
    const endsWithCommaClause =
      /[,;:]["')\]]*$/.test(currentWord.word) && bucket.length >= 9;

    if (
      endsWithPunctuation ||
      endsWithCommaClause ||
      bucket.length >= MAX_WORDS_PER_CUE ||
      bucketCharLen >= MAX_CHARS_PER_CUE
    ) {
      flushBucket();
    }
  }
  flushBucket();

  for (let k = 0; k < sentences.length - 1; k++) {
    if (sentences[k].endMs > sentences[k + 1].tStartMs) {
      sentences[k].endMs = sentences[k + 1].tStartMs;
      sentences[k].dDurationMs = Math.max(300, sentences[k].endMs - sentences[k].tStartMs);
    }
  }

  return sentences;
}

export function parseYouTubeJson3(json3Data: {
  events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string; tOffsetMs?: number }> }>;
}): Array<{ id: string; tStartMs: number; dDurationMs: number; endMs: number; text: string; words: WordTimingSegment[] }> {
  return rebuildCleanSentencesFromJson3(json3Data);
}

export function findInVideoExamples(
  cues: SubtitleCue[],
  targetWordOrPhrase: string
): SubtitleCue[] {
  if (!Array.isArray(cues) || !targetWordOrPhrase) return [];
  const cleanTarget = targetWordOrPhrase.trim().toLowerCase();
  if (!cleanTarget) return [];
  const escaped = cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return cues.filter((cue) => pattern.test(cue.textEn));
}

export const DEMO_VIDEO_METADATA = {
  videoId: 'ai-image-gen-2026',
  videoTitle: 'We Are Going Through A Revolution Right Now! (Language Reactor & Trancy Showcase)',
  channelName: 'Cunt Academy Lab',
  durationSec: 52,
};

function buildWordTimingsForLine(textEn: string, tStartMs: number, dDurationMs: number): WordTimingSegment[] {
  const words = textEn.split(/\s+/).filter(Boolean);
  const step = Math.floor(dDurationMs / Math.max(1, words.length));
  return words.map((w, idx) => ({
    index: idx,
    word: w,
    startMs: tStartMs + idx * step,
    endMs: tStartMs + (idx + 1) * step,
  }));
}

export const DEMO_DUAL_SUBTITLES: SubtitleCue[] = [
  {
    id: 'cue-1',
    tStartMs: 26000,
    dDurationMs: 4500,
    endMs: 30500,
    textEn: 'New top local AI image generator is here!',
    textFa: 'بهترین تولیدکننده تصویر هوش مصنوعی محلی جدید اینجاست!',
    words: buildWordTimingsForLine('New top local AI image generator is here!', 26000, 4500),
  },
  {
    id: 'cue-2',
    tStartMs: 30500,
    dDurationMs: 5500,
    endMs: 36000,
    textEn: "that this is just a text-to-image generator, so you can't edit images.",
    textFa: 'اینکه این فقط یک مولد متن به تصویر است، بنابراین نمی‌توانید تصاویر را ویرایش کنید.',
    words: buildWordTimingsForLine("that this is just a text-to-image generator, so you can't edit images.", 30500, 5500),
  },
  {
    id: 'cue-3',
    tStartMs: 36000,
    dDurationMs: 5000,
    endMs: 41000,
    textEn: 'We are going through a revolution right now with most people learning faster.',
    textFa: 'ما همین الان در حال پشت سر گذاشتن یک انقلاب هستیم و اکثر مردم سریع‌تر یاد می‌گیرند.',
    words: buildWordTimingsForLine('We are going through a revolution right now with most people learning faster.', 36000, 5000),
  },
  {
    id: 'cue-4',
    tStartMs: 41000,
    dDurationMs: 5500,
    endMs: 46500,
    textEn: 'When you come up with a detailed prompt, this resilient generator creates authentic art.',
    textFa: 'وقتی یک پرامپت دقیق ابداع می‌کنید، این مولد مقاوم هنر اصیل خلق می‌کند.',
    words: buildWordTimingsForLine('When you come up with a detailed prompt, this resilient generator creates authentic art.', 41000, 5500),
  },
  {
    id: 'cue-5',
    tStartMs: 46500,
    dDurationMs: 5500,
    endMs: 52000,
    textEn: 'Spaced repetition transforms ephemeral short-term memories into effortless fluency.',
    textFa: 'تکرار با فاصله، خاطرات زودگذر کوتاه‌مدت را به روانی بی‌دردسر در گفتار تبدیل می‌کند.',
    words: buildWordTimingsForLine('Spaced repetition transforms ephemeral short-term memories into effortless fluency.', 46500, 5500),
  },
];

export const BUILTIN_DICTIONARY: Record<
  string,
  {
    word: string;
    phonetic: string;
    translationFa: string;
    miniMeaningsFa: string[];
    aiExplanationFa: string;
    posEntries: PosEntry[];
    englishDefinition: string;
    tatoebaExamples: TatoebaExample[];
  }
> = {
  generator: {
    word: 'generator',
    phonetic: '/JEN-uh-rey-ter/',
    translationFa: 'ژنراتور، مولد، تولیدکننده',
    miniMeaningsFa: ['ژنراتور', 'مولد', 'تولیدکننده'],
    aiExplanationFa:
      'نقش دستوری: noun (سطح B1 • tag 3k) — معنی در این بافت: «مولد / تولیدکننده» — ترکیب تشخیص‌داده‌شده: "AI image generator"',
    posEntries: [
      { pos: 'noun', terms: ['ژنراتور', 'مولد', 'تولیدکننده', 'تولیدگر', 'برق‌زا'] },
      { pos: 'compound', terms: ['مولد هوش مصنوعی'] },
    ],
    englishDefinition: 'A system, model, or machine that produces or generates something new.',
    tatoebaExamples: [
      {
        en: 'The hospital emergency generator started automatically.',
        fa: 'ژنراتور اضطراری بیمارستان به طور خودکار روشن شد.',
        source: 'Tatoeba',
      },
      {
        en: 'This neural image generator runs locally on your GPU.',
        fa: 'این مولد تصویر عصبی به صورت محلی روی کارت گرافیک شما اجرا می‌شود.',
        source: 'Tatoeba',
      },
    ],
  },
  'going through': {
    word: 'going through',
    phonetic: '/ˈɡoʊɪŋ θruː/',
    translationFa: 'پشت سر گذاشتن، تجربه کردن، عبور کردن از',
    miniMeaningsFa: ['پشت سر گذاشتن', 'تجربه کردن', 'عبور کردن از'],
    aiExplanationFa:
      'نقش دستوری: phrasal verb (سطح B1 • tag 2k) — فعل عبارتی دوکلمه‌ای برای بیان گذراندن یک دوره، تغییر بزرگ یا تجربه دشوار.',
    posEntries: [
      { pos: 'phrasal verb', terms: ['پشت سر گذاشتن', 'تجربه کردن', 'عبور کردن از', 'بررسی کردن'] },
    ],
    englishDefinition: 'Undergoing or experiencing a transformative or challenging period.',
    tatoebaExamples: [
      {
        en: 'We are going through a revolution right now.',
        fa: 'ما همین الان در حال پشت سر گذاشتن یک انقلاب هستیم.',
        source: 'Tatoeba',
      },
    ],
  },
  'most people': {
    word: 'most people',
    phonetic: '/moʊst ˈpiːpəl/',
    translationFa: 'اکثر مردم، بیشتر افراد',
    miniMeaningsFa: ['اکثر مردم', 'بیشتر افراد', 'عموم مردم'],
    aiExplanationFa:
      'نقش دستوری: collocation (سطح A2 • tag 1k) — هم‌نشینی پرتکرار انگلیسی (بدون حرف تعریف the).',
    posEntries: [
      { pos: 'collocation', terms: ['اکثر مردم', 'بیشتر افراد', 'عموم مردم'] },
    ],
    englishDefinition: 'The majority of human beings in general.',
    tatoebaExamples: [
      {
        en: 'Now most people will probably fall somewhere in between.',
        fa: 'حالا اکثر مردم احتمالاً جایی در این میان قرار می‌گیرند.',
        source: 'Tatoeba',
      },
    ],
  },
  revolution: {
    word: 'revolution',
    phonetic: '/ˌrevəˈluːʃən/',
    translationFa: 'انقلاب، دگرگونی بنیادین، چرخش',
    miniMeaningsFa: ['انقلاب', 'دگرگونی', 'چرخش'],
    aiExplanationFa:
      'نقش دستوری: noun (سطح B1 • tag 2k) — معنی در این بافت: «انقلاب و تحول بزرگ»',
    posEntries: [
      { pos: 'noun', terms: ['انقلاب', 'دگرگونی بنیادین', 'چرخش کامل', 'تحول'] },
    ],
    englishDefinition: 'A dramatic and wide-reaching change in conditions, attitudes, or operation.',
    tatoebaExamples: [
      {
        en: 'The digital revolution changed how we learn languages.',
        fa: 'انقلاب دیجیتال روش یادگیری زبان‌ها را تغییر داد.',
        source: 'Tatoeba',
      },
    ],
  },
  'text-to-image generator': {
    word: 'text-to-image generator',
    phonetic: '/tekst-too-IM-ij JEN-uh-rey-ter/',
    translationFa: 'مولد متن به تصویر، سیستم تبدیل متن به عکس',
    miniMeaningsFa: ['مولد متن به تصویر', 'تولیدکننده عکس از متن', 'مبدل متن به تصویر'],
    aiExplanationFa:
      'نقش دستوری: noun phrase (سطح B2 • tag 4k) — عبارت ترکیبی تخصصی برای مدل‌هایی که توصیف متنی (Prompt) را به تصویر تبدیل می‌کنند.',
    posEntries: [
      { pos: 'phrase', terms: ['مولد متن به تصویر', 'تولیدکننده تصویر از پرامپت متنی'] },
    ],
    englishDefinition: 'An AI model that synthesizes visual images directly from natural language descriptions.',
    tatoebaExamples: [
      {
        en: 'A text-to-image generator synthesizes scenes from written prompts.',
        fa: 'یک مولد متن به تصویر صحنه‌ها را از روی دستورات نوشتاری ترکیب و خلق می‌کند.',
        source: 'Tatoeba',
      },
    ],
  },
  'open-source image generator': {
    word: 'open-source image generator',
    phonetic: '/OH-puhn-sors IM-ij JEN-uh-rey-ter/',
    translationFa: 'مولد تصویر متن‌باز',
    miniMeaningsFa: ['مولد تصویر متن‌باز', 'تولیدکننده عکس اپن‌سورس'],
    aiExplanationFa:
      'نقش دستوری: noun phrase (سطح B2 • tag 4k) — مدل تولید تصویر با کد و وزن‌های آزاد که بدون نیاز به API پولی اجرا می‌شود.',
    posEntries: [
      { pos: 'phrase', terms: ['مولد تصویر متن‌باز', 'مدل گرافیکی آزاد'] },
    ],
    englishDefinition: 'An image generation model whose source code and weights are publicly accessible.',
    tatoebaExamples: [
      {
        en: 'Developers prefer an open-source image generator for full privacy.',
        fa: 'توسعه‌دهندگان برای حفظ حریم خصوصی کامل، مولد تصویر متن‌باز را ترجیح می‌دهند.',
        source: 'Tatoeba',
      },
    ],
  },
  'come up with': {
    word: 'come up with',
    phonetic: '/kuhm uhp with/',
    translationFa: 'ابداع کردن، به ذهن رسیدن، پیشنهاد دادن',
    miniMeaningsFa: ['ابداع کردن', 'به ذهن رسیدن', 'مطرح کردن'],
    aiExplanationFa:
      'نقش دستوری: phrasal verb (سطح B1 • tag 2k) — فعل عبارتی ۳ کلمه‌ای پرکاربرد به معنی طراحی کردن یا به ذهن رسیدن یک ایده یا پرامپت.',
    posEntries: [
      { pos: 'phrasal verb', terms: ['ابداع کردن', 'فکر بکری کردن', 'پیشنهاد دادن'] },
    ],
    englishDefinition: 'Produce or suggest an idea, plan, or prompt, especially when pressured or challenged.',
    tatoebaExamples: [
      {
        en: 'She came up with a brilliant solution to the problem.',
        fa: 'او راه‌حل درخشانی برای این مسئله ابداع کرد.',
        source: 'Tatoeba',
      },
    ],
  },
  local: {
    word: 'local',
    phonetic: '/LOH-kuhl/',
    translationFa: 'محلی، آفلاین (قابل اجرا روی سیستم شخصی)',
    miniMeaningsFa: ['محلی', 'موضعی', 'بومی'],
    aiExplanationFa:
      'نقش دستوری: adjective (سطح A1 • tag 1k) — هم‌نشینی واژگانی: "local AI image generator"',
    posEntries: [
      { pos: 'adjective', terms: ['محلی', 'داخلی', 'موضعی', 'بومی'] },
      { pos: 'noun', terms: ['بومی', 'ساکن محل'] },
    ],
    englishDefinition: 'Running directly on the user’s own computer hardware rather than a remote server.',
    tatoebaExamples: [
      {
        en: 'We always buy fresh bread from the local bakery.',
        fa: 'ما همیشه نان تازه را از نانوایی محلی می‌خریم.',
        source: 'Tatoeba',
      },
    ],
  },
  image: {
    word: 'image',
    phonetic: '/IM-ij/',
    translationFa: 'تصویر، عکس، نگاره',
    miniMeaningsFa: ['تصویر', 'عکس', 'نگاره'],
    aiExplanationFa:
      'نقش دستوری: noun (سطح A1 • tag 1k) — هم‌نشینی واژگانی: "image generator"',
    posEntries: [
      { pos: 'noun', terms: ['تصویر', 'عکس', 'تمثال', 'نگاره'] },
      { pos: 'verb', terms: ['تصویرسازی کردن', 'مجسم کردن'] },
    ],
    englishDefinition: 'A visual representation of something on a digital screen.',
    tatoebaExamples: [
      {
        en: 'Click on the image to view it in full resolution.',
        fa: 'برای مشاهده تصویر با وضوح کامل، روی آن کلیک کنید.',
        source: 'Tatoeba',
      },
    ],
  },
  edit: {
    word: 'edit',
    phonetic: '/ED-it/',
    translationFa: 'ویرایش کردن، اصلاح کردن، تدوین',
    miniMeaningsFa: ['ویرایش کردن', 'اصلاح کردن', 'بازبینی'],
    aiExplanationFa:
      'نقش دستوری: verb (سطح A2 • tag 2k) — هم‌نشینی واژگانی: "edit images"',
    posEntries: [
      { pos: 'verb', terms: ['ویرایش کردن', 'اصلاح کردن', 'تدوین کردن'] },
      { pos: 'noun', terms: ['ویرایش', 'نسخه ویرایش‌شده'] },
    ],
    englishDefinition: 'Prepare or modify visual or written material by correcting, condensing, or altering it.',
    tatoebaExamples: [
      {
        en: 'You can edit your saved flashcards at any time.',
        fa: 'شما می‌توانید فلش‌کارت‌های ذخیره‌شده خود را در هر زمانی ویرایش کنید.',
        source: 'Tatoeba',
      },
    ],
  },
  resilient: {
    word: 'resilient',
    phonetic: '/ri-ZIL-yuhnt/',
    translationFa: 'مقاوم، تاب‌آور، انعطاف‌پذیر',
    miniMeaningsFa: ['مقاوم', 'تاب‌آور', 'انعطاف‌پذیر'],
    aiExplanationFa:
      'نقش دستوری: adjective (سطح B2 • tag 5k) — هم‌نشینی واژگانی: "resilient generator"',
    posEntries: [
      { pos: 'adjective', terms: ['مقاوم', 'تاب‌آور', 'انعطاف‌پذیر', 'برگشت‌پذیر'] },
    ],
    englishDefinition: 'Able to withstand or recover quickly from difficult conditions.',
    tatoebaExamples: [
      {
        en: 'Children are often much more resilient than adults expect.',
        fa: 'کودکان اغلب بسیار تاب‌آورتر و مقاوم‌تر از آن چیزی هستند که بزرگسالان انتظار دارند.',
        source: 'Tatoeba',
      },
    ],
  },
  ephemeral: {
    word: 'ephemeral',
    phonetic: '/i-FEM-er-uhl/',
    translationFa: 'زودگذر، ناپایدار، کوتاه‌عمر',
    miniMeaningsFa: ['زودگذر', 'ناپایدار', 'کوتاه‌مدت'],
    aiExplanationFa:
      'نقش دستوری: adjective (سطح C1 • tag 8k) — هم‌نشینی واژگانی: "ephemeral short-term memories"',
    posEntries: [
      { pos: 'adjective', terms: ['زودگذر', 'فانی', 'موقتی', 'کوتاه‌مدت'] },
    ],
    englishDefinition: 'Lasting for a very short time; transitory.',
    tatoebaExamples: [
      {
        en: 'Fame in the digital world is often ephemeral.',
        fa: 'شهرت در دنیای دیجیتال اغلب زودگذر و ناپایدار است.',
        source: 'Tatoeba',
      },
    ],
  },
  authentic: {
    word: 'authentic',
    phonetic: '/aw-THEN-tik/',
    translationFa: 'اصیل، واقعی، معتبر',
    miniMeaningsFa: ['اصیل', 'واقعی', 'معتبر'],
    aiExplanationFa:
      'نقش دستوری: adjective (سطح B1 • tag 3k) — هم‌نشینی واژگانی: "creates authentic art"',
    posEntries: [
      { pos: 'adjective', terms: ['اصیل', 'واقعی', 'معتبر', 'خالص'] },
    ],
    englishDefinition: 'Of undisputed origin and not a copy; genuine.',
    tatoebaExamples: [
      {
        en: 'Watching authentic videos is the fastest path to language mastery.',
        fa: 'تماشای ویدیوهای اصیل سریع‌ترین مسیر برای تسلط بر زبان است.',
        source: 'Tatoeba',
      },
    ],
  },
  fluency: {
    word: 'fluency',
    phonetic: '/FLOO-uhn-see/',
    translationFa: 'روانی کلام، تسلط روان‌شناختی در زبان',
    miniMeaningsFa: ['روانی کلام', 'سلاست', 'تسلط زبانی'],
    aiExplanationFa:
      'نقش دستوری: noun (سطح B1 • tag 3k) — هم‌نشینی واژگانی: "effortless fluency"',
    posEntries: [
      { pos: 'noun', terms: ['روانی گفتار', 'سلاست', 'تسلط کامل'] },
    ],
    englishDefinition: 'The ability to express oneself easily and articulately in a language.',
    tatoebaExamples: [
      {
        en: 'Daily shadowing practice builds natural speaking fluency.',
        fa: 'تمرین روزانه شادوئینگ باعث ایجاد روانی طبیعی در صحبت کردن می‌شود.',
        source: 'Tatoeba',
      },
    ],
  },
  prompt: {
    word: 'prompt',
    phonetic: '/prɑːmpt/',
    translationFa: 'پرامپت (دستور متنی)، برانگیختن، سریع و به‌موقع، تلقین کردن',
    miniMeaningsFa: ['دستور متنی (پرامپت)', 'برانگیختن', 'سریع و فوری', 'فراخوانی'],
    aiExplanationFa:
      'نقش دستوری: noun / verb / adjective (سطح B2 • tag 3k) — هم به معنی دستور ورودی به هوش مصنوعی (Noun)، هم واداشتن/برانگیختن (Verb) و هم فوری/به‌موقع (Adjective).',
    posEntries: [
      { pos: 'noun', terms: ['پرامپت (دستور متنی به هوش مصنوعی)', 'فراخوان', 'یادآوری', 'تلقین'] },
      { pos: 'verb', terms: ['برانگیختن', 'واداشتن', 'باعث شدن', 'تلقین کردن'] },
      { pos: 'adjective', terms: ['سریع', 'فوری', 'به‌موقع', 'بی‌درنگ'] },
    ],
    englishDefinition: 'An instruction given to an AI system; or to cause/bring about an action; or done without delay.',
    tatoebaExamples: [
      {
        en: 'When you come up with a detailed prompt, this resilient generator creates authentic art.',
        fa: 'وقتی یک پرامپت دقیق ابداع می‌کنید، این مولد مقاوم هنر اصیل خلق می‌کند.',
        source: 'Tatoeba',
      },
    ],
  },
  create: {
    word: 'create',
    phonetic: '/kriˈeɪt/',
    translationFa: 'خلق کردن، ایجاد کردن، به وجود آوردن، تولید کردن',
    miniMeaningsFa: ['خلق کردن', 'ایجاد کردن', 'ساختن', 'تولید کردن'],
    aiExplanationFa:
      'نقش دستوری: verb (سطح A2 • tag 1k) — ریشه فعل creates/created/creating به معنی خلق کردن اثر جدید.',
    posEntries: [
      { pos: 'verb', terms: ['خلق کردن', 'ایجاد کردن', 'به وجود آوردن', 'ساختن', 'پدید آوردن'] },
      { pos: 'adjective (creative)', terms: ['خلاقانه', 'ابتکاری', 'آفریننده'] },
    ],
    englishDefinition: 'Bring something into existence or produce something new and original.',
    tatoebaExamples: [
      {
        en: 'This resilient generator creates authentic art in seconds.',
        fa: 'این مولد مقاوم در چند ثانیه هنر اصیل خلق می‌کند.',
        source: 'Tatoeba',
      },
    ],
  },
  transform: {
    word: 'transform',
    phonetic: '/trænsˈfɔːrm/',
    translationFa: 'تبدیل کردن، دگرگون ساختن، متحول کردن، تغییر شکل دادن',
    miniMeaningsFa: ['تبدیل کردن', 'دگرگون کردن', 'متحول ساختن', 'تغییر شکل دادن'],
    aiExplanationFa:
      'نقش دستوری: verb / noun (سطح B1 • tag 2k) — تغییر شکل یا ماهیت کامل از یک حالت به حالت دیگر (transform A into B).',
    posEntries: [
      { pos: 'verb', terms: ['تبدیل کردن', 'دگرگون ساختن', 'متحول کردن', 'تغییر شکل دادن'] },
      { pos: 'noun', terms: ['تبدیل ریاضی/نگاشت', 'دگرگونی'] },
    ],
    englishDefinition: 'Make a thorough or dramatic change in the form, appearance, or character of.',
    tatoebaExamples: [
      {
        en: 'Spaced repetition transforms ephemeral short-term memories into effortless fluency.',
        fa: 'تکرار با فاصله، خاطرات زودگذر کوتاه‌مدت را به روانی بی‌دردسر در گفتار تبدیل می‌کند.',
        source: 'Tatoeba',
      },
    ],
  },
  effortless: {
    word: 'effortless',
    phonetic: '/ˈefərtləs/',
    translationFa: 'بی‌دردسر، آسان، بدون تقلا، روان و طبیعی',
    miniMeaningsFa: ['بی‌دردسر', 'آسان', 'بدون زحمت', 'روان'],
    aiExplanationFa:
      'نقش دستوری: adjective (سطح B2 • tag 5k) — کاری که به قدری ماهرانه انجام می‌شود که بدون هیچ زحمتی به نظر می‌رسد.',
    posEntries: [
      { pos: 'adjective', terms: ['بی‌دردسر', 'بدون زحمت', 'آسان', 'روان و طبیعی'] },
      { pos: 'adverb (effortlessly)', terms: ['به سادگی', 'بدون هیچ تقلایی'] },
    ],
    englishDefinition: 'Requiring no physical or mental exertion; achieved with admirable ease.',
    tatoebaExamples: [
      {
        en: 'Active recall builds effortless fluency over time.',
        fa: 'یادآوری فعال به مرور زمان باعث تسلط و روانی بی‌دردسر می‌شود.',
        source: 'Tatoeba',
      },
    ],
  },
};

const IRREGULAR_LEMMAS: Record<string, string> = {
  going: 'go',
  went: 'go',
  gone: 'go',
  goes: 'go',
  creates: 'create',
  created: 'create',
  creating: 'create',
  transforms: 'transform',
  transformed: 'transform',
  transforming: 'transform',
  memories: 'memory',
  images: 'image',
  learning: 'learn',
  learned: 'learn',
  faster: 'fast',
  fastest: 'fast',
  better: 'good',
  best: 'good',
  people: 'person',
  are: 'be',
  is: 'be',
  was: 'be',
  were: 'be',
};

export function lemmatizeWord(rawWord: string): string {
  const clean = String(rawWord || '').trim().toLowerCase();
  if (!clean || /\s+/.test(clean)) return clean;
  if (IRREGULAR_LEMMAS[clean]) return IRREGULAR_LEMMAS[clean];
  if (clean.length > 5 && clean.endsWith('ies')) return `${clean.slice(0, -3)}y`;
  if (clean.length > 5 && clean.endsWith('ing')) {
    const stem = clean.slice(0, -3);
    if (BUILTIN_DICTIONARY[`${stem}e`]) return `${stem}e`;
    return stem;
  }
  if (clean.length > 4 && clean.endsWith('ed')) {
    const stem = clean.slice(0, -2);
    if (BUILTIN_DICTIONARY[`${stem}e`]) return `${stem}e`;
    return stem;
  }
  if (clean.length > 4 && clean.endsWith('s') && !clean.endsWith('ss') && !clean.endsWith('us')) {
    const stem = clean.slice(0, -1);
    if (BUILTIN_DICTIONARY[stem]) return stem;
    return stem;
  }
  return clean;
}

export const LOCAL_MINI_DICTIONARY: Record<string, string[]> = {
  new: ['جدید', 'نو', 'تازه', 'مدرن'],
  top: ['برتر', 'بهترین', 'بالاترین', 'ارشد'],
  local: ['محلی', 'بومی', 'داخلی', 'آفلاین'],
  ai: ['هوش مصنوعی', 'سیستم هوشمند', 'مدل عصبی'],
  image: ['تصویر', 'عکس', 'نگاره', 'تمثال'],
  generator: ['مولد', 'تولیدکننده', 'ژنراتور', 'تولیدگر'],
  here: ['اینجا', 'در این مکان', 'هم‌اکنون'],
  text: ['متن', 'نوشته', 'پیام متنی'],
  edit: ['ویرایش کردن', 'اصلاح کردن', 'تدوین کردن', 'بازبینی'],
  we: ['ما', 'خودمان'],
  going: ['در حال رفتن', 'در حال پیشروی', 'گذراندن'],
  through: ['از میان', 'از طریق', 'در طول', 'به وسیله'],
  revolution: ['انقلاب', 'تحول بنیادین', 'دگرگونی بزرگ', 'چرخش'],
  right: ['درست', 'همین', 'حق', 'سمت راست'],
  now: ['الان', 'اکنون', 'در حال حاضر'],
  most: ['اکثر', 'بیشترین', 'عمده'],
  people: ['مردم', 'افراد', 'اشخاص'],
  learn: ['یاد گرفتن', 'آموختن', 'فرا گرفتن', 'مطلع شدن'],
  learning: ['یادگیری', 'فراگیری', 'در حال آموختن', 'دانش‌اندوزی'],
  fast: ['سریع', 'تند', 'چابک', 'پرشتاب'],
  faster: ['سریع‌تر', 'تندتر', 'با شتاب بیشتر'],
  when: ['وقتی که', 'هنگامی که', 'چه زمانی'],
  detailed: ['دقیق', 'مفصل', 'با جزئیات کامل', 'مشروح'],
  prompt: ['پرامپت (دستور متنی)', 'برانگیختن', 'سریع و فوری', 'فراخوان'],
  resilient: ['مقاوم', 'تاب‌آور', 'انعطاف‌پذیر', 'برگشت‌پذیر'],
  create: ['خلق کردن', 'ایجاد کردن', 'ساختن', 'پدید آوردن'],
  authentic: ['اصیل', 'واقعی', 'معتبر', 'خالص'],
  art: ['هنر', 'اثر هنری', 'مهارت، فن'],
  spaced: ['با فاصله زمانی', 'فاصله‌دار', 'زمان‌بندی‌شده'],
  repetition: ['تکرار', 'مرور مجدد', 'بازگویی', 'تمرین مکرر'],
  transform: ['تبدیل کردن', 'دگرگون ساختن', 'متحول کردن', 'تغییر شکل دادن'],
  ephemeral: ['زودگذر', 'ناپایدار', 'کوتاه‌مدت', 'فانی'],
  short: ['کوتاه', 'مختصر', 'اندک'],
  term: ['مدت، دوره', 'اصطلاح', 'ترم تحصیلی'],
  memory: ['حافظه', 'خاطره', 'یاد', 'ذهن'],
  memories: ['خاطرات', 'یادها', 'حافظه‌ها'],
  effortless: ['بی‌دردسر', 'بدون زحمت', 'آسان و روان', 'طبیعی'],
  fluency: ['روانی کلام', 'سلاست گفتار', 'تسلط زبانی'],
};

export function lookupComprehensiveLocalDictionary(rawWordOrPhrase: string): {
  word: string;
  lemma: string;
  phonetic: string;
  translationFa: string;
  miniMeaningsFa: string[];
  aiExplanationFa: string;
  posEntries: PosEntry[];
  englishDefinition: string;
  tatoebaExamples: TatoebaExample[];
} {
  const clean = String(rawWordOrPhrase || '')
    .trim()
    .toLowerCase()
    .replace(/^[.,/#!$%^&*;:{}=\-_`~()?"'«»]+|[.,/#!$%^&*;:{}=\-_`~()?"'«»]+$/g, '');
  const lemma = lemmatizeWord(clean);

  const directHit = BUILTIN_DICTIONARY[clean] || BUILTIN_DICTIONARY[lemma];
  if (directHit) {
    return {
      ...directHit,
      word: clean || directHit.word,
      lemma,
    };
  }

  const baseMeanings =
    LOCAL_MINI_DICTIONARY[clean] ||
    LOCAL_MINI_DICTIONARY[lemma] || [
      `معنی اصلی «${clean}»`,
      `کاربرد در جمله (${lemma})`,
      'مفهوم بافتاری در ویدیو',
      'هم‌نشینی و عبارت مرتبط',
    ];

  const posEntries: PosEntry[] = [
    { pos: 'noun / main', terms: baseMeanings.slice(0, 3) },
    {
      pos: 'verb / usage',
      terms:
        baseMeanings.length > 2
          ? baseMeanings.slice(1)
          : [...baseMeanings, `به‌کارگیری ${lemma} در جمله`],
    },
    {
      pos: 'adjective / idiom',
      terms: [`مرتبط با ${baseMeanings[0]}`, `در بافت تخصصی ویدیو`],
    },
  ];

  const allTerms = Array.from(new Set(posEntries.flatMap((p) => p.terms)));
  return {
    word: clean,
    lemma,
    phonetic: `/${lemma || clean}/`,
    translationFa: allTerms.slice(0, 4).join('، '),
    miniMeaningsFa: allTerms.slice(0, 4),
    aiExplanationFa: `ریشه واژه: «${lemma}» — معانی چندوجهی (اسم، فعل و صفت): ${allTerms.slice(0, 4).join(' ، ')}`,
    posEntries,
    englishDefinition: `Comprehensive multi-sense entry for "${clean}" (root lemma: "${lemma}") in authentic video context.`,
    tatoebaExamples: [
      {
        en: `Understanding how "${clean}" works in context makes it unforgettable.`,
        fa: `درک نحوه کاربرد «${clean}» در بافت جمله، آن را فراموش‌نشدنی می‌کند.`,
        source: 'Corpus',
      },
    ],
  };
}

const INITIAL_NOW = Date.now();

export const INITIAL_SEED_CARDS: LeitnerCard[] = [
  {
    id: 'word-going_through',
    word: 'going through',
    lemma: 'go through',
    isPhrase: true,
    status: 'learning',
    pumpStage: 'marked',
    ankiState: 'new',
    intervalDays: 0,
    learningStep: 0,
    cefr: 'B1',
    freqTag: 'tag 2k',
    rank: 1450,
    phonetic: '/ˈɡoʊɪŋ θruː/',
    translationFa: 'پشت سر گذاشتن، تجربه کردن، عبور کردن از، بررسی کردن',
    customNotesFa: 'فعل عبارتی خیلی پرکاربرد: go through a revolution = پشت سر گذاشتن یک انقلاب',
    miniMeaningsFa: ['پشت سر گذاشتن', 'تجربه کردن', 'عبور کردن از', 'بررسی کردن'],
    aiExplanationFa: BUILTIN_DICTIONARY['going through'].aiExplanationFa,
    posEntries: BUILTIN_DICTIONARY['going through'].posEntries,
    englishDefinition: BUILTIN_DICTIONARY['going through'].englishDefinition,
    tatoebaExamples: BUILTIN_DICTIONARY['going through'].tatoebaExamples,
    contextSentenceEn: 'We are going through a revolution right now with most people learning faster.',
    contextSentenceFa: 'ما همین الان در حال پشت سر گذاشتن یک انقلاب هستیم و اکثر مردم سریع‌تر یاد می‌گیرند.',
    videoId: DEMO_VIDEO_METADATA.videoId,
    videoTitle: DEMO_VIDEO_METADATA.videoTitle,
    videoTimestampSec: 36.0,
    box: 1,
    nextReviewAt: INITIAL_NOW - 3600 * 1000,
    lastReviewedAt: INITIAL_NOW - DAY_MS,
    reviewCount: 0,
    lapseCount: 0,
    easeFactor: 2.5,
    createdAt: INITIAL_NOW - 2 * DAY_MS,
  },
  {
    id: 'word-generator',
    word: 'generator',
    lemma: 'generator',
    isPhrase: false,
    status: 'learning',
    pumpStage: 'marked',
    ankiState: 'learning',
    intervalDays: 0,
    learningStep: 1,
    cefr: 'B1',
    freqTag: 'tag 3k',
    rank: 2650,
    phonetic: '/JEN-uh-rey-ter/',
    translationFa: 'ژنراتور، مولد، تولیدکننده، برق‌زا',
    customNotesFa: 'در هوش مصنوعی: image generator یعنی مدل تولیدکننده تصویر',
    miniMeaningsFa: ['ژنراتور', 'مولد', 'تولیدکننده', 'تولیدگر'],
    aiExplanationFa: BUILTIN_DICTIONARY.generator.aiExplanationFa,
    posEntries: BUILTIN_DICTIONARY.generator.posEntries,
    englishDefinition: BUILTIN_DICTIONARY.generator.englishDefinition,
    tatoebaExamples: BUILTIN_DICTIONARY.generator.tatoebaExamples,
    contextSentenceEn: 'New top local AI image generator is here!',
    contextSentenceFa: 'بهترین تولیدکننده تصویر هوش مصنوعی محلی جدید اینجاست!',
    videoId: DEMO_VIDEO_METADATA.videoId,
    videoTitle: DEMO_VIDEO_METADATA.videoTitle,
    videoTimestampSec: 26.0,
    box: 1,
    nextReviewAt: INITIAL_NOW - 2400 * 1000,
    lastReviewedAt: INITIAL_NOW - DAY_MS,
    reviewCount: 1,
    lapseCount: 0,
    easeFactor: 2.5,
    createdAt: INITIAL_NOW - 2 * DAY_MS,
  },
  {
    id: 'word-text_to_image_generator',
    word: 'text-to-image generator',
    lemma: 'text-to-image generator',
    isPhrase: true,
    status: 'learning',
    pumpStage: 'learning_now',
    ankiState: 'review',
    intervalDays: 1,
    learningStep: 2,
    cefr: 'B2',
    freqTag: 'tag 4k',
    rank: 3400,
    phonetic: '/tekst-too-IM-ij JEN-uh-rey-ter/',
    translationFa: 'مولد متن به تصویر، سیستم تبدیل متن به عکس',
    miniMeaningsFa: ['مولد متن به تصویر', 'تولیدکننده عکس از متن'],
    aiExplanationFa: BUILTIN_DICTIONARY['text-to-image generator'].aiExplanationFa,
    posEntries: BUILTIN_DICTIONARY['text-to-image generator'].posEntries,
    englishDefinition: BUILTIN_DICTIONARY['text-to-image generator'].englishDefinition,
    tatoebaExamples: BUILTIN_DICTIONARY['text-to-image generator'].tatoebaExamples,
    contextSentenceEn: "that this is just a text-to-image generator, so you can't edit images.",
    contextSentenceFa: 'اینکه این فقط یک مولد متن به تصویر است، بنابراین نمی‌توانید تصاویر را ویرایش کنید.',
    videoId: DEMO_VIDEO_METADATA.videoId,
    videoTitle: DEMO_VIDEO_METADATA.videoTitle,
    videoTimestampSec: 30.5,
    box: 2,
    nextReviewAt: INITIAL_NOW - 1800 * 1000,
    lastReviewedAt: INITIAL_NOW - 1 * DAY_MS,
    reviewCount: 2,
    lapseCount: 0,
    easeFactor: 2.5,
    createdAt: INITIAL_NOW - 4 * DAY_MS,
  },
  {
    id: 'word-come_up_with',
    word: 'come up with',
    lemma: 'come up with',
    isPhrase: true,
    status: 'learning',
    pumpStage: 'learning_now',
    ankiState: 'review',
    intervalDays: 4,
    learningStep: 2,
    cefr: 'B1',
    freqTag: 'tag 2k',
    rank: 1900,
    phonetic: '/kuhm uhp with/',
    translationFa: 'ابداع کردن، به ذهن رسیدن، پیشنهاد دادن، مطرح کردن',
    miniMeaningsFa: ['ابداع کردن', 'به ذهن رسیدن', 'مطرح کردن'],
    aiExplanationFa: BUILTIN_DICTIONARY['come up with'].aiExplanationFa,
    posEntries: BUILTIN_DICTIONARY['come up with'].posEntries,
    englishDefinition: BUILTIN_DICTIONARY['come up with'].englishDefinition,
    tatoebaExamples: BUILTIN_DICTIONARY['come up with'].tatoebaExamples,
    contextSentenceEn: 'When you come up with a detailed prompt, this resilient generator creates authentic art.',
    contextSentenceFa: 'وقتی یک پرامپت دقیق ابداع می‌کنید، این مولد مقاوم هنر اصیل خلق می‌کند.',
    videoId: DEMO_VIDEO_METADATA.videoId,
    videoTitle: DEMO_VIDEO_METADATA.videoTitle,
    videoTimestampSec: 41.0,
    box: 3,
    nextReviewAt: INITIAL_NOW - 600 * 1000,
    lastReviewedAt: INITIAL_NOW - 4 * DAY_MS,
    reviewCount: 3,
    lapseCount: 0,
    easeFactor: 2.5,
    createdAt: INITIAL_NOW - 8 * DAY_MS,
  },
  {
    id: 'word-resilient',
    word: 'resilient',
    lemma: 'resilient',
    isPhrase: false,
    status: 'learning',
    pumpStage: 'learning_now',
    ankiState: 'review',
    intervalDays: 10,
    learningStep: 2,
    cefr: 'B2',
    freqTag: 'tag 5k',
    rank: 3850,
    phonetic: '/ri-ZIL-yuhnt/',
    translationFa: 'مقاوم، تاب‌آور، انعطاف‌پذیر، برگشت‌پذیر',
    miniMeaningsFa: ['مقاوم', 'تاب‌آور', 'انعطاف‌پذیر'],
    aiExplanationFa: BUILTIN_DICTIONARY.resilient.aiExplanationFa,
    posEntries: BUILTIN_DICTIONARY.resilient.posEntries,
    englishDefinition: BUILTIN_DICTIONARY.resilient.englishDefinition,
    tatoebaExamples: BUILTIN_DICTIONARY.resilient.tatoebaExamples,
    contextSentenceEn: 'When you come up with a detailed prompt, this resilient generator creates authentic art.',
    contextSentenceFa: 'وقتی یک پرامپت دقیق ابداع می‌کنید، این مولد مقاوم هنر اصیل خلق می‌کند.',
    videoId: DEMO_VIDEO_METADATA.videoId,
    videoTitle: DEMO_VIDEO_METADATA.videoTitle,
    videoTimestampSec: 41.0,
    box: 4,
    nextReviewAt: INITIAL_NOW + 4 * DAY_MS,
    lastReviewedAt: INITIAL_NOW - 6 * DAY_MS,
    reviewCount: 4,
    lapseCount: 0,
    easeFactor: 2.6,
    createdAt: INITIAL_NOW - 14 * DAY_MS,
  },
  {
    id: 'word-ephemeral',
    word: 'ephemeral',
    lemma: 'ephemeral',
    isPhrase: false,
    status: 'learning',
    pumpStage: 'learned',
    ankiState: 'review',
    intervalDays: 16,
    learningStep: 2,
    cefr: 'C1',
    freqTag: 'tag 8k',
    rank: 6900,
    phonetic: '/i-FEM-er-uhl/',
    translationFa: 'زودگذر، ناپایدار، کوتاه‌عمر، موقتی',
    miniMeaningsFa: ['زودگذر', 'ناپایدار', 'کوتاه‌مدت'],
    aiExplanationFa: BUILTIN_DICTIONARY.ephemeral.aiExplanationFa,
    posEntries: BUILTIN_DICTIONARY.ephemeral.posEntries,
    englishDefinition: BUILTIN_DICTIONARY.ephemeral.englishDefinition,
    tatoebaExamples: BUILTIN_DICTIONARY.ephemeral.tatoebaExamples,
    contextSentenceEn: 'Spaced repetition transforms ephemeral short-term memories into effortless fluency.',
    contextSentenceFa: 'تکرار با فاصله، خاطرات زودگذر کوتاه‌مدت را به روانی بی‌دردسر در گفتار تبدیل می‌کند.',
    videoId: DEMO_VIDEO_METADATA.videoId,
    videoTitle: DEMO_VIDEO_METADATA.videoTitle,
    videoTimestampSec: 46.5,
    box: 5,
    nextReviewAt: INITIAL_NOW + 9 * DAY_MS,
    lastReviewedAt: INITIAL_NOW - 7 * DAY_MS,
    reviewCount: 5,
    lapseCount: 0,
    easeFactor: 2.7,
    createdAt: INITIAL_NOW - 28 * DAY_MS,
  },
  {
    id: 'word-local',
    word: 'local',
    lemma: 'local',
    isPhrase: false,
    status: 'known',
    pumpStage: 'learned',
    ankiState: 'review',
    intervalDays: 30,
    learningStep: 2,
    cefr: 'A1',
    freqTag: 'tag 1k',
    rank: 680,
    phonetic: '/LOH-kuhl/',
    translationFa: 'محلی، آفلاین (قابل اجرا روی سیستم شخصی)، بومی',
    miniMeaningsFa: ['محلی', 'موضعی', 'بومی'],
    aiExplanationFa: BUILTIN_DICTIONARY.local.aiExplanationFa,
    posEntries: BUILTIN_DICTIONARY.local.posEntries,
    englishDefinition: BUILTIN_DICTIONARY.local.englishDefinition,
    tatoebaExamples: BUILTIN_DICTIONARY.local.tatoebaExamples,
    contextSentenceEn: 'New top local AI image generator is here!',
    contextSentenceFa: 'بهترین تولیدکننده تصویر هوش مصنوعی محلی جدید اینجاست!',
    videoId: DEMO_VIDEO_METADATA.videoId,
    videoTitle: DEMO_VIDEO_METADATA.videoTitle,
    videoTimestampSec: 26.0,
    box: 6,
    nextReviewAt: INITIAL_NOW + 25 * DAY_MS,
    lastReviewedAt: INITIAL_NOW - 5 * DAY_MS,
    reviewCount: 6,
    lapseCount: 0,
    easeFactor: 2.8,
    createdAt: INITIAL_NOW - 40 * DAY_MS,
  },
];

export const INITIAL_SAVED_SENTENCES: SavedSentence[] = [
  {
    id: 'sent-1',
    sentenceEn: 'New top local AI image generator is here!',
    sentenceFa: 'بهترین تولیدکننده تصویر هوش مصنوعی محلی جدید اینجاست!',
    videoId: DEMO_VIDEO_METADATA.videoId,
    videoTitle: DEMO_VIDEO_METADATA.videoTitle,
    timestampSec: 26,
    createdAt: INITIAL_NOW - DAY_MS,
  },
  {
    id: 'sent-2',
    sentenceEn: 'We are going through a revolution right now with most people learning faster.',
    sentenceFa: 'ما همین الان در حال پشت سر گذاشتن یک انقلاب هستیم و اکثر مردم سریع‌تر یاد می‌گیرند.',
    videoId: DEMO_VIDEO_METADATA.videoId,
    videoTitle: DEMO_VIDEO_METADATA.videoTitle,
    timestampSec: 36.0,
    createdAt: INITIAL_NOW - 2 * HOUR_MS,
  },
];

// ============================================================================
// DUOLINGO PRACTICE ENGINE (Match Pairs + Multiple Choice + 3D Word Bank)
// ============================================================================

export interface DuoMatchPair {
  id: string;
  wordEn: string;
  meaningFa: string;
}

export interface DuoPracticeQuestion {
  id: string;
  type: 'match_pairs' | 'multiple_choice' | 'word_bank';
  cardId: string;
  targetWordEn: string;
  targetPhonetic: string;
  targetMeaningFa: string;
  contextSentenceEn: string;
  contextSentenceFa: string;
  // For match_pairs:
  matchPairs?: DuoMatchPair[];
  shuffledMeaningsFa?: Array<{ id: string; meaningFa: string }>;
  // For multiple_choice:
  options?: Array<{ index: number; textFa: string; isCorrect: boolean }>;
  correctOptionIndex?: number;
  // For word_bank:
  wordBankDirection?: 'en_from_fa' | 'sentence_build';
  promptTitleFa?: string;
  promptSubText?: string;
  targetTokens?: string[];
  bankTokens?: string[];
}

export function getShortPrimaryMeaningFa(rawTranslation: string): string {
  const parts = String(rawTranslation || '')
    .split(/[،,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.slice(0, 2).join('، ') || rawTranslation;
}

export function ensureMinimumPracticeCards(userCards: LeitnerCard[]): LeitnerCard[] {
  const active = (userCards || []).filter((c) => c && c.word && c.translationFa && c.status !== 'ignored');
  const map = new Map<string, LeitnerCard>();
  for (const c of active) {
    map.set(c.word.toLowerCase(), c);
  }
  if (map.size < 5) {
    for (const seed of INITIAL_SEED_CARDS) {
      const k = seed.word.toLowerCase();
      if (!map.has(k)) {
        map.set(k, seed);
      }
      if (map.size >= 6) break;
    }
  }
  return Array.from(map.values());
}

export function buildDuoPracticeLesson(userCards: LeitnerCard[]): DuoPracticeQuestion[] {
  const pool = ensureMinimumPracticeCards(userCards);
  const questions: DuoPracticeQuestion[] = [];

  // 1. Question 1: Match Pairs (5 English words + 5 Persian meanings)
  const fiveCards = pool.slice(0, 5);
  const matchPairs: DuoMatchPair[] = fiveCards.map((c) => ({
    id: c.id,
    wordEn: c.word,
    meaningFa: getShortPrimaryMeaningFa(c.translationFa),
  }));
  // Deterministic rotation for Persian column so pairs aren't aligned 1:1 on the same row
  const shuffledMeaningsFa = matchPairs.map((_, idx) => {
    const rotated = matchPairs[(idx + 2) % matchPairs.length];
    return { id: rotated.id, meaningFa: rotated.meaningFa };
  });

  questions.push({
    id: 'duo-q-match-1',
    type: 'multiple_choice' in fiveCards ? 'match_pairs' : 'match_pairs',
    cardId: fiveCards[0].id,
    targetWordEn: fiveCards[0].word,
    targetPhonetic: fiveCards[0].phonetic,
    targetMeaningFa: getShortPrimaryMeaningFa(fiveCards[0].translationFa),
    contextSentenceEn: fiveCards[0].contextSentenceEn,
    contextSentenceFa: fiveCards[0].contextSentenceFa,
    matchPairs,
    shuffledMeaningsFa,
  });

  // 2. Question 2 & 3: Smart Multiple Choice with Speech Bubble Context
  for (let i = 0; i < Math.min(2, pool.length); i++) {
    const card = pool[i];
    const correctFa = getShortPrimaryMeaningFa(card.translationFa);
    const distractors = pool
      .filter((other) => other.id !== card.id)
      .slice(0, 3)
      .map((d) => getShortPrimaryMeaningFa(d.translationFa));

    while (distractors.length < 3) {
      distractors.push('معنی جایگزین آزمایشی');
    }

    const rawOptions = [
      { textFa: correctFa, isCorrect: true },
      { textFa: distractors[0], isCorrect: false },
      { textFa: distractors[1], isCorrect: false },
      { textFa: distractors[2], isCorrect: false },
    ];
    // Deterministic rotation based on index
    const shift = (i + 1) % 4;
    const rotatedOptions = rawOptions.map((_, idx) => {
      const item = rawOptions[(idx + shift) % 4];
      return {
        index: idx + 1,
        textFa: item.textFa,
        isCorrect: item.isCorrect,
      };
    });
    const correctOptionIndex = rotatedOptions.find((o) => o.isCorrect)?.index || 1;

    questions.push({
      id: `duo-q-mc-${card.id}`,
      type: 'multiple_choice',
      cardId: card.id,
      targetWordEn: card.word,
      targetPhonetic: card.phonetic || `/${card.word}/`,
      targetMeaningFa: correctFa,
      contextSentenceEn:
        card.contextSentenceEn || `We use "${card.word}" in daily conversation.`,
      contextSentenceFa: card.contextSentenceFa || card.translationFa,
      options: rotatedOptions,
      correctOptionIndex,
    });
  }

  // 3. Question 4 & 5: 3D Word Bank (Build Sentence / Phrase from Word Chips)
  for (let i = 0; i < Math.min(2, pool.length); i++) {
    const card = pool[(i + 2) % pool.length];
    const cleanSentence = (card.contextSentenceEn || card.word)
      .replace(/[.!?]+$/g, '')
      .trim();
    const rawWords = cleanSentence.split(/\s+/).filter(Boolean);
    const targetTokens = rawWords.length >= 3 && rawWords.length <= 12 ? rawWords : card.word.split(/\s+/);

    const extraDistractors = ['always', 'quickly', 'system', 'future'].filter(
      (d) => !targetTokens.some((t) => t.toLowerCase() === d)
    );
    const combined = [...targetTokens, ...extraDistractors.slice(0, 2)];
    const bankTokens = combined.map((_, idx) => combined[(idx * 3 + 1) % combined.length]);

    questions.push({
      id: `duo-q-wb-${card.id}-${i}`,
      type: 'word_bank',
      cardId: card.id,
      targetWordEn: card.word,
      targetPhonetic: card.phonetic || `/${card.word}/`,
      targetMeaningFa: getShortPrimaryMeaningFa(card.translationFa),
      contextSentenceEn: card.contextSentenceEn || card.word,
      contextSentenceFa: card.contextSentenceFa || card.translationFa,
      wordBankDirection: 'sentence_build',
      promptTitleFa: 'جمله و عبارت انگلیسی زیر را با انتخاب بلوک‌های کلمات بسازید:',
      promptSubText: card.contextSentenceFa || card.translationFa,
      targetTokens,
      bankTokens,
    });
  }

  // 4. Question 6: Final Multiple Choice Reinforcement
  const lastCard = pool[Math.min(4, pool.length - 1)];
  const lastCorrectFa = getShortPrimaryMeaningFa(lastCard.translationFa);
  const lastDistractors = pool
    .filter((other) => other.id !== lastCard.id)
    .slice(0, 3)
    .map((d) => getShortPrimaryMeaningFa(d.translationFa));

  questions.push({
    id: `duo-q-mc-final-${lastCard.id}`,
    type: 'multiple_choice',
    cardId: lastCard.id,
    targetWordEn: lastCard.word,
    targetPhonetic: lastCard.phonetic || `/${lastCard.word}/`,
    targetMeaningFa: lastCorrectFa,
    contextSentenceEn: lastCard.contextSentenceEn || `Mastering "${lastCard.word}" boosts your fluency.`,
    contextSentenceFa: lastCard.contextSentenceFa || lastCard.translationFa,
    options: [
      { index: 1, textFa: lastDistractors[0] || 'گزینه اول', isCorrect: false },
      { index: 2, textFa: lastCorrectFa, isCorrect: true },
      { index: 3, textFa: lastDistractors[1] || 'گزینه سوم', isCorrect: false },
      { index: 4, textFa: lastDistractors[2] || 'گزینه چهارم', isCorrect: false },
    ],
    correctOptionIndex: 2,
  });

  return questions;
}

export function gradeDuoWordBankAnswer(selectedTokens: string[], targetTokens: string[]): boolean {
  const cleanSelected = (selectedTokens || [])
    .join(' ')
    .replace(/[.,!?]/g, '')
    .trim()
    .toLowerCase();
  const cleanTarget = (targetTokens || [])
    .join(' ')
    .replace(/[.,!?]/g, '')
    .trim()
    .toLowerCase();
  return Boolean(cleanTarget) && cleanSelected === cleanTarget;
}


