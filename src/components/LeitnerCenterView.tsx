import React, { useState, useMemo, useEffect } from 'react';
import {
  LeitnerCard,
  SavedSentence,
  LanguageReactorSettings,
  AnkiGrade,
  WORD_COLOR_PRESETS,
  computePhrasePumpPipelineCounts,
  computeAnkiDeckCounts,
  computeAnkiNextIntervals,
  getDueAnkiQueue,
  normalizeForQuizComparison,
  toPersianDigits,
  formatTimestamp,
  DAY_MS,
} from '../utils/linguatubeLogic';

export type PortalSubView = 'phrasepump' | 'saved' | 'drills' | 'settings';
export type PracticeStudioMode = 'flashcards' | 'cloze' | 'dictation' | 'builder' | 'match';

interface LeitnerCenterViewProps {
  activeSubView: PortalSubView;
  onChangeSubView: (view: PortalSubView) => void;
  cards: LeitnerCard[];
  savedSentences: SavedSentence[];
  settings: LanguageReactorSettings;
  onUpdateSettings: (patch: Partial<LanguageReactorSettings>) => void;
  onGradeCard: (cardId: string, grade: AnkiGrade) => void;
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
  onUpdateCardStatus: (cardId: string, status: 'learning' | 'known' | 'ignored') => void;
  onDeleteCard: (cardId: string) => void;
  onDeleteSentence: (sentenceId: string) => void;
  onAddCard: (cardInput: Partial<LeitnerCard> & { word: string; translationFa: string }) => void;
  onBulkImport: (imported: LeitnerCard[]) => void;
}

export const LeitnerCenterView: React.FC<LeitnerCenterViewProps> = ({
  activeSubView,
  onChangeSubView,
  cards,
  savedSentences,
  settings,
  onUpdateSettings,
  onGradeCard,
  onUpdateCardBack,
  onUpdateCardStatus,
  onDeleteCard,
  onDeleteSentence,
  onAddCard,
}) => {
  // 5-Mode Practice Studio State
  const [practiceMode, setPracticeMode] = useState<PracticeStudioMode>('flashcards');
  const [pumpRevealed, setPumpRevealed] = useState<boolean>(false);
  const [pumpIndex, setPumpIndex] = useState<number>(0);
  const [todayReviewedCount, setTodayReviewedCount] = useState<number>(0);
  const [selectedStageFilter, setSelectedStageFilter] = useState<'all' | 'marked' | 'learning_now' | 'learned'>('all');
  const [customStudyAhead, setCustomStudyAhead] = useState<boolean>(false);
  const [lastGradedFeedback, setLastGradedFeedback] = useState<string | null>(null);

  // Back of Flashcard Inline Editor State
  const [isEditingCardBack, setIsEditingCardBack] = useState<boolean>(false);
  const [editBackTranslationFa, setEditBackTranslationFa] = useState<string>('');
  const [editBackCustomNotesFa, setEditBackCustomNotesFa] = useState<string>('');
  const [editBackContextFa, setEditBackContextFa] = useState<string>('');

  // Saved Table Row Editor State
  const [editingSavedRowId, setEditingSavedRowId] = useState<string | null>(null);
  const [savedRowTranslationFa, setSavedRowTranslationFa] = useState<string>('');
  const [savedRowNotesFa, setSavedRowNotesFa] = useState<string>('');

  // Sentence Builder (Word Scramble) State
  const [builderSelectedIndices, setBuilderSelectedIndices] = useState<number[]>([]);
  const [builderFeedback, setBuilderFeedback] = useState<'idle' | 'correct' | 'wrong'>('idle');

  // Speed Match State
  const [selectedMatchEnId, setSelectedMatchEnId] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);

  // Saved Items tab state
  const [savedTabType, setSavedTabType] = useState<'all' | 'words' | 'phrases' | 'sentences'>('all');
  const [savedStatusFilter, setSavedStatusFilter] = useState<'all' | 'learning' | 'known' | 'ignored'>('all');
  const [savedFreqFilter, setSavedFreqFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [newWordEn, setNewWordEn] = useState<string>('');
  const [newWordFa, setNewWordFa] = useState<string>('');
  const [newWordContext, setNewWordContext] = useState<string>('');

  // Dictation / FSI Drills state
  const [drillIndex, setDrillIndex] = useState<number>(0);
  const [drillInput, setDrillInput] = useState<string>('');
  const [drillFeedback, setDrillFeedback] = useState<'idle' | 'correct' | 'wrong'>('idle');

  const now = Date.now();
  const pipeline = useMemo(() => computePhrasePumpPipelineCounts(cards, now), [cards, now]);
  const ankiCounts = useMemo(() => computeAnkiDeckCounts(cards, now), [cards, now]);

  // Strict AnkiDroid Due-Only Queue: cards scheduled for 1d / 4d / 10d leave this queue immediately!
  const pumpQueue = useMemo(
    () => getDueAnkiQueue(cards, now, selectedStageFilter, customStudyAhead),
    [cards, now, selectedStageFilter, customStudyAhead]
  );

  const activePumpCard = pumpQueue.length > 0 ? pumpQueue[pumpIndex % pumpQueue.length] : null;
  const ankiNextPreview = useMemo(
    () => (activePumpCard ? computeAnkiNextIntervals(activePumpCard) : null),
    [activePumpCard]
  );

  const openCardBackEditor = (card: LeitnerCard) => {
    setEditBackTranslationFa(card.translationFa || '');
    setEditBackCustomNotesFa(card.customNotesFa || '');
    setEditBackContextFa(card.contextSentenceFa || '');
    setIsEditingCardBack(true);
  };

  const handleSaveCardBackEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePumpCard) return;
    onUpdateCardBack(activePumpCard.id, {
      translationFa: editBackTranslationFa,
      customNotesFa: editBackCustomNotesFa,
      contextSentenceFa: editBackContextFa,
    });
    setIsEditingCardBack(false);
    setLastGradedFeedback(`✓ معنی و یادداشت پشت کارت «${activePumpCard.word}» ذخیره شد`);
    setTimeout(() => setLastGradedFeedback(null), 3000);
  };

  const speakText = (text: string) => {
    try {
      if ('speechSynthesis' in window && text) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.rate = 0.95;
        window.speechSynthesis.speak(u);
      }
    } catch {
      // ignore
    }
  };

  const handlePumpGrade = (grade: AnkiGrade) => {
    if (!activePumpCard || !ankiNextPreview) return;
    const labelMap: Record<string, string> = {
      again: ankiNextPreview.againLabel,
      wrong: ankiNextPreview.againLabel,
      hard: ankiNextPreview.hardLabel,
      good: ankiNextPreview.goodLabel,
      correct: ankiNextPreview.goodLabel,
      easy: ankiNextPreview.easyLabel,
    };
    const intervalChosen = labelMap[grade] || ankiNextPreview.goodLabel;
    const wordGraded = activePumpCard.word;

    onGradeCard(activePumpCard.id, grade);
    setPumpRevealed(false);
    setIsEditingCardBack(false);
    setBuilderSelectedIndices([]);
    setBuilderFeedback('idle');
    setDrillInput('');
    setDrillFeedback('idle');
    setTodayReviewedCount((c) => c + 1);
    setPumpIndex(0);

    if (grade === 'again' || grade === 'wrong') {
      setLastGradedFeedback(`↻ کارت «${wordGraded}» به حالت بازآموزی (< 10m) برگشت`);
    } else {
      setLastGradedFeedback(
        `✓ کارت «${wordGraded}» زمان‌بندی شد برای ${intervalChosen} و از صف مرور امروز خارج شد`
      );
    }
    setTimeout(() => setLastGradedFeedback(null), 3500);
  };

  // Manual Spacebar Flip + Anki 1/2/3/4 Shortcuts (ONLY when user presses key, NO automatic timer!)
  useEffect(() => {
    if (activeSubView !== 'phrasepump' || practiceMode !== 'flashcards') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setPumpRevealed((prev) => {
          const next = !prev;
          if (next && activePumpCard) speakText(activePumpCard.word);
          return next;
        });
      } else if (pumpRevealed && activePumpCard) {
        if (e.key === '1') {
          e.preventDefault();
          handlePumpGrade('again');
        } else if (e.key === '2') {
          e.preventDefault();
          handlePumpGrade('hard');
        } else if (e.key === '3') {
          e.preventDefault();
          handlePumpGrade('good');
        } else if (e.key === '4') {
          e.preventDefault();
          handlePumpGrade('easy');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Scrambled words for Mode 4: Phrase & Sentence Builder
  const builderWordTiles = useMemo(() => {
    if (!activePumpCard) return [];
    const rawSentence = activePumpCard.contextSentenceEn || activePumpCard.word;
    const words = rawSentence
      .replace(/[.!?]+$/g, '')
      .split(/\s+/)
      .filter(Boolean);
    return words.map((w, idx) => ({ word: w, origIndex: idx })).sort((a, b) => {
      const hashA = (a.word.charCodeAt(0) * 17 + a.origIndex * 31) % 97;
      const hashB = (b.word.charCodeAt(0) * 17 + b.origIndex * 31) % 97;
      return hashA - hashB;
    });
  }, [activePumpCard]);

  const filteredSavedCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return cards.filter((c) => {
      if (savedTabType === 'words' && c.isPhrase) return false;
      if (savedTabType === 'phrases' && !c.isPhrase) return false;
      if (savedStatusFilter !== 'all' && (c.status || 'learning') !== savedStatusFilter) return false;
      if (savedFreqFilter !== 'all' && (c.freqTag || 'tag 3k') !== savedFreqFilter) return false;
      if (q) {
        const hay = `${c.word} ${c.translationFa} ${c.customNotesFa || ''} ${c.contextSentenceEn}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cards, savedTabType, savedStatusFilter, savedFreqFilter, searchQuery]);

  const handleExportSavedCsv = () => {
    const header =
      'Word,Type,AnkiState,IntervalDays,EaseFactor,CEFR,Frequency,Persian Translation,Personal Notes,Context Sentence,Video Source';
    const rows = cards.map((c) =>
      [
        `"${c.word.replace(/"/g, '""')}"`,
        c.isPhrase ? 'Phrase/Idiom' : 'Word',
        c.ankiState || 'review',
        c.intervalDays ?? 0,
        c.easeFactor ?? 2.5,
        c.cefr || 'B1',
        c.freqTag || 'tag 3k',
        `"${c.translationFa.replace(/"/g, '""')}"`,
        `"${(c.customNotesFa || '').replace(/"/g, '""')}"`,
        `"${(c.contextSentenceEn || '').replace(/"/g, '""')}"`,
        `"${(c.videoTitle || '').replace(/"/g, '""')}"`,
      ].join(',')
    );
    const blob = new Blob(['\uFEFF' + [header, ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cunt-academy-ankidroid-deck.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Top Portal Sub-Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#121521] border border-white/10 px-4 py-2.5 rounded-2xl shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="portal-tab-phrasepump"
            onClick={() => onChangeSubView('phrasepump')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeSubView === 'phrasepump'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-600/25'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>⚡</span>
            <span>
              AnkiDroid Flashcards &amp; Practice ({toPersianDigits(ankiCounts.totalDueToday)} مرور امروز)
            </span>
          </button>

          <button
            type="button"
            data-testid="portal-tab-saved"
            onClick={() => onChangeSubView('saved')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeSubView === 'saved'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-600/25'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>📚</span>
            <span>Saved Words &amp; Back Editor ({toPersianDigits(cards.length)})</span>
          </button>

          <button
            type="button"
            data-testid="portal-tab-drills"
            onClick={() => onChangeSubView('drills')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeSubView === 'drills'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-600/25'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🎙</span>
            <span>Shadowing &amp; Active Recall Lab</span>
          </button>

          <button
            type="button"
            data-testid="portal-tab-settings"
            onClick={() => onChangeSubView('settings')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeSubView === 'settings'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-600/25'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>⚙</span>
            <span>Settings (Subtitles &amp; Word Colors)</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleExportSavedCsv}
          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold"
        >
          📤 Export Anki CSV
        </button>
      </div>

      {/* =====================================================================
          SUB-VIEW 1: ANKIDROID SM-2 FLASHCARDS + 5-MODE PRACTICE STUDIO
         ===================================================================== */}
      {activeSubView === 'phrasepump' && (
        <div className="space-y-7">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left (8 Cols): AnkiDroid SM-2 Interactive Flashcard & Practice Stage */}
            <div
              data-testid="phrasepump-hero-card"
              className="lg:col-span-8 bg-[#121521] border border-violet-500/40 rounded-2xl p-5 shadow-2xl flex flex-col justify-between space-y-4"
            >
              {/* Header + Authentic AnkiDroid 3-Counter Bar (New Blue / Learning Red / Review Green) */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 via-violet-600 to-emerald-500 flex items-center justify-center text-xl text-white font-black shadow-lg">
                    ★
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-white tracking-tight">
                      AnkiDroid Spaced Repetition (SM-2) Studio
                    </h2>
                    <p className="text-xs text-slate-400" dir="rtl">
                      دقیقاً مطابق الگوریتم AnkiDroid: کارت‌های مرور شده تا موعد بعدی (فردا، ۴ روز دیگر، ۱۰ روز دیگر) از صف امروز خارج می‌شوند و تکرار بی‌مورد ندارند.
                    </p>
                  </div>
                </div>

                {/* Authentic AnkiDroid 3 Counters: New (Blue) | Learning (Red) | Review Due (Green) */}
                <div
                  data-testid="ankidroid-deck-counters"
                  className="flex items-center gap-2 text-xs bg-[#0B0D14] border border-white/10 px-3.5 py-2 rounded-xl"
                >
                  <div className="px-2 text-center border-r border-white/10">
                    <span className="block text-[10px] text-slate-400">New (جدید)</span>
                    <strong data-testid="anki-new-count" className="text-sky-400 font-mono text-sm">
                      {ankiCounts.newCount}
                    </strong>
                  </div>
                  <div className="px-2 text-center border-r border-white/10">
                    <span className="block text-[10px] text-slate-400">Learn (در حال یادگیری)</span>
                    <strong data-testid="anki-learning-count" className="text-rose-400 font-mono text-sm">
                      {ankiCounts.learningCount}
                    </strong>
                  </div>
                  <div className="px-2 text-center">
                    <span className="block text-[10px] text-slate-400">Due (مرور امروز)</span>
                    <strong
                      data-testid="phrasepump-urgent-count"
                      className="text-emerald-400 font-mono text-sm"
                    >
                      {ankiCounts.reviewDueCount}
                    </strong>
                  </div>
                </div>
              </div>

              {lastGradedFeedback && (
                <div
                  dir="rtl"
                  data-testid="anki-schedule-toast"
                  className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-200 text-xs font-bold flex items-center justify-between"
                >
                  <span>{lastGradedFeedback}</span>
                  <span className="text-[11px] font-mono text-emerald-300">
                    باقی‌مانده امروز: {toPersianDigits(pumpQueue.length)} کارت
                  </span>
                </div>
              )}

              {/* 5 Practice Mode Selector Pills */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 rounded-xl bg-[#0B0D14] border border-white/10 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'flashcards', icon: '🃏', label: '۱. فلش‌کارت آنکی (Anki SM-2)' },
                      { id: 'cloze', icon: '🪭', label: '۲. جای خالی (PhrasePump Cloze)' },
                      { id: 'dictation', icon: '🎧', label: '۳. دیکته شنیداری (Dictation)' },
                      { id: 'builder', icon: '🧱', label: '۴. جمله‌ساز (Word Scramble)' },
                      { id: 'match', icon: '🧩', label: '۵. تطبیق سریع (Speed Match)' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      data-testid={`mode-btn-${m.id}`}
                      onClick={() => {
                        setPracticeMode(m.id);
                        setPumpRevealed(false);
                        setIsEditingCardBack(false);
                        setBuilderSelectedIndices([]);
                        setBuilderFeedback('idle');
                        setDrillInput('');
                        setDrillFeedback('idle');
                      }}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                        practiceMode === m.id
                          ? 'bg-violet-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      <span>{m.icon}</span>
                      <span dir="rtl">{m.label}</span>
                    </button>
                  ))}
                </div>

                {customStudyAhead && (
                  <button
                    type="button"
                    onClick={() => setCustomStudyAhead(false)}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold"
                  >
                    خروج از مطالعه زودتر از موعد
                  </button>
                )}
              </div>

              {/* ACTIVE PRACTICE STAGE OR ANKIDROID CONGRATULATIONS SCREEN */}
              {activePumpCard && ankiNextPreview ? (
                <div className="bg-[#0B0D14] border border-white/10 rounded-2xl p-5 space-y-4">
                  {/* Top Card Meta Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-bold">
                        {activePumpCard.ankiState === 'new'
                          ? 'New Card (کارت جدید)'
                          : activePumpCard.ankiState === 'relearning' || activePumpCard.ankiState === 'learning'
                            ? 'Learning (< 1d)'
                            : `Review • فاصله فعلی: ${toPersianDigits(activePumpCard.intervalDays || 1)} روز`}{' '}
                        • Ease {Math.round((activePumpCard.easeFactor || 2.5) * 100)}%
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                        {activePumpCard.cefr || 'B1'} • {activePumpCard.freqTag || 'tag 2k'}
                      </span>
                      {activePumpCard.isPhrase && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                          🔗 Phrasal Verb / Idiom
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid="edit-card-back-btn"
                        onClick={() => {
                          setPumpRevealed(true);
                          openCardBackEditor(activePumpCard);
                        }}
                        className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold"
                      >
                        ✏️ ویرایش پشت کارت
                      </button>
                      <button
                        type="button"
                        onClick={() => speakText(activePumpCard.contextSentenceEn || activePumpCard.word)}
                        className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-sky-300 font-semibold"
                      >
                        🔊 پخش تلفظ
                      </button>
                    </div>
                  </div>

                  {/* MODE 1: ANKIDROID MANUAL-FLIP FLASHCARD + INLINE BACK EDITOR + 4 ANKI INTERVAL BUTTONS */}
                  {practiceMode === 'flashcards' && (
                    <div className="space-y-4">
                      <div
                        data-testid="manual-flip-flashcard"
                        onClick={() => {
                          if (isEditingCardBack) return;
                          const next = !pumpRevealed;
                          setPumpRevealed(next);
                          if (next) speakText(activePumpCard.word);
                        }}
                        className="cursor-pointer select-none rounded-2xl border border-violet-500/35 hover:border-violet-400 bg-gradient-to-br from-[#161A2C] via-[#121524] to-[#0E111D] p-7 min-h-[240px] flex flex-col items-center justify-center text-center transition-all shadow-inner"
                      >
                        {!pumpRevealed ? (
                          <>
                            <span className="text-[11px] font-bold uppercase tracking-widest text-violet-300/80 mb-2">
                              FRONT • برای دیدن پشت کارت کلیک کنید یا کلید Space را بزنید
                            </span>
                            <div
                              data-testid="flashcard-front-word"
                              className="text-2xl md:text-3xl font-black text-white mb-1.5"
                            >
                              {activePumpCard.word}
                            </div>
                            <div className="text-xs font-mono text-sky-300 mb-4">
                              {activePumpCard.phonetic}
                            </div>
                            <p className="text-sm text-slate-300 max-w-xl leading-relaxed">
                              &ldquo;{activePumpCard.contextSentenceEn}&rdquo;
                            </p>
                          </>
                        ) : isEditingCardBack ? (
                          <form
                            onClick={(e) => e.stopPropagation()}
                            onSubmit={handleSaveCardBackEdit}
                            dir="rtl"
                            data-testid="card-back-editor-form"
                            className="w-full max-w-xl text-right space-y-3 bg-[#0B0D14]/90 border border-amber-500/40 rounded-xl p-4"
                          >
                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                              <span className="text-xs font-extrabold text-amber-300">
                                ✏️ ویرایش معنی و توضیحات پشت فلش‌کارت ({activePumpCard.word})
                              </span>
                              <button
                                type="button"
                                onClick={() => setIsEditingCardBack(false)}
                                className="text-slate-400 hover:text-white text-xs"
                              >
                                ✕ انصراف
                              </button>
                            </div>

                            <div>
                              <label className="block text-[11px] text-slate-300 mb-1">
                                معنی فارسی پشت کارت (می‌توانید چند معنی یا معنی دلخواه خودتان را بنویسید):
                              </label>
                              <input
                                type="text"
                                data-testid="edit-back-translation-input"
                                value={editBackTranslationFa}
                                onChange={(e) => setEditBackTranslationFa(e.target.value)}
                                className="w-full bg-[#121521] border border-white/20 rounded-lg px-3 py-2 text-xs text-white font-bold"
                                placeholder="معنی فارسی..."
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] text-slate-300 mb-1">
                                یادداشت شخصی / نکات گرامری یا هم‌نشینی (نمایش در پشت کارت):
                              </label>
                              <textarea
                                rows={2}
                                data-testid="edit-back-notes-input"
                                value={editBackCustomNotesFa}
                                onChange={(e) => setEditBackCustomNotesFa(e.target.value)}
                                className="w-full bg-[#121521] border border-white/20 rounded-lg px-3 py-2 text-xs text-amber-200"
                                placeholder="مثلاً: در این ویدیو به معنی ... به کار رفته است"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] text-slate-300 mb-1">
                                ترجمه فارسی جمله نمونه:
                              </label>
                              <input
                                type="text"
                                value={editBackContextFa}
                                onChange={(e) => setEditBackContextFa(e.target.value)}
                                className="w-full bg-[#121521] border border-white/20 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                              />
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setIsEditingCardBack(false)}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
                              >
                                لغو
                              </button>
                              <button
                                type="submit"
                                data-testid="save-card-back-btn"
                                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                              >
                                💾 ذخیره تغییرات پشت کارت
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 mb-2">
                              BACK • معنی دقیق فارسی، دسته‌بندی نقش‌های کلمه و یادداشت شخصی
                            </span>
                            <div className="text-xl font-black text-white mb-1">
                              {activePumpCard.word}
                            </div>
                            <div
                              dir="rtl"
                              data-testid="flashcard-back-translation"
                              className="text-2xl font-black text-emerald-400 mb-2"
                            >
                              {activePumpCard.translationFa}
                            </div>

                            {/* Multi-POS Dictionary chips on the back of the card */}
                            {activePumpCard.posEntries && activePumpCard.posEntries.length > 0 && (
                              <div className="flex flex-wrap items-center justify-center gap-1.5 mb-3 max-w-xl">
                                {activePumpCard.posEntries.map((pe, idx) => (
                                  <span
                                    key={idx}
                                    dir="rtl"
                                    className="px-2.5 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-200"
                                  >
                                    <strong className="text-sky-300 font-mono">{pe.pos}:</strong>{' '}
                                    {pe.terms.join('، ')}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* User's Editable Custom Notes on the Back of the Card */}
                            {activePumpCard.customNotesFa && (
                              <div
                                dir="rtl"
                                data-testid="flashcard-back-custom-notes"
                                className="text-xs font-bold text-amber-200 bg-amber-500/15 border border-amber-500/35 px-3.5 py-2 rounded-xl mb-2.5 max-w-xl"
                              >
                                📝 یادداشت شما: {activePumpCard.customNotesFa}
                              </div>
                            )}

                            <div dir="rtl" className="text-sm font-medium text-amber-300 mb-2 max-w-xl">
                              {activePumpCard.contextSentenceFa}
                            </div>

                            {activePumpCard.aiExplanationFa && (
                              <div
                                dir="rtl"
                                className="text-xs text-violet-200 bg-violet-950/45 border border-violet-500/30 px-3 py-1.5 rounded-lg max-w-xl"
                              >
                                {activePumpCard.aiExplanationFa}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Authentic AnkiDroid Bottom Action Bar: Show Answer OR 4 SM-2 Interval Buttons */}
                      {!pumpRevealed ? (
                        <button
                          type="button"
                          data-testid="pump-reveal-btn"
                          onClick={() => {
                            setPumpRevealed(true);
                            speakText(activePumpCard.word);
                          }}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-extrabold shadow-lg"
                        >
                          نمایش پاسخ (Show Answer • Space)
                        </button>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          <button
                            type="button"
                            data-testid="anki-btn-again"
                            onClick={() => handlePumpGrade('again')}
                            className="py-2.5 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/45 text-rose-200 flex flex-col items-center justify-center transition-all"
                          >
                            <span className="text-[11px] font-mono text-rose-300">
                              {ankiNextPreview.againLabel}
                            </span>
                            <span className="text-xs font-extrabold text-white mt-0.5">
                              Again • دوباره (1)
                            </span>
                          </button>

                          <button
                            type="button"
                            data-testid="anki-btn-hard"
                            onClick={() => handlePumpGrade('hard')}
                            className="py-2.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/45 text-amber-200 flex flex-col items-center justify-center transition-all"
                          >
                            <span className="text-[11px] font-mono text-amber-300">
                              {ankiNextPreview.hardLabel}
                            </span>
                            <span className="text-xs font-extrabold text-white mt-0.5">
                              Hard • سخت (2)
                            </span>
                          </button>

                          <button
                            type="button"
                            data-testid="anki-btn-good"
                            onClick={() => handlePumpGrade('good')}
                            className="py-2.5 px-3 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/45 border border-emerald-400/60 text-emerald-200 flex flex-col items-center justify-center transition-all shadow-md"
                          >
                            <span
                              data-testid="anki-good-interval-label"
                              className="text-[11px] font-mono text-emerald-300"
                            >
                              {ankiNextPreview.goodLabel}
                            </span>
                            <span className="text-xs font-extrabold text-white mt-0.5">
                              Good • خوب (3)
                            </span>
                          </button>

                          <button
                            type="button"
                            data-testid="anki-btn-easy"
                            onClick={() => handlePumpGrade('easy')}
                            className="py-2.5 px-3 rounded-xl bg-sky-500/25 hover:bg-sky-500/40 border border-sky-400/55 text-sky-200 flex flex-col items-center justify-center transition-all"
                          >
                            <span
                              data-testid="anki-easy-interval-label"
                              className="text-[11px] font-mono text-sky-300"
                            >
                              {ankiNextPreview.easyLabel}
                            </span>
                            <span className="text-xs font-extrabold text-white mt-0.5">
                              Easy • آسان (4)
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MODE 2: PHRASEPUMP CONTEXTUAL CLOZE */}
                  {practiceMode === 'cloze' && (
                    <div className="space-y-3">
                      <div className="text-base md:text-lg font-bold text-white leading-relaxed">
                        {pumpRevealed
                          ? activePumpCard.contextSentenceEn || activePumpCard.word
                          : (activePumpCard.contextSentenceEn || activePumpCard.word).replace(
                              new RegExp(activePumpCard.word, 'gi'),
                              ' [ _____ ] '
                            )}
                      </div>

                      <div dir="rtl" className="text-sm font-medium text-amber-300">
                        {activePumpCard.contextSentenceFa || activePumpCard.translationFa}
                      </div>

                      {pumpRevealed ? (
                        <div className="pt-2 border-t border-white/10 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#121521] p-3 rounded-xl">
                            <div>
                              <span className="text-lg font-extrabold text-emerald-400">
                                {activePumpCard.word}
                              </span>
                              <span className="text-xs font-mono text-slate-400 ml-2">
                                {activePumpCard.phonetic}
                              </span>
                            </div>
                            <div dir="rtl" className="text-sm font-bold text-white">
                              {activePumpCard.translationFa}
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handlePumpGrade('again')}
                              className="py-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-bold"
                            >
                              Again ({ankiNextPreview.againLabel})
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePumpGrade('hard')}
                              className="py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-bold"
                            >
                              Hard ({ankiNextPreview.hardLabel})
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePumpGrade('good')}
                              className="py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                            >
                              Good ({ankiNextPreview.goodLabel})
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePumpGrade('easy')}
                              className="py-2 rounded-lg bg-sky-600 text-white text-xs font-bold"
                            >
                              Easy ({ankiNextPreview.easyLabel})
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          data-testid="pump-reveal-btn"
                          onClick={() => {
                            setPumpRevealed(true);
                            speakText(activePumpCard.word);
                          }}
                          className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-lg"
                        >
                          نمایش پاسخ و تلفظ ({activePumpCard.word})
                        </button>
                      )}
                    </div>
                  )}

                  {/* MODE 3: LISTENING & DICTATION LAB */}
                  {practiceMode === 'dictation' && (
                    <div className="space-y-3">
                      <div dir="rtl" className="text-sm font-bold text-amber-300">
                        معنی عبارت: «{activePumpCard.translationFa}» — در جمله: «{activePumpCard.contextSentenceFa}»
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={drillInput}
                          onChange={(e) => {
                            setDrillInput(e.target.value);
                            setDrillFeedback('idle');
                          }}
                          placeholder={`تایپ املای انگلیسی واژه یا عبارت (${activePumpCard.word.length} حرف)...`}
                          className="flex-1 bg-[#121521] border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const ok =
                              normalizeForQuizComparison(drillInput) ===
                              normalizeForQuizComparison(activePumpCard.word);
                            setDrillFeedback(ok ? 'correct' : 'wrong');
                            speakText(activePumpCard.word);
                          }}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                        >
                          بررسی املا
                        </button>
                      </div>
                      {drillFeedback !== 'idle' && (
                        <div
                          className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between ${
                            drillFeedback === 'correct'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          <span>
                            {drillFeedback === 'correct'
                              ? `✓ عالی! املای صحیح: "${activePumpCard.word}"`
                              : `پاسخ صحیح: "${activePumpCard.word}"`}
                          </span>
                          <button
                            type="button"
                            onClick={() => handlePumpGrade(drillFeedback === 'correct' ? 'good' : 'again')}
                            className="px-3 py-1 rounded-lg bg-white/10 text-white"
                          >
                            ثبت در آنکی و کارت بعدی →
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MODE 4: PHRASE & SENTENCE BUILDER (Word Tile Scramble) */}
                  {practiceMode === 'builder' && (
                    <div className="space-y-3">
                      <div dir="rtl" className="text-sm font-bold text-amber-300">
                        کلمات درهم‌ریخته زیر را به ترتیب صحیح انگلیسی بچینید: «{activePumpCard.contextSentenceFa || activePumpCard.translationFa}»
                      </div>

                      <div className="min-h-[48px] p-3 rounded-xl bg-[#121521] border border-violet-500/30 flex flex-wrap items-center gap-1.5">
                        {builderSelectedIndices.length === 0 ? (
                          <span className="text-xs text-slate-500">
                            روی کاشی‌های کلمات پایین کلیک کنید تا جمله ساخته شود...
                          </span>
                        ) : (
                          builderSelectedIndices.map((tileIdx, pos) => (
                            <button
                              key={pos}
                              type="button"
                              onClick={() =>
                                setBuilderSelectedIndices((prev) => prev.filter((_, i) => i !== pos))
                              }
                              className="px-2.5 py-1 rounded-lg bg-violet-600 text-white text-xs font-bold"
                            >
                              {builderWordTiles[tileIdx]?.word}
                            </button>
                          ))
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {builderWordTiles.map((tile, idx) => {
                          const used = builderSelectedIndices.includes(idx);
                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={used}
                              onClick={() => {
                                setBuilderSelectedIndices((prev) => [...prev, idx]);
                                setBuilderFeedback('idle');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                used
                                  ? 'opacity-30 bg-slate-900 border-slate-800 text-slate-500'
                                  : 'bg-[#161A2B] hover:bg-violet-600/30 border-white/15 text-slate-100'
                              }`}
                            >
                              {tile.word}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setBuilderSelectedIndices([]);
                            setBuilderFeedback('idle');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-xs"
                        >
                          پاک کردن چیدمان
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const assembled = builderSelectedIndices
                                .map((i) => builderWordTiles[i]?.word)
                                .join(' ');
                              const target = (activePumpCard.contextSentenceEn || activePumpCard.word).replace(
                                /[.!?]+$/g,
                                ''
                              );
                              const ok =
                                normalizeForQuizComparison(assembled) ===
                                normalizeForQuizComparison(target);
                              setBuilderFeedback(ok ? 'correct' : 'wrong');
                              if (ok) speakText(activePumpCard.contextSentenceEn || activePumpCard.word);
                            }}
                            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                          >
                            بررسی جمله
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePumpGrade('good')}
                            className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold"
                          >
                            ثبت Good و کارت بعدی →
                          </button>
                        </div>
                      </div>

                      {builderFeedback !== 'idle' && (
                        <div
                          className={`p-2.5 rounded-lg text-xs font-bold ${
                            builderFeedback === 'correct'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {builderFeedback === 'correct'
                            ? `✓ آفرین! جمله کامل: "${activePumpCard.contextSentenceEn}"`
                            : `ترتیب صحیح: "${activePumpCard.contextSentenceEn}"`}
                        </div>
                      )}
                    </div>
                  )}

                  {/* MODE 5: SYNAPSE SPEED MATCH */}
                  {practiceMode === 'match' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-emerald-400 font-bold" dir="rtl">
                          ابتدا روی واژه انگلیسی و سپس روی معنی فارسی آن کلیک کنید:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setMatchedIds([]);
                            setSelectedMatchEnId(null);
                          }}
                          className="px-2.5 py-1 rounded bg-white/10 text-slate-200"
                        >
                          ↻ چیدمان مجدد
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          {cards.slice(0, 5).map((c) => {
                            const done = matchedIds.includes(c.id);
                            const selected = selectedMatchEnId === c.id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                disabled={done}
                                onClick={() => setSelectedMatchEnId(c.id)}
                                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                                  done
                                    ? 'opacity-30 bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                                    : selected
                                      ? 'bg-violet-600/30 border-violet-400 text-white'
                                      : 'bg-[#121521] border-white/10 text-slate-200 hover:border-violet-500/40'
                                }`}
                              >
                                {c.word}
                              </button>
                            );
                          })}
                        </div>
                        <div className="space-y-2">
                          {cards
                            .slice(0, 5)
                            .reverse()
                            .map((c) => {
                              const done = matchedIds.includes(c.id);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  dir="rtl"
                                  disabled={done}
                                  onClick={() => {
                                    if (selectedMatchEnId === c.id) {
                                      setMatchedIds((prev) => [...prev, c.id]);
                                      setSelectedMatchEnId(null);
                                      speakText(c.word);
                                      onGradeCard(c.id, 'good');
                                    } else {
                                      setSelectedMatchEnId(null);
                                    }
                                  }}
                                  className={`w-full text-right px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                                    done
                                      ? 'opacity-30 bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                                      : 'bg-[#121521] border-white/10 text-amber-300 hover:border-emerald-500/40'
                                  }`}
                                >
                                  {c.translationFa}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* AUTHENTIC ANKIDROID DECK FINISHED SCREEN (When all Due cards for today are completed!) */
                <div
                  data-testid="anki-deck-finished-screen"
                  dir="rtl"
                  className="bg-gradient-to-br from-[#0E1525] via-[#0B0D14] to-[#111D21] border border-emerald-500/40 rounded-2xl p-8 text-center space-y-4 my-auto"
                >
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-2xl text-emerald-300">
                    🎉
                  </div>
                  <h3 className="text-xl font-black text-white">
                    تبریک! مرورهای امروز این دسته (Deck) به پایان رسید!
                  </h3>
                  <p className="text-xs text-slate-300 max-w-lg mx-auto leading-relaxed">
                    دقیقاً مطابق استاندارد <strong>AnkiDroid</strong>، کارت‌هایی که امروز پاسخ دادید بر اساس ضریب تسلط شما به{' '}
                    <span className="text-emerald-300 font-bold">فردا (1d)</span>،{' '}
                    <span className="text-sky-300 font-bold">۴ روز دیگر (4d)</span> یا{' '}
                    <span className="text-violet-300 font-bold">۱۰+ روز آینده</span> منتقل شدند و دیگر بی‌مورد در همین جلسه جلوی چشمتان تکرار نمی‌شوند.
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-xs">
                    <div className="px-4 py-2 rounded-xl bg-[#121521] border border-white/10 text-slate-300">
                      کارت‌های زمان‌بندی‌شده برای روزهای آینده:{' '}
                      <strong className="text-emerald-400 font-mono">
                        {toPersianDigits(ankiCounts.scheduledFutureCount)} کارت
                      </strong>
                    </div>
                    {ankiCounts.nextDueTimestampMs && (
                      <div className="px-4 py-2 rounded-xl bg-[#121521] border border-white/10 text-slate-300">
                        نزدیک‌ترین مرور بعدی:{' '}
                        <strong className="text-sky-300">
                          {Math.max(
                            1,
                            Math.round((ankiCounts.nextDueTimestampMs - now) / (60 * 60 * 1000))
                          )}{' '}
                          ساعت دیگر
                        </strong>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                    <button
                      type="button"
                      data-testid="anki-custom-study-ahead-btn"
                      onClick={() => {
                        setCustomStudyAhead(true);
                        setPumpIndex(0);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-extrabold shadow-lg"
                    >
                      ⚡ مطالعه سفارشی / مرور زودتر از موعد (Custom Study Ahead)
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeSubView('saved')}
                      className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-bold"
                    >
                      📚 مدیریت و افزودن کارت جدید
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right (4 Cols): Anki SM-2 Deck Breakdown & Activity Heatmap */}
            <div className="lg:col-span-4 bg-[#121521] border border-white/10 rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-bold text-white">Anki SM-2 Deck Status</h3>
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-[11px] font-bold">
                    SM-2 Algorithm
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-3" dir="rtl">
                  سیستم فاصله‌گذاری هوشمند آنکی: هر بار که گزینه Good یا Easy را می‌زنید، فاصله مرور در ضریب آسانی (Ease Factor) ضرب می‌شود.
                </p>

                <div className="space-y-2 text-xs mb-4" dir="rtl">
                  <div className="p-2.5 rounded-xl bg-[#0B0D14] border border-white/10 flex items-center justify-between">
                    <span className="text-sky-300 font-bold">🟦 کارت‌های جدید (New)</span>
                    <span className="font-mono text-white">{toPersianDigits(ankiCounts.newCount)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#0B0D14] border border-white/10 flex items-center justify-between">
                    <span className="text-rose-300 font-bold">🟥 در حال یادگیری (Learning &lt; 1d)</span>
                    <span className="font-mono text-white">{toPersianDigits(ankiCounts.learningCount)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#0B0D14] border border-white/10 flex items-center justify-between">
                    <span className="text-emerald-300 font-bold">🟩 سررسید مرور امروز (Review Due)</span>
                    <span className="font-mono text-white">{toPersianDigits(ankiCounts.reviewDueCount)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#0B0D14] border border-white/10 flex items-center justify-between">
                    <span className="text-violet-300 font-bold">🗓 زمان‌بندی‌شده برای روزهای آینده</span>
                    <span className="font-mono text-white">
                      {toPersianDigits(ankiCounts.scheduledFutureCount)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-14 gap-1.5 p-3 bg-[#0B0D14] rounded-xl border border-white/10">
                  {Array.from({ length: 56 }).map((_, idx) => {
                    const intensity = (idx * 7 + todayReviewedCount) % 5;
                    const bgClass =
                      idx === 55
                        ? 'bg-emerald-400'
                        : intensity === 0
                          ? 'bg-slate-800/80'
                          : intensity === 1
                            ? 'bg-violet-950'
                            : intensity === 2
                              ? 'bg-violet-600/70'
                              : 'bg-emerald-500/90';
                    return (
                      <div
                        key={idx}
                        className={`aspect-square rounded-[3px] ${bgClass}`}
                        title={`Day ${idx + 1}: ${intensity * 4} reviews`}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-[#0B0D14] border border-white/10">
                  <span className="text-slate-400 block text-[10px]">Today Done</span>
                  <strong className="text-emerald-400 text-sm">{todayReviewedCount}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0B0D14] border border-white/10">
                  <span className="text-slate-400 block text-[10px]">Mature (21d+)</span>
                  <strong className="text-violet-400 text-sm">{pipeline.learnedCount}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0B0D14] border border-white/10">
                  <span className="text-slate-400 block text-[10px]">Saved Lines</span>
                  <strong className="text-sky-400 text-sm">{savedSentences.length}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom: 3-Stage Retention Pipeline Filter */}
          <div className="max-w-3xl mx-auto flex flex-col items-center space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
              <button
                type="button"
                onClick={() => setSelectedStageFilter('all')}
                className={`text-left p-3.5 rounded-xl bg-[#121521] border transition-all ${
                  selectedStageFilter === 'all'
                    ? 'border-emerald-400 ring-2 ring-emerald-500/25'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-bold text-white">
                    همه کارت‌های موعد امروز ({ankiCounts.totalDueToday})
                  </h4>
                  <span className="text-[10px] font-mono text-emerald-300">Anki Due</span>
                </div>
                <p className="text-[11px] text-slate-400" dir="rtl">
                  فقط کارت‌هایی که زمان مرورشان فرا رسیده است.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStageFilter('marked')}
                className={`text-left p-3.5 rounded-xl bg-[#121521] border transition-all ${
                  selectedStageFilter === 'marked'
                    ? 'border-amber-400 ring-2 ring-amber-500/25'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-bold text-white">
                    New &amp; Relearning ({pipeline.markedCount})
                  </h4>
                  <span className="text-[10px] font-mono text-amber-300">Step 1</span>
                </div>
                <p className="text-[11px] text-slate-400" dir="rtl">
                  واژه‌های جدید یا نیازمند تکرار فوری (&lt; 10m).
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStageFilter('learning_now')}
                className={`text-left p-3.5 rounded-xl bg-[#121521] border transition-all ${
                  selectedStageFilter === 'learning_now'
                    ? 'border-violet-400 ring-2 ring-violet-500/25'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-bold text-white">
                    Graduated Review ({pipeline.learningNowCount})
                  </h4>
                  <span className="text-[10px] font-mono text-violet-300">1d → 4d → 10d</span>
                </div>
                <p className="text-[11px] text-slate-400" dir="rtl">
                  کارت‌های وارد شده به چرخه مرور چندروزه آنکی.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 2: SAVED WORDS, PHRASAL VERBS & BACK-OF-CARD EDITOR
         ===================================================================== */}
      {activeSubView === 'saved' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#121521] border border-white/10 p-3 rounded-2xl">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `All Vocabulary (${cards.length})` },
                  { id: 'words', label: `Single Words (${cards.filter((c) => !c.isPhrase).length})` },
                  { id: 'phrases', label: `Phrasal Verbs & Idioms (${cards.filter((c) => c.isPhrase).length})` },
                  { id: 'sentences', label: `Saved Sentences (${savedSentences.length})` },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSavedTabType(t.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    savedTabType === t.id
                      ? 'bg-violet-600 text-white'
                      : 'bg-[#0B0D14] text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی واژه، معنی یا یادداشت پشت کارت..."
                className="bg-[#0B0D14] border border-white/15 rounded-xl px-3 py-1.5 text-slate-100"
              />
              <select
                aria-label="فیلتر وضعیت واژه"
                value={savedStatusFilter}
                onChange={(e) =>
                  setSavedStatusFilter(e.target.value as 'all' | 'learning' | 'known' | 'ignored')
                }
                className="bg-[#0B0D14] border border-white/15 rounded-xl px-2.5 py-1.5 text-slate-200"
              >
                <option value="all">All Statuses</option>
                <option value="learning">📖 Learning (Anki Deck)</option>
                <option value="known">✓ Known (Mastered)</option>
                <option value="ignored">⊘ Ignored</option>
              </select>
              <select
                aria-label="فیلتر رتبه فراوانی"
                value={savedFreqFilter}
                onChange={(e) => setSavedFreqFilter(e.target.value)}
                className="bg-[#0B0D14] border border-white/15 rounded-xl px-2.5 py-1.5 text-slate-200"
              >
                <option value="all">All Frequencies</option>
                <option value="tag 1k">tag 1k (A1)</option>
                <option value="tag 2k">tag 2k (A2)</option>
                <option value="tag 3k">tag 3k (B1)</option>
                <option value="tag 4k">tag 4k (B2)</option>
                <option value="tag 5k">tag 5k (B2+)</option>
                <option value="tag 8k">tag 8k (C1)</option>
              </select>
            </div>
          </div>

          {/* Quick Add Word or Multi-Word Phrasal Verb Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newWordEn.trim() || !newWordFa.trim()) return;
              onAddCard({
                word: newWordEn.trim(),
                isPhrase: /\s+/.test(newWordEn.trim()),
                translationFa: newWordFa.trim(),
                contextSentenceEn: newWordContext.trim() || `Contextual example with ${newWordEn.trim()}.`,
                status: 'learning',
                box: 1,
              });
              setNewWordEn('');
              setNewWordFa('');
              setNewWordContext('');
            }}
            className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-[#121521] border border-white/10 p-3 rounded-2xl text-xs"
          >
            <input
              type="text"
              value={newWordEn}
              onChange={(e) => setNewWordEn(e.target.value)}
              placeholder="واژه یا عبارت انگلیسی (روی کارت)..."
              className="bg-[#0B0D14] border border-white/15 rounded-xl px-3 py-2 text-white"
            />
            <input
              type="text"
              dir="rtl"
              value={newWordFa}
              onChange={(e) => setNewWordFa(e.target.value)}
              placeholder="معنی فارسی (پشت کارت)..."
              className="bg-[#0B0D14] border border-white/15 rounded-xl px-3 py-2 text-white"
            />
            <input
              type="text"
              value={newWordContext}
              onChange={(e) => setNewWordContext(e.target.value)}
              placeholder="جمله نمونه یا یادداشت (اختیاری)..."
              className="bg-[#0B0D14] border border-white/15 rounded-xl px-3 py-2 text-white"
            />
            <button
              type="submit"
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-xl px-4 py-2"
            >
              + افزودن کارت جدید به Anki
            </button>
          </form>

          {/* Data Table with Inline Back-of-Card Editor */}
          <div className="bg-[#121521] border border-white/10 rounded-2xl overflow-hidden">
            {savedTabType === 'sentences' ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0B0D14] text-slate-400 border-b border-white/10">
                    <th className="p-3">Time</th>
                    <th className="p-3">English Sentence</th>
                    <th className="p-3 text-right">Persian Translation</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {savedSentences.map((s) => (
                    <tr key={s.id} className="hover:bg-white/5">
                      <td className="p-3 font-mono text-violet-300">
                        {formatTimestamp(s.timestampSec)}
                      </td>
                      <td className="p-3 font-semibold text-white">{s.sentenceEn}</td>
                      <td className="p-3 text-amber-300 text-right" dir="rtl">
                        {s.sentenceFa}
                      </td>
                      <td className="p-3 text-slate-400">{s.videoTitle}</td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => onDeleteSentence(s.id)}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0B0D14] text-slate-400 border-b border-white/10">
                    <th className="p-3">Status</th>
                    <th className="p-3">Word / Phrasal Verb</th>
                    <th className="p-3 text-right">Back of Card: Translation &amp; Notes (FA)</th>
                    <th className="p-3">Anki Schedule</th>
                    <th className="p-3">Context Sentence</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredSavedCards.map((c) => {
                    const isDueNow = (c.nextReviewAt || 0) <= now;
                    const daysLeft = Math.max(
                      1,
                      Math.round(((c.nextReviewAt || now) - now) / DAY_MS)
                    );
                    const isRowEditing = editingSavedRowId === c.id;

                    return (
                      <tr key={c.id} className="hover:bg-white/5">
                        <td className="p-3">
                          <select
                            aria-label={`وضعیت ${c.word}`}
                            value={c.status || 'learning'}
                            onChange={(e) =>
                              onUpdateCardStatus(
                                c.id,
                                e.target.value as 'learning' | 'known' | 'ignored'
                              )
                            }
                            className="bg-[#0B0D14] border border-white/15 rounded-lg px-2 py-1 text-slate-200"
                          >
                            <option value="learning">📖 Active</option>
                            <option value="known">✓ Known</option>
                            <option value="ignored">⊘ Ignore</option>
                          </select>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => speakText(c.word)}
                              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300"
                            >
                              🔊
                            </button>
                            <strong className="text-white text-sm">{c.word}</strong>
                            {c.isPhrase && (
                              <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[10px] font-bold">
                                PHRASE
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right" dir="rtl">
                          {isRowEditing ? (
                            <div className="space-y-1.5">
                              <input
                                type="text"
                                value={savedRowTranslationFa}
                                onChange={(e) => setSavedRowTranslationFa(e.target.value)}
                                className="w-full bg-[#0B0D14] border border-amber-500/40 rounded px-2.5 py-1 text-white font-bold"
                                placeholder="معنی فارسی پشت کارت..."
                              />
                              <input
                                type="text"
                                value={savedRowNotesFa}
                                onChange={(e) => setSavedRowNotesFa(e.target.value)}
                                className="w-full bg-[#0B0D14] border border-white/15 rounded px-2.5 py-1 text-amber-200 text-[11px]"
                                placeholder="یادداشت شخصی پشت کارت..."
                              />
                              <div className="flex gap-1.5 justify-start">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onUpdateCardBack(c.id, {
                                      translationFa: savedRowTranslationFa,
                                      customNotesFa: savedRowNotesFa,
                                    });
                                    setEditingSavedRowId(null);
                                  }}
                                  className="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold text-[11px]"
                                >
                                  ذخیره
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingSavedRowId(null)}
                                  className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-[11px]"
                                >
                                  لغو
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-amber-300 font-bold">{c.translationFa}</div>
                              {c.customNotesFa && (
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  📝 {c.customNotesFa}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-mono text-[11px]">
                          {isDueNow ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                              Due Now (امروز)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300">
                              In {daysLeft}d ({toPersianDigits(daysLeft)} روز دیگر)
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-300 max-w-sm truncate">{c.contextSentenceEn}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSavedRowId(c.id);
                                setSavedRowTranslationFa(c.translationFa);
                                setSavedRowNotesFa(c.customNotesFa || '');
                              }}
                              className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 font-bold"
                              title="ویرایش پشت کارت"
                            >
                              ✏️ ویرایش
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteCard(c.id)}
                              className="px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-300"
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 3: SHADOWING & ACTIVE RECALL DRILLS
         ===================================================================== */}
      {activeSubView === 'drills' && (
        <div className="bg-[#121521] border border-white/10 rounded-2xl p-6 max-w-3xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-white">
                🎙 Shadowing &amp; Contextual Phrasal Verb Recall Lab
              </h2>
              <p className="text-xs text-slate-400 mt-0.5" dir="rtl">
                تمرین مکالمه، شادوئینگ صوتی و بازخوانی فعال افعال عبارتی و جملات ویدیو
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 text-xs font-mono">
              Drill #{(drillIndex % Math.max(1, cards.length)) + 1} / {cards.length}
            </span>
          </div>

          {cards.length > 0 && (
            <div className="bg-[#0B0D14] border border-white/10 rounded-xl p-5 space-y-4">
              {(() => {
                const drillCard = cards[drillIndex % cards.length];
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400">
                        Target {drillCard.isPhrase ? 'Phrasal Verb / Idiom' : 'Word'}: {drillCard.cefr || 'B1'}
                      </span>
                      <button
                        type="button"
                        onClick={() => speakText(drillCard.contextSentenceEn || drillCard.word)}
                        className="px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold"
                      >
                        🔊 Shadow Native Sentence
                      </button>
                    </div>

                    <div dir="rtl" className="text-base font-bold text-amber-300">
                      معنی جمله: «{drillCard.contextSentenceFa || drillCard.translationFa}»
                    </div>

                    <div className="text-sm text-slate-200">
                      جمله انگلیسی:{' '}
                      <span className="font-mono text-white">
                        {(drillCard.contextSentenceEn || drillCard.word).replace(
                          new RegExp(drillCard.word, 'gi'),
                          ' [ _____ ] '
                        )}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={drillInput}
                        onChange={(e) => {
                          setDrillInput(e.target.value);
                          setDrillFeedback('idle');
                        }}
                        placeholder={`Type the missing English expression (${drillCard.word.length} chars)...`}
                        className="flex-1 bg-[#121521] border border-white/15 rounded-lg px-3 py-2 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const ok =
                            normalizeForQuizComparison(drillInput) ===
                            normalizeForQuizComparison(drillCard.word);
                          setDrillFeedback(ok ? 'correct' : 'wrong');
                          if (ok) speakText(drillCard.contextSentenceEn || drillCard.word);
                        }}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                      >
                        Check Answer
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrillInput('');
                          setDrillFeedback('idle');
                          setDrillIndex((i) => i + 1);
                        }}
                        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                      >
                        Next →
                      </button>
                    </div>

                    {drillFeedback !== 'idle' && (
                      <div
                        className={`p-3 rounded-lg text-xs font-bold ${
                          drillFeedback === 'correct'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {drillFeedback === 'correct'
                          ? `✓ عالی! عبارت صحیح: "${drillCard.word}" — ${drillCard.contextSentenceEn}`
                          : `پاسخ صحیح: "${drillCard.word}"`}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 4: COMPLETE LANGUAGE REACTOR + TRANCY SETTINGS
         ===================================================================== */}
      {activeSubView === 'settings' && (
        <div
          data-testid="lr-full-settings-view"
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-[#121521] border border-white/10 rounded-2xl p-6 text-xs"
        >
          {/* Left Column: LANGUAGE REACTOR & TRANCY SUBTITLE SETTINGS */}
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-violet-300 mb-3">
                SUBTITLE &amp; TRANCY KARAOKE SETTINGS
              </h3>
              <div className="space-y-3 bg-[#0B0D14] p-4 rounded-xl border border-white/10">
                <label className="flex items-center justify-between">
                  <span className="text-slate-200 font-semibold">
                    Word-by-Word Speaker Highlighting (برجسته‌سازی کلمه به کلمه Trancy)
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.wordByWordHighlight}
                    onChange={(e) => onUpdateSettings({ wordByWordHighlight: e.target.checked })}
                  />
                </label>

                <label className="flex items-center justify-between">
                  <span className="text-slate-200 font-semibold">
                    Hover Hold Auto-Pause at End of Current Cue (مکث دقیق در پایان خط فعلی هنگام هاور)
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.hoverPauseAtCueEnd}
                    onChange={(e) => onUpdateSettings({ hoverPauseAtCueEnd: e.target.checked })}
                  />
                </label>

                <label className="flex items-center justify-between">
                  <span className="text-slate-200">
                    Subtitle background opacity ({settings.subtitleBgOpacity}%)
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.subtitleBgOpacity}
                    onChange={(e) => onUpdateSettings({ subtitleBgOpacity: Number(e.target.value) })}
                  />
                </label>

                <label className="flex items-center justify-between">
                  <span className="text-slate-200">Right click action</span>
                  <select
                    value={settings.rightClickAction}
                    onChange={(e) =>
                      onUpdateSettings({
                        rightClickAction: e.target.value as LanguageReactorSettings['rightClickAction'],
                      })
                    }
                    className="bg-[#121521] border border-white/15 rounded px-2.5 py-1 text-slate-100"
                  >
                    <option value="toggle_known_learning">Toggle known / learning</option>
                    <option value="save_known">Mark as Known</option>
                    <option value="save_learning">Mark as Learning</option>
                    <option value="none">Disabled</option>
                  </select>
                </label>

                <label className="flex items-center justify-between">
                  <span className="text-slate-200">Show machine translation (Persian)</span>
                  <input
                    type="checkbox"
                    checked={settings.showMachineTranslation}
                    onChange={(e) => onUpdateSettings({ showMachineTranslation: e.target.checked })}
                  />
                </label>

                <label className="flex items-center justify-between">
                  <span className="text-slate-200">Show mini dictionary on hover (#1b6b85 popup)</span>
                  <input
                    type="checkbox"
                    checked={settings.showMiniDictionary}
                    onChange={(e) => onUpdateSettings({ showMiniDictionary: e.target.checked })}
                  />
                </label>

                <label className="flex items-center justify-between">
                  <span className="text-slate-200">
                    Hide YouTube playback bar (only show when mouse enters bottom bar)
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.hidePlaybackBar}
                    onChange={(e) => onUpdateSettings({ hidePlaybackBar: e.target.checked })}
                  />
                </label>

                <label className="flex items-center justify-between">
                  <span className="text-slate-200">Auto-speak word on click (TTS)</span>
                  <input
                    type="checkbox"
                    checked={settings.speakWordOnClick}
                    onChange={(e) => onUpdateSettings({ speakWordOnClick: e.target.checked })}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Right Column: VOCABULARY HIGHLIGHTING + WORD COLORS + EXAMPLE TEXT PREVIEW */}
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-violet-300 mb-3">
                VOCABULARY LEVEL &amp; WORD HUNTING COLORS
              </h3>
              <div className="space-y-4 bg-[#0B0D14] p-4 rounded-xl border border-white/10">
                <label className="flex items-center justify-between">
                  <span className="text-slate-200">Set vocabulary level (Local CEFR Rank)</span>
                  <select
                    value={settings.vocabLevel}
                    onChange={(e) => onUpdateSettings({ vocabLevel: Number(e.target.value) })}
                    className="bg-[#121521] border border-white/15 rounded px-2.5 py-1 text-slate-100"
                  >
                    <option value={1000}>A1 Beginner (1,000 words)</option>
                    <option value={2500}>B1 Intermediate (2,500 words)</option>
                    <option value={4500}>B2 Upper-Intermediate (4,500 words)</option>
                    <option value={7000}>C1 Advanced (7,000 words)</option>
                  </select>
                </label>

                <label className="flex items-center justify-between">
                  <span className="text-slate-200">Vocabulary highlighting style</span>
                  <select
                    value={settings.vocabularyHighlighting}
                    onChange={(e) =>
                      onUpdateSettings({
                        vocabularyHighlighting: e.target
                          .value as LanguageReactorSettings['vocabularyHighlighting'],
                      })
                    }
                    className="bg-[#121521] border border-white/15 rounded px-2.5 py-1 text-slate-100"
                  >
                    <option value="Disabled">Disabled (Clean White)</option>
                    <option value="Underline">Underline</option>
                    <option value="Text">Text</option>
                    <option value="Background">Background</option>
                    <option value="Blur">Blur</option>
                  </select>
                </label>

                <label className="flex items-center justify-between">
                  <span className="text-slate-200">Word Hunting Color Preset</span>
                  <select
                    value={settings.wordColorPreset}
                    onChange={(e) => {
                      const key = e.target.value as 'default-lr' | 'kevin-hunting';
                      if (WORD_COLOR_PRESETS[key]) {
                        onUpdateSettings({
                          wordColorPreset: key,
                          wordColors: { ...WORD_COLOR_PRESETS[key].colors },
                        });
                      }
                    }}
                    className="bg-[#121521] border border-white/15 rounded px-2.5 py-1 text-slate-100"
                  >
                    <option value="default-lr">Default LR (Green / Orange / Purple)</option>
                    <option value="kevin-hunting">
                      Kevin&apos;s Word Hunting (Green / Red / Blackout)
                    </option>
                  </select>
                </label>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-1">
                  {(
                    [
                      { key: 'known', label: 'Known' },
                      { key: 'suggested', label: 'Suggested' },
                      { key: 'learning', label: 'Learn' },
                      { key: 'ignored', label: "Don't learn" },
                      { key: 'special', label: 'Special' },
                    ] as const
                  ).map((item) => (
                    <label
                      key={item.key}
                      className="flex flex-col items-center gap-1 p-2 rounded-lg bg-[#121521] border border-white/10"
                    >
                      <span className="text-[10px] text-slate-300">{item.label}</span>
                      <input
                        type="color"
                        value={settings.wordColors[item.key]}
                        onChange={(e) =>
                          onUpdateSettings({
                            wordColorPreset: 'custom',
                            wordColors: {
                              ...settings.wordColors,
                              [item.key]: e.target.value,
                            },
                          })
                        }
                        className="w-8 h-6 rounded cursor-pointer bg-transparent border-0"
                      />
                    </label>
                  ))}
                </div>

                {/* Live EXAMPLE TEXT Preview */}
                <div className="p-3.5 rounded-xl bg-[#121521] border border-white/10 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    EXAMPLE TEXT:
                  </div>
                  <p className="text-sm leading-relaxed text-white">
                    <span
                      style={{
                        backgroundColor: `${settings.wordColors.known}38`,
                        borderBottom: `2px solid ${settings.wordColors.known}`,
                      }}
                      className="px-1.5 py-0.5 rounded mx-0.5"
                    >
                      The first night I went to sleep
                    </span>{' '}
                    on the{' '}
                    <span
                      style={{
                        backgroundColor: `${settings.wordColors.suggested}38`,
                        borderBottom: `2px solid ${settings.wordColors.suggested}`,
                      }}
                      className="px-1.5 py-0.5 rounded mx-0.5"
                    >
                      sand
                    </span>
                    , a thousand miles from any{' '}
                    <span
                      style={{
                        backgroundColor: `${settings.wordColors.learning}38`,
                        borderBottom: `2px solid ${settings.wordColors.learning}`,
                      }}
                      className="px-1.5 py-0.5 rounded mx-0.5"
                    >
                      inhabited
                    </span>{' '}
                    country.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
