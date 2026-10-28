import React, { useState, useMemo, useEffect } from 'react';
import {
  LeitnerCard,
  AnkiGrade,
  buildDuoPracticeLesson,
  gradeDuoWordBankAnswer,
  toPersianDigits,
} from '../utils/linguatubeLogic';

interface DuoPracticeViewProps {
  cards: LeitnerCard[];
  onGradeCard: (cardId: string, grade: AnkiGrade) => void;
  onEarnXp: (xpDelta: number) => void;
  onExit: () => void;
}

interface AiCoachResponse {
  mnemonicFa: string;
  usageTipFa: string;
  miniExampleEn: string;
  miniExampleFa: string;
}

export const DuoPracticeView: React.FC<DuoPracticeViewProps> = ({
  cards,
  onGradeCard,
  onEarnXp,
  onExit,
}) => {
  const questions = useMemo(() => buildDuoPracticeLesson(cards), [cards]);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [hearts, setHearts] = useState<number>(5);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [totalAnswered, setTotalAnswered] = useState<number>(0);
  const [lessonFinished, setLessonFinished] = useState<boolean>(false);

  // Match Pairs State
  const [selectedEnId, setSelectedEnId] = useState<string | null>(null);
  const [selectedFaId, setSelectedFaId] = useState<string | null>(null);
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([]);
  const [wrongPairFlash, setWrongPairFlash] = useState<boolean>(false);

  // Multiple Choice State
  const [selectedOptionIdx, setSelectedOptionIdx] = useState<number | null>(null);

  // Word Bank State
  const [pickedBankIndices, setPickedBankIndices] = useState<number[]>([]);

  // Bottom Sheet Feedback State
  const [sheetState, setSheetState] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [sheetMessageFa, setSheetMessageFa] = useState<string>('');

  // Gemini AI Coach State
  const [aiCoachLoading, setAiCoachLoading] = useState<boolean>(false);
  const [aiCoachData, setAiCoachData] = useState<AiCoachResponse | null>(null);

  const currentQuestion = questions[currentIdx] || questions[0];
  const progressPercent = lessonFinished
    ? 100
    : Math.round((currentIdx / Math.max(1, questions.length)) * 100);

  const resetQuestionState = () => {
    setSelectedEnId(null);
    setSelectedFaId(null);
    setMatchedPairIds([]);
    setWrongPairFlash(false);
    setSelectedOptionIdx(null);
    setPickedBankIndices([]);
    setSheetState('idle');
    setSheetMessageFa('');
    setAiCoachData(null);
  };

  const speakEnglish = (text: string) => {
    try {
      if ('speechSynthesis' in window && text) {
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

  // Handle Match Pairs Selection
  useEffect(() => {
    if (!selectedEnId || !selectedFaId) return;
    if (selectedEnId === selectedFaId) {
      const nextMatched = [...matchedPairIds, selectedEnId];
      setMatchedPairIds(nextMatched);
      setSelectedEnId(null);
      setSelectedFaId(null);
      const matchedItem = currentQuestion.matchPairs?.find((p) => p.id === selectedEnId);
      if (matchedItem) speakEnglish(matchedItem.wordEn);

      // Automatically trigger correct state if all 5 pairs are matched
      if (
        currentQuestion.matchPairs &&
        nextMatched.length === currentQuestion.matchPairs.length
      ) {
        setSheetState('correct');
        setSheetMessageFa('آفرین! هر ۵ جفت کلمه را بدون نقص پیدا کردید! (Awesome!)');
        setCorrectCount((c) => c + 1);
        setTotalAnswered((t) => t + 1);
        onEarnXp(15);
      }
    } else {
      setWrongPairFlash(true);
      setHearts((h) => Math.max(1, h - 1));
      const timer = setTimeout(() => {
        setSelectedEnId(null);
        setSelectedFaId(null);
        setWrongPairFlash(false);
      }, 550);
      return () => clearTimeout(timer);
    }
  }, [selectedEnId, selectedFaId, matchedPairIds, currentQuestion, onEarnXp]);

  // Keyboard shortcuts 1, 2, 3, 4 and Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lessonFinished) return;
      if (currentQuestion.type === 'multiple_choice' && sheetState === 'idle') {
        if (['1', '2', '3', '4'].includes(e.key)) {
          setSelectedOptionIdx(Number(e.key));
        }
      }
      if (e.key === 'Enter') {
        if (sheetState !== 'idle') {
          handleContinueNext();
        } else if (canClickCheck) {
          handleCheckAnswer();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const canClickCheck = useMemo(() => {
    if (!currentQuestion || sheetState !== 'idle') return false;
    if (currentQuestion.type === 'match_pairs') {
      return (
        Boolean(currentQuestion.matchPairs) &&
        matchedPairIds.length === currentQuestion.matchPairs!.length
      );
    }
    if (currentQuestion.type === 'multiple_choice') {
      return selectedOptionIdx !== null;
    }
    if (currentQuestion.type === 'word_bank') {
      return pickedBankIndices.length > 0;
    }
    return false;
  }, [currentQuestion, sheetState, matchedPairIds.length, selectedOptionIdx, pickedBankIndices.length]);

  const handleCheckAnswer = () => {
    if (!currentQuestion || sheetState !== 'idle') return;

    if (currentQuestion.type === 'multiple_choice') {
      const isRight = selectedOptionIdx === currentQuestion.correctOptionIndex;
      setTotalAnswered((t) => t + 1);
      if (isRight) {
        setSheetState('correct');
        setSheetMessageFa('عالی بود! معنی دقیق کلمه را درست تشخیص دادید! (Awesome!)');
        setCorrectCount((c) => c + 1);
        onGradeCard(currentQuestion.cardId, 'good');
        onEarnXp(10);
        speakEnglish(currentQuestion.targetWordEn);
      } else {
        setSheetState('wrong');
        setSheetMessageFa(`پاسخ صحیح: «${currentQuestion.targetMeaningFa}»`);
        setHearts((h) => Math.max(1, h - 1));
        onGradeCard(currentQuestion.cardId, 'again');
      }
    } else if (currentQuestion.type === 'word_bank') {
      const bank = currentQuestion.bankTokens || [];
      const target = currentQuestion.targetTokens || [];
      const userTokens = pickedBankIndices.map((i) => bank[i]);
      const isRight = gradeDuoWordBankAnswer(userTokens, target);
      setTotalAnswered((t) => t + 1);
      if (isRight) {
        setSheetState('correct');
        setSheetMessageFa('فوق‌العاده! ساختار جمله را کاملاً درست چیدید! (Perfect!)');
        setCorrectCount((c) => c + 1);
        onGradeCard(currentQuestion.cardId, 'good');
        onEarnXp(15);
        speakEnglish(target.join(' '));
      } else {
        setSheetState('wrong');
        setSheetMessageFa(`جمله صحیح: "${target.join(' ')}"`);
        setHearts((h) => Math.max(1, h - 1));
      }
    }
  };

  const handleContinueNext = () => {
    if (currentIdx + 1 >= questions.length) {
      setLessonFinished(true);
      onEarnXp(20);
    } else {
      setCurrentIdx((idx) => idx + 1);
      resetQuestionState();
    }
  };

  const handleRestartLesson = () => {
    setCurrentIdx(0);
    setHearts(5);
    setCorrectCount(0);
    setTotalAnswered(0);
    setLessonFinished(false);
    resetQuestionState();
  };

  const handleAskGeminiCoach = async () => {
    if (!currentQuestion || aiCoachLoading) return;
    setAiCoachLoading(true);
    try {
      const res = await fetch('/api/gemini/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: currentQuestion.targetWordEn,
          translationFa: currentQuestion.targetMeaningFa,
          contextSentenceEn: currentQuestion.contextSentenceEn,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.mnemonicFa) {
          setAiCoachData(data);
          setAiCoachLoading(false);
          return;
        }
      }
    } catch {
      // fallback below
    }
    setAiCoachData({
      mnemonicFa: `تصور کنید عبارت «${currentQuestion.targetWordEn}» کلید اصلی درک جمله «${currentQuestion.contextSentenceFa}» است.`,
      usageTipFa: `در مکالمات روزمره و ویدیوهای یوتیوب، «${currentQuestion.targetWordEn}» به معنی «${currentQuestion.targetMeaningFa}» بسیار پرکاربرد است.`,
      miniExampleEn: currentQuestion.contextSentenceEn,
      miniExampleFa: currentQuestion.contextSentenceFa,
    });
    setAiCoachLoading(false);
  };

  // LESSON COMPLETED CELEBRATION SCREEN
  if (lessonFinished) {
    const accuracy =
      totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 100;
    const earnedXp = correctCount * 15 + 20;

    return (
      <div
        data-testid="duo-lesson-complete-screen"
        className="max-w-2xl mx-auto py-8 px-4 space-y-8 text-center"
        dir="rtl"
      >
        <div className="duo-card p-8 space-y-6">
          <div className="w-24 h-24 mx-auto rounded-3xl bg-[#FFC800] border-2 border-b-4 border-[#E5B400] flex items-center justify-center text-5xl">
            🏆
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-black text-[#58CC02]">
              تمرین دولینگویی با موفقیت کامل شد!
            </h2>
            <p className="text-sm font-bold duo-text-muted">
              لغات ذخیره‌شده شما در جعبه لایتنر و الگوریتم AnkiDroid به‌روزرسانی شدند.
            </p>
          </div>

          {/* 3 Duolingo Stat Boxes (XP, Accuracy, Hearts) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="rounded-2xl border-2 border-b-4 border-[#E5B400] bg-[#FFC800] p-4 text-[#3C3C3C]">
              <div className="text-xs font-extrabold uppercase">امتیاز دریافتی (XP)</div>
              <div className="text-2xl font-black mt-1" dir="ltr">
                ⚡ +{earnedXp} XP
              </div>
            </div>

            <div className="rounded-2xl border-2 border-b-4 border-[#58A700] bg-[#58CC02] p-4 text-white">
              <div className="text-xs font-extrabold uppercase">درصد دقت (Accuracy)</div>
              <div className="text-2xl font-black mt-1">
                🎯 %{toPersianDigits(accuracy)}
              </div>
            </div>

            <div className="rounded-2xl border-2 border-b-4 border-[#EA2B2B] bg-[#FF4B4B] p-4 text-white">
              <div className="text-xs font-extrabold uppercase">قلب‌های باقی‌مانده</div>
              <div className="text-2xl font-black mt-1" dir="ltr">
                ❤️ {hearts} / 5
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              type="button"
              data-testid="duo-restart-btn"
              onClick={handleRestartLesson}
              className="duo-btn duo-btn-green px-8 py-3.5 text-base"
            >
              🔄 شروع یک تمرین دیگر
            </button>
            <button
              type="button"
              onClick={onExit}
              className="duo-btn duo-btn-blue px-6 py-3.5 text-base"
            >
              بازگشت به داشبورد
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="duo-practice-view"
      className="max-w-3xl mx-auto space-y-6 pb-8"
      dir="rtl"
    >
      {/* 1. DUOLINGO TOP LESSON BAR: Close (✕) + Glossy Green Progress Bar + Hearts (❤️ 5) */}
      <div className="duo-card p-4 flex items-center gap-4">
        <button
          type="button"
          onClick={onExit}
          title="خروج از تمرین"
          className="duo-btn duo-btn-neutral w-10 h-10 text-lg font-black shrink-0"
        >
          ✕
        </button>

        {/* Signature Duolingo Chunky Progress Bar with Top Gloss Highlight */}
        <div
          className="flex-1 h-4 rounded-full overflow-hidden relative"
          style={{ backgroundColor: 'var(--duo-border)' }}
        >
          <div
            data-testid="duo-progress-bar-fill"
            className="h-full bg-[#58CC02] rounded-full transition-all duration-300 relative"
            style={{ width: `${Math.max(12, progressPercent)}%` }}
          >
            <div className="bg-white/30 h-1 rounded-full mx-2 mt-1" />
          </div>
        </div>

        {/* Hearts Counter */}
        <div
          data-testid="duo-hearts-badge"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border-2 border-b-4 border-[#EA2B2B] bg-[#FF4B4B] text-white font-black text-sm shrink-0"
          dir="ltr"
        >
          <span>❤️</span>
          <span>{hearts}</span>
        </div>
      </div>

      {/* 2. QUESTION STAGE CARD */}
      <div className="duo-card p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-xl bg-[#CE82FF] border-b-2 border-[#A568CC] text-white text-xs font-extrabold">
              سوال {toPersianDigits(currentIdx + 1)} از {toPersianDigits(questions.length)}
            </span>
            <h2 className="text-lg sm:text-xl font-black">
              {currentQuestion.type === 'match_pairs' &&
                'کلمات انگلیسی را با معنی فارسی درست جفت کنید!'}
              {currentQuestion.type === 'multiple_choice' &&
                'معنی درست این کلمه در دیالوگ زیر کدام است؟'}
              {currentQuestion.type === 'word_bank' &&
                (currentQuestion.promptTitleFa ||
                  'با کلیک روی بلوک‌های کلمات، جمله را بسازید:')}
            </h2>
          </div>

          {/* Gemini AI Coach Button */}
          <button
            type="button"
            data-testid="duo-gemini-coach-btn"
            onClick={handleAskGeminiCoach}
            disabled={aiCoachLoading}
            className="duo-btn duo-btn-purple px-3.5 py-2 text-xs"
          >
            <span>✨</span>
            <span>
              {aiCoachLoading ? 'در حال دریافت نکته Gemini...' : 'راهنمای هوشمند Gemini'}
            </span>
          </button>
        </div>

        {/* Gemini AI Coach Box (when requested) */}
        {aiCoachData && (
          <div
            data-testid="duo-gemini-coach-box"
            className="duo-card-subtle p-4 space-y-2 border-[#A568CC]"
          >
            <div className="text-xs font-black text-[#CE82FF]">
              ✨ نکته یادگیری هوشمند Gemini برای «{currentQuestion.targetWordEn}»:
            </div>
            <p className="text-xs font-bold leading-relaxed">{aiCoachData.mnemonicFa}</p>
            <p className="text-xs duo-text-muted leading-relaxed">{aiCoachData.usageTipFa}</p>
            <div className="pt-1 text-xs font-bold text-[#1CB0F6]" dir="ltr">
              🗣 {aiCoachData.miniExampleEn}
            </div>
          </div>
        )}

        {/* QUESTION TYPE 1: MATCH PAIRS (5 EN + 5 FA Tactile 3D Tiles) */}
        {currentQuestion.type === 'match_pairs' && currentQuestion.matchPairs && (
          <div
            data-testid="duo-question-match-pairs"
            className="grid grid-cols-2 gap-4 pt-2"
          >
            {/* English Column */}
            <div className="space-y-3" dir="ltr">
              <div className="text-xs font-extrabold uppercase duo-text-muted text-center">
                English Words
              </div>
              {currentQuestion.matchPairs.map((pair) => {
                const isMatched = matchedPairIds.includes(pair.id);
                const isSelected = selectedEnId === pair.id;
                const isWrong = isSelected && wrongPairFlash;
                return (
                  <button
                    key={pair.id}
                    type="button"
                    disabled={isMatched}
                    data-testid={`duo-match-en-${pair.id}`}
                    onClick={() => {
                      speakEnglish(pair.wordEn);
                      setSelectedEnId(pair.id);
                    }}
                    className={`w-full py-3.5 px-4 text-sm sm:text-base font-black duo-chip flex items-center justify-between ${
                      isMatched
                        ? 'is-matched'
                        : isWrong
                          ? 'is-wrong'
                          : isSelected
                            ? 'is-selected'
                            : ''
                    }`}
                  >
                    <span>{pair.wordEn}</span>
                    <span className="text-xs opacity-75">{isMatched ? '✓' : '🔊'}</span>
                  </button>
                );
              })}
            </div>

            {/* Persian Column */}
            <div className="space-y-3" dir="rtl">
              <div className="text-xs font-extrabold duo-text-muted text-center">
                معنی فارسی
              </div>
              {(currentQuestion.shuffledMeaningsFa || []).map((item) => {
                const isMatched = matchedPairIds.includes(item.id);
                const isSelected = selectedFaId === item.id;
                const isWrong = isSelected && wrongPairFlash;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isMatched}
                    data-testid={`duo-match-fa-${item.id}`}
                    onClick={() => setSelectedFaId(item.id)}
                    className={`w-full py-3.5 px-4 text-sm sm:text-base font-black duo-chip flex items-center justify-between ${
                      isMatched
                        ? 'is-matched'
                        : isWrong
                          ? 'is-wrong'
                          : isSelected
                            ? 'is-selected'
                            : ''
                    }`}
                  >
                    <span>{item.meaningFa}</span>
                    <span className="text-xs opacity-75">{isMatched ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* QUESTION TYPE 2: SMART MULTIPLE CHOICE WITH DUOLINGO SPEECH BUBBLE */}
        {currentQuestion.type === 'multiple_choice' && (
          <div data-testid="duo-question-multiple-choice" className="space-y-6">
            {/* Character + Speech Bubble Row */}
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() => speakEnglish(currentQuestion.targetWordEn)}
                className="duo-btn duo-btn-blue w-14 h-14 text-2xl shrink-0"
                title="تلفظ صوتی"
              >
                🔊
              </button>

              <div className="duo-card-subtle p-4 flex-1 space-y-2" dir="ltr">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-2xl font-black text-[#1CB0F6]">
                    {currentQuestion.targetWordEn}
                  </span>
                  <span className="text-xs font-mono duo-text-muted">
                    {currentQuestion.targetPhonetic}
                  </span>
                </div>
                <p className="text-sm font-bold leading-relaxed">
                  &ldquo;{currentQuestion.contextSentenceEn}&rdquo;
                </p>
              </div>
            </div>

            {/* 4 Numbered Tactile Option Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {(currentQuestion.options || []).map((opt) => {
                const isSelected = selectedOptionIdx === opt.index;
                const showCorrectHighlight =
                  sheetState !== 'idle' && opt.index === currentQuestion.correctOptionIndex;
                const showWrongHighlight =
                  sheetState === 'wrong' && isSelected && !opt.isCorrect;

                return (
                  <button
                    key={opt.index}
                    type="button"
                    disabled={sheetState !== 'idle'}
                    data-testid={`duo-mc-option-${opt.index}`}
                    onClick={() => setSelectedOptionIdx(opt.index)}
                    className={`p-4 text-right duo-chip flex items-center justify-between gap-3 ${
                      showCorrectHighlight
                        ? 'is-matched'
                        : showWrongHighlight
                          ? 'is-wrong'
                          : isSelected
                            ? 'is-selected'
                            : ''
                    }`}
                  >
                    <span className="text-sm sm:text-base font-extrabold">{opt.textFa}</span>
                    <span
                      dir="ltr"
                      className="w-7 h-7 rounded-lg border-2 border-current flex items-center justify-center text-xs font-black shrink-0"
                    >
                      {opt.index}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* QUESTION TYPE 3: 3D WORD BANK (SENTENCE / PHRASE BUILDER) */}
        {currentQuestion.type === 'word_bank' && (
          <div data-testid="duo-question-word-bank" className="space-y-6">
            {/* Prompt Speech Bubble */}
            <div className="duo-card-subtle p-4 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-extrabold text-[#FF9600]">
                  معنی جمله / عبارت هدف:
                </div>
                <div className="text-base sm:text-lg font-black">
                  «{currentQuestion.promptSubText}»
                </div>
              </div>
              <button
                type="button"
                onClick={() => speakEnglish((currentQuestion.targetTokens || []).join(' '))}
                className="duo-btn duo-btn-blue px-3.5 py-2.5 text-sm shrink-0"
              >
                🔊 شنیدن جمله
              </button>
            </div>

            {/* Answer Tray (Selected Word Chips) */}
            <div
              dir="ltr"
              className="min-h-[76px] p-4 rounded-2xl border-2 border-dashed duo-border-color flex flex-wrap items-center gap-2.5"
            >
              {pickedBankIndices.length === 0 ? (
                <span className="text-xs font-bold duo-text-muted">
                  روی کلمات پایین کلیک کنید تا جمله اینجا ساخته شود...
                </span>
              ) : (
                pickedBankIndices.map((bankIdx, pos) => {
                  const token = (currentQuestion.bankTokens || [])[bankIdx];
                  return (
                    <button
                      key={`${bankIdx}-${pos}`}
                      type="button"
                      disabled={sheetState !== 'idle'}
                      onClick={() =>
                        setPickedBankIndices((prev) => prev.filter((_, i) => i !== pos))
                      }
                      className="duo-chip is-selected px-3.5 py-2 text-sm font-black"
                    >
                      {token}
                    </button>
                  );
                })
              )}
            </div>

            {/* Available 3D Word Bank Chips */}
            <div dir="ltr" className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              {(currentQuestion.bankTokens || []).map((token, idx) => {
                const isUsed = pickedBankIndices.includes(idx);
                return (
                  <button
                    key={`${token}-${idx}`}
                    type="button"
                    disabled={isUsed || sheetState !== 'idle'}
                    data-testid={`duo-wb-chip-${idx}`}
                    onClick={() => {
                      speakEnglish(token);
                      setPickedBankIndices((prev) => [...prev, idx]);
                    }}
                    className={`duo-chip px-4 py-2.5 text-sm font-black ${
                      isUsed ? 'opacity-30 cursor-default' : ''
                    }`}
                  >
                    {token}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 3. DUOLINGO BOTTOM ACTION BAR / FEEDBACK SHEET */}
      <div
        data-testid="duo-bottom-sheet"
        className="rounded-3xl border-2 border-b-4 p-5 flex flex-wrap items-center justify-between gap-4 transition-all"
        style={
          sheetState === 'correct'
            ? {
                backgroundColor: 'var(--duo-sheet-correct-bg)',
                borderColor: 'var(--duo-sheet-correct-border)',
                color: 'var(--duo-sheet-correct-text)',
              }
            : sheetState === 'wrong'
              ? {
                  backgroundColor: 'var(--duo-sheet-wrong-bg)',
                  borderColor: 'var(--duo-sheet-wrong-border)',
                  color: 'var(--duo-sheet-wrong-text)',
                }
              : {
                  backgroundColor: 'var(--duo-bg-card)',
                  borderColor: 'var(--duo-border)',
                  color: 'var(--duo-text-main)',
                }
        }
      >
        {sheetState === 'idle' ? (
          <>
            <button
              type="button"
              onClick={handleContinueNext}
              className="duo-btn duo-btn-neutral px-5 py-3 text-xs sm:text-sm"
            >
              رد کردن (SKIP)
            </button>

            <button
              type="button"
              data-testid="duo-check-btn"
              disabled={!canClickCheck}
              onClick={handleCheckAnswer}
              className="duo-btn duo-btn-green px-8 py-3 text-sm sm:text-base"
            >
              بررسی پاسخ (CHECK)
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-black text-white shrink-0 ${
                  sheetState === 'correct'
                    ? 'bg-[#58CC02] border-b-4 border-[#58A700]'
                    : 'bg-[#FF4B4B] border-b-4 border-[#EA2B2B]'
                }`}
              >
                {sheetState === 'correct' ? '✓' : '✕'}
              </div>
              <div>
                <div className="text-base sm:text-lg font-black">
                  {sheetState === 'correct' ? 'عالی بود! (Awesome!)' : 'نیاز به مرور بیشتر!'}
                </div>
                <div className="text-xs sm:text-sm font-bold">{sheetMessageFa}</div>
              </div>
            </div>

            <button
              type="button"
              data-testid="duo-continue-btn"
              onClick={handleContinueNext}
              className={`duo-btn px-8 py-3 text-sm sm:text-base ${
                sheetState === 'correct' ? 'duo-btn-green' : 'duo-btn-red'
              }`}
            >
              ادامه (CONTINUE)
            </button>
          </>
        )}
      </div>
    </div>
  );
};
