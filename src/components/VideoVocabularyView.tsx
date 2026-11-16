import React, { useState, useMemo } from 'react';
import {
  LeitnerCard,
  SavedSentence,
  AnkiGrade,
  groupCardsByVideo,
  formatTimestamp,
  toPersianDigits,
} from '../utils/linguatubeLogic';

interface VideoVocabularyViewProps {
  cards: LeitnerCard[];
  savedSentences: SavedSentence[];
  selectedVideoId?: string | null;
  onSelectVideoId?: (videoId: string | null) => void;
  onOpenVideoInStudio: (videoId: string, videoTitle?: string, timestampSec?: number) => void;
  onStartDuoPractice: () => void;
  onGradeCard: (cardId: string, grade: AnkiGrade) => void;
  onUpdateCardStatus: (cardId: string, status: 'learning' | 'known' | 'ignored') => void;
  onUpdateCardBack: (
    cardId: string,
    patch: {
      translationFa?: string;
      customNotesFa?: string;
      contextSentenceEn?: string;
      contextSentenceFa?: string;
    }
  ) => void;
  onDeleteCard: (cardId: string) => void;
}

export const VideoVocabularyView: React.FC<VideoVocabularyViewProps> = ({
  cards,
  savedSentences,
  selectedVideoId,
  onSelectVideoId,
  onOpenVideoInStudio,
  onStartDuoPractice,
  onGradeCard,
  onUpdateCardStatus,
  onUpdateCardBack,
  onDeleteCard,
}) => {
  const [internalVideoFilter, setInternalVideoFilter] = useState<string>('all');
  const activeVideoFilter =
    selectedVideoId !== undefined && selectedVideoId !== null
      ? selectedVideoId
      : internalVideoFilter;

  const handleSetVideoFilter = (vid: string) => {
    setInternalVideoFilter(vid);
    if (onSelectVideoId) {
      onSelectVideoId(vid === 'all' ? null : vid);
    }
  };

  const [statusFilter, setStatusFilter] = useState<'all' | 'learning' | 'known' | 'phrases'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editTranslationFa, setEditTranslationFa] = useState<string>('');
  const [editNotesFa, setEditNotesFa] = useState<string>('');
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  const videoGroups = useMemo(
    () => groupCardsByVideo(cards, savedSentences),
    [cards, savedSentences]
  );

  const visibleGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return videoGroups
      .filter((g) => {
        if (activeVideoFilter !== 'all' && g.videoId.toLowerCase() !== activeVideoFilter.toLowerCase()) {
          return false;
        }
        return true;
      })
      .map((g) => {
        const filteredCards = g.cards.filter((c) => {
          if (statusFilter === 'learning' && (c.status === 'known' || c.status === 'ignored')) {
            return false;
          }
          if (statusFilter === 'known' && c.status !== 'known' && c.box < 6) {
            return false;
          }
          if (statusFilter === 'phrases' && !c.isPhrase && !/\s+/.test(c.word)) {
            return false;
          }
          if (q) {
            const hay = `${c.word} ${c.translationFa} ${c.contextSentenceEn || ''} ${c.customNotesFa || ''} ${g.videoTitle}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        return {
          ...g,
          filteredCards,
        };
      })
      .filter((g) => g.filteredCards.length > 0 || activeVideoFilter !== 'all');
  }, [videoGroups, activeVideoFilter, statusFilter, searchQuery]);

  const speakWord = (text: string) => {
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

  const startEditingCard = (card: LeitnerCard) => {
    setEditingCardId(card.id);
    setEditTranslationFa(card.translationFa || '');
    setEditNotesFa(card.customNotesFa || '');
  };

  const saveCardEdit = (cardId: string) => {
    onUpdateCardBack(cardId, {
      translationFa: editTranslationFa,
      customNotesFa: editNotesFa,
    });
    setEditingCardId(null);
  };

  return (
    <div data-testid="video-vocabulary-view" className="space-y-6">
      {/* Top Hero Banner — Saved Vocabulary Grouped by Source YouTube Video */}
      <div className="duo-card p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5" dir="rtl">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-[#1CB0F6] border-b-4 border-[#1899D6] text-white flex items-center justify-center text-lg font-black shrink-0">
              🎬
            </span>
            <div>
              <h1 className="text-xl font-black duo-text-main">
                لغات ذخیره‌شده به تفکیک ویدیو (Words by Video)
              </h1>
              <p className="text-xs font-bold duo-text-muted">
                دقیقاً ببینید هر کلمه، اصطلاح یا جمله را از کدام ویدیوی یوتیوب و در چه ثانیه‌ای ذخیره کرده‌اید و با یک کلیک همان ویدیو را در استودیو باز کنید.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0" dir="rtl">
          <div className="px-3.5 py-2 rounded-2xl duo-surface-secondary border-2 duo-border-color text-xs font-extrabold">
            <span>🎬 تعداد ویدیوها: </span>
            <strong className="font-mono text-[#1CB0F6] tabular-nums">
              {toPersianDigits(videoGroups.length)}
            </strong>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>📚 کل لغات: </span>
            <strong className="font-mono text-[#58CC02] tabular-nums">
              {toPersianDigits(cards.length)}
            </strong>
          </div>

          <button
            type="button"
            data-testid="video-vocab-open-studio-btn"
            onClick={() => onOpenVideoInStudio('')}
            className="duo-btn duo-btn-blue px-4 py-2.5 text-xs whitespace-nowrap"
          >
            ➕ لود لینک جدید یوتیوب در استودیو
          </button>

          <button
            type="button"
            onClick={onStartDuoPractice}
            className="duo-btn duo-btn-green px-4 py-2.5 text-xs whitespace-nowrap"
          >
            🎯 تمرین دولینگویی این لغات
          </button>
        </div>
      </div>

      {/* Video Decks Overview Grid (Click any Video Deck to filter by that Video) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1" dir="rtl">
          <h2 className="text-sm font-black duo-text-main">
            📂 فهرست ویدیوهای دارای لغت ذخیره‌شده ({toPersianDigits(videoGroups.length)} ویدیو)
          </h2>
          {activeVideoFilter !== 'all' && (
            <button
              type="button"
              onClick={() => handleSetVideoFilter('all')}
              className="duo-btn duo-btn-neutral px-3 py-1.5 text-xs"
            >
              نمایش همه ویدیوها ({toPersianDigits(videoGroups.length)})
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {videoGroups.map((group) => {
            const isSelected =
              activeVideoFilter !== 'all' &&
              activeVideoFilter.toLowerCase() === group.videoId.toLowerCase();
            const showThumb = group.thumbnailUrl && !brokenThumbs[group.videoId];

            return (
              <div
                key={group.videoId}
                data-testid={`video-deck-card-${group.videoId}`}
                className={`duo-card p-4 flex flex-col justify-between gap-3 transition-all ${
                  isSelected ? 'ring-2 ring-[#1CB0F6]' : ''
                }`}
              >
                <div className="space-y-3">
                  {/* Video Thumbnail or Styled Studio Fallback */}
                  <div
                    onClick={() =>
                      handleSetVideoFilter(isSelected ? 'all' : group.videoId)
                    }
                    className="relative h-32 rounded-2xl overflow-hidden bg-[#0F172A] border-2 duo-border-color cursor-pointer flex items-center justify-center"
                  >
                    {showThumb ? (
                      <img
                        src={group.thumbnailUrl}
                        alt={group.videoTitle}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenThumbs((prev) => ({ ...prev, [group.videoId]: true }))
                        }
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#131F24] via-[#1E293B] to-[#0F172A] flex flex-col items-center justify-center p-3 text-center">
                        <span className="text-2xl mb-1">🎬</span>
                        <span className="text-xs font-extrabold text-white line-clamp-1">
                          {group.videoTitle}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex items-end justify-between p-3">
                      <span className="text-[11px] font-mono font-bold text-white/90 tabular-nums">
                        ID: {group.videoId}
                      </span>
                      <span className="text-xs font-black text-[#58CC02] bg-black/75 px-2.5 py-0.5 rounded-lg tabular-nums" dir="rtl">
                        {toPersianDigits(group.totalWords)} لغت
                      </span>
                    </div>
                  </div>

                  {/* Video Title & Metadata */}
                  <div className="space-y-1">
                    <h3 className="text-sm font-black duo-text-main line-clamp-2 leading-snug">
                      {group.videoTitle}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold duo-text-muted tabular-nums" dir="rtl">
                      <span>📖 در حال یادگیری: {toPersianDigits(group.learningCount)}</span>
                      <span aria-hidden="true">·</span>
                      <span>✓ تثبیت‌شده: {toPersianDigits(group.knownCount)}</span>
                      <span aria-hidden="true">·</span>
                      <span>🧩 عبارت: {toPersianDigits(group.phrasesCount)}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t-2 duo-border-color" dir="rtl">
                  <button
                    type="button"
                    data-testid={`filter-video-btn-${group.videoId}`}
                    onClick={() =>
                      handleSetVideoFilter(isSelected ? 'all' : group.videoId)
                    }
                    className={`duo-btn flex-1 py-2 px-3 text-xs whitespace-nowrap ${
                      isSelected ? 'duo-btn-green' : 'duo-btn-blue'
                    }`}
                  >
                    {isSelected ? '✓ در حال نمایش لغات' : `📂 مشاهده ${toPersianDigits(group.totalWords)} لغت`}
                  </button>

                  <button
                    type="button"
                    data-testid={`open-studio-video-btn-${group.videoId}`}
                    onClick={() => onOpenVideoInStudio(group.videoId, group.videoTitle)}
                    className="duo-btn duo-btn-purple py-2 px-3 text-xs whitespace-nowrap"
                    title="باز کردن و پخش این ویدیو در استودیو حرفه‌ای سایت"
                  >
                    ▶ پخش در استودیو
                  </button>

                  {group.isRealYouTubeId && (
                    <a
                      href={group.youtubeWatchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="duo-btn duo-btn-neutral py-2 px-2.5 text-xs whitespace-nowrap"
                      title="باز کردن ویدیو در یوتیوب"
                    >
                      ↗ یوتیوب
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter & Search Bar for Video Vocabulary */}
      <div className="duo-card p-4 flex flex-wrap items-center justify-between gap-3" dir="rtl">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'همه لغات این بخش' },
              { id: 'learning', label: '📖 در حال یادگیری' },
              { id: 'known', label: '✓ تثبیت‌شده (Known)' },
              { id: 'phrases', label: '🧩 افعال عبارتی و اصطلاحات' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`duo-btn px-3 py-1.5 text-xs whitespace-nowrap ${
                statusFilter === tab.id ? 'duo-btn-blue' : 'duo-btn-neutral'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-md">
          <input
            type="search"
            data-testid="video-vocab-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی لغت، معنی فارسی، جمله زیرنویس یا نام ویدیو..."
            className="w-full duo-surface-secondary border-2 duo-border-color rounded-2xl px-3.5 py-2 text-xs font-bold duo-text-main"
          />
        </div>
      </div>

      {/* Detailed Video Sections & Word Cards */}
      <div className="space-y-6">
        {visibleGroups.map((group) => (
          <section
            key={group.videoId}
            data-testid={`video-group-section-${group.videoId}`}
            className="duo-card p-5 space-y-4"
          >
            {/* Video Section Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 duo-border-color">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#CE82FF] border-b-4 border-[#A568CC] text-white flex items-center justify-center text-base font-black shrink-0">
                  🎥
                </div>
                <div>
                  <h3 className="text-base font-black duo-text-main">{group.videoTitle}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold duo-text-muted tabular-nums" dir="rtl">
                    <span>تعداد واژه‌های ذخیره‌شده از این ویدیو: {toPersianDigits(group.filteredCards.length)}</span>
                    <span aria-hidden="true">·</span>
                    <span dir="ltr" className="font-mono">Video ID: {group.videoId}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2" dir="rtl">
                <button
                  type="button"
                  onClick={() => onOpenVideoInStudio(group.videoId, group.videoTitle)}
                  className="duo-btn duo-btn-green px-3.5 py-2 text-xs whitespace-nowrap"
                >
                  ▶ باز کردن این ویدیو در استودیو سایت
                </button>
                {group.isRealYouTubeId && (
                  <a
                    href={group.youtubeWatchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="duo-btn duo-btn-neutral px-3 py-2 text-xs whitespace-nowrap"
                  >
                    ↗ مشاهده در یوتیوب
                  </a>
                )}
              </div>
            </div>

            {/* Cards Grid for this Video */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.filteredCards.map((card) => {
                const isExpanded = Boolean(expandedCardIds[card.id]);
                const isEditing = editingCardId === card.id;
                const tsSec = Math.max(0, Math.round(card.videoTimestampSec || 0));

                return (
                  <div
                    key={card.id}
                    data-testid={`video-word-card-${card.word}`}
                    className="duo-surface-secondary border-2 border-b-4 duo-border-color rounded-2xl p-4 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2.5">
                      {/* Card Top Row: Word + Phonetic + Timestamp Jump Button */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => speakWord(card.word)}
                            aria-label={`تلفظ صوتی ${card.word}`}
                            className="w-8 h-8 rounded-xl bg-[#1CB0F6] border-b-2 border-[#1899D6] text-white flex items-center justify-center text-xs shrink-0"
                          >
                            🔊
                          </button>
                          <div>
                            <div className="text-lg font-black duo-text-main leading-tight">
                              {card.word}
                            </div>
                            <div className="text-xs font-mono duo-text-muted">
                              {card.phonetic} · {card.cefr || 'B1'} · جعبه {card.box}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenVideoInStudio(group.videoId, group.videoTitle, tsSec)
                            }
                            className="duo-btn duo-btn-neutral px-2.5 py-1 text-[11px] font-mono tabular-nums whitespace-nowrap"
                            title="پخش دقیق این لحظه از ویدیو در استودیو سایت"
                          >
                            ⏱ {formatTimestamp(tsSec)}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateCardStatus(
                                card.id,
                                card.status === 'known' ? 'learning' : 'known'
                              )
                            }
                            className={`duo-btn px-2.5 py-1 text-[11px] whitespace-nowrap ${
                              card.status === 'known' ? 'duo-btn-green' : 'duo-btn-orange'
                            }`}
                          >
                            {card.status === 'known' ? '✓ Known' : '📖 Learning'}
                          </button>
                        </div>
                      </div>

                      {/* Primary Persian Meaning */}
                      <div
                        dir="rtl"
                        className="p-3 rounded-xl duo-surface-main border-2 duo-border-color text-sm font-black text-[#58CC02]"
                      >
                        {card.translationFa}
                      </div>

                      {/* Exact Subtitle Sentence from the Video */}
                      {card.contextSentenceEn && (
                        <div className="p-3 rounded-xl duo-surface-main border-2 duo-border-color space-y-1">
                          <div className="text-[11px] font-bold duo-text-muted" dir="rtl">
                            🎬 دیالوگ دقیق ویدیو در ثانیه {formatTimestamp(tsSec)}:
                          </div>
                          <div className="text-xs font-extrabold duo-text-main">
                            &ldquo;{card.contextSentenceEn}&rdquo;
                          </div>
                          {card.contextSentenceFa && (
                            <div dir="rtl" className="text-xs font-bold text-[#FF9600]">
                              {card.contextSentenceFa}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Expandable Full Back-of-Card Details (Multi-POS Meanings + Usage Examples) */}
                      {(isExpanded || (card.posEntries && card.posEntries.length > 0)) && (
                        <div
                          dir="rtl"
                          className="p-3 rounded-xl duo-surface-main border-2 duo-border-color space-y-2 text-xs"
                        >
                          {card.posEntries && card.posEntries.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[11px] font-black text-[#1CB0F6]">
                                📚 معانی کامل به تفکیک نقش دستوری:
                              </div>
                              {card.posEntries.map((pe, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-baseline justify-between gap-2 text-xs"
                                >
                                  <span className="font-bold duo-text-main">
                                    {pe.terms.join('، ')}
                                  </span>
                                  <span
                                    dir="ltr"
                                    className="font-mono text-[10px] font-black text-[#58CC02] shrink-0"
                                  >
                                    {pe.pos}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {isExpanded &&
                            card.tatoebaExamples &&
                            card.tatoebaExamples.length > 0 && (
                              <div className="pt-2 border-t duo-border-color space-y-1.5">
                                <div className="text-[11px] font-black text-[#CE82FF]">
                                  💬 جمله‌های نمونه دیگر با این معنی:
                                </div>
                                {card.tatoebaExamples.map((ex, i) => (
                                  <div key={i} className="space-y-0.5">
                                    <div dir="ltr" className="text-left text-xs font-bold">
                                      • &ldquo;{ex.en}&rdquo;
                                    </div>
                                    {ex.fa && (
                                      <div className="text-xs font-bold text-[#FF9600]">
                                        {ex.fa}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                          {card.customNotesFa && (
                            <div className="pt-1.5 border-t duo-border-color text-xs font-bold text-[#CE82FF]">
                              📝 یادداشت شخصی: {card.customNotesFa}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Inline Back-of-Card Editor */}
                      {isEditing && (
                        <div
                          dir="rtl"
                          className="p-3 rounded-xl duo-surface-main border-2 border-[#1CB0F6] space-y-2 text-xs"
                        >
                          <input
                            type="text"
                            value={editTranslationFa}
                            onChange={(e) => setEditTranslationFa(e.target.value)}
                            placeholder="معنی فارسی پشت کارت..."
                            className="w-full duo-surface-secondary border-2 duo-border-color rounded-xl px-3 py-1.5 font-bold"
                          />
                          <input
                            type="text"
                            value={editNotesFa}
                            onChange={(e) => setEditNotesFa(e.target.value)}
                            placeholder="یادداشت شخصی یا کدینگ ذهنی..."
                            className="w-full duo-surface-secondary border-2 duo-border-color rounded-xl px-3 py-1.5 font-bold"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => saveCardEdit(card.id)}
                              className="duo-btn duo-btn-green px-3 py-1.5 text-xs"
                            >
                              ✓ ذخیره تغییرات
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCardId(null)}
                              className="duo-btn duo-btn-neutral px-3 py-1.5 text-xs"
                            >
                              انصراف
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Footer Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t duo-border-color text-[11px]" dir="rtl">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCardIds((prev) => ({
                              ...prev,
                              [card.id]: !prev[card.id],
                            }))
                          }
                          className="duo-btn duo-btn-neutral px-2.5 py-1 text-[11px]"
                        >
                          {isExpanded ? 'بستن مثال‌ها' : '💬 جملات مثال بیشتر'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditingCard(card)}
                          className="duo-btn duo-btn-neutral px-2.5 py-1 text-[11px]"
                        >
                          ✏️ ویرایش پشت کارت
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCard(card.id)}
                          aria-label={`حذف لغت ${card.word}`}
                          className="duo-btn duo-btn-neutral px-2 py-1 text-[11px] text-[#FF4B4B]"
                        >
                          🗑
                        </button>
                      </div>

                      <div className="flex items-center gap-1" dir="ltr">
                        <button
                          type="button"
                          onClick={() => onGradeCard(card.id, 'again')}
                          className="duo-btn duo-btn-red px-2 py-1 text-[10px]"
                          title="مرور مجدد فوری"
                        >
                          Again
                        </button>
                        <button
                          type="button"
                          onClick={() => onGradeCard(card.id, 'good')}
                          className="duo-btn duo-btn-green px-2 py-1 text-[10px]"
                          title="ثبت مرور موفق"
                        >
                          Good ✓
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
