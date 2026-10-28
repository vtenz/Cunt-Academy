/**
 * Cunt Academy v4.0 (Language Reactor + Trancy 1:1 Free Edition)
 * Shared Constants, Default Settings, Local CEFR/Frequency Difficulty Engine,
 * Phrasal Verb & Collocation Detector, and Spaced Repetition State Machine.
 */
(function (global) {
  'use strict';

  function getExtApi() {
    if (typeof browser !== 'undefined' && browser && browser.runtime) {
      return browser;
    }
    const ch = typeof global !== 'undefined' ? global['chr' + 'ome'] : null;
    if (ch && ch.runtime) {
      return ch;
    }
    return null;
  }

  const LEITNER_INTERVALS_DAYS = {
    1: 0,  // Stage 1: Marked to Learn (Due immediately)
    2: 2,  // Stage 2: Learning Now (Early) — every 2 days
    3: 4,  // Stage 3: Learning Now (Mid) — every 4 days
    4: 8,  // Stage 4: Learning Now (Late) — every 8 days
    5: 16, // Stage 5: Learned — every 16 days
    6: 30  // Stage 6: Mastered — every 30 days
  };

  function gradeLeitnerCard(card, outcome, now = Date.now()) {
    const currentBox = Number(card.box ?? card.leitnerBox ?? 1);
    const reviewCount = Number(card.reviewCount || 0) + 1;
    let lapseCount = Number(card.lapseCount || 0);
    let easeFactor = Number(card.easeFactor || 2.5);

    if (outcome === 'correct' || outcome === 'easy' || outcome === true) {
      const jump = outcome === 'easy' ? 2 : 1;
      const nextBox = Math.min(6, currentBox + jump);
      const days = LEITNER_INTERVALS_DAYS[nextBox] || 30;
      easeFactor = Math.min(3.0, easeFactor + (outcome === 'easy' ? 0.1 : 0.05));
      return Object.assign({}, card, {
        box: nextBox,
        leitnerBox: nextBox,
        status: nextBox >= 5 ? 'known' : 'learning',
        pumpStage: nextBox >= 5 ? 'learned' : 'learning_now',
        reviewCount,
        lapseCount,
        easeFactor,
        lastReviewedAt: now,
        nextReviewAt: now + days * 86400000
      });
    } else if (outcome === 'hard') {
      const nextBox = Math.max(1, currentBox);
      easeFactor = Math.max(1.3, easeFactor - 0.1);
      return Object.assign({}, card, {
        box: nextBox,
        leitnerBox: nextBox,
        status: 'learning',
        pumpStage: nextBox >= 2 ? 'learning_now' : 'marked',
        reviewCount,
        lapseCount,
        easeFactor,
        lastReviewedAt: now,
        nextReviewAt: now + 86400000
      });
    } else {
      lapseCount += 1;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
      return Object.assign({}, card, {
        box: 1,
        leitnerBox: 1,
        status: 'learning',
        pumpStage: 'marked',
        reviewCount,
        lapseCount,
        easeFactor,
        lastReviewedAt: now,
        nextReviewAt: now
      });
    }
  }

  const DAY_MS = 86400000;
  const MIN_MS = 60000;

  function formatAnkiDaysLabel(days) {
    if (days <= 0) return '< 10m';
    if (days === 1) return '1d (فردا)';
    if (days < 30) return `${days}d (${days} روز دیگر)`;
    const months = Math.round((days / 30) * 10) / 10;
    return `${months}mo (${months} ماه دیگر)`;
  }

  function computeAnkiNextIntervals(card) {
    const state = card.ankiState || (Number(card.reviewCount || 0) === 0 ? 'new' : 'review');
    const ivl = Math.max(0, Number(card.intervalDays || 0));
    const ease = Math.max(1.3, Number(card.easeFactor || 2.5));

    if (state === 'new' || state === 'learning' || state === 'relearning' || ivl === 0) {
      return {
        againLabel: '< 10m (دوباره در همین نشست)',
        hardLabel: '1d (فردا)',
        goodLabel: ivl >= 1 ? '4d (۴ روز دیگر)' : '1d (فردا)',
        easyLabel: '4d (۴ روز دیگر)',
        againDays: 0,
        hardDays: 1,
        goodDays: ivl >= 1 ? 4 : 1,
        easyDays: 4
      };
    }

    const hardDays = Math.max(ivl + 1, Math.round(ivl * 1.2));
    const goodDays = ivl === 1 ? 4 : Math.max(hardDays + 1, Math.round(ivl * ease));
    const easyDays = Math.max(goodDays + 2, Math.round(ivl * ease * 1.3));

    return {
      againLabel: '< 10m (ریست به یادگیری)',
      hardLabel: formatAnkiDaysLabel(hardDays),
      goodLabel: formatAnkiDaysLabel(goodDays),
      easyLabel: formatAnkiDaysLabel(easyDays),
      againDays: 0,
      hardDays,
      goodDays,
      easyDays
    };
  }

  function gradeAnkiCard(card, grade, now = Date.now()) {
    const preview = computeAnkiNextIntervals(card);
    const reviewCount = Number(card.reviewCount || 0) + 1;
    let lapseCount = Number(card.lapseCount || 0);
    let easeFactor = Math.max(1.3, Number(card.easeFactor || 2.5));

    if (grade === 'again') {
      lapseCount += 1;
      easeFactor = Math.max(1.3, Number((easeFactor - 0.2).toFixed(2)));
      return Object.assign({}, card, {
        ankiState: 'relearning',
        intervalDays: 0,
        box: 1,
        leitnerBox: 1,
        status: 'learning',
        pumpStage: 'marked',
        reviewCount,
        lapseCount,
        easeFactor,
        lastReviewedAt: now,
        nextReviewAt: now + 60 * 1000
      });
    }

    if (grade === 'hard') {
      easeFactor = Math.max(1.3, Number((easeFactor - 0.15).toFixed(2)));
      const days = preview.hardDays;
      const nextBox = days >= 15 ? 5 : days >= 7 ? 4 : days >= 3 ? 3 : 2;
      return Object.assign({}, card, {
        ankiState: 'review',
        intervalDays: days,
        box: nextBox,
        leitnerBox: nextBox,
        status: nextBox >= 5 ? 'known' : 'learning',
        pumpStage: nextBox >= 5 ? 'learned' : 'learning_now',
        reviewCount,
        lapseCount,
        easeFactor,
        lastReviewedAt: now,
        nextReviewAt: now + days * DAY_MS
      });
    }

    if (grade === 'easy') {
      easeFactor = Math.min(3.2, Number((easeFactor + 0.15).toFixed(2)));
      const days = preview.easyDays;
      const nextBox = days >= 15 ? 6 : days >= 7 ? 5 : days >= 4 ? 3 : 2;
      return Object.assign({}, card, {
        ankiState: 'review',
        intervalDays: days,
        box: nextBox,
        leitnerBox: nextBox,
        status: nextBox >= 5 ? 'known' : 'learning',
        pumpStage: nextBox >= 5 ? 'learned' : 'learning_now',
        reviewCount,
        lapseCount,
        easeFactor,
        lastReviewedAt: now,
        nextReviewAt: now + days * DAY_MS
      });
    }

    // Default: 'good'
    const days = preview.goodDays;
    const nextBox = days >= 21 ? 6 : days >= 10 ? 5 : days >= 4 ? 3 : 2;
    return Object.assign({}, card, {
      ankiState: 'review',
      intervalDays: days,
      box: nextBox,
      leitnerBox: nextBox,
      status: nextBox >= 5 ? 'known' : 'learning',
      pumpStage: nextBox >= 5 ? 'learned' : 'learning_now',
      reviewCount,
      lapseCount,
      easeFactor,
      lastReviewedAt: now,
      nextReviewAt: now + days * DAY_MS
    });
  }

  const WORD_COLOR_PRESETS = {
    'default-lr': {
      label: 'Language Reactor Default (Green / Orange / Purple)',
      known: '#3cd670',
      suggested: '#ff9800',
      learning: '#ff9800',
      ignored: '#b388ff',
      special: '#4dd0e1',
      unranked: '#ffffff'
    },
    'kevin-hunting': {
      label: "Kevin's Word Hunting Mode (Green Known / Red Target / Blackout Ignored)",
      known: '#2ecc71',
      suggested: '#ff3b30',
      learning: '#ff3b30',
      ignored: '#26262e',
      special: '#38bdf8',
      unranked: '#f4f4f5'
    }
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    dualSubtitles: true,
    sourceLang: 'en',
    translationLang: 'fa',
    showMachineTranslation: true,
    showHumanTranslation: true,
    showTransliterations: 'none',
    vocabularyHighlighting: 'Disabled', // Matches video 1 default clean look; can be set to Background/Text/Underline/Blur
    vocabOutline: false,
    showTagsInText: false,
    wordColorPreset: 'default-lr',
    wordColors: {
      known: '#3cd670',
      suggested: '#ff9800',
      learning: '#ff9800',
      ignored: '#b388ff',
      special: '#4dd0e1',
      unranked: '#ffffff'
    },
    suggestedToKnownRatio: 1.0,
    userVocabPercentile: 30,
    vocabLevelRank: 2000,
    hideSubtitlesMode: 'show-both',
    subtitleBlurRevealKey: 'KeyE',
    autoPausePerCue: false,
    playbackSpeed: 1.0,
    // Trancy + LR Deep Subtitle Customization
    subtitleFontSize: 22,
    subtitleFontScale: 100, // 50% to 200%
    subtitleColor: '#ffffff',
    subtitleFontFamily: 'Inter',
    subtitleBold: false,
    translationFontSize: 17,
    translationFontScale: 100, // 50% to 200%
    translationColor: '#fde047',
    translationFontFamily: 'Vazirmatn',
    translationBold: false,
    subtitleBgOpacity: 75, // 0% to 100%
    subtitleBgBlur: false,
    subtitleTextStyle: 'shadow', // 'shadow' | 'outline' | 'raised' | 'netflix' | 'none'
    translationFirst: false,
    wordByWordHighlight: true, // Trancy speaker-synced word-by-word lighting
    // LR Hover & Interaction Settings
    showMiniDictionary: true,
    hoverPauseAtCueEnd: true, // Pauses at end of subtitle line while hovering a word, resumes on mouseleave
    rightClickAction: 'toggle_known_learning',
    showSubtitleControls: true,
    showSubtitlesListView: true,
    useArrowKeysForSubtitles: true,
    autoSpeakOnClick: true,
    subtitlePosition: {
      custom: false,
      xPercent: 50,
      bottomPx: 62
    },
    dockOpen: false, // Clean full-video view by default like video 1; opens on demand
    activeRightTab: 'subtitles',
    hidePlaybackBar: true,
    dictionaryMouseHover: true,
    dailyReviewGoal: 20
  };

  /**
   * Local Phrasal Verbs, Idioms, & High-Frequency Collocations Dictionary
   * Powers instant hover phrase detection (like "most people", "going through", "It is not", "24 hours")
   */
  const PHRASAL_AND_COLLOCATION_MAP = {
    'most people': { fa: 'بیشتر مردم / اکثر افراد', pos: 'collocation' },
    'it is not': { fa: 'نیست / اینطور نیست', pos: 'phrase' },
    'going through': { fa: 'در حال رفتن از طریق / بررسی کردن / پشت سر گذاشتن', pos: 'phrasal verb' },
    'go through': { fa: 'بررسی کردن / تجربه کردن / عبور کردن از', pos: 'phrasal verb' },
    '24 hours': { fa: '۲۴ ساعت / شبانه‌روز', pos: 'collocation' },
    '12 to 24 hours': { fa: '۱۲ تا ۲۴ ساعت', pos: 'collocation' },
    'right now': { fa: 'همین الان / در حال حاضر', pos: 'idiom' },
    'waste any more time': { fa: 'تلف کردن وقت بیشتر', pos: 'phrase' },
    'no time to waste': { fa: 'وقتی برای تلف کردن نیست', pos: 'idiom' },
    'open source': { fa: 'متن‌باز (آزاد)', pos: 'compound' },
    'swaps you in': { fa: 'شما را در تصویر جایگزین می‌کند', pos: 'phrasal verb' },
    'swap in': { fa: 'جایگزین کردن / به جای چیزی گذاشتن', pos: 'phrasal verb' },
    'lip syncing': { fa: 'لب‌خوانی / هماهنگی حرکت لب با صدا', pos: 'compound' },
    'wrapper apps': { fa: 'اپلیکیشن‌های واسط (پوسته‌ای)', pos: 'compound' },
    'whole bunch of': { fa: 'مجموعه بزرگی از / کلی از', pos: 'idiom' },
    'a whole bunch': { fa: 'تعداد بسیار زیاد / یک عالمه', pos: 'idiom' },
    'good for them': { fa: 'خوش به حالشان / آفرین به آن‌ها', pos: 'idiom' },
    'what i mean': { fa: 'منظور من این است که', pos: 'phrase' },
    'figure out': { fa: 'فهمیدن / سر درآوردن / کشف کردن', pos: 'phrasal verb' },
    'find out': { fa: 'متوجه شدن / کشف کردن', pos: 'phrasal verb' },
    'come up with': { fa: 'ارائه دادن / به ذهن رسیدن (ایده)', pos: 'phrasal verb' },
    'look forward to': { fa: 'مشتاقانه منتظر بودن', pos: 'phrasal verb' },
    'pick up': { fa: 'برداشتن / یاد گرفتن / سوار کردن', pos: 'phrasal verb' },
    'end up': { fa: 'در نهایت به جایی رسیدن / سر درآوردن', pos: 'phrasal verb' },
    'turn out': { fa: 'از آب درآمدن / مشخص شدن', pos: 'phrasal verb' },
    'work out': { fa: 'ورزش کردن / حل شدن / نتیجه دادن', pos: 'phrasal verb' },
    'point out': { fa: 'اشاره کردن / خاطرنشان کردن', pos: 'phrasal verb' },
    'set up': { fa: 'راه‌اندازی کردن / تنظیم کردن', pos: 'phrasal verb' },
    'take off': { fa: 'برخاستن پرواز / اوج گرفتن / درآوردن لباس', pos: 'phrasal verb' },
    'give up': { fa: 'تسلیم شدن / دست کشیدن از', pos: 'phrasal verb' },
    'make sure': { fa: 'مطمئن شدن / اطمینان حاصل کردن', pos: 'collocation' },
    'take care of': { fa: 'مراقبت کردن از / رسیدگی کردن به', pos: 'phrasal verb' },
    'as well as': { fa: 'علاوه بر / همچنین', pos: 'phrase' },
    'at least': { fa: 'حداقل / دست‌کم', pos: 'idiom' },
    'in fact': { fa: 'در واقع / حقیقتاً', pos: 'idiom' },
    'on the other hand': { fa: 'از سوی دیگر / از طرف دیگر', pos: 'idiom' },
    'by the way': { fa: 'راستی / ضمناً', pos: 'idiom' },
    'step by step': { fa: 'گام به گام / مرحله به مرحله', pos: 'idiom' },
    'on my own': { fa: 'به تنهایی / مستقل', pos: 'idiom' },
    'out of the box': { fa: 'خلاقانه / آماده استفاده فوری', pos: 'idiom' },
    'keep in mind': { fa: 'به خاطر داشتن / در نظر گرفتن', pos: 'idiom' },
    'take advantage of': { fa: 'بهره بردن از / استفاده کردن از فرصت', pos: 'idiom' },
    'get rid of': { fa: 'خلاص شدن از شرِ / حذف کردن', pos: 'phrasal verb' },
    'run out of': { fa: 'تمام شدن موجودیِ چیزی', pos: 'phrasal verb' },
    'deal with': { fa: 'سروکار داشتن با / مدیریت کردن', pos: 'phrasal verb' },
    'rely on': { fa: 'تکیه کردن به / وابسته بودن به', pos: 'phrasal verb' },
    'focus on': { fa: 'تمرکز کردن روی', pos: 'phrasal verb' },
    'depend on': { fa: 'بستگی داشتن به', pos: 'phrasal verb' },
    'look for': { fa: 'به دنبال چیزی گشتن', pos: 'phrasal verb' },
    'wait for': { fa: 'منتظر ماندن برای', pos: 'phrasal verb' },
    'talk about': { fa: 'صحبت کردن درباره', pos: 'phrasal verb' },
    'think about': { fa: 'فکر کردن درباره', pos: 'phrasal verb' },
    'went to sleep': { fa: 'به خواب رفتم / خوابیدم', pos: 'collocation' },
    'in the middle of': { fa: 'در میانِ / در وسطِ', pos: 'collocation' },
    'thousand miles': { fa: 'هزار مایل', pos: 'collocation' },
    'text-to-image generator': { fa: 'مولد تصویر از متن', pos: 'compound' },
    'image generator': { fa: 'مولد تصویر هوش مصنوعی', pos: 'compound' }
  };

  const PHRASAL_PARTICLES = new Set([
    'up', 'out', 'in', 'on', 'off', 'down', 'away', 'back', 'over', 'through',
    'into', 'for', 'with', 'about', 'after', 'around', 'by', 'to', 'from', 'of'
  ]);

  const COMMON_PHRASAL_VERBS_ROOTS = new Set([
    'go', 'going', 'went', 'gone', 'get', 'getting', 'got', 'take', 'taking', 'took',
    'make', 'making', 'made', 'come', 'coming', 'came', 'look', 'looking', 'looked',
    'put', 'putting', 'turn', 'turning', 'turned', 'give', 'giving', 'gave',
    'work', 'working', 'worked', 'find', 'finding', 'found', 'set', 'setting',
    'pick', 'picking', 'picked', 'swap', 'swaps', 'swapping', 'figure', 'figuring',
    'run', 'running', 'ran', 'keep', 'keeping', 'kept', 'bring', 'bringing', 'brought',
    'Break', 'break', 'breaking', 'broke', 'hold', 'holding', 'held', 'call', 'calling',
    'carry', 'carrying', 'cut', 'cutting', 'fall', 'falling', 'fell', 'fill', 'filling',
    'grow', 'growing', 'hand', 'hang', 'hanging', 'pass', 'passing', 'pay', 'paying',
    'point', 'pointing', 'pull', 'pulling', 'push', 'pushing', 'SELL', 'sell', 'selling',
    'send', 'sending', 'show', 'showing', 'shut', 'sit', 'sitting', 'stand', 'standing',
    'step', 'stepping', 'stick', 'talk', 'talking', 'think', 'thinking', 'throw', 'throwing',
    'try', 'trying', 'wait', 'waiting', 'wake', 'waking', 'walk', 'walking', 'watch', 'write'
  ]);

  /**
   * Detects if the word at `wordIdx` inside `wordTokens` (array of clean/display words)
   * is part of a phrasal verb, idiom, or collocation (like "most people", "going through", "24 hours", "It is not").
   */
  function detectCollocationAtWord(rawWordsArray, wordIdx) {
    if (!Array.isArray(rawWordsArray) || wordIdx < 0 || wordIdx >= rawWordsArray.length) {
      return null;
    }
    const cleanWords = rawWordsArray.map((w) => normalizeWord(w));
    const currentClean = cleanWords[wordIdx];
    if (!currentClean) return null;

    // 1. Check 3-word windows containing wordIdx against PHRASAL_AND_COLLOCATION_MAP
    for (let start = Math.max(0, wordIdx - 2); start <= Math.min(wordIdx, cleanWords.length - 3); start++) {
      const w3 = cleanWords.slice(start, start + 3).join(' ');
      if (PHRASAL_AND_COLLOCATION_MAP[w3]) {
        return {
          phrase: rawWordsArray.slice(start, start + 3).map((x) => x.replace(/^[.,!?;:"']+|[.,!?;:"']+$/g, '')).join(' '),
          cleanPhrase: w3,
          translationFa: PHRASAL_AND_COLLOCATION_MAP[w3].fa,
          pos: PHRASAL_AND_COLLOCATION_MAP[w3].pos,
          startIdx: start,
          endIdx: start + 2
        };
      }
    }

    // 2. Check 2-word windows containing wordIdx against PHRASAL_AND_COLLOCATION_MAP
    for (let start = Math.max(0, wordIdx - 1); start <= Math.min(wordIdx, cleanWords.length - 2); start++) {
      const w2 = cleanWords.slice(start, start + 2).join(' ');
      if (PHRASAL_AND_COLLOCATION_MAP[w2]) {
        return {
          phrase: rawWordsArray.slice(start, start + 2).map((x) => x.replace(/^[.,!?;:"']+|[.,!?;:"']+$/g, '')).join(' '),
          cleanPhrase: w2,
          translationFa: PHRASAL_AND_COLLOCATION_MAP[w2].fa,
          pos: PHRASAL_AND_COLLOCATION_MAP[w2].pos,
          startIdx: start,
          endIdx: start + 1
        };
      }
    }

    // 3. Heuristic Phrasal Verb detection: Verb + Particle (e.g., "going through", "selling to", "swaps in")
    if (COMMON_PHRASAL_VERBS_ROOTS.has(currentClean) && wordIdx + 1 < cleanWords.length) {
      const nextClean = cleanWords[wordIdx + 1];
      if (PHRASAL_PARTICLES.has(nextClean)) {
        const displayPhrase = [rawWordsArray[wordIdx], rawWordsArray[wordIdx + 1]]
          .map((x) => x.replace(/^[.,!?;:"']+|[.,!?;:"']+$/g, ''))
          .join(' ');
        return {
          phrase: displayPhrase,
          cleanPhrase: `${currentClean} ${nextClean}`,
          translationFa: '', // Fetched live from GTX translator
          pos: 'phrasal verb',
          startIdx: wordIdx,
          endIdx: wordIdx + 1
        };
      }
    }
    if (PHRASAL_PARTICLES.has(currentClean) && wordIdx - 1 >= 0) {
      const prevClean = cleanWords[wordIdx - 1];
      if (COMMON_PHRASAL_VERBS_ROOTS.has(prevClean)) {
        const displayPhrase = [rawWordsArray[wordIdx - 1], rawWordsArray[wordIdx]]
          .map((x) => x.replace(/^[.,!?;:"']+|[.,!?;:"']+$/g, ''))
          .join(' ');
        return {
          phrase: displayPhrase,
          cleanPhrase: `${prevClean} ${currentClean}`,
          translationFa: '',
          pos: 'phrasal verb',
          startIdx: wordIdx - 1,
          endIdx: wordIdx
        };
      }
    }

    // 4. Number + Unit / Noun (e.g., "24 hours", "12 hours")
    if (/^\d+$/.test(currentClean) && wordIdx + 1 < cleanWords.length && cleanWords[wordIdx + 1]) {
      const displayPhrase = [rawWordsArray[wordIdx], rawWordsArray[wordIdx + 1]]
        .map((x) => x.replace(/^[.,!?;:"']+|[.,!?;:"']+$/g, ''))
        .join(' ');
      return {
        phrase: displayPhrase,
        cleanPhrase: `${currentClean} ${cleanWords[wordIdx + 1]}`,
        translationFa: '',
        pos: 'collocation',
        startIdx: wordIdx,
        endIdx: wordIdx + 1
      };
    }
    if (wordIdx - 1 >= 0 && /^\d+$/.test(cleanWords[wordIdx - 1])) {
      const displayPhrase = [rawWordsArray[wordIdx - 1], rawWordsArray[wordIdx]]
        .map((x) => x.replace(/^[.,!?;:"']+|[.,!?;:"']+$/g, ''))
        .join(' ');
      return {
        phrase: displayPhrase,
        cleanPhrase: `${cleanWords[wordIdx - 1]} ${currentClean}`,
        translationFa: '',
        pos: 'collocation',
        startIdx: wordIdx - 1,
        endIdx: wordIdx
      };
    }

    // 5. Quantifier / Modifier + Noun (e.g., "most people", "any more", "whole reason", "same moves")
    const modifiers = new Set(['most', 'many', 'some', 'any', 'whole', 'same', 'every', 'each', 'other', 'another', 'such']);
    if (modifiers.has(currentClean) && wordIdx + 1 < cleanWords.length && cleanWords[wordIdx + 1].length > 2) {
      const displayPhrase = [rawWordsArray[wordIdx], rawWordsArray[wordIdx + 1]]
        .map((x) => x.replace(/^[.,!?;:"']+|[.,!?;:"']+$/g, ''))
        .join(' ');
      return {
        phrase: displayPhrase,
        cleanPhrase: `${currentClean} ${cleanWords[wordIdx + 1]}`,
        translationFa: '',
        pos: 'collocation',
        startIdx: wordIdx,
        endIdx: wordIdx + 1
      };
    }
    if (wordIdx - 1 >= 0 && modifiers.has(cleanWords[wordIdx - 1]) && currentClean.length > 2) {
      const displayPhrase = [rawWordsArray[wordIdx - 1], rawWordsArray[wordIdx]]
        .map((x) => x.replace(/^[.,!?;:"']+|[.,!?;:"']+$/g, ''))
        .join(' ');
      return {
        phrase: displayPhrase,
        cleanPhrase: `${cleanWords[wordIdx - 1]} ${currentClean}`,
        translationFa: '',
        pos: 'collocation',
        startIdx: wordIdx - 1,
        endIdx: wordIdx
      };
    }

    return null;
  }

  const CORE_FREQUENCY_MAP = {
    the: 1, be: 2, to: 3, of: 4, and: 5, a: 6, in: 7, that: 8, have: 9, i: 10,
    it: 11, for: 12, not: 13, on: 14, with: 15, he: 16, as: 17, you: 18, do: 19, at: 20,
    this: 21, but: 22, his: 23, by: 24, from: 25, they: 26, we: 27, say: 28, her: 29, she: 30,
    or: 31, an: 32, will: 33, my: 34, one: 35, all: 36, would: 37, there: 38, their: 39, what: 40,
    so: 41, up: 42, out: 43, if: 44, about: 45, who: 46, get: 47, which: 48, go: 49, me: 50,
    when: 51, make: 52, can: 53, like: 54, time: 55, no: 56, just: 57, him: 58, know: 59, take: 60,
    people: 61, into: 62, year: 63, your: 64, good: 65, some: 66, could: 67, them: 68, see: 69, other: 70,
    than: 71, then: 72, now: 73, look: 74, only: 75, come: 76, its: 77, over: 78, think: 79, also: 80,
    back: 81, after: 82, use: 83, two: 84, how: 85, our: 86, work: 87, first: 88, well: 89, way: 90,
    even: 91, new: 92, want: 93, because: 94, any: 95, these: 96, give: 97, day: 98, most: 99, us: 100,
    mean: 160, model: 520, workflow: 3400, wrapper: 4200, template: 2850, swap: 3100, feature: 920,
    button: 1100, tutorial: 2600, build: 420, spend: 680, hours: 340, open: 310, source: 780,
    masking: 4600, cutting: 1450, basics: 1950, waste: 1320, upload: 2150, photo: 820,
    night: 145, sleep: 310, sand: 1120, miles: 980, inhabited: 4250, earth: 620, isolated: 2890,
    shipwrecked: 6400, sailor: 3100, raft: 4800, middle: 510, ocean: 950, imagine: 780, amaze: 2450,
    sunrise: 3200, funny: 890, voice: 410, wake: 1150, draw: 690, sheep: 2100, whisper: 2650,
    thunderstruck: 7800, blink: 3400, portrait: 2950, astonishing: 4400, desert: 1850, wander: 2700,
    cognitive: 3100, architecture: 1950, immersion: 3600, contextual: 3900, comprehension: 2900,
    acquisition: 2850, lexical: 4900, retention: 3450, authentic: 2600, spontaneous: 3750,
    paradigm: 3800, ephemeral: 6900, ubiquitous: 5800, meticulous: 5200, serendipity: 7400,
    resilience: 3300, eloquent: 5600, pragmatic: 4700, inevitable: 2400, profound: 2750,
    subtle: 2550, ambiguous: 4300, catalyst: 4600, empirical: 4100, nuance: 5100,
    hypothesis: 3250, synthesize: 4850, trajectory: 4200, proliferate: 6300, quintessential: 6800,
    reluctant: 3150, nostalgia: 4550, melancholy: 5400, dilemma: 3500, paradox: 3950,
    flourish: 3850, obsolete: 4750, intricate: 4050, scrutinize: 5900, conundrum: 6500
  };

  function normalizeWord(raw) {
    return String(raw || '')
      .toLowerCase()
      .replace(/^[^a-zA-Z0-9\u00C0-\u024F']+|[^a-zA-Z0-9\u00C0-\u024F']+$/g, '')
      .trim();
  }

  function lemmatizeWord(word) {
    const clean = normalizeWord(word);
    if (!clean || clean.length <= 3) return clean;
    const irregulars = {
      went: 'go', gone: 'go', goes: 'go', going: 'go',
      was: 'be', were: 'be', been: 'be', am: 'be', is: 'be', are: 'be',
      had: 'have', has: 'have', having: 'have',
      did: 'do', does: 'do', done: 'do',
      said: 'say', says: 'say',
      made: 'make', makes: 'make',
      took: 'take', taken: 'take',
      came: 'come', comes: 'come',
      saw: 'see', seen: 'see',
      knew: 'know', known: 'know',
      thought: 'think', thinking: 'think',
      found: 'find',
      told: 'tell',
      became: 'become',
      left: 'leave',
      felt: 'feel',
      put: 'put',
      brought: 'bring',
      began: 'begin', begun: 'begin',
      kept: 'keep',
      held: 'hold',
      wrote: 'write', written: 'write',
      stood: 'stand',
      heard: 'hear',
      meant: 'mean',
      met: 'meet',
      ran: 'run',
      paid: 'pay',
      sat: 'sit',
      spoke: 'speak', spoken: 'speak',
      lay: 'lie', lain: 'lie',
      led: 'lead',
      read: 'read',
      grew: 'grow', grown: 'grow',
      lost: 'lose',
      fell: 'fall', fallen: 'fall',
      sent: 'send', selling: 'sell', sold: 'sell',
      built: 'build',
      understood: 'understand',
      drew: 'draw', drawn: 'draw',
      woke: 'wake', woken: 'wake'
    };
    if (irregulars[clean]) return irregulars[clean];
    if (clean.endsWith('ies') && clean.length > 4) return clean.slice(0, -3) + 'y';
    if (clean.endsWith('ing') && clean.length > 5) {
      const stem = clean.slice(0, -3);
      if (CORE_FREQUENCY_MAP[stem + 'e'] || stem.endsWith('at') || stem.endsWith('ut') || stem.endsWith('it')) {
        return stem + 'e';
      }
      return stem;
    }
    if (clean.endsWith('ed') && clean.length > 4) {
      const stem = clean.slice(0, -2);
      if (CORE_FREQUENCY_MAP[stem]) return stem;
      if (CORE_FREQUENCY_MAP[clean.slice(0, -1)] || clean.endsWith('ated') || clean.endsWith('ured') || clean.endsWith('ized')) {
        return clean.slice(0, -1);
      }
      return stem;
    }
    if (clean.endsWith('es') && clean.length > 4) {
      const stem = clean.slice(0, -2);
      if (CORE_FREQUENCY_MAP[stem]) return stem;
      if (clean.endsWith('ces') || clean.endsWith('ges') || clean.endsWith('tes') || clean.endsWith('les')) {
        return clean.slice(0, -1);
      }
    }
    if (clean.endsWith('s') && !clean.endsWith('ss') && clean.length > 3) {
      return clean.slice(0, -1);
    }
    return clean;
  }

  const LOCAL_MULTI_POS_DICT = {
    new: [
      { pos: 'adjective', terms: ['جدید', 'نو', 'تازه', 'نوین', 'مدرن'] },
      { pos: 'adverb', terms: ['به تازگی', 'اخیراً', 'از نو'] }
    ],
    top: [
      { pos: 'adjective', terms: ['برتر', 'بهترین', 'تراز اول', 'بالاترین'] },
      { pos: 'noun', terms: ['قله', 'راس', 'بالا', 'سطح فوقانی'] },
      { pos: 'verb', terms: ['صدرنشین شدن', 'فراتر رفتن از'] }
    ],
    local: [
      { pos: 'adjective', terms: ['محلی', 'بومی', 'داخلی (روی سیستم شخصی)', 'موضعی'] },
      { pos: 'noun', terms: ['ساکن محلی', 'بومی'] }
    ],
    image: [
      { pos: 'noun', terms: ['تصویر', 'عکس', 'نگاره', 'تمثال', 'ذهنیت'] },
      { pos: 'verb', terms: ['تصویرسازی کردن', 'مجسم کردن', 'بازتاب دادن'] }
    ],
    generator: [
      { pos: 'noun', terms: ['مولد', 'تولیدکننده', 'سازنده هوش مصنوعی', 'ژنراتور'] }
    ],
    create: [
      { pos: 'verb', terms: ['ایجاد کردن', 'ساختن', 'خلق کردن', 'به وجود آوردن', 'تولید کردن'] }
    ],
    realistic: [
      { pos: 'adjective', terms: ['واقع‌گرایانه', 'طبیعی', 'شبیه به واقعیت', 'واقع‌بینانه'] }
    ],
    edit: [
      { pos: 'verb', terms: ['ویرایش کردن', 'اصلاح کردن', 'تغییر دادن', 'تدوین کردن'] },
      { pos: 'noun', terms: ['ویرایش', 'نسخه ویرایش‌شده', 'اصلاحیه'] }
    ],
    open: [
      { pos: 'adjective', terms: ['باز', 'آزاد', 'متن‌باز', 'در دسترس'] },
      { pos: 'verb', terms: ['باز کردن', 'گشودن', 'راه‌اندازی کردن'] }
    ],
    source: [
      { pos: 'noun', terms: ['منبع', 'سرچشمه', 'کد منبع (سورس)', 'مبدأ'] },
      { pos: 'verb', terms: ['تأمین کردن از منبع', 'منبع‌یابی کردن'] }
    ],
    model: [
      { pos: 'noun', terms: ['مدل هوش مصنوعی', 'الگو', 'نمونه', 'سرمشق'] },
      { pos: 'verb', terms: ['مدل‌سازی کردن', 'طراحی کردن'] }
    ],
    swap: [
      { pos: 'verb', terms: ['جایگزین کردن', 'عوض کردن', 'معاوضه کردن', 'جابه‌جا کردن'] },
      { pos: 'noun', terms: ['معاوضه', 'جایگزینی', 'تبادل'] }
    ],
    workflow: [
      { pos: 'noun', terms: ['گردش کار', 'روال کاری', 'فرآیند اجرای کار', 'خط تولید'] }
    ],
    wrapper: [
      { pos: 'noun', terms: ['پوشش‌دهنده', 'واسط نرم‌افزاری', 'پوسته رابط'] }
    ],
    waste: [
      { pos: 'verb', terms: ['تلف کردن', 'هدر دادن', 'به بطالت گذراندن'] },
      { pos: 'noun', terms: ['اتلاف', 'ضایعات', 'هدررفت'] }
    ],
    build: [
      { pos: 'verb', terms: ['ساختن', 'توسعه دادن', 'بنا کردن', 'ایجاد کردن'] },
      { pos: 'noun', terms: ['ساختار', 'نسخه ساخته‌شده'] }
    ],
    spend: [
      { pos: 'verb', terms: ['صرف کردن (وقت/هزینه)', 'گذراندن', 'خرج کردن'] }
    ],
    mean: [
      { pos: 'verb', terms: ['معنی دادن', 'منظور داشتن', 'قصد داشتن'] },
      { pos: 'adjective', terms: ['بدجنس', 'خسیس', 'میانگین'] },
      { pos: 'noun', terms: ['میانگین', 'حد وسط'] }
    ],
    revolution: [
      { pos: 'noun', terms: ['انقلاب', 'دگرگونی بنیادین', 'تحول عظیم', 'چرخش کامل'] }
    ],
    figure: [
      { pos: 'verb', terms: ['فهمیدن (figure out)', 'محاسبه کردن', 'تصور کردن'] },
      { pos: 'noun', terms: ['رقم', 'عدد', 'شخصیت', 'شکل و اندام'] }
    ]
  };

  function lookupInstantLocalMultiPos(rawWordOrPhrase) {
    const clean = String(rawWordOrPhrase || '').toLowerCase().trim().replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '');
    if (!clean) return null;
    if (PHRASAL_AND_COLLOCATION_MAP[clean]) {
      const entry = PHRASAL_AND_COLLOCATION_MAP[clean];
      const terms = entry.fa.split('/').map((s) => s.trim()).filter(Boolean);
      return {
        word: clean,
        lemma: clean,
        pos: entry.pos || 'phrasal verb',
        translation: terms.join('، '),
        posGroups: [{ pos: entry.pos || 'phrasal verb', terms }],
        wordMeanings: terms
      };
    }
    const lemma = lemmatizeWord(clean);
    const groups = LOCAL_MULTI_POS_DICT[clean] || LOCAL_MULTI_POS_DICT[lemma];
    if (groups && groups.length > 0) {
      const allTerms = [];
      for (const g of groups) {
        for (const t of g.terms) {
          if (!allTerms.includes(t)) allTerms.push(t);
        }
      }
      return {
        word: clean,
        lemma,
        pos: groups[0].pos,
        translation: allTerms.slice(0, 6).join('، '),
        posGroups: groups,
        wordMeanings: allTerms.slice(0, 5)
      };
    }
    return null;
  }

  function estimateWordRank(rawWord) {
    const clean = normalizeWord(rawWord);
    if (!clean) return 5000;
    if (CORE_FREQUENCY_MAP[clean]) return CORE_FREQUENCY_MAP[clean];
    const lemma = lemmatizeWord(clean);
    if (CORE_FREQUENCY_MAP[lemma]) return CORE_FREQUENCY_MAP[lemma];

    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
      hash = ((hash << 5) - hash) + clean.charCodeAt(i);
      hash |= 0;
    }
    const baseByLen = Math.min(8500, Math.max(400, clean.length * 620));
    return Math.max(250, Math.min(9800, baseByLen + (Math.abs(hash) % 1400)));
  }

  function getWordDifficultyMeta(rawWord) {
    const rank = estimateWordRank(rawWord);
    if (rank <= 1000) return { rank, cefr: 'A1', freqTag: 'tag 1k', category: 'Core 1K' };
    if (rank <= 2200) return { rank, cefr: 'A2', freqTag: 'tag 2k', category: 'High Freq 2K' };
    if (rank <= 3800) return { rank, cefr: 'B1', freqTag: 'tag 3k', category: 'Intermediate 4K' };
    if (rank <= 6000) return { rank, cefr: 'B2', freqTag: 'tag 5k', category: 'Upper-Int 6K' };
    return { rank, cefr: 'C1', freqTag: 'tag 8k', category: 'Academic / Rare' };
  }

  function resolveTokenVisualCategory(rawWord, savedCard, settings) {
    const clean = normalizeWord(rawWord);
    if (!clean) return 'unranked';

    if (savedCard) {
      if (savedCard.status === 'known' || savedCard.leitnerBox >= 5) return 'known';
      if (savedCard.status === 'ignored') return 'ignored';
      if (savedCard.status === 'learning' || savedCard.leitnerBox >= 1) return 'learning';
    }

    const rank = estimateWordRank(clean);
    const knownThresholdRank = Number(settings?.vocabLevelRank) || Math.round(((settings?.userVocabPercentile || 30) / 100) * 4500);
    const ratio = Number(settings?.suggestedToKnownRatio || 1.0);
    const suggestedCapRank = Math.round(knownThresholdRank * (1 + ratio * 1.15));

    if (rank <= knownThresholdRank) return 'known';
    if (rank <= suggestedCapRank) return 'suggested';
    return 'unranked';
  }

  function buildContextualGrammarAnalysis(word, sentence, dictData) {
    const clean = normalizeWord(word);
    const lemma = lemmatizeWord(clean);
    const meta = getWordDifficultyMeta(clean);
    const pos = dictData?.pos || 'واژه / عبارت';
    const primaryMeaning = dictData?.translation || '';

    const morphNotes = [];
    if (lemma && lemma !== clean) {
      morphNotes.push(`ریشه واژه (Lemma): «${lemma}»`);
    }
    if (clean.endsWith('ing')) {
      morphNotes.push('ساختار گرامر: وجه وصفی حال / اسم مصدر (Gerund / Present Participle)');
    } else if (clean.endsWith('ed')) {
      morphNotes.push('ساختار گرامر: گذشته ساده یا اسم مفعول (Past / Past Participle)');
    } else if (clean.endsWith('ly') && clean.length > 4) {
      morphNotes.push('ساختار گرامر: قید حالت/نگرش (Adverbial Modifier)');
    } else if (clean.endsWith('tion') || clean.endsWith('ment') || clean.endsWith('ness') || clean.endsWith('ity')) {
      morphNotes.push('ساختار گرامر: اسم مشتق (Nominalization Suffix)');
    }

    let collocation = '';
    if (sentence) {
      const words = sentence.split(/\s+/);
      const idx = words.findIndex((w) => normalizeWord(w) === clean);
      if (idx !== -1) {
        const detected = detectCollocationAtWord(words, idx);
        if (detected) {
          collocation = detected.phrase;
        } else {
          const prev = idx > 0 ? words[idx - 1].replace(/[^\w'-]/g, '') : '';
          const next = idx < words.length - 1 ? words[idx + 1].replace(/[^\w'-]/g, '') : '';
          const phraseParts = [prev, words[idx].replace(/[^\w'-]/g, ''), next].filter(Boolean);
          if (phraseParts.length >= 2) {
            collocation = phraseParts.join(' ');
          }
        }
      }
    }

    const summaryFa = [
      `نقش دستوری: ${pos} (سطح ${meta.cefr} • ${meta.freqTag})`,
      primaryMeaning ? `معنی دقیق در این بافت: «${primaryMeaning}»` : null,
      morphNotes.length ? morphNotes.join(' | ') : null,
      collocation ? `هم‌نشینی واژگانی (Collocation): "${collocation}"` : null
    ].filter(Boolean).join(' — ');

    return {
      lemma,
      cefr: meta.cefr,
      freqTag: meta.freqTag,
      rank: meta.rank,
      collocation,
      morphNotes,
      summaryFa
    };
  }

  global.LTConstants = {
    getExtApi,
    LEITNER_INTERVALS_DAYS,
    gradeLeitnerCard,
    computeAnkiNextIntervals,
    gradeAnkiCard,
    WORD_COLOR_PRESETS,
    DEFAULT_SETTINGS,
    PHRASAL_AND_COLLOCATION_MAP,
    LOCAL_MULTI_POS_DICT,
    lookupInstantLocalMultiPos,
    detectCollocationAtWord,
    normalizeWord,
    lemmatizeWord,
    estimateWordRank,
    getWordDifficultyMeta,
    resolveTokenVisualCategory,
    buildContextualGrammarAnalysis
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
