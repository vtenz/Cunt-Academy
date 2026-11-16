import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LeitnerCard,
  SavedSentence,
  SubtitleCue,
  LanguageReactorSettings,
  WORD_COLOR_PRESETS,
  DEMO_DUAL_SUBTITLES,
  DEMO_VIDEO_METADATA,
  CURATED_YOUTUBE_STUDIO_VIDEOS,
  StudioVideoPreset,
  extractYouTubeVideoId,
  parseCustomSubtitlesOrTranscript,
  generateTopicContextualSubtitles,
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
  isValidPersianMeaning,
} from '../utils/linguatubeLogic';
import {
  requestOnDemandGeminiContextualAnalysis,
  askGeminiWordQuestion,
  GeminiContextualAnalysis,
  WordQaTurn,
  getStoredUserGeminiApiKey,
} from '../services/geminiService';

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
  selectedStudioVideo?: {
    videoId: string;
    videoTitle?: string;
    timestampSec?: number;
  } | null;
  onOpenVideoVocabulary?: (videoId: string) => void;
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

type GeminiContextualResult = GeminiContextualAnalysis;

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
  selectedStudioVideo,
  onOpenVideoVocabulary,
}) => {
  const [currentVideo, setCurrentVideo] = useState<StudioVideoPreset>(
    () => CURATED_YOUTUBE_STUDIO_VIDEOS[0]
  );
  const [cues, setCues] = useState<SubtitleCue[]>(() => DEMO_DUAL_SUBTITLES);
  const [youtubeUrlInput, setYoutubeUrlInput] = useState<string>('');
  const [isLoadingYoutubeVideo, setIsLoadingYoutubeVideo] = useState<boolean>(false);
  const [showRealYouTubeEmbed, setShowRealYouTubeEmbed] = useState<boolean>(false);
  const [loopCurrentCue, setLoopCurrentCue] = useState<boolean>(false);
  const [customTranscriptModalOpen, setCustomTranscriptModalOpen] = useState<boolean>(false);
  const [customTranscriptInput, setCustomTranscriptInput] = useState<string>('');
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

  // Gemini Contextual AI (Lexa AI) On-Demand State + Interactive Word Q&A State
  const [geminiLoading, setGeminiLoading] = useState<boolean>(false);
  const [geminiResultMap, setGeminiResultMap] = useState<Record<string, GeminiContextualResult>>({});
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [wordQaMap, setWordQaMap] = useState<Record<string, WordQaTurn[]>>({});
  const [wordQaInput, setWordQaInput] = useState<string>('');
  const [wordQaLoading, setWordQaLoading] = useState<boolean>(false);

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

  const currentVideoSavedCardsCount = useMemo(
    () => cards.filter((c) => (c.videoId || DEMO_VIDEO_METADATA.videoId) === currentVideo.videoId).length,
    [cards, currentVideo.videoId]
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
        // 2.5 Check A-B Single Cue Loop
        if (loopCurrentCue) {
          setSpokenWordCursor(0);
          return 0;
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
    loopCurrentCue,
  ]);

  // Load or switch studio video when selectedStudioVideo prop changes (e.g., from VideoVocabularyView)
  useEffect(() => {
    if (!selectedStudioVideo?.videoId) return;
    const matchCurated = CURATED_YOUTUBE_STUDIO_VIDEOS.find(
      (v) =>
        v.videoId === selectedStudioVideo.videoId ||
        v.youtubeId === selectedStudioVideo.videoId
    );
    if (matchCurated) {
      setCurrentVideo(matchCurated);
      setCues(matchCurated.cues);
      if (typeof selectedStudioVideo.timestampSec === 'number') {
        const targetMs = selectedStudioVideo.timestampSec * 1000;
        const cueIdx = matchCurated.cues.findIndex(
          (c) => Math.abs(c.tStartMs - targetMs) <= 4500
        );
        setActiveCueIndex(cueIdx >= 0 ? cueIdx : 0);
      } else {
        setActiveCueIndex(0);
      }
      setSpokenWordCursor(0);
      return;
    }

    // Dynamic YouTube video ID passed from VideoVocabularyView
    const customTitle =
      selectedStudioVideo.videoTitle || `YouTube Video (${selectedStudioVideo.videoId})`;
    const generatedCues = generateTopicContextualSubtitles(customTitle);
    setCurrentVideo({
      videoId: selectedStudioVideo.videoId,
      youtubeId: selectedStudioVideo.videoId,
      videoTitle: customTitle,
      channelName: 'YouTube Learning Studio',
      durationSec: 60,
      categoryFa: '🎬 ویدیوی اختصاصی شما',
      cues: generatedCues,
    });
    setCues(generatedCues);
    setActiveCueIndex(0);
    setSpokenWordCursor(0);
  }, [selectedStudioVideo]);

  const handleSelectCuratedVideo = (vid: StudioVideoPreset) => {
    setCurrentVideo(vid);
    setCues(vid.cues);
    setActiveCueIndex(0);
    setSpokenWordCursor(0);
    setPhraseRange(null);
    setFloatingPopupOpen(false);
    showToast(`🎬 ویدیوی «${vid.videoTitle}» در استودیو بارگذاری شد`);
  };

  const handleLoadYoutubeUrlInStudio = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const extractedId = extractYouTubeVideoId(youtubeUrlInput);
    if (!extractedId) {
      showToast('⚠️ لطفاً یک لینک معتبر یوتیوب (مثلاً https://youtu.be/... یا youtube.com/watch?v=...) وارد کنید.');
      return;
    }

    // Check if it matches one of our curated videos first
    const matchedCurated = CURATED_YOUTUBE_STUDIO_VIDEOS.find(
      (v) => v.youtubeId === extractedId || v.videoId === extractedId
    );
    if (matchedCurated) {
      handleSelectCuratedVideo(matchedCurated);
      setShowRealYouTubeEmbed(true);
      return;
    }

    setIsLoadingYoutubeVideo(true);
    try {
      let loadedTitle = `YouTube Study Video (${extractedId})`;
      let loadedChannel = 'YouTube Channel';
      let loadedCues: SubtitleCue[] | null = null;

      try {
        const apiRes = await fetch('/api/youtube/load', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getStoredUserGeminiApiKey()
              ? { 'x-user-gemini-key': getStoredUserGeminiApiKey() }
              : {}),
          },
          body: JSON.stringify({ urlOrId: extractedId }),
        });
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (data.videoTitle) loadedTitle = data.videoTitle;
          if (data.channelName) loadedChannel = data.channelName;
          if (Array.isArray(data.cues) && data.cues.length > 0) {
            loadedCues = data.cues;
          }
        }
      } catch {
        // Fallback for static Netlify hosting: fetch title from public noembed oEmbed CORS endpoint
      }

      if (!loadedCues) {
        try {
          const oembedRes = await fetch(
            `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${encodeURIComponent(extractedId)}`
          );
          if (oembedRes.ok) {
            const oembedJson = await oembedRes.json();
            if (oembedJson?.title) loadedTitle = String(oembedJson.title);
            if (oembedJson?.author_name) loadedChannel = String(oembedJson.author_name);
          }
        } catch {
          // ignore
        }
        loadedCues = generateTopicContextualSubtitles(loadedTitle);
      }

      const newStudioVideo: StudioVideoPreset = {
        videoId: extractedId,
        youtubeId: extractedId,
        videoTitle: loadedTitle,
        channelName: loadedChannel,
        durationSec: Math.round(
          ((loadedCues[loadedCues.length - 1]?.tStartMs || 45000) + 5000) / 1000
        ),
        categoryFa: '🔗 لود شده از لینک یوتیوب',
        cues: loadedCues,
      };

      setCurrentVideo(newStudioVideo);
      setCues(loadedCues);
      setActiveCueIndex(0);
      setSpokenWordCursor(0);
      setPhraseRange(null);
      setShowRealYouTubeEmbed(true);
      showToast(`✅ ویدیوی «${loadedTitle}» با موفقیت در استودیو بارگذاری شد!`);
    } finally {
      setIsLoadingYoutubeVideo(false);
    }
  };

  const handleImportCustomSubtitles = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseCustomSubtitlesOrTranscript(customTranscriptInput);
    if (parsed.length === 0) {
      showToast('⚠️ متن یا فایل زیرنویس واردشده معتبر نیست.');
      return;
    }
    setCues(parsed);
    setActiveCueIndex(0);
    setSpokenWordCursor(0);
    setCustomTranscriptModalOpen(false);
    setCustomTranscriptInput('');
    showToast(`✅ ${toPersianDigits(parsed.length)} خط زیرنویس دلخواه با موفقیت روی این ویدیو اعمال شد!`);
  };

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
          videoId: currentVideo.videoId,
          videoTitle: currentVideo.videoTitle,
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
  }, [
    activeCue,
    cues.length,
    currentVideo.videoId,
    currentVideo.videoTitle,
    onSaveSentence,
    onUpdateSettings,
    settings.autoPauseAfterCue,
    settings.useArrowKeys,
  ]);

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

      const localFallback = lookupComprehensiveLocalDictionary(key);
      try {
        const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&dt=bd&dj=1&q=${encodeURIComponent(key)}`;
        const gtxRes = await fetch(gtxUrl);
        if (gtxRes.ok) {
          const data = await gtxRes.json();
          if (Array.isArray(data.sentences)) {
            const rawTrans = data.sentences.map((s: { trans?: string }) => s.trans || '').join('').trim();
            if (isValidPersianMeaning(rawTrans, key)) {
              translationFa = rawTrans;
            }
          }
          if (Array.isArray(data.dict)) {
            posEntries = data.dict
              .map((d: { pos?: string; terms?: string[] }) => ({
                pos: d.pos || 'word',
                terms: Array.isArray(d.terms)
                  ? d.terms.filter((t) => isValidPersianMeaning(t, key)).slice(0, 6)
                  : [],
              }))
              .filter((d: { terms: string[] }) => d.terms.length > 0);
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
                  fa: localFallback.tatoebaExamples[0]?.fa || activeCue.textFa,
                  source: 'Tatoeba',
                });
              }
            }
          }
        } catch {
          // ignore
        }
      }

      if (posEntries.length === 0) {
        posEntries = localFallback.posEntries;
      }
      const miniMeaningsFa = posEntries.flatMap((p) => p.terms).slice(0, 4);
      if (!translationFa) {
        translationFa = miniMeaningsFa[0] || localFallback.translationFa;
      }
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
            translationFa: translationFa || localFallback.translationFa,
            miniMeaningsFa: miniMeaningsFa.length > 0 ? miniMeaningsFa : localFallback.miniMeaningsFa,
            aiExplanationFa,
            posEntries,
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

  const handleRequestGeminiContextualAi = async () => {
    const key = `${currentDictEntry.word}::${activeCue.id}`;
    setGeminiLoading(true);
    setGeminiError(null);
    try {
      const analysis = await requestOnDemandGeminiContextualAnalysis({
        wordOrPhrase: currentDictEntry.word,
        sentenceEn: activeCue.textEn,
        sentenceFa: activeCue.textFa,
      });
      setGeminiResultMap((prev) => ({
        ...prev,
        [key]: analysis,
      }));
    } catch (err) {
      setGeminiError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeminiLoading(false);
    }
  };

  const activeGeminiResult = geminiResultMap[`${currentDictEntry.word}::${activeCue.id}`] || null;
  const activeWordQaKey = `${currentDictEntry.word}::${activeCue.id}`;
  const activeWordQaHistory = wordQaMap[activeWordQaKey] || [];

  const handleAskWordQuestion = async (rawQuestion?: string) => {
    const qText = String(rawQuestion ?? wordQaInput).trim();
    if (!qText || wordQaLoading) return;
    setWordQaInput('');
    setWordQaLoading(true);
    const nextHistory: WordQaTurn[] = [...activeWordQaHistory, { role: 'user', text: qText }];
    setWordQaMap((prev) => ({
      ...prev,
      [activeWordQaKey]: nextHistory,
    }));
    try {
      const res = await askGeminiWordQuestion({
        wordOrPhrase: currentDictEntry.word,
        sentenceEn: activeCue.textEn,
        sentenceFa: activeCue.textFa,
        question: qText,
        history: nextHistory,
      });
      setWordQaMap((prev) => ({
        ...prev,
        [activeWordQaKey]: [...nextHistory, { role: 'ai', text: res.answerFa }],
      }));
    } catch (err) {
      setWordQaMap((prev) => ({
        ...prev,
        [activeWordQaKey]: [
          ...nextHistory,
          { role: 'ai', text: err instanceof Error ? err.message : String(err) },
        ],
      }));
    } finally {
      setWordQaLoading(false);
    }
  };

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
      videoId: currentVideo.videoId,
      videoTitle: currentVideo.videoTitle,
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
      videoId: currentVideo.videoId,
      videoTitle: currentVideo.videoTitle,
      videoTimestampSec: Number((activeCue.tStartMs / 1000).toFixed(1)),
      box,
    });
    const label =
      status === 'known'
        ? 'Known (سبز)'
        : status === 'ignored'
          ? "Don't learn (نادیده)"
          : 'افزوده به فلش‌کارت‌های AnkiDroid';
    showToast(`«${targetWord}» در دسته ویدیوی «${currentVideo.videoTitle}» ذخیره شد`);
  };

  const handleExecuteExport = () => {
    if (exportFormat === 'html') {
      const html = generatePrintableTranscriptHtml(currentVideo.videoTitle, cues);
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
          className="fixed bottom-5 left-5 z-50 duo-card px-4 py-3 text-xs font-black duo-text-main"
        >
          {toastMessage}
        </div>
      )}

      {/* PRO YOUTUBE URL STUDIO LOADER & MULTI-VIDEO WORKBENCH BAR */}
      <div
        data-testid="youtube-studio-loader-bar"
        dir="rtl"
        className="duo-card p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-2xl bg-[#FF4B4B] border-b-4 border-[#EA2B2B] text-white flex items-center justify-center text-base font-black">
              ▶
            </span>
            <div>
              <h2 className="text-sm font-black duo-text-main">
                استودیوی حرفه‌ای یوتیوب در سایت (YouTube Pro Learning Studio)
              </h2>
              <p className="text-[11px] font-bold duo-text-muted">
                لینک هر ویدیوی یوتیوب را وارد کنید تا داخل سایت با دیکشنری چندمعنایی، هوش مصنوعی Gemini و تفکیک خودکار لغات آن ویدیو باز شود.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenVideoVocabulary && (
              <button
                type="button"
                data-testid="open-current-video-vocab-btn"
                onClick={() => onOpenVideoVocabulary(currentVideo.videoId)}
                className="duo-btn duo-btn-purple px-3.5 py-2 text-xs"
              >
                📂 لغات ذخیره‌شده این ویدیو ({toPersianDigits(currentVideoSavedCardsCount)})
              </button>
            )}
            <button
              type="button"
              data-testid="open-custom-subtitles-modal-btn"
              onClick={() => setCustomTranscriptModalOpen(true)}
              className="duo-btn duo-btn-neutral px-3 py-2 text-xs"
            >
              📝 الصاق زیرنویس دلخواه (.SRT / متن)
            </button>
            <button
              type="button"
              data-testid="toggle-real-youtube-embed-btn"
              onClick={() => setShowRealYouTubeEmbed((prev) => !prev)}
              className={`duo-btn px-3 py-2 text-xs ${
                showRealYouTubeEmbed ? 'duo-btn-green' : 'duo-btn-blue'
              }`}
            >
              {showRealYouTubeEmbed
                ? '🎬 پلیر واقعی یوتیوب: فعال'
                : '🎬 نمایش پلیر واقعی یوتیوب'}
            </button>
          </div>
        </div>

        {/* YouTube Link Input Form */}
        <form
          onSubmit={handleLoadYoutubeUrlInStudio}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
        >
          <div className="relative flex-1" dir="ltr">
            <input
              type="text"
              data-testid="youtube-url-studio-input"
              value={youtubeUrlInput}
              onChange={(e) => setYoutubeUrlInput(e.target.value)}
              placeholder="Paste YouTube URL or Video ID (e.g. https://www.youtube.com/watch?v=M7lc1UVf-VE or https://youtu.be/dQw4w9WgXcQ)"
              className="w-full duo-surface-secondary border-2 duo-border-color rounded-2xl px-4 py-2.5 text-xs font-mono font-bold duo-text-main focus:outline-none focus:border-[#1CB0F6]"
            />
          </div>
          <button
            type="submit"
            disabled={isLoadingYoutubeVideo}
            data-testid="youtube-url-studio-load-btn"
            className="duo-btn duo-btn-green px-5 py-2.5 text-xs shrink-0"
          >
            {isLoadingYoutubeVideo ? '⏳ در حال استخراج زیرنویس...' : '🚀 لود ویدیو در استودیو'}
          </button>
        </form>

        {/* Quick Curated Multi-Video Switcher Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] font-black duo-text-muted">ویدیوهای آماده تمرین:</span>
          {CURATED_YOUTUBE_STUDIO_VIDEOS.map((vid) => {
            const isSelected = currentVideo.videoId === vid.videoId;
            const savedCount = cards.filter(
              (c) => (c.videoId || DEMO_VIDEO_METADATA.videoId) === vid.videoId
            ).length;
            return (
              <button
                key={vid.videoId}
                type="button"
                data-testid={`studio-preset-video-${vid.videoId}`}
                onClick={() => handleSelectCuratedVideo(vid)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black border-2 transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-[#1CB0F6] border-[#1899D6] text-white'
                    : 'duo-surface-secondary duo-border-color duo-text-main hover:border-[#1CB0F6]'
                }`}
              >
                <span>{vid.categoryFa}</span>
                <span dir="ltr" className="truncate max-w-[200px]">
                  {vid.videoTitle}
                </span>
                <span className="px-1.5 py-0.5 rounded-lg bg-black/20 text-[10px] font-mono">
                  {toPersianDigits(savedCount)} لغت
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split Workspace: Left YouTube Player Stage + Right 3-Tab Cunt Academy Dock */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (8 Cols): Interactive YouTube Player Stage */}
        <div className="lg:col-span-8 duo-card overflow-hidden flex flex-col">
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
            {/* Optional Real Embedded YouTube Iframe Layer */}
            {showRealYouTubeEmbed && (
              <div className="absolute inset-0 z-0 pointer-events-auto">
                <iframe
                  title={currentVideo.videoTitle}
                  src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(
                    currentVideo.youtubeId || 'M7lc1UVf-VE'
                  )}?rel=0&modestbranding=1&start=${Math.floor(activeCue.tStartMs / 1000)}`}
                  className="w-full h-full border-0 opacity-75"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D14] via-transparent to-[#0B0D14]/70 pointer-events-none" />
              </div>
            )}

            {/* Top Status Strip inside Video Canvas */}
            <div className="flex flex-wrap items-center justify-between gap-2 z-10">
              <div className="flex items-center gap-2">
                <span
                  data-testid="active-studio-video-title"
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30"
                >
                  🎬 {currentVideo.videoTitle}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-900/90 text-slate-300 border border-slate-700/70">
                  {formatTimestamp(activeCue.tStartMs / 1000)} / {formatTimestamp(currentVideo.durationSec)}
                </span>
                {loopCurrentCue && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/25 text-emerald-300 border border-emerald-500/40">
                    🔁 A-B Loop فعال
                  </span>
                )}
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
            {!floatingPopupOpen && !trancyStyleDrawerOpen && !hoveredWordInfo && !showRealYouTubeEmbed && (
              <div className="my-auto flex flex-col items-center justify-center text-center py-6 pointer-events-none z-10">
                <div className="text-xs uppercase tracking-widest text-violet-400/90 font-bold mb-1.5">
                  Cunt Academy Studio — {currentVideo.channelName} • ID: {currentVideo.videoId}
                </div>
                <p className="text-xs text-slate-400 max-w-xl leading-relaxed" dir="rtl">
                  • <strong>ذخیره خودکار به تفکیک ویدیو:</strong> هر کلمه‌ای که از این ویدیو ذخیره کنید، مستقیماً در پوشه{' '}
                  <span className="text-sky-300 font-bold">«{currentVideo.videoTitle}»</span> قرار می‌گیرد.
                  <br />• <strong>ابزارهای استودیویی:</strong> از نوار بالا می‌توانید هر لینک یوتیوبی را لود کنید، پلیر واقعی یوتیوب را روشن کنید یا فایل زیرنویس دلخواه خود را وارد نمایید.
                </p>
              </div>
            )}

            {/* RIGHT-SIDE SLIDE-OVER PLAYER DICTIONARY DRAWER (Multi-POS + Lexa AI Gemini + Interactive Word Q&A + Editable Back of Card) */}
            {settings.lrEnabled && floatingPopupOpen && (
              <div
                data-testid="floating-dictionary-popup"
                onClick={(e) => e.stopPropagation()}
                className="absolute top-3 right-3 bottom-16 z-30 w-full max-w-[415px] bg-[#131F24] border-2 border-b-4 border-[#37464F] rounded-3xl flex flex-col overflow-hidden text-left"
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

                {/* Dictionary Body: Multi-POS Meanings + On-Demand Gemini Lexa AI + Interactive Word Q&A + Examples */}
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

                  {/* GEMINI AI CONTEXTUAL EXPLANATION + INTERACTIVE WORD Q&A CHAT */}
                  <div
                    dir="rtl"
                    data-testid="lexa-ai-contextual-box"
                    className="p-3 rounded-xl bg-gradient-to-br from-violet-950/60 via-[#151828] to-emerald-950/40 border border-violet-500/40 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold text-violet-200 flex items-center gap-1">
                        <span>✨</span>
                        <span>هوش مصنوعی Google Gemini — تحلیل و پرسش درباره واژه</span>
                      </span>
                      <button
                        type="button"
                        data-testid="ask-gemini-context-btn"
                        disabled={geminiLoading}
                        onClick={handleRequestGeminiContextualAi}
                        className="px-3 py-1.5 rounded-lg bg-[#CE82FF] hover:bg-[#b968f0] disabled:opacity-50 text-white text-[11px] font-black shadow cursor-pointer"
                      >
                        {geminiLoading
                          ? 'در حال دریافت پاسخ از Gemini...'
                          : '✨ تحلیل هوشمند در این جمله'}
                      </button>
                    </div>

                    {activeGeminiResult ? (
                      <div
                        data-testid="gemini-context-result-panel"
                        className="space-y-2 text-[11px] pt-1.5 border-t border-white/10"
                      >
                        <div className="text-emerald-300 font-extrabold text-xs">
                          🎯 معنی دقیق در این دیالوگ: «{activeGeminiResult.contextualMeaningFa}» ({activeGeminiResult.posInSentence})
                        </div>
                        {activeGeminiResult.sentenceTranslationFa && (
                          <div className="text-amber-200 font-bold">
                            📝 ترجمه روان دیالوگ: «{activeGeminiResult.sentenceTranslationFa}»
                          </div>
                        )}
                        <p className="text-slate-100 leading-relaxed font-medium">
                          {activeGeminiResult.grammarNuanceFa}
                        </p>
                        {activeGeminiResult.mnemonicFa && (
                          <div className="p-2 rounded-lg bg-violet-500/15 border border-violet-400/30 text-violet-200 font-bold leading-relaxed">
                            {activeGeminiResult.mnemonicFa}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            handleSetWordStatus(
                              'learning',
                              currentDictEntry.word,
                              activeGeminiResult.contextualMeaningFa,
                              `${activeGeminiResult.grammarNuanceFa} ${activeGeminiResult.mnemonicFa || ''}`.trim()
                            )
                          }
                          className="w-full mt-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px]"
                        >
                          💾 افزودن تحلیل هوشمند Gemini به پشت فلش‌کارت Anki
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-300 leading-relaxed">
                        {geminiError ? (
                          <div className="text-rose-300 font-bold">⚠️ {geminiError}</div>
                        ) : (
                          <span>
                            برای دریافت معنی دقیق «{currentDictEntry.word}» در این دیالوگ، روی{' '}
                            <strong className="text-violet-300">«✨ تحلیل هوشمند در این جمله»</strong> کلیک کنید یا سوال خود را در کادر زیر بپرسید:
                          </span>
                        )}
                      </div>
                    )}

                    {/* Interactive "Ask AI About This Word" Q&A Chat inside Dictionary Drawer */}
                    <div className="pt-2 border-t border-white/15 space-y-2">
                      <div className="text-[10.5px] font-extrabold text-violet-200">
                        💬 هر سوالی درباره «{currentDictEntry.word}» در این زیرنویس دارید از Gemini بپرسید:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {[
                          'تفاوت معنایی و مترادف‌ها؟',
                          'چرا در این جمله این معنی را می‌دهد؟',
                          '۲ مثال کاربردی دیگر بده',
                          'رسمی است یا عامیانه؟',
                        ].map((chipText) => (
                          <button
                            key={chipText}
                            type="button"
                            onClick={() => handleAskWordQuestion(chipText)}
                            className="px-2 py-0.5 rounded-full bg-violet-500/20 hover:bg-violet-500/35 border border-violet-400/35 text-violet-100 text-[10px] font-bold transition-colors"
                          >
                            {chipText}
                          </button>
                        ))}
                      </div>

                      {activeWordQaHistory.length > 0 && (
                        <div
                          data-testid="dict-word-qa-history"
                          className="max-h-36 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-[#0B0D14]/80 border border-white/10"
                        >
                          {activeWordQaHistory.map((turn, tIdx) => (
                            <div
                              key={tIdx}
                              className={`p-2 rounded-lg text-[11px] leading-relaxed whitespace-pre-line ${
                                turn.role === 'user'
                                  ? 'bg-violet-500/20 border border-violet-400/30 text-violet-100 font-bold'
                                  : 'bg-emerald-500/15 border border-emerald-400/30 text-emerald-100'
                              }`}
                            >
                              {turn.role === 'user' ? `❓ شما: ${turn.text}` : turn.text}
                            </div>
                          ))}
                        </div>
                      )}

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleAskWordQuestion();
                        }}
                        className="flex items-center gap-1.5"
                      >
                        <input
                          type="text"
                          value={wordQaInput}
                          onChange={(e) => setWordQaInput(e.target.value)}
                          placeholder={`سوال شما درباره "${currentDictEntry.word}"...`}
                          data-testid="dict-word-qa-input"
                          className="flex-1 bg-[#0B0D14] border border-violet-400/40 rounded-lg px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-violet-300"
                        />
                        <button
                          type="submit"
                          disabled={wordQaLoading}
                          data-testid="dict-word-qa-send-btn"
                          className="px-3 py-1.5 rounded-lg bg-[#CE82FF] hover:bg-[#b968f0] disabled:opacity-50 text-white text-[11px] font-black shrink-0"
                        >
                          {wordQaLoading ? '...' : 'پرسش ✨'}
                        </button>
                      </form>
                    </div>
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

            {/* TRANCY LIVE SUBTITLE CUSTOMIZATION POPOVER */}
            {trancyStyleDrawerOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
                className="absolute top-3 left-3 z-30 w-full max-w-[350px] bg-[#131F24] border-2 border-b-4 border-[#37464F] rounded-3xl p-4 space-y-3 text-xs"
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
                    <option value={0.5}>0.5x</option>
                    <option value={0.75}>0.75x</option>
                    <option value={1}>1.0x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                  </select>
                  <button
                    type="button"
                    data-testid="toggle-ab-loop-btn"
                    onClick={() => setLoopCurrentCue((prev) => !prev)}
                    className={`px-2.5 py-1 rounded text-xs font-bold border transition-colors ${
                      loopCurrentCue
                        ? 'bg-emerald-600 border-emerald-400 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                    title="تکرار مداوم همین دیالوگ (A-B Loop)"
                  >
                    🔁 A-B Loop
                  </button>
                  <button
                    type="button"
                    data-testid="save-current-cue-sentence-btn"
                    onClick={() => {
                      onSaveSentence({
                        sentenceEn: activeCue.textEn,
                        sentenceFa: activeCue.textFa,
                        videoId: currentVideo.videoId,
                        videoTitle: currentVideo.videoTitle,
                        timestampSec: Math.round(activeCue.tStartMs / 1000),
                      });
                      showToast(`💬 این جمله در پوشه ویدیوی «${currentVideo.videoTitle}» ذخیره شد`);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold border border-amber-500/30"
                    title="ذخیره کل این جمله زیرنویس به همراه نام ویدیو (کلید میانبر R)"
                  >
                    ⭐ ذخیره جمله
                  </button>
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
          <div className="px-4 py-3 duo-surface-secondary border-t-2 duo-border flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="toggle-karaoke-btn"
                onClick={() => onUpdateSettings({ wordByWordHighlight: !settings.wordByWordHighlight })}
                className={`duo-btn px-3 py-1.5 text-xs ${
                  settings.wordByWordHighlight ? 'duo-btn-green' : 'duo-btn-neutral'
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
                className={`duo-btn px-3 py-1.5 text-xs ${
                  settings.vocabularyHighlighting !== 'Disabled' && settings.wordColorPreset === 'default-lr'
                    ? 'duo-btn-blue'
                    : 'duo-btn-neutral'
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
                className={`duo-btn px-3 py-1.5 text-xs ${
                  settings.vocabularyHighlighting !== 'Disabled' && settings.wordColorPreset === 'kevin-hunting'
                    ? 'duo-btn-red'
                    : 'duo-btn-neutral'
                }`}
              >
                Kevin&apos;s Hunting
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 duo-text-main font-bold">
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
                  className="duo-surface-main border-2 duo-border rounded-xl px-2.5 py-1 text-xs font-bold duo-text-main"
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
        <div className="lg:col-span-4 duo-card overflow-hidden flex flex-col h-[605px]">
          <div className="px-3.5 py-3 duo-surface-secondary border-b-2 duo-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRightTab('subtitles')}
                className={`duo-btn px-3 py-1.5 text-xs ${
                  rightTab === 'subtitles' ? 'duo-btn-blue' : 'duo-btn-neutral'
                }`}
              >
                Subtitles
              </button>
              <button
                type="button"
                onClick={() => setRightTab('words')}
                className={`duo-btn px-3 py-1.5 text-xs ${
                  rightTab === 'words' ? 'duo-btn-blue' : 'duo-btn-neutral'
                }`}
              >
                Words ({allVideoWords.length})
              </button>
              <button
                type="button"
                onClick={() => setRightTab('saved')}
                className={`duo-btn px-3 py-1.5 text-xs ${
                  rightTab === 'saved' ? 'duo-btn-blue' : 'duo-btn-neutral'
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
                className="duo-btn duo-btn-neutral px-2.5 py-1.5 text-xs"
                title="Export Subtitles (Print HTML / Excel CSV)"
              >
                📤 Export
              </button>
              <button
                type="button"
                onClick={onOpenSettingsPage}
                className="duo-btn duo-btn-neutral px-2.5 py-1.5 text-xs"
                title="تنظیمات کامل Cunt Academy"
              >
                ⚙
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y-2 duo-border">
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
                    className={`p-3.5 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-[#DDF4FF] dark:bg-[#1B2B32] border-l-4 border-l-[#1CB0F6]'
                        : 'hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-bold duo-text-muted mb-1">
                      <span className="font-mono font-black text-[#1CB0F6]">
                        ▶ {formatTimestamp(cue.tStartMs / 1000)}
                      </span>
                      <span>Cue #{idx + 1}</span>
                    </div>
                    <div className="text-xs font-extrabold duo-text-main leading-relaxed">
                      {cue.textEn}
                    </div>
                    {settings.showMachineTranslation && (
                      <div dir="rtl" className="text-xs font-bold text-[#FF9600] mt-1 leading-relaxed">
                        {cue.textFa}
                      </div>
                    )}
                  </div>
                );
              })}

            {rightTab === 'words' && (
              <div>
                <div className="p-2.5 duo-surface-secondary flex flex-wrap gap-1.5 border-b-2 duo-border">
                  {(['all', 'suggested', 'learning', 'known'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setWordFilterCat(cat)}
                      className={`duo-btn px-2.5 py-1 text-[11px] capitalize ${
                        wordFilterCat === cat ? 'duo-btn-blue' : 'duo-btn-neutral'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="divide-y-2 duo-border">
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
                        className="px-3.5 py-2.5 flex items-center justify-between hover:opacity-85 cursor-pointer text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block"
                            style={{
                              backgroundColor: settings.wordColors[item.category] || '#71717a',
                            }}
                          />
                          <span className="font-black duo-text-main">{item.word}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] duo-text-muted font-mono font-bold">
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
                <div className="p-3 duo-surface-secondary flex items-center justify-between border-b-2 duo-border text-xs">
                  <span className="duo-text-muted font-bold">
                    {cards.length} واژه و عبارت • {savedSentences.length} جمله
                  </span>
                  <button
                    type="button"
                    onClick={onOpenPhrasePump}
                    className="duo-btn duo-btn-green px-3 py-1 text-[11px]"
                  >
                    ⚡ تمرین فلش‌کارت و PhrasePump
                  </button>
                </div>
                <div className="divide-y-2 duo-border">
                  {cards.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedPhrase(c.word);
                        setFloatingPopupOpen(true);
                      }}
                      className="px-3.5 py-2.5 flex items-center justify-between hover:opacity-85 cursor-pointer text-xs"
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
                        <strong className="duo-text-main font-black">{c.word}</strong>
                        {c.isPhrase && (
                          <span className="px-1.5 py-0.5 rounded bg-[#CE82FF]/20 text-[#CE82FF] text-[9px] font-black">
                            PHRASE
                          </span>
                        )}
                        <span className="text-[10px] font-mono font-bold duo-text-muted">Box {c.box}</span>
                      </div>
                      <span dir="rtl" className="text-[#58CC02] font-black">
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

      {/* CUSTOM SUBTITLES (.SRT / TRANSCRIPT) IMPORT MODAL */}
      {customTranscriptModalOpen && (
        <div
          data-testid="custom-subtitles-modal"
          onClick={() => setCustomTranscriptModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleImportCustomSubtitles}
            dir="rtl"
            className="bg-[#161929] border border-white/15 rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-white">
                📝 الصاق زیرنویس دلخواه (.SRT / .VTT یا متن انگلیسی) برای «{currentVideo.videoTitle}»
              </h3>
              <button
                type="button"
                onClick={() => setCustomTranscriptModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-slate-300 leading-relaxed">
              اگر ویدیوی یوتیوب شما زیرنویس آماده نداشت یا می‌خواهید متن خاص خودتان را روی این ویدیو تمرین کنید، محتوای فایل <strong>.SRT</strong> یا جملات انگلیسی را در کادر زیر Paste کنید:
            </p>

            <textarea
              dir="ltr"
              rows={7}
              data-testid="custom-subtitles-textarea"
              value={customTranscriptInput}
              onChange={(e) => setCustomTranscriptInput(e.target.value)}
              placeholder={`1\n00:00:02,000 --> 00:00:06,500\nSo column A in retrospect is even more impressive.\nبنابراین ستون الف در نگاه به گذشته حتی چشمگیرتر است.`}
              className="w-full bg-[#0B0D14] border border-white/15 rounded-xl p-3 text-xs font-mono text-white focus:outline-none focus:border-sky-400"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCustomTranscriptModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-bold"
              >
                انصراف
              </button>
              <button
                type="submit"
                data-testid="confirm-custom-subtitles-btn"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black"
              >
                اعمال زیرنویس روی ویدیو
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
