import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LeitnerCard,
  SavedSentence,
  SubtitleCue,
  LanguageReactorSettings,
  WORD_COLOR_PRESETS,
  DEMO_DUAL_SUBTITLES,
  DEMO_VIDEO_METADATA,
  BUILTIN_DICTIONARY,
  lookupComprehensiveLocalDictionary,
  tokenizeSubtitleLine,
  findInVideoExamples,
  formatTimestamp,
  toPersianDigits,
  resolveWordVisualCategory,
  getWordDifficultyMeta,
  buildContextualGrammarAnalysisFa,
  generatePrintableTranscriptHtml,
  generateTranscriptCsv,
  detectCollocationAtWord,
  DetectedCollocation,
} from '../utils/linguatubeLogic';

interface PlayerSimulatorViewProps {
  cards: LeitnerCard[];
  savedSentences: SavedSentence[];
  settings: LanguageReactorSettings;
  onUpdateSettings: (patch: Partial<LanguageReactorSettings>) => void;
  onSaveCard: (card: Partial<LeitnerCard> & { word: string; translationFa: string }) => void;
  onUpdateCardBack: (
    cardId: string,
    patch: {
      translationFa?: string;
      customNotesFa?: string;
      contextSentenceEn?: string;
      contextSentenceFa?: string;
      aiExplanationFa?: string;
      miniMeaningsFa?: string[];
    }
  ) => void;
  onSaveSentence: (sentence: Omit<SavedSentence, 'id' | 'createdAt'>) => void;
  onOpenPhrasePump: () => void;
  onOpenSettingsPage: () => void;
}

interface LiveLookupResult {
  word: string;
  phonetic: string;
  translationFa: string;
  miniMeaningsFa: string[];
  aiExplanationFa: string;
  posEntries: Array<{ pos: string; terms: string[] }>;
  englishDefinition: string;
  tatoebaExamples: Array<{ en: string; fa: string; source: 'Tatoeba' | 'Corpus' }>;
  cefr: string;
  freqTag: string;
}

interface GeminiContextualResult {
  contextualMeaningFa: string;
  posInSentence: string;
  grammarNuanceFa: string;
  allMeaningsByPos: Array<{ pos: string; meaningsFa: string[] }>;
  collocationOrIdiom?: string;
}

export const PlayerSimulatorView: React.FC<PlayerSimulatorViewProps> = ({
  cards,
  savedSentences,
  settings,
  onUpdateSettings,
  onSaveCard,
  onUpdateCardBack,
  onSaveSentence,
  onOpenPhrasePump,
  onOpenSettingsPage,
}) => {
  const [cues] = useState<SubtitleCue[]>(DEMO_DUAL_SUBTITLES);
  const [activeCueIndex, setActiveCueIndex] = useState<number>(2); // Start on Cue #3 ("We are going through a revolution right now with most people learning faster.")
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [rightTab, setRightTab] = useState<'subtitles' | 'words' | 'saved'>('subtitles');
  const [wordFilterCat, setWordFilterCat] = useState<'all' | 'suggested' | 'learning' | 'known'>('all');

  // Trancy Word-by-Word Speaker Karaoke Progress (0..wordCount)
  const [spokenWordCursor, setSpokenWordCursor] = useState<number>(4);

  // Hover Mini-Popup State (#1b6b85 Teal Tooltip + Collocation + End-of-Cue Hover Auto-Pause)
  const [hoveredWordInfo, setHoveredWordInfo] = useState<{
    cleanWord: string;
    displayWord: string;
    wordIndex: number;
    collocation: DetectedCollocation | null;
  } | null>(null);
  const [hoverPausedAtCueEnd, setHoverPausedAtCueEnd] = useState<boolean>(false);

  // Multi-Word Drag / Range Selection State for Phrasal Verbs & Idioms
  const [isDraggingWords, setIsDraggingWords] = useState<boolean>(false);
  const [phraseRange, setPhraseRange] = useState<{ startIdx: number; endIdx: number } | null>(null);

  // Listening Mode Reveal Step: 0 = blurred (if hideSubtitles active), 1 = EN revealed ('E'), 2 = EN+FA revealed
  const [cueRevealedStep, setCueRevealedStep] = useState<number>(0);

  // Smart YouTube Playback Bar Bottom Zone Hover State
  const [isMouseInBottomPlaybarZone, setIsMouseInBottomPlaybarZone] = useState<boolean>(false);

  // Draggable Subtitle Box State
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingSubBox, setIsDraggingSubBox] = useState<boolean>(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; xPercent: number; bottomPx: number }>({
    mouseX: 0,
    mouseY: 0,
    xPercent: 50,
    bottomPx: 62,
  });

  // Selected Word / Right-Side Slide-Over Dictionary Drawer State
  const [selectedPhrase, setSelectedPhrase] = useState<string>('going through');
  const [anchorWordIndex, setAnchorWordIndex] = useState<number | null>(2);
  const [floatingPopupOpen, setFloatingPopupOpen] = useState<boolean>(false);
  const [trancyStyleDrawerOpen, setTrancyStyleDrawerOpen] = useState<boolean>(false);
  const [liveDictCache, setLiveDictCache] = useState<Record<string, LiveLookupResult>>({});
  const [isLoadingDict, setIsLoadingDict] = useState<boolean>(false);

  // Gemini Contextual AI (Lexa AI) On-Demand State
  const [geminiLoading, setGeminiLoading] = useState<boolean>(false);
  const [geminiResultMap, setGeminiResultMap] = useState<Record<string, GeminiContextualResult>>({});
  const [geminiError, setGeminiError] = useState<string | null>(null);

  // Inline Custom Back-of-Card Editor inside Dictionary Drawer
  const [drawerEditOpen, setDrawerEditOpen] = useState<boolean>(false);
  const [drawerCustomTranslationFa, setDrawerCustomTranslationFa] = useState<string>('');
  const [drawerCustomNotesFa, setDrawerCustomNotesFa] = useState<string>('');

  // Modals
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'html' | 'csv'>('html');
  const [quickSettingsOpen, setQuickSettingsOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const pressedKeysRef = useRef<Set<string>>(new Set());
  const activeCue = cues[activeCueIndex] || cues[0];
  const tokens = useMemo(() => tokenizeSubtitleLine(activeCue.textEn), [activeCue.textEn]);
  const wordOnlyList = useMemo(
    () => tokens.filter((t) => t.isWord).map((t) => t.text),
    [tokens]
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2600);
  };

  const speakWord = (text: string) => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'en-US';
        utter.rate = 0.95;
        window.speechSynthesis.speak(utter);
      }
    } catch {
      // ignore
    }
  };

  // Word-by-Word Speaker Karaoke Ticker + End-of-Cue Hover Hold Auto-Pause
  useEffect(() => {
    if (!isPlaying) return;
    const totalWords = Math.max(1, wordOnlyList.length);
    const wordStepMs = Math.max(260, Math.round(activeCue.dDurationMs / playbackSpeed / totalWords));

    const timer = setInterval(() => {
      setSpokenWordCursor((prev) => {
        if (prev + 1 < totalWords) {
          return prev + 1;
        }
        // Reached the end of the current subtitle line!
        // 1. Check Language Reactor Hover-Hold Auto-Pause: if mouse is hovering a word with popup open, pause here until mouse leaves!
        if (settings.hoverPauseAtCueEnd && hoveredWordInfo !== null) {
          setIsPlaying(false);
          setHoverPausedAtCueEnd(true);
          showToast('⏸ توقف خودکار در انتهای خط به خاطر نگه داشتن موس روی کلمه — با کنار بردن موس ادامه می‌یابد');
          return totalWords - 1;
        }
        // 2. Check standard AP (Auto-Pause after cue)
        if (settings.autoPauseAfterCue) {
          setIsPlaying(false);
          if (settings.hideSubtitles === 'subtitle_then_translation') {
            setCueRevealedStep(2);
          }
          showToast('توقف خودکار (AP) در پایان دیالوگ فعال شد');
          return totalWords - 1;
        }
        // 3. Otherwise advance to next subtitle cue
        setCueRevealedStep(0);
        setPhraseRange(null);
        setActiveCueIndex((cIdx) => (cIdx + 1) % cues.length);
        return 0;
      });
    }, wordStepMs);

    return () => clearInterval(timer);
  }, [
    isPlaying,
    activeCue.dDurationMs,
    playbackSpeed,
    wordOnlyList.length,
    settings.hoverPauseAtCueEnd,
    settings.autoPauseAfterCue,
    settings.hideSubtitles,
    hoveredWordInfo,
    cues.length,
  ]);

  // Stop word-drag selection on global mouseup
  useEffect(() => {
    if (!isDraggingWords) return;
    const onUp = () => setIsDraggingWords(false);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [isDraggingWords]);

  // Keyboard Shortcuts: A/ArrowLeft (Prev), S/ArrowDown (Repeat), D/ArrowRight (Next), E (Reveal), W (Repeat Blurred), Q (AP)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      pressedKeysRef.current.add(e.code);

      if ((pressedKeysRef.current.has('KeyA') && pressedKeysRef.current.has('KeyD')) || e.code === 'KeyW') {
        e.preventDefault();
        setCueRevealedStep(0);
        setSpokenWordCursor(0);
        setIsPlaying(false);
        showToast('تکرار دیالوگ با اعمال مجدد حالت Blur (شنیداری)');
        return;
      }

      if (e.code === 'KeyA' || (settings.useArrowKeys && e.code === 'ArrowLeft')) {
        e.preventDefault();
        setCueRevealedStep(0);
        setSpokenWordCursor(0);
        setPhraseRange(null);
        setActiveCueIndex((prev) => Math.max(0, prev - 1));
      } else if (e.code === 'KeyS' || (settings.useArrowKeys && e.code === 'ArrowDown')) {
        e.preventDefault();
        setSpokenWordCursor(0);
        setIsPlaying(false);
        showToast(`تکرار دیالوگ (${formatTimestamp(activeCue.tStartMs / 1000)})`);
      } else if (e.code === 'KeyD' || (settings.useArrowKeys && e.code === 'ArrowRight')) {
        e.preventDefault();
        setCueRevealedStep(0);
        setSpokenWordCursor(0);
        setPhraseRange(null);
        setActiveCueIndex((prev) => Math.min(cues.length - 1, prev + 1));
      } else if (e.code === 'KeyE') {
        e.preventDefault();
        setCueRevealedStep((prev) => (prev >= 2 ? 0 : prev + 1));
      } else if (e.code === 'KeyQ') {
        e.preventDefault();
        onUpdateSettings({ autoPauseAfterCue: !settings.autoPauseAfterCue });
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        onSaveSentence({
          sentenceEn: activeCue.textEn,
          sentenceFa: activeCue.textFa,
          videoId: DEMO_VIDEO_METADATA.videoId,
          videoTitle: DEMO_VIDEO_METADATA.videoTitle,
          timestampSec: Math.round(activeCue.tStartMs / 1000),
        });
        showToast('جمله فعلی در Saved Sentences ذخیره شد');
      } else if (e.code === 'Escape') {
        setFloatingPopupOpen(false);
        setQuickSettingsOpen(false);
        setExportModalOpen(false);
        setTrancyStyleDrawerOpen(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.code);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [activeCue, cues.length, onSaveSentence, onUpdateSettings, settings.autoPauseAfterCue, settings.useArrowKeys]);

  // Draggable Subtitle Box Mouse Listeners
  useEffect(() => {
    if (!isDraggingSubBox) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = playerContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;

      const nextXPercent = Math.max(
        18,
        Math.min(82, dragStartRef.current.xPercent + (dx / Math.max(320, rect.width)) * 100)
      );
      const nextBottomPx = Math.max(
        18,
        Math.min(rect.height - 95, dragStartRef.current.bottomPx - dy)
      );

      onUpdateSettings({
        subtitlePosition: {
          custom: true,
          xPercent: Math.round(nextXPercent * 10) / 10,
          bottomPx: Math.round(nextBottomPx),
        },
      });
    };

    const handleMouseUp = () => {
      setIsDraggingSubBox(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSubBox, onUpdateSettings]);

  // Multi-Source Free Dictionary + Tatoeba Parallel Examples Lookup
  useEffect(() => {
    const key = selectedPhrase.trim().toLowerCase();
    if (!key) return;
    if (BUILTIN_DICTIONARY[key] || liveDictCache[key]) return;

    let cancelled = false;
    setIsLoadingDict(true);

    const fetchMultiSourceDictionary = async () => {
      const meta = getWordDifficultyMeta(key);
      let translationFa = '';
      let phonetic = `/${key}/`;
      let englishDefinition = '';
      let posEntries: Array<{ pos: string; terms: string[] }> = [];
      const tatoebaExamples: Array<{ en: string; fa: string; source: 'Tatoeba' | 'Corpus' }> = [];

      try {
        const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&dt=bd&dj=1&q=${encodeURIComponent(key)}`;
        const gtxRes = await fetch(gtxUrl);
        if (gtxRes.ok) {
          const data = await gtxRes.json();
          if (Array.isArray(data.sentences)) {
            translationFa = data.sentences.map((s: { trans?: string }) => s.trans || '').join('').trim();
          }
          if (Array.isArray(data.dict)) {
            posEntries = data.dict.map((d: { pos?: string; terms?: string[] }) => ({
              pos: d.pos || 'word',
              terms: Array.isArray(d.terms) ? d.terms.slice(0, 6) : [],
            }));
          }
        }
      } catch {
        // fallback below
      }

      if (!/\s+/.test(key)) {
        try {
          const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`);
          if (dictRes.ok) {
            const dictJson = await dictRes.json();
            if (Array.isArray(dictJson) && dictJson[0]) {
              if (dictJson[0].phonetic) phonetic = dictJson[0].phonetic;
              const firstMeaning = dictJson[0].meanings?.[0];
              const firstDef = firstMeaning?.definitions?.[0];
              if (firstDef?.definition) {
                englishDefinition = firstDef.definition;
              }
              if (firstDef?.example) {
                tatoebaExamples.push({
                  en: firstDef.example,
                  fa: 'مثال کاربردی از پیکره واژگانی (Tatoeba / Oxford)',
                  source: 'Tatoeba',
                });
              }
            }
          }
        } catch {
          // ignore
        }
      }

      const miniMeaningsFa = posEntries.flatMap((p) => p.terms).slice(0, 4);
      if (miniMeaningsFa.length === 0 && translationFa) {
        miniMeaningsFa.push(translationFa);
      }

      const primaryPos = posEntries[0]?.pos || (/\s+/.test(key) ? 'phrasal verb / idiom' : 'word');
      const aiExplanationFa = buildContextualGrammarAnalysisFa(
        key,
        activeCue.textEn,
        primaryPos,
        translationFa || miniMeaningsFa[0] || key
      );

      if (tatoebaExamples.length === 0) {
        tatoebaExamples.push({
          en: activeCue.textEn,
          fa: activeCue.textFa,
          source: 'Tatoeba',
        });
      }

      if (!cancelled) {
        setLiveDictCache((prev) => ({
          ...prev,
          [key]: {
            word: key,
            phonetic,
            translationFa: translationFa || miniMeaningsFa[0] || 'واژه / عبارت منتخب',
            miniMeaningsFa: miniMeaningsFa.length > 0 ? miniMeaningsFa : ['معنی در بافت جمله'],
            aiExplanationFa,
            posEntries:
              posEntries.length > 0
                ? posEntries
                : [{ pos: primaryPos, terms: [translationFa || 'معنی در بافت جمله'] }],
            englishDefinition:
              englishDefinition || `Contextual occurrence in "${activeCue.textEn}"`,
            tatoebaExamples,
            cefr: meta.cefr,
            freqTag: meta.freqTag,
          },
        }));
        setIsLoadingDict(false);
      }
    };

    fetchMultiSourceDictionary();
    return () => {
      cancelled = true;
    };
  }, [selectedPhrase, activeCue.textEn, activeCue.textFa, liveDictCache]);

  const currentDictEntry: LiveLookupResult = useMemo(() => {
    const key = selectedPhrase.trim().toLowerCase();
    const meta = getWordDifficultyMeta(key);
    const localRich = lookupComprehensiveLocalDictionary(key);
    if (liveDictCache[key]) {
      const cached = liveDictCache[key];
      const mergedPos =
        cached.posEntries && cached.posEntries.length >= 2
          ? cached.posEntries
          : localRich.posEntries;
      return {
        ...cached,
        posEntries: mergedPos,
        cefr: meta.cefr,
        freqTag: meta.freqTag,
      };
    }
    return {
      ...localRich,
      cefr: meta.cefr,
      freqTag: meta.freqTag,
    };
  }, [selectedPhrase, liveDictCache]);

  const buildClientSideContextualFallback = (): GeminiContextualResult => {
    const primaryPos =
      currentDictEntry.posEntries?.[0]?.pos ||
      (/\s+/.test(currentDictEntry.word) ? 'phrasal verb / idiom' : 'word');
    const allMeaningsByPos =
      currentDictEntry.posEntries && currentDictEntry.posEntries.length > 0
        ? currentDictEntry.posEntries.map((entry) => ({
            pos: entry.pos,
            meaningsFa: entry.terms,
          }))
        : [
            {
              pos: primaryPos,
              meaningsFa:
                currentDictEntry.miniMeaningsFa.length > 0
                  ? currentDictEntry.miniMeaningsFa
                  : [currentDictEntry.translationFa],
            },
          ];

    return {
      contextualMeaningFa: currentDictEntry.translationFa,
      posInSentence: primaryPos,
      grammarNuanceFa:
        currentDictEntry.aiExplanationFa ||
        buildContextualGrammarAnalysisFa(
          currentDictEntry.word,
          activeCue.textEn,
          primaryPos,
          currentDictEntry.translationFa
        ),
      allMeaningsByPos,
      collocationOrIdiom: /\s+/.test(currentDictEntry.word) ? currentDictEntry.word : '',
    };
  };

  const handleRequestGeminiContextualAi = async () => {
    const key = `${currentDictEntry.word}::${activeCue.id}`;
    setGeminiLoading(true);
    setGeminiError(null);
    try {
      const res = await fetch('/api/gemini/contextual-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wordOrPhrase: currentDictEntry.word,
          sentenceEn: activeCue.textEn,
          sentenceFa: activeCue.textFa,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        setGeminiResultMap((prev) => ({
          ...prev,
          [key]: data as GeminiContextualResult,
        }));
      } else {
        setGeminiResultMap((prev) => ({
          ...prev,
          [key]: buildClientSideContextualFallback(),
        }));
      }
    } catch {
      setGeminiResultMap((prev) => ({
        ...prev,
        [key]: buildClientSideContextualFallback(),
      }));
    } finally {
      setGeminiLoading(false);
    }
  };

  const activeGeminiResult = geminiResultMap[`${currentDictEntry.word}::${activeCue.id}`] || null;

  const concordanceExamples = useMemo(
    () => findInVideoExamples(cues, selectedPhrase),
    [cues, selectedPhrase]
  );

  const savedCardForSelected = useMemo(
    () => cards.find((c) => c.word.toLowerCase() === selectedPhrase.trim().toLowerCase()),
    [cards, selectedPhrase]
  );

  const allVideoWords = useMemo(() => {
    const map = new Map<
      string,
      {
        word: string;
        count: number;
        cefr: string;
        freqTag: string;
        rank: number;
        category: 'known' | 'suggested' | 'learning' | 'ignored' | 'unranked';
        cueIndex: number;
      }
    >();

    cues.forEach((cue, cueIdx) => {
      const toks = tokenizeSubtitleLine(cue.textEn);
      toks.forEach((t) => {
        if (!t.isWord || t.cleanWord.length < 2) return;
        const existing = map.get(t.cleanWord);
        if (existing) {
          existing.count += 1;
        } else {
          const saved = cards.find((c) => c.word.toLowerCase() === t.cleanWord);
          const meta = getWordDifficultyMeta(t.cleanWord);
          const category = resolveWordVisualCategory(t.cleanWord, saved, settings);
          map.set(t.cleanWord, {
            word: t.cleanWord,
            count: 1,
            cefr: meta.cefr,
            freqTag: meta.freqTag,
            rank: meta.rank,
            category,
            cueIndex: cueIdx,
          });
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => a.rank - b.rank);
  }, [cues, cards, settings]);

  const applyPhraseRangeSelection = (startIdx: number, endIdx: number, openDrawer = true) => {
    const minIdx = Math.min(startIdx, endIdx);
    const maxIdx = Math.max(startIdx, endIdx);
    const phraseWords = tokens
      .filter((t) => t.isWord && t.wordIndex >= minIdx && t.wordIndex <= maxIdx)
      .map((t) => t.text);
    const joined = phraseWords.join(' ').toLowerCase();
    if (joined) {
      setPhraseRange({ startIdx: minIdx, endIdx: maxIdx });
      setSelectedPhrase(joined);
      setDrawerEditOpen(false);
      setGeminiError(null);
      if (openDrawer) setFloatingPopupOpen(true);
      if (settings.speakWordOnClick) speakWord(joined);
    }
  };

  const handleTokenClick = (e: React.MouseEvent, cleanWord: string, wordIdx: number) => {
    e.stopPropagation();
    setIsPlaying(false);

    if (e.shiftKey && anchorWordIndex !== null && anchorWordIndex !== wordIdx) {
      applyPhraseRangeSelection(anchorWordIndex, wordIdx, true);
      return;
    }

    setAnchorWordIndex(wordIdx);
    setPhraseRange({ startIdx: wordIdx, endIdx: wordIdx });
    setSelectedPhrase(cleanWord);
    setDrawerEditOpen(false);
    setGeminiError(null);
    setFloatingPopupOpen(true);
    if (settings.speakWordOnClick) speakWord(cleanWord);
  };

  const handleWordRightClick = (e: React.MouseEvent, cleanWord: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (settings.rightClickAction === 'none') return;
    const existing = cards.find((c) => c.word.toLowerCase() === cleanWord);
    const nextStatus: 'known' | 'learning' =
      settings.rightClickAction === 'save_known'
        ? 'known'
        : settings.rightClickAction === 'save_learning'
          ? 'learning'
          : existing?.status === 'known'
            ? 'learning'
            : 'known';

    const dictEntry = lookupComprehensiveLocalDictionary(cleanWord);
    const meta = getWordDifficultyMeta(cleanWord);
    onSaveCard({
      word: cleanWord,
      lemma: dictEntry.lemma || cleanWord,
      isPhrase: /\s+/.test(cleanWord),
      status: nextStatus,
      box: nextStatus === 'known' ? 6 : 1,
      cefr: meta.cefr,
      freqTag: meta.freqTag,
      translationFa: dictEntry.translationFa,
      posEntries: dictEntry.posEntries,
      contextSentenceEn: activeCue.textEn,
      contextSentenceFa: activeCue.textFa,
      videoId: DEMO_VIDEO_METADATA.videoId,
      videoTitle: DEMO_VIDEO_METADATA.videoTitle,
      videoTimestampSec: Number((activeCue.tStartMs / 1000).toFixed(1)),
    });
    showToast(
      `کلیک راست: «${cleanWord}» به وضعیت ${nextStatus === 'known' ? 'Known (سبز)' : 'Learning (نارنجی)'} تغییر یافت`
    );
  };

  const handleSetWordStatus = (
    status: 'learning' | 'known' | 'ignored',
    customPhrase?: string,
    customMeaningFa?: string,
    customNotesFa?: string
  ) => {
    const targetWord = (customPhrase || currentDictEntry.word).trim().toLowerCase();
    const targetMeaning = customMeaningFa || currentDictEntry.translationFa;
    const box = status === 'known' ? 6 : 1;
    const meta = getWordDifficultyMeta(targetWord);

    onSaveCard({
      word: targetWord,
      lemma: targetWord,
      isPhrase: /\s+/.test(targetWord),
      status,
      pumpStage: status === 'known' ? 'learned' : status === 'ignored' ? 'ignored' : 'marked',
      cefr: meta.cefr,
      freqTag: meta.freqTag,
      phonetic: currentDictEntry.phonetic,
      translationFa: targetMeaning,
      customNotesFa,
      miniMeaningsFa: currentDictEntry.miniMeaningsFa,
      aiExplanationFa: activeGeminiResult
        ? `${activeGeminiResult.posInSentence}: ${activeGeminiResult.grammarNuanceFa}`
        : currentDictEntry.aiExplanationFa,
      posEntries: currentDictEntry.posEntries,
      englishDefinition: currentDictEntry.englishDefinition,
      tatoebaExamples: currentDictEntry.tatoebaExamples,
      contextSentenceEn: activeCue.textEn,
      contextSentenceFa: activeCue.textFa,
      videoId: DEMO_VIDEO_METADATA.videoId,
      videoTitle: DEMO_VIDEO_METADATA.videoTitle,
      videoTimestampSec: Number((activeCue.tStartMs / 1000).toFixed(1)),
      box,
    });
    const label =
      status === 'known'
        ? 'Known (سبز)'
        : status === 'ignored'
          ? "Don't learn (نادیده)"
          : 'افزوده به فلش‌کارت‌های AnkiDroid';
    showToast(`«${targetWord}» با وضعیت ${label} ذخیره شد`);
  };

  const handleExecuteExport = () => {
    if (exportFormat === 'html') {
      const html = generatePrintableTranscriptHtml(DEMO_VIDEO_METADATA.videoTitle, cues);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cunt-academy-printable-transcript.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast('فایل دو ستونی قابل چاپ Print (HTML) دانلود شد');
    } else {
      const csv = generateTranscriptCsv(cues);
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cunt-academy-transcript.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast('فایل Excel (CSV) زیرنویس‌ها دانلود شد');
    }
    setExportModalOpen(false);
  };

  // Compute Listening Mode Blur states
  const isSubtitleBlurred =
    (settings.hideSubtitles === 'hide_l2' && cueRevealedStep < 1) ||
    (settings.hideSubtitles === 'hide_both' && cueRevealedStep < 1) ||
    (settings.hideSubtitles === 'subtitle_then_translation' && cueRevealedStep < 1);

  const isTranslationBlurred =
    (settings.hideSubtitles === 'blur_translation' && cueRevealedStep < 2) ||
    (settings.hideSubtitles === 'hide_both' && cueRevealedStep < 2) ||
    (settings.hideSubtitles === 'subtitle_then_translation' && cueRevealedStep < 2);

  const isYoutubePlaybarVisible =
    !settings.lrEnabled || !settings.hidePlaybackBar || isMouseInBottomPlaybarZone;

  const subPos = settings.subtitlePosition || { custom: false, xPercent: 50, bottomPx: 62 };

  // Compute Trancy Text Shadow / Style CSS
  const textEffectStyle = useMemo((): React.CSSProperties => {
    switch (settings.subtitleTextStyle) {
      case 'outline':
        return {
          textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000',
        };
      case 'raised':
        return {
          textShadow: '0 1px 0 #000, 0 2px 0 #000, 0 3px 6px rgba(0,0,0,0.85)',
        };
      case 'netflix':
        return {
          textShadow: '0 0 8px rgba(0,0,0,0.95), 0 3px 10px rgba(0,0,0,0.95)',
          letterSpacing: '0.02em',
        };
      case 'none':
        return { textShadow: 'none' };
      case 'shadow':
      default:
        return { textShadow: '0 2px 6px rgba(0,0,0,0.92)' };
    }
  }, [settings.subtitleTextStyle]);

  // Instant 0ms Multi-Meaning Hover Lookup for the `#1b6b85` Teal Mini-Popup
  const hoveredMiniMeanings = useMemo(() => {
    if (!hoveredWordInfo) return [];
    const k = hoveredWordInfo.cleanWord;
    const saved = cards.find((c) => c.word.toLowerCase() === k);
    if (saved && saved.miniMeaningsFa && saved.miniMeaningsFa.length >= 2) {
      return saved.miniMeaningsFa.slice(0, 4);
    }
    const localRich = lookupComprehensiveLocalDictionary(k);
    return localRich.miniMeaningsFa.slice(0, 4);
  }, [hoveredWordInfo, cards]);

  return (
    <div className="space-y-4">
      {toastMessage && (
        <div
          dir="rtl"
          className="fixed bottom-5 left-5 z-50 bg-[#16192b]/95 border border-violet-500/50 text-violet-100 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-medium"
        >
          {toastMessage}
        </div>
      )}

      {/* Main Split Workspace: Left YouTube Player Stage + Right 3-Tab Cunt Academy Dock */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN (8 Cols): Interactive YouTube Player Stage */}
        <div className="lg:col-span-8 bg-[#0B0D14] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
          {/* Video Stage Canvas */}
          <div
            ref={playerContainerRef}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const distFromBottom = rect.bottom - e.clientY;
              setIsMouseInBottomPlaybarZone(distFromBottom <= 68 && distFromBottom >= -8);
            }}
            onMouseLeave={() => setIsMouseInBottomPlaybarZone(false)}
            onClick={() => {
              setFloatingPopupOpen(false);
              setTrancyStyleDrawerOpen(false);
            }}
            className="relative min-h-[560px] bg-gradient-to-br from-[#101524] via-[#0B0D14] to-[#141122] flex flex-col justify-between p-5 select-none overflow-hidden"
          >
            {/* Top Status Strip inside Video Canvas */}
            <div className="flex flex-wrap items-center justify-between gap-2 z-10">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  {DEMO_VIDEO_METADATA.videoTitle}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-900/90 text-slate-300 border border-slate-700/70">
                  {formatTimestamp(activeCue.tStartMs / 1000)} / 00:52
                </span>
              </div>

              <div className="flex items-center gap-2">
                {hoverPausedAtCueEnd && (
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                    ⏸ متوقف در انتهای خط فعلی (موس را کنار ببرید تا پخش ادامه یابد)
                  </span>
                )}
                <span
                  data-testid="playbar-autohide-indicator"
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                    isYoutubePlaybarVisible
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-900/90 text-slate-400 border-slate-800'
                  }`}
                >
                  {settings.hidePlaybackBar
                    ? isYoutubePlaybarVisible
                      ? 'پلی‌بار یوتیوب: نمایان (موس پایین)'
                      : 'پلی‌بار یوتیوب: مخفی خودکار'
                    : 'پلی‌بار یوتیوب: همیشه نمایان'}
                </span>
              </div>
            </div>

            {/* Center Visual Stage / Interactive Feature Guide */}
            {!floatingPopupOpen && !trancyStyleDrawerOpen && !hoveredWordInfo && (
              <div className="my-auto flex flex-col items-center justify-center text-center py-6 pointer-events-none">
                <div className="text-xs uppercase tracking-widest text-violet-400/90 font-bold mb-1.5">
                  Cunt Academy v4.5 — Instant Multi-POS Dictionary + Lexa AI (Gemini) + Anki SM-2
                </div>
                <p className="text-xs text-slate-400 max-w-xl leading-relaxed" dir="rtl">
                  • <strong>دیکشنری چندمعنایی فوری (۰ میلی‌ثانیه تأخیر):</strong> روی هر کلمه کلیک یا هاور کنید تا معانی کامل آن در نقش‌های دستوری مختلف (Noun, Verb, Adjective, Phrasal Verb) فوراً نمایش داده شود.
                  <br />• <strong>تحلیل هوشمند بافت جمله (Lexa AI / Gemini):</strong> در پنجره دیکشنری سمت راست، دکمه{' '}
                  <span className="text-emerald-300 font-bold">✨ تحلیل معنی در این جمله با Gemini</span> را بزنید و معنی دلخواه را مستقیم به پشت فلش‌کارت Anki اضافه کنید!
                </p>
              </div>
            )}

            {/* RIGHT-SIDE SLIDE-OVER PLAYER DICTIONARY DRAWER (Multi-POS + Lexa AI Gemini + Editable Back of Card) */}
            {settings.lrEnabled && floatingPopupOpen && (
              <div
                data-testid="floating-dictionary-popup"
                onClick={(e) => e.stopPropagation()}
                className="absolute top-3 right-3 bottom-16 z-30 w-full max-w-[405px] bg-[#141722]/98 border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-left backdrop-blur-xl"
              >
                {/* Top Status Action Strip: Known (Green) | Learn (Orange) | Ignore (Purple) */}
                <div className="flex items-center gap-1.5 px-3 py-2 bg-[#0B0D14] border-b border-white/10">
                  <button
                    type="button"
                    data-testid="dict-mark-known"
                    onClick={() => handleSetWordStatus('known')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors border ${
                      savedCardForSelected?.status === 'known'
                        ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300'
                        : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    ✓ Known
                  </button>
                  <button
                    type="button"
                    data-testid="dict-mark-learning"
                    onClick={() => handleSetWordStatus('learning')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors border ${
                      savedCardForSelected?.status === 'learning'
                        ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                        : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    📖 Add to Anki
                  </button>
                  <button
                    type="button"
                    data-testid="dict-edit-back-toggle"
                    onClick={() => {
                      setDrawerCustomTranslationFa(
                        savedCardForSelected?.translationFa || currentDictEntry.translationFa
                      );
                      setDrawerCustomNotesFa(savedCardForSelected?.customNotesFa || '');
                      setDrawerEditOpen((o) => !o);
                    }}
                    className="px-2 py-1 rounded-md text-[11px] font-bold bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 text-amber-200"
                    title="ویرایش معنی پشت فلش‌کارت"
                  >
                    ✏️ ویرایش پشت کارت
                  </button>

                  <span className="ml-auto px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono text-slate-300">
                    {currentDictEntry.cefr} • {currentDictEntry.freqTag}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFloatingPopupOpen(false)}
                    className="text-slate-400 hover:text-white px-1 text-xs"
                  >
                    ✕
                  </button>
                </div>

                {/* Multi-Word Phrasal Verb Range Expander Bar */}
                {phraseRange !== null && (
                  <div className="px-3 py-1.5 bg-[#10131e] border-b border-white/10 flex items-center justify-between text-[11px]">
                    <span className="text-violet-300 font-semibold">
                      {/\s+/.test(currentDictEntry.word) ? '🔗 Phrasal Verb / Idiom' : 'انتخاب چندکلمه‌ای:'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const nextStart = Math.max(0, phraseRange.startIdx - 1);
                          applyPhraseRangeSelection(nextStart, phraseRange.endIdx, true);
                        }}
                        className="px-2 py-0.5 rounded bg-violet-500/20 hover:bg-violet-500/35 text-violet-200 font-bold"
                        title="افزودن کلمه قبلی به عبارت"
                      >
                        ◀ +Word
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextEnd = Math.min(wordOnlyList.length - 1, phraseRange.endIdx + 1);
                          applyPhraseRangeSelection(phraseRange.startIdx, nextEnd, true);
                        }}
                        className="px-2 py-0.5 rounded bg-violet-500/20 hover:bg-violet-500/35 text-violet-200 font-bold"
                        title="افزودن کلمه بعدی به عبارت"
                      >
                        +Word ▶
                      </button>
                    </div>
                  </div>
                )}

                {/* Teal Header (#0b5772) matching Language Reactor */}
                <div className="bg-[#0b5772] px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => speakWord(currentDictEntry.word)}
                      className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center text-xs"
                      title="تلفظ صوتی"
                    >
                      🔊
                    </button>
                    <div>
                      <div className="text-base font-extrabold text-white leading-tight">
                        {currentDictEntry.word}
                      </div>
                      <div className="text-[11px] font-mono text-sky-200">
                        {currentDictEntry.phonetic}
                      </div>
                    </div>
                  </div>
                  <div dir="rtl" className="text-sm font-extrabold text-amber-300 text-right">
                    {savedCardForSelected?.translationFa || currentDictEntry.translationFa}
                  </div>
                </div>

                {/* Inline Back-of-Card Editor inside Dictionary Drawer */}
                {drawerEditOpen && (
                  <div
                    dir="rtl"
                    data-testid="drawer-card-back-editor"
                    className="p-3 bg-[#0B0D14] border-b border-amber-500/40 space-y-2 text-xs"
                  >
                    <div className="text-[11px] font-extrabold text-amber-300">
                      ✏️ شخصی‌سازی معنی و یادداشت پشت کارت Anki:
                    </div>
                    <input
                      type="text"
                      value={drawerCustomTranslationFa}
                      onChange={(e) => setDrawerCustomTranslationFa(e.target.value)}
                      placeholder="معنی فارسی دلخواه برای پشت کارت..."
                      className="w-full bg-[#141722] border border-white/20 rounded-lg px-2.5 py-1.5 text-white font-bold"
                    />
                    <input
                      type="text"
                      value={drawerCustomNotesFa}
                      onChange={(e) => setDrawerCustomNotesFa(e.target.value)}
                      placeholder="یادداشت یا مثال شخصی شما..."
                      className="w-full bg-[#141722] border border-white/20 rounded-lg px-2.5 py-1.5 text-amber-200"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDrawerEditOpen(false)}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-300"
                      >
                        بستن
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (savedCardForSelected) {
                            onUpdateCardBack(savedCardForSelected.id, {
                              translationFa: drawerCustomTranslationFa,
                              customNotesFa: drawerCustomNotesFa,
                            });
                            showToast(`✓ پشت کارت «${currentDictEntry.word}» آپدیت شد`);
                          } else {
                            handleSetWordStatus(
                              'learning',
                              currentDictEntry.word,
                              drawerCustomTranslationFa,
                              drawerCustomNotesFa
                            );
                          }
                          setDrawerEditOpen(false);
                        }}
                        className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                      >
                        💾 ذخیره در پشت کارت Anki
                      </button>
                    </div>
                  </div>
                )}

                {/* Dictionary Body: Multi-POS Meanings + On-Demand Gemini Lexa AI + Examples */}
                <div className="p-3 space-y-2.5 flex-1 overflow-y-auto text-xs">
                  {/* Comprehensive Multi-POS Meanings (Noun, Verb, Adjective, Phrasal Verb) */}
                  <div className="space-y-1.5 bg-[#0B0D14]/70 p-2.5 rounded-xl border border-white/10">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-sky-300 mb-1">
                      All Meanings by Part of Speech (معانی کامل):
                    </div>
                    {currentDictEntry.posEntries.map((entry, idx) => (
                      <div key={idx} className="flex items-baseline justify-between gap-3 py-0.5">
                        <span className="text-[11px] italic text-emerald-400 font-mono shrink-0">
                          {entry.pos}
                        </span>
                        <span dir="rtl" className="text-slate-100 text-right font-medium">
                          {entry.terms.join('، ')}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* ON-DEMAND LEXA AI / GEMINI CONTEXTUAL EXPLANATION SECTION */}
                  <div
                    dir="rtl"
                    data-testid="lexa-ai-contextual-box"
                    className="p-2.5 rounded-xl bg-gradient-to-br from-violet-950/60 via-[#151828] to-emerald-950/40 border border-violet-500/40 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold text-violet-200 flex items-center gap-1">
                        <span>✨</span>
                        <span>Lexa AI (Gemini) — معنی دقیق در این جمله</span>
                      </span>
                      <button
                        type="button"
                        data-testid="ask-gemini-context-btn"
                        disabled={geminiLoading}
                        onClick={handleRequestGeminiContextualAi}
                        className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[11px] font-bold shadow"
                      >
                        {geminiLoading ? 'در حال تحلیل...' : '✨ تحلیل هوشمند در این جمله'}
                      </button>
                    </div>

                    {activeGeminiResult ? (
                      <div className="space-y-1.5 text-[11px] pt-1 border-t border-white/10">
                        <div className="text-emerald-300 font-extrabold text-xs">
                          🎯 معنی دقیق در این دیالوگ: «{activeGeminiResult.contextualMeaningFa}» ({activeGeminiResult.posInSentence})
                        </div>
                        <p className="text-slate-200 leading-relaxed">
                          {activeGeminiResult.grammarNuanceFa}
                        </p>
                        {activeGeminiResult.allMeaningsByPos &&
                          activeGeminiResult.allMeaningsByPos.length > 0 && (
                            <div className="space-y-1 pt-1">
                              {activeGeminiResult.allMeaningsByPos.map((grp, gIdx) => (
                                <div key={gIdx} className="text-slate-300">
                                  <strong className="text-sky-300 font-mono">{grp.pos}:</strong>{' '}
                                  {grp.meaningsFa.join('، ')}
                                </div>
                              ))}
                            </div>
                          )}
                        <button
                          type="button"
                          onClick={() =>
                            handleSetWordStatus(
                              'learning',
                              currentDictEntry.word,
                              activeGeminiResult.contextualMeaningFa,
                              activeGeminiResult.grammarNuanceFa
                            )
                          }
                          className="w-full mt-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px]"
                        >
                          💾 افزودن معنی هوشمند Gemini به پشت فلش‌کارت Anki
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-violet-200/90 leading-relaxed">
                        {currentDictEntry.aiExplanationFa}
                        {geminiError && (
                          <div className="mt-1.5 text-amber-300 font-semibold">
                            ⚠️ {geminiError} (کلید GEMINI_API_KEY از بخش Settings &gt; Secrets خوانده می‌شود)
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Examples: Current text */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Examples: Current text ({concordanceExamples.length})
                    </div>
                    {concordanceExamples.slice(0, 2).map((ex) => (
                      <div key={ex.id} className="py-1.5 border-b border-slate-800/70 last:border-none">
                        <div className="text-slate-200">{ex.textEn}</div>
                        <div dir="rtl" className="text-slate-400 text-[11px]">
                          {ex.textFa}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Examples: Tatoeba */}
                  {currentDictEntry.tatoebaExamples.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                        Examples: Tatoeba
                      </div>
                      {currentDictEntry.tatoebaExamples.map((tex, i) => (
                        <div key={i} className="py-1.5 border-b border-slate-800/70 last:border-none">
                          <div className="text-slate-200">🔊 {tex.en}</div>
                          <div dir="rtl" className="text-amber-300/90 text-[11px]">
                            {tex.fa}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* External Dictionary Links Strip: Re | Ca | Wr | Gl */}
                <div className="px-3 py-2 bg-[#0B0D14] border-t border-white/10 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">External Dictionaries:</span>
                  <div className="flex items-center gap-1.5">
                    {[
                      { code: 'Re', name: 'Reverso Context', url: `https://context.reverso.net/translation/english-persian/${encodeURIComponent(currentDictEntry.word)}` },
                      { code: 'Ca', name: 'Cambridge Dictionary', url: `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(currentDictEntry.word)}` },
                      { code: 'Wr', name: 'WordReference', url: `https://www.wordreference.com/enfa/${encodeURIComponent(currentDictEntry.word)}` },
                      { code: 'Gl', name: 'Glosbe Persian', url: `https://glosbe.com/en/fa/${encodeURIComponent(currentDictEntry.word)}` },
                    ].map((extLink) => (
                      <a
                        key={extLink.code}
                        href={extLink.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={extLink.name}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-violet-600 text-sky-300 hover:text-white text-[10px] font-bold transition-colors"
                      >
                        {extLink.code}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TRANCY LIVE SUBTITLE CUSTOMIZATION POPOVER (word_by_word_trancy_a0703cdc.mp4) */}
            {trancyStyleDrawerOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
                className="absolute top-3 left-3 z-30 w-full max-w-[350px] bg-[#141722]/98 border border-violet-500/40 rounded-2xl p-4 shadow-2xl space-y-3 text-xs backdrop-blur-xl"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="font-extrabold text-white text-sm">🎨 شخصی‌سازی زیرنویس (Trancy + LR)</span>
                  <button
                    type="button"
                    onClick={() => setTrancyStyleDrawerOpen(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <label className="flex items-center justify-between">
                  <span className="text-slate-200 font-semibold">برجسته‌سازی کلمه به کلمه (همگام با گوینده)</span>
                  <input
                    type="checkbox"
                    checked={settings.wordByWordHighlight}
                    onChange={(e) => onUpdateSettings({ wordByWordHighlight: e.target.checked })}
                  />
                </label>

                <label className="flex items-center justify-between">
                  <span className="text-slate-200 font-semibold">مکث خودکار در پایان خط هنگام هاور روی کلمه</span>
                  <input
                    type="checkbox"
                    checked={settings.hoverPauseAtCueEnd}
                    onChange={(e) => onUpdateSettings({ hoverPauseAtCueEnd: e.target.checked })}
                  />
                </label>

                <div className="space-y-1">
                  <div className="flex justify-between text-slate-300">
                    <span>شفافیت پس‌زمینه زیرنویس (Opacity)</span>
                    <span className="font-mono text-violet-300">{settings.subtitleBgOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.subtitleBgOpacity}
                    onChange={(e) => onUpdateSettings({ subtitleBgOpacity: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-[#0B0D14] border border-white/10">
                    <div className="text-[11px] text-slate-400 mb-1">اندازه فونت اصلی</div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({
                            subtitleFontSizePercent: Math.max(70, settings.subtitleFontSizePercent - 5),
                          })
                        }
                        className="px-2 py-0.5 rounded bg-slate-800 text-white font-bold"
                      >
                        -
                      </button>
                      <span className="font-mono text-white">{settings.subtitleFontSizePercent}%</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({
                            subtitleFontSizePercent: Math.min(160, settings.subtitleFontSizePercent + 5),
                          })
                        }
                        className="px-2 py-0.5 rounded bg-slate-800 text-white font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-[#0B0D14] border border-white/10">
                    <div className="text-[11px] text-slate-400 mb-1">اندازه فونت ترجمه</div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({
                            translationFontSizePercent: Math.max(70, settings.translationFontSizePercent - 5),
                          })
                        }
                        className="px-2 py-0.5 rounded bg-slate-800 text-white font-bold"
                      >
                        -
                      </button>
                      <span className="font-mono text-amber-300">{settings.translationFontSizePercent}%</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({
                            translationFontSizePercent: Math.min(160, settings.translationFontSizePercent + 5),
                          })
                        }
                        className="px-2 py-0.5 rounded bg-slate-800 text-white font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span>استایل متن (۵ حالت Trancy):</span>
                  <select
                    value={settings.subtitleTextStyle}
                    onChange={(e) =>
                      onUpdateSettings({
                        subtitleTextStyle: e.target.value as LanguageReactorSettings['subtitleTextStyle'],
                      })
                    }
                    className="bg-[#0B0D14] border border-white/15 rounded-lg px-2.5 py-1 text-white"
                  >
                    <option value="shadow">۱. سایه نرم (Drop Shadow)</option>
                    <option value="outline">۲. خط دور مشکی (Outline)</option>
                    <option value="raised">۳. برجسته سه‌بعدی (Raised)</option>
                    <option value="netflix">۴. سینمایی پررنگ (Cinema)</option>
                    <option value="none">۵. بدون سایه (Minimal)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span>خانواده فونت:</span>
                  <select
                    value={settings.subtitleFontFamily}
                    onChange={(e) => onUpdateSettings({ subtitleFontFamily: e.target.value })}
                    className="bg-[#0B0D14] border border-white/15 rounded-lg px-2.5 py-1 text-white"
                  >
                    {['Inter', 'Rubik', 'Roboto', 'Noto Sans', 'Vollkorn', 'Work Sans', 'Open Sans', 'Merriweather'].map(
                      (f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <label className="flex items-center justify-between">
                  <span className="text-slate-200">اولویت ترجمه (نمایش فارسی بالای انگلیسی)</span>
                  <input
                    type="checkbox"
                    checked={settings.translationPriority}
                    onChange={(e) => onUpdateSettings({ translationPriority: e.target.checked })}
                  />
                </label>
              </div>
            )}

            {/* BOTTOM-LEFT CORNER `<` / `>` SUBTITLE NAV BUTTONS (1:1 Language Reactor Video 1) */}
            {settings.lrEnabled && settings.showSubtitleControls && (
              <div className="absolute left-3 bottom-16 z-20 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCueRevealedStep(0);
                    setSpokenWordCursor(0);
                    setActiveCueIndex((prev) => Math.max(0, prev - 1));
                  }}
                  className="w-7 h-7 rounded bg-black/55 hover:bg-black/85 border border-white/15 text-slate-200 text-xs font-bold"
                  title="Previous Subtitle (A / ←)"
                >
                  &lt;
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCueRevealedStep(0);
                    setSpokenWordCursor(0);
                    setActiveCueIndex((prev) => Math.min(cues.length - 1, prev + 1));
                  }}
                  className="w-7 h-7 rounded bg-black/55 hover:bg-black/85 border border-white/15 text-slate-200 text-xs font-bold"
                  title="Next Subtitle (D / →)"
                >
                  &gt;
                </button>
              </div>
            )}

            {/* ULTRA-CLEAN FRAMELESS DUAL-SUBTITLE OVERLAY BOX (1:1 Language Reactor + Trancy Word-by-Word Karaoke) */}
            {settings.lrEnabled && (
              <div
                data-testid="draggable-subtitle-box"
                onClick={(e) => e.stopPropagation()}
                onMouseLeave={() => {
                  if (hoveredWordInfo !== null) {
                    setHoveredWordInfo(null);
                  }
                  if (hoverPausedAtCueEnd) {
                    setHoverPausedAtCueEnd(false);
                    setSpokenWordCursor(0);
                    setActiveCueIndex((prev) => (prev + 1) % cues.length);
                    setIsPlaying(true);
                    showToast('▶ ادامه خودکار پخش و رفتن به خط بعدی پس از کنار رفتن موس');
                  }
                }}
                style={{
                  position: 'absolute',
                  left: `${subPos.xPercent}%`,
                  bottom: `${subPos.bottomPx}px`,
                  transform: 'translateX(-50%)',
                  backgroundColor: `rgba(12, 14, 18, ${(settings.subtitleBgOpacity ?? 75) / 100})`,
                  backdropFilter: settings.subtitleBgBlur ? 'blur(6px)' : 'none',
                  fontFamily: `'${settings.subtitleFontFamily || 'Inter'}', 'Vazirmatn', system-ui, sans-serif`,
                }}
                className={`group z-20 w-fit max-w-[90%] rounded-xl px-4 py-2 transition-shadow ${
                  isDraggingSubBox ? 'ring-2 ring-violet-500/60 cursor-grabbing' : ''
                }`}
              >
                {/* LANGUAGE REACTOR HOVER MINI-POPUP (#1b6b85 Teal Tooltip floating cleanly above the subtitle box) */}
                {settings.showMiniDictionary && hoveredWordInfo && (
                  <div
                    data-testid="lr-hover-mini-tooltip"
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 10px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontFamily: `'Vazirmatn', 'Plus Jakarta Sans', system-ui, sans-serif`,
                    }}
                    className="z-30 w-max min-w-[205px] max-w-[320px] bg-[#1b6b85] border border-white/25 rounded-lg p-2.5 shadow-2xl text-white text-left"
                  >
                    {/* Detected 2–3 Word Collocation / Phrasal Verb Top Box (Video 1 `most people` / `going through`) */}
                    {hoveredWordInfo.collocation && (
                      <div className="bg-[#104e63] rounded-md px-2.5 py-1.5 mb-2 border border-white/15">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-extrabold text-white">
                            {hoveredWordInfo.collocation.phrase}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetWordStatus(
                                'learning',
                                hoveredWordInfo.collocation!.phrase,
                                hoveredWordInfo.collocation!.meaningFa
                              );
                            }}
                            className="px-1.5 py-0.5 rounded bg-emerald-500/30 hover:bg-emerald-500/50 border border-emerald-300/40 text-[10px] font-bold text-emerald-100"
                            title="ذخیره کل عبارت ترکیبی در فلش‌کارت‌ها"
                          >
                            + Save Phrase
                          </button>
                        </div>
                        <div dir="rtl" className="text-xs font-bold text-amber-200 mt-1">
                          {hoveredWordInfo.collocation.meaningFa}
                        </div>
                      </div>
                    )}

                    {/* Single Hovered Word + Up to 3 Concise Persian Meanings */}
                    <div className="flex items-center justify-between gap-2 px-1">
                      <span className="text-sm font-extrabold text-white">
                        {hoveredWordInfo.displayWord}
                      </span>
                      <span className="text-[10px] font-mono text-sky-200">
                        {getWordDifficultyMeta(hoveredWordInfo.cleanWord).cefr}
                      </span>
                    </div>
                    <div dir="rtl" className="px-1 mt-1 space-y-0.5 text-xs font-bold text-white/95">
                      {hoveredMiniMeanings.map((m, idx) => (
                        <div key={idx}>{m}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Subtle Hover-Only Top Drag & Quick Action Strip */}
                <div
                  data-testid="subtitle-drag-handle"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dragStartRef.current = {
                      mouseX: e.clientX,
                      mouseY: e.clientY,
                      xPercent: subPos.xPercent,
                      bottomPx: subPos.bottomPx,
                    };
                    setIsDraggingSubBox(true);
                  }}
                  style={{ fontFamily: `'Vazirmatn', system-ui, sans-serif` }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pb-1 mb-1 border-b border-white/10 cursor-grab text-[10px] text-slate-300"
                  title="این نوار را بکشید تا باکس زیرنویس جابه‌جا شود"
                >
                  <span className="font-mono text-violet-300">⋮⋮ Drag</span>
                  <button
                    type="button"
                    data-testid="reveal-blur-btn"
                    onClick={() => setCueRevealedStep((prev) => (prev >= 2 ? 0 : prev + 1))}
                    className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-violet-600/40 text-white"
                  >
                    👁 Reveal (E)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrancyStyleDrawerOpen((o) => !o)}
                    className="px-1.5 py-0.5 rounded bg-violet-500/25 text-violet-200 hover:bg-violet-500/40"
                  >
                    🎨 استایل زیرنویس
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSaveSentence({
                        sentenceEn: activeCue.textEn,
                        sentenceFa: activeCue.textFa,
                        videoId: DEMO_VIDEO_METADATA.videoId,
                        videoTitle: DEMO_VIDEO_METADATA.videoTitle,
                        timestampSec: Math.round(activeCue.tStartMs / 1000),
                      });
                      showToast('جمله در Saved Sentences ذخیره شد');
                    }}
                    className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-amber-500/30 text-amber-300"
                    title="Save Sentence (R)"
                  >
                    ☆ Save Line
                  </button>
                </div>

                {/* Subtitle Lines Container (Supports Translation Priority swap) */}
                <div className={`flex flex-col ${settings.translationPriority ? 'flex-col-reverse' : ''}`}>
                  {/* Primary English Tokenized Line with Trancy Word-by-Word Karaoke + Collocation Bracket + Multi-Word Range Selection */}
                  <div
                    style={{
                      fontSize: `${((settings.subtitleFontSizePercent || 100) / 100) * 1.32}rem`,
                      fontWeight: settings.subtitleFontBold ? 700 : 500,
                      color: settings.subtitleFontColor || '#ffffff',
                      ...textEffectStyle,
                    }}
                    className="text-center leading-snug tracking-tight mb-1"
                  >
                    {tokens.map((tok, i) => {
                      if (!tok.isWord) {
                        return <span key={i}>{tok.text}</span>;
                      }
                      const savedCard = cards.find((c) => c.word.toLowerCase() === tok.cleanWord);
                      const cat = resolveWordVisualCategory(tok.cleanWord, savedCard, settings);
                      const hex = settings.wordColors[cat] || '#ffffff';
                      const hlMode = settings.vocabularyHighlighting;

                      const isSpokenYet = !settings.wordByWordHighlight || tok.wordIndex <= spokenWordCursor;
                      const isInCollocationHover =
                        hoveredWordInfo?.collocation &&
                        tok.wordIndex >= hoveredWordInfo.collocation.startIndex &&
                        tok.wordIndex <= hoveredWordInfo.collocation.endIndex;
                      const isInSelectedPhraseRange =
                        phraseRange !== null &&
                        tok.wordIndex >= phraseRange.startIdx &&
                        tok.wordIndex <= phraseRange.endIdx;

                      const style: React.CSSProperties = {
                        opacity: isSpokenYet ? 1 : 0.45,
                        transition: 'opacity 0.14s ease, color 0.14s ease, background-color 0.14s ease',
                      };

                      if (hlMode !== 'Disabled' && cat !== 'unranked') {
                        if (hlMode === 'Background' || hlMode === 'Blur') {
                          if (cat === 'ignored' && settings.wordColorPreset === 'kevin-hunting') {
                            style.backgroundColor = hex;
                            style.color = '#52525b';
                          } else {
                            style.backgroundColor = `${hex}38`;
                            style.borderBottom = `2px solid ${hex}`;
                          }
                        } else if (hlMode === 'Text') {
                          style.color = hex;
                        } else if (hlMode === 'Underline') {
                          style.borderBottom = `2.5px solid ${hex}`;
                        }
                        if (settings.vocabOutline) {
                          style.boxShadow = `inset 0 0 0 1px ${hex}66`;
                        }
                      }

                      if (isInCollocationHover) {
                        style.backgroundColor = 'rgba(27, 107, 133, 0.55)';
                        style.borderBottom = '2px solid #38bdf8';
                      } else if (isInSelectedPhraseRange) {
                        style.backgroundColor = 'rgba(124, 92, 252, 0.45)';
                        style.borderBottom = '2px solid #a78bfa';
                      }

                      if (isSubtitleBlurred || hlMode === 'Blur') {
                        style.color = 'transparent';
                        style.textShadow = '0 0 9px rgba(255,255,255,0.92)';
                      }

                      return (
                        <button
                          key={i}
                          type="button"
                          style={style}
                          onMouseEnter={() => {
                            const colloc = detectCollocationAtWord(wordOnlyList, tok.wordIndex);
                            setHoveredWordInfo({
                              cleanWord: tok.cleanWord,
                              displayWord: tok.text,
                              wordIndex: tok.wordIndex,
                              collocation: colloc,
                            });
                            if (isDraggingWords && anchorWordIndex !== null) {
                              applyPhraseRangeSelection(anchorWordIndex, tok.wordIndex, true);
                            }
                          }}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            setAnchorWordIndex(tok.wordIndex);
                            setIsDraggingWords(true);
                          }}
                          onContextMenu={(e) => handleWordRightClick(e, tok.cleanWord)}
                          onClick={(e) => handleTokenClick(e, tok.cleanWord, tok.wordIndex)}
                          className="inline-block px-1.5 py-0.5 mx-0.5 rounded hover:bg-white/15 cursor-pointer"
                        >
                          {tok.text}
                        </button>
                      );
                    })}
                  </div>

                  {/* Secondary Persian RTL Translation */}
                  {settings.showMachineTranslation && (
                    <div
                      dir="rtl"
                      onClick={() => setCueRevealedStep(2)}
                      style={{
                        fontSize: `${((settings.translationFontSizePercent || 95) / 100) * 1.02}rem`,
                        color: settings.translationFontColor || '#fde047',
                        fontFamily: `'Vazirmatn', system-ui, sans-serif`,
                        ...textEffectStyle,
                      }}
                      className={`text-center font-medium transition-all cursor-pointer ${
                        isTranslationBlurred ? 'blur-md opacity-70 select-none' : ''
                      }`}
                    >
                      {activeCue.textFa}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* BOTTOM-RIGHT CORNER [AP] AND [⬍] POSITION NUDGE CONTROLS (Language Reactor Video 1) */}
            <div className="absolute right-3 bottom-16 z-20 flex flex-col gap-1.5">
              <button
                type="button"
                data-testid="corner-ap-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateSettings({ autoPauseAfterCue: !settings.autoPauseAfterCue });
                }}
                className={`w-9 h-7 rounded-md text-[11px] font-extrabold border transition-colors ${
                  settings.autoPauseAfterCue
                    ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg'
                    : 'bg-black/65 border-white/15 text-slate-300 hover:text-white'
                }`}
                title="Auto-Pause after every subtitle (Shortcut: Q)"
              >
                AP
              </button>
              <button
                type="button"
                data-testid="corner-position-nudge"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextBottom = subPos.bottomPx > 170 ? 48 : subPos.bottomPx + 45;
                  onUpdateSettings({
                    subtitlePosition: { custom: true, xPercent: 50, bottomPx: nextBottom },
                  });
                }}
                className="w-9 h-7 rounded-md text-xs font-bold bg-black/65 border border-white/15 text-slate-300 hover:text-white"
                title="تغییر ارتفاع یا ریست جایگاه عمودی باکس زیرنویس (⬍)"
              >
                ⬍
              </button>
            </div>

            {/* YOUTUBE BOTTOM PLAYBACK CONTROL BAR WITH NATIVE [CA ON ⚙] PILL */}
            <div
              data-testid="youtube-bottom-control-bar"
              onClick={(e) => e.stopPropagation()}
              className={`z-20 mt-auto pt-2 transition-all duration-200 ${
                isYoutubePlaybarVisible
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-20 translate-y-2 pointer-events-none'
              }`}
            >
              {/* Red YouTube Scrubber Progress Line */}
              <div className="w-full h-1 bg-slate-700/80 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-red-600 transition-all"
                  style={{ width: `${((activeCueIndex + 1) / cues.length) * 100}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#11131a]/95 border border-white/10 px-3 py-1.5 rounded-lg">
                {/* Left YouTube Controls */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setHoverPausedAtCueEnd(false);
                      setIsPlaying((p) => !p);
                    }}
                    className="px-3 py-1 rounded bg-white text-slate-950 font-bold text-xs hover:bg-slate-200"
                  >
                    {isPlaying ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSpokenWordCursor(0);
                      setActiveCueIndex((prev) => Math.max(0, prev - 1));
                    }}
                    className="px-2 py-1 rounded bg-slate-800 text-slate-200 text-xs hover:bg-slate-700"
                  >
                    ⏮ A
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSpokenWordCursor(0);
                      setActiveCueIndex((prev) => Math.min(cues.length - 1, prev + 1));
                    }}
                    className="px-2 py-1 rounded bg-slate-800 text-slate-200 text-xs hover:bg-slate-700"
                  >
                    D ⏭
                  </button>
                  <select
                    aria-label="سرعت پخش"
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200"
                  >
                    <option value={0.75}>0.75x</option>
                    <option value={1}>1.0x</option>
                    <option value={1.25}>1.25x</option>
                  </select>
                </div>

                {/* Right YouTube Controls: Cunt Academy [CA ON ⚙] Toggle Widget + Subtitle Style Button */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTrancyStyleDrawerOpen((o) => !o)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-violet-300 text-xs font-bold border border-violet-500/30"
                  >
                    🎨 استایل زیرنویس
                  </button>

                  <div
                    data-testid="ytp-lr-toggle-widget"
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#161822] border border-violet-500/50"
                  >
                    <button
                      type="button"
                      data-testid="ytp-lr-switch-btn"
                      onClick={() => onUpdateSettings({ lrEnabled: !settings.lrEnabled })}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-white cursor-pointer"
                      title="فعال یا غیرفعال کردن افزونه Cunt Academy از داخل پلی‌بار یوتیوب"
                    >
                      <span className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-600 to-emerald-500 text-[10px] font-black flex items-center justify-center text-white">
                        CA
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          settings.lrEnabled
                            ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {settings.lrEnabled ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuickSettingsOpen((o) => !o)}
                      className="text-slate-300 hover:text-white text-xs px-1"
                      title="تنظیمات سریع Cunt Academy"
                    >
                      ⚙
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenPhrasePump}
                    className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold"
                  >
                    ⚡ Practice Hub ({toPersianDigits(cards.length)})
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Bar below the player: Word-by-Word Karaoke Toggle + Word Color Highlighting Mode + Listening Mode */}
          <div className="px-4 py-2.5 bg-[#121521] border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="toggle-karaoke-btn"
                onClick={() => onUpdateSettings({ wordByWordHighlight: !settings.wordByWordHighlight })}
                className={`px-2.5 py-1 rounded-md font-bold border transition-colors ${
                  settings.wordByWordHighlight
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                ✨ روشن شدن کلمه به کلمه (Trancy): {settings.wordByWordHighlight ? 'فعال' : 'غیرفعال'}
              </button>

              <button
                type="button"
                data-testid="preset-default-lr"
                onClick={() =>
                  onUpdateSettings({
                    vocabularyHighlighting:
                      settings.vocabularyHighlighting === 'Disabled' ? 'Background' : 'Disabled',
                    wordColorPreset: 'default-lr',
                    wordColors: { ...WORD_COLOR_PRESETS['default-lr'].colors },
                  })
                }
                className={`px-2.5 py-1 rounded-md font-semibold border transition-colors ${
                  settings.vocabularyHighlighting !== 'Disabled' && settings.wordColorPreset === 'default-lr'
                    ? 'bg-violet-600/25 border-violet-400 text-violet-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                هایلایت سطح دشواری واژگان (سبز / نارنجی)
              </button>

              <button
                type="button"
                data-testid="preset-kevin-hunting"
                onClick={() =>
                  onUpdateSettings({
                    vocabularyHighlighting: 'Background',
                    wordColorPreset: 'kevin-hunting',
                    wordColors: { ...WORD_COLOR_PRESETS['kevin-hunting'].colors },
                  })
                }
                className={`px-2.5 py-1 rounded-md font-semibold border transition-colors ${
                  settings.vocabularyHighlighting !== 'Disabled' && settings.wordColorPreset === 'kevin-hunting'
                    ? 'bg-red-600/25 border-red-400 text-red-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Kevin&apos;s Hunting
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-slate-300">
                <span>حالت شنیداری:</span>
                <select
                  aria-label="حالت مخفی‌سازی زیرنویس"
                  value={settings.hideSubtitles}
                  onChange={(e) => {
                    setCueRevealedStep(0);
                    onUpdateSettings({
                      hideSubtitles: e.target.value as LanguageReactorSettings['hideSubtitles'],
                    });
                  }}
                  className="bg-[#0B0D14] border border-white/15 rounded px-2 py-1 text-xs text-slate-200"
                >
                  <option value="disabled">Show both (نمایش کامل)</option>
                  <option value="blur_translation">Hide translations (تار کردن ترجمه)</option>
                  <option value="subtitle_then_translation">
                    Subtitle then translation (کلید E)
                  </option>
                  <option value="hide_both">Hide both (مخفی کامل)</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (4 Cols): 3-Tab Cunt Academy Dock (Subtitles | Words | Saved) */}
        <div className="lg:col-span-4 bg-[#121521] border border-white/10 rounded-2xl overflow-hidden shadow-xl flex flex-col h-[605px]">
          <div className="px-3 py-2.5 bg-[#161A29] border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRightTab('subtitles')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  rightTab === 'subtitles'
                    ? 'bg-violet-600/25 text-violet-300 border border-violet-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Subtitles
              </button>
              <button
                type="button"
                onClick={() => setRightTab('words')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  rightTab === 'words'
                    ? 'bg-violet-600/25 text-violet-300 border border-violet-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Words ({allVideoWords.length})
              </button>
              <button
                type="button"
                onClick={() => setRightTab('saved')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  rightTab === 'saved'
                    ? 'bg-violet-600/25 text-violet-300 border border-violet-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Saved ({cards.length})
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="open-export-modal-btn"
                onClick={() => setExportModalOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                title="Export Subtitles (Print HTML / Excel CSV)"
              >
                📤 Export
              </button>
              <button
                type="button"
                onClick={onOpenSettingsPage}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                title="تنظیمات کامل Cunt Academy"
              >
                ⚙
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {rightTab === 'subtitles' &&
              cues.map((cue, idx) => {
                const isActive = idx === activeCueIndex;
                return (
                  <div
                    key={cue.id}
                    onClick={() => {
                      setActiveCueIndex(idx);
                      setSpokenWordCursor(0);
                      setCueRevealedStep(0);
                    }}
                    className={`p-3 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-violet-950/35 border-l-4 border-l-violet-500'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span className="font-mono text-violet-300">
                        ▶ {formatTimestamp(cue.tStartMs / 1000)}
                      </span>
                      <span>Cue #{idx + 1}</span>
                    </div>
                    <div className="text-xs font-medium text-slate-100 leading-relaxed">
                      {cue.textEn}
                    </div>
                    {settings.showMachineTranslation && (
                      <div dir="rtl" className="text-xs text-amber-300/90 mt-1 leading-relaxed">
                        {cue.textFa}
                      </div>
                    )}
                  </div>
                );
              })}

            {rightTab === 'words' && (
              <div>
                <div className="p-2.5 bg-[#0B0D14] flex flex-wrap gap-1.5 border-b border-white/10">
                  {(['all', 'suggested', 'learning', 'known'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setWordFilterCat(cat)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize ${
                        wordFilterCat === cat
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="divide-y divide-white/5">
                  {allVideoWords
                    .filter((w) => (wordFilterCat === 'all' ? true : w.category === wordFilterCat))
                    .map((item) => (
                      <div
                        key={item.word}
                        onClick={() => {
                          setActiveCueIndex(item.cueIndex);
                          setSelectedPhrase(item.word);
                          setFloatingPopupOpen(true);
                        }}
                        className="px-3.5 py-2.5 flex items-center justify-between hover:bg-white/5 cursor-pointer text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block"
                            style={{
                              backgroundColor: settings.wordColors[item.category] || '#71717a',
                            }}
                          />
                          <span className="font-bold text-slate-100">{item.word}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                          <span>
                            {item.cefr} • {item.freqTag}
                          </span>
                          <span>×{item.count}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {rightTab === 'saved' && (
              <div>
                <div className="p-3 bg-[#0B0D14] flex items-center justify-between border-b border-white/10 text-xs">
                  <span className="text-slate-300">
                    {cards.length} واژه و عبارت • {savedSentences.length} جمله
                  </span>
                  <button
                    type="button"
                    onClick={onOpenPhrasePump}
                    className="px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white font-bold text-[11px]"
                  >
                    ⚡ تمرین فلش‌کارت و PhrasePump
                  </button>
                </div>
                <div className="divide-y divide-white/5">
                  {cards.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedPhrase(c.word);
                        setFloatingPopupOpen(true);
                      }}
                      className="px-3.5 py-2.5 flex items-center justify-between hover:bg-white/5 cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              c.status === 'known'
                                ? settings.wordColors.known
                                : c.status === 'ignored'
                                  ? settings.wordColors.ignored
                                  : settings.wordColors.learning,
                          }}
                        />
                        <strong className="text-slate-100">{c.word}</strong>
                        {c.isPhrase && (
                          <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[9px] font-bold">
                            PHRASE
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-slate-400">Box {c.box}</span>
                      </div>
                      <span dir="rtl" className="text-amber-300 font-medium">
                        {c.translationFa}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* EXPORT SUBTITLES MODAL */}
      {exportModalOpen && (
        <div
          data-testid="export-subtitles-modal"
          onClick={() => setExportModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#161929] border border-white/15 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white">📤 Export Subtitles (Cunt Academy)</h3>
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="flex items-start gap-3 p-3 rounded-xl bg-[#0B0D14] border border-white/10 cursor-pointer">
                <input
                  type="radio"
                  name="export_fmt"
                  checked={exportFormat === 'html'}
                  onChange={() => setExportFormat('html')}
                  className="mt-1"
                />
                <div>
                  <div className="font-bold text-white text-sm">Print (HTML) — Two-Column Study Sheet</div>
                  <p className="text-slate-400 mt-0.5" dir="rtl">
                    خروجی دو ستونی قابل چاپ (متن انگلیسی + ترجمه فارسی + تایم‌استمپ).
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-xl bg-[#0B0D14] border border-white/10 cursor-pointer">
                <input
                  type="radio"
                  name="export_fmt"
                  checked={exportFormat === 'csv'}
                  onChange={() => setExportFormat('csv')}
                  className="mt-1"
                />
                <div>
                  <div className="font-bold text-white text-sm">Excel (CSV) / Anki Deck</div>
                  <p className="text-slate-400 mt-0.5" dir="rtl">
                    خروجی جدول استاندارد UTF-8 CSV برای اکسل یا Anki.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-export-btn"
                onClick={handleExecuteExport}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold"
              >
                Export Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK SETTINGS POPOVER MODAL */}
      {quickSettingsOpen && (
        <div
          onClick={() => setQuickSettingsOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#161929] border border-white/15 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white">⚙ تنظیمات سریع Cunt Academy</h3>
              <button
                type="button"
                onClick={() => setQuickSettingsOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3" dir="rtl">
              <label className="flex items-center justify-between">
                <span>روشن شدن کلمه به کلمه همگام با گوینده (Trancy Karaoke)</span>
                <input
                  type="checkbox"
                  checked={settings.wordByWordHighlight}
                  onChange={(e) => onUpdateSettings({ wordByWordHighlight: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between">
                <span>مکث خودکار در انتهای خط هنگام نگه داشتن موس روی کلمه</span>
                <input
                  type="checkbox"
                  checked={settings.hoverPauseAtCueEnd}
                  onChange={(e) => onUpdateSettings({ hoverPauseAtCueEnd: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between">
                <span>مخفی‌سازی هوشمند پلی‌بار یوتیوب (فقط با رفتن موس به پایین نمایان شود)</span>
                <input
                  type="checkbox"
                  checked={settings.hidePlaybackBar}
                  onChange={(e) => onUpdateSettings({ hidePlaybackBar: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between">
                <span>نمایش مینی‌پاپ‌آپ ترجمه و ترکیبات هنگام هاور</span>
                <input
                  type="checkbox"
                  checked={settings.showMiniDictionary}
                  onChange={(e) => onUpdateSettings({ showMiniDictionary: e.target.checked })}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setQuickSettingsOpen(false);
                  onOpenSettingsPage();
                }}
                className="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-bold"
              >
                باز کردن صفحه کامل تنظیمات (Settings)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
