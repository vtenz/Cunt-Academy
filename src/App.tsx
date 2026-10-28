/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  LeitnerCard,
  SavedSentence,
  LanguageReactorSettings,
  AnkiGrade,
  DEFAULT_LR_SETTINGS,
  INITIAL_SEED_CARDS,
  INITIAL_SAVED_SENTENCES,
  gradeAnkiCard,
  updateCardBackContent,
  computePhrasePumpPipelineCounts,
  computeAnkiDeckCounts,
  DAY_MS,
} from './utils/linguatubeLogic';
import { PlayerSimulatorView } from './components/PlayerSimulatorView';
import { LeitnerCenterView, PortalSubView } from './components/LeitnerCenterView';
import { ExtensionPackageView } from './components/ExtensionPackageView';
import { CloudAccountModal } from './components/CloudAccountModal';
import {
  auth,
  User,
  AppAccountUser,
  onAuthStateChanged,
  signInWithGoogleAccount,
  signOutGoogleAccount,
  ensureUserProfileDoc,
  upsertCloudCard,
  deleteCloudCard,
  upsertCloudSentence,
  deleteCloudSentence,
  subscribeUserCloudData,
  sanitizeFirestoreId,
  getStoredDirectSession,
  clearStoredDirectSession,
  signInOrRegisterDirectEmailAccount,
  signInWithCloudSyncToken,
} from './firebase';

const CARDS_STORAGE_KEY = 'cunt_academy_cards_v5';
const SENTENCES_STORAGE_KEY = 'cunt_academy_sentences_v5';
const SETTINGS_STORAGE_KEY = 'cunt_academy_settings_v5';

export type MainNavSection = 'media' | 'phrasepump' | 'saved' | 'drills' | 'settings' | 'extension';

export default function App() {
  const [activeNav, setActiveNav] = useState<MainNavSection>('media');
  const [authUser, setAuthUser] = useState<User | AppAccountUser | null>(() =>
    getStoredDirectSession()
  );
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [cloudModalOpen, setCloudModalOpen] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);

  const [settings, setSettings] = useState<LanguageReactorSettings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_LR_SETTINGS,
          ...parsed,
          wordColors: { ...DEFAULT_LR_SETTINGS.wordColors, ...(parsed.wordColors || {}) },
          subtitlePosition: {
            ...DEFAULT_LR_SETTINGS.subtitlePosition,
            ...(parsed.subtitlePosition || {}),
          },
        };
      }
    } catch {
      // ignore
    }
    return DEFAULT_LR_SETTINGS;
  });

  const [cards, setCards] = useState<LeitnerCard[]>(() => {
    try {
      const directSession = getStoredDirectSession();
      const acctKey = directSession
        ? `${CARDS_STORAGE_KEY}_${directSession.uid}`
        : CARDS_STORAGE_KEY;
      const raw = localStorage.getItem(acctKey) || localStorage.getItem(CARDS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_SEED_CARDS;
  });

  const [savedSentences, setSavedSentences] = useState<SavedSentence[]>(() => {
    try {
      const directSession = getStoredDirectSession();
      const acctKey = directSession
        ? `${SENTENCES_STORAGE_KEY}_${directSession.uid}`
        : SENTENCES_STORAGE_KEY;
      const raw = localStorage.getItem(acctKey) || localStorage.getItem(SENTENCES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_SAVED_SENTENCES;
  });

  const cardsRef = useRef<LeitnerCard[]>(cards);
  cardsRef.current = cards;
  const sentencesRef = useRef<SavedSentence[]>(savedSentences);
  sentencesRef.current = savedSentences;
  const settingsRef = useRef<LanguageReactorSettings>(settings);
  settingsRef.current = settings;
  const initialCloudSeededRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
      if (authUser?.uid) {
        localStorage.setItem(`${CARDS_STORAGE_KEY}_${authUser.uid}`, JSON.stringify(cards));
      }
    } catch {
      // ignore
    }
  }, [cards, authUser]);

  useEffect(() => {
    try {
      localStorage.setItem(SENTENCES_STORAGE_KEY, JSON.stringify(savedSentences));
      if (authUser?.uid) {
        localStorage.setItem(
          `${SENTENCES_STORAGE_KEY}_${authUser.uid}`,
          JSON.stringify(savedSentences)
        );
      }
    } catch {
      // ignore
    }
  }, [savedSentences, authUser]);

  // Firebase Auth & Real-Time Firestore Subscription (with fallback to direct client session)
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (!user) {
        const directSession = getStoredDirectSession();
        setAuthUser(directSession);
        setAuthLoading(false);
        setSyncStatus(directSession ? 'synced' : 'idle');
        return;
      }

      setAuthUser(user);
      setAuthLoading(false);

      try {
        setSyncStatus('syncing');
        setSyncError(null);
        await ensureUserProfileDoc(user, settingsRef.current);

        unsubscribeSnapshot = subscribeUserCloudData(
          user.uid,
          async (cloudCards) => {
            if (cloudCards.length > 0) {
              setCards(cloudCards);
              setSyncStatus('synced');
            } else if (!initialCloudSeededRef.current[user.uid]) {
              initialCloudSeededRef.current[user.uid] = true;
              const localToPush = cardsRef.current;
              for (const c of localToPush) {
                await upsertCloudCard(user.uid, c);
              }
              setSyncStatus('synced');
            }
          },
          async (cloudSentences) => {
            if (cloudSentences.length > 0) {
              setSavedSentences(cloudSentences);
            } else if (!initialCloudSeededRef.current[`sent_${user.uid}`]) {
              initialCloudSeededRef.current[`sent_${user.uid}`] = true;
              for (const s of sentencesRef.current) {
                await upsertCloudSentence(user.uid, s);
              }
            }
          }
        );
      } catch (err) {
        setSyncStatus('error');
        setSyncError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const handleSignInGoogle = async () => {
    try {
      setAuthLoading(true);
      setSyncError(null);
      await signInWithGoogleAccount();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/unauthorized-domain')) {
        setSyncError(
          'دامین فعلی در لیست Authorized Domains کنسول Firebase ثبت نشده است. می‌توانید همین حالا از فرم «ثبت‌نام / ورود فوری با جیمیل و رمز عبور» در بالای همین پنجره استفاده کنید تا بدون نیاز به تنظیمات دامین وارد اکانت خود شوید.'
        );
      } else {
        setSyncError(msg);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignInDirectEmail = async (
    email: string,
    password: string,
    displayName?: string
  ) => {
    try {
      setAuthLoading(true);
      setSyncError(null);
      const sessionUser = signInOrRegisterDirectEmailAccount(email, password, displayName);
      setAuthUser(sessionUser);
      const savedAcctCards = localStorage.getItem(`${CARDS_STORAGE_KEY}_${sessionUser.uid}`);
      if (savedAcctCards) {
        const parsed = JSON.parse(savedAcctCards);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCards(parsed);
        }
      } else {
        localStorage.setItem(
          `${CARDS_STORAGE_KEY}_${sessionUser.uid}`,
          JSON.stringify(cardsRef.current)
        );
      }
      setSyncStatus('synced');
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignInSyncToken = async (token: string) => {
    try {
      setAuthLoading(true);
      setSyncError(null);
      const { user, cloudCards } = await signInWithCloudSyncToken(token);
      setAuthUser(user);
      if (cloudCards.length > 0) {
        setCards(cloudCards);
      }
      setSyncStatus('synced');
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOutGoogle = async () => {
    try {
      clearStoredDirectSession();
      if (auth.currentUser) {
        await signOutGoogleAccount();
      }
      setAuthUser(null);
      setSyncStatus('idle');
      setSyncError(null);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleForcePushLocalToCloud = async () => {
    if (!authUser) return;
    try {
      setSyncStatus('syncing');
      setSyncError(null);
      localStorage.setItem(`${CARDS_STORAGE_KEY}_${authUser.uid}`, JSON.stringify(cards));
      localStorage.setItem(
        `${SENTENCES_STORAGE_KEY}_${authUser.uid}`,
        JSON.stringify(savedSentences)
      );
      if (auth.currentUser) {
        await ensureUserProfileDoc(auth.currentUser, settings);
        for (const c of cards) {
          await upsertCloudCard(auth.currentUser.uid, c);
        }
        for (const s of savedSentences) {
          await upsertCloudSentence(auth.currentUser.uid, s);
        }
      }
      setSyncStatus('synced');
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpdateSettings = (patch: Partial<LanguageReactorSettings>) => {
    setSettings((prev) => {
      const next: LanguageReactorSettings = {
        ...prev,
        ...patch,
        wordColors: {
          ...prev.wordColors,
          ...(patch.wordColors || {}),
        },
        subtitlePosition: {
          ...prev.subtitlePosition,
          ...(patch.subtitlePosition || {}),
        },
      };
      if (auth.currentUser) {
        ensureUserProfileDoc(auth.currentUser, next).catch(() => {});
      }
      return next;
    });
  };

  const handleSaveCard = (
    cardInput: Partial<LeitnerCard> & { word: string; translationFa: string }
  ) => {
    const cleanWord = cardInput.word.trim().toLowerCase();
    if (!cleanWord) return;
    const now = Date.now();
    const id = sanitizeFirestoreId(
      cardInput.id || `word_${cleanWord.replace(/[^a-z0-9]/gi, '_')}`,
      'word'
    );

    setCards((prev) => {
      const existing = prev.find((c) => c.id === id || c.word.toLowerCase() === cleanWord);
      const status = cardInput.status || (cardInput.box === 6 ? 'known' : 'learning');
      const box = status === 'known' ? 6 : cardInput.box ?? 1;
      const pumpStage =
        status === 'known' || box >= 5
          ? 'learned'
          : status === 'ignored'
            ? 'ignored'
            : box >= 2
              ? 'learning_now'
              : 'marked';

      const newCard: LeitnerCard = {
        id: existing ? existing.id : id,
        word: cleanWord,
        lemma: cardInput.lemma || existing?.lemma || cleanWord,
        isPhrase: cardInput.isPhrase ?? /\s+/.test(cleanWord),
        status,
        pumpStage,
        ankiState: status === 'known' ? 'review' : existing?.ankiState || 'new',
        intervalDays: status === 'known' ? 30 : existing?.intervalDays ?? 0,
        learningStep: existing?.learningStep ?? 0,
        customNotesFa:
          cardInput.customNotesFa !== undefined ? cardInput.customNotesFa : existing?.customNotesFa,
        cefr: cardInput.cefr || existing?.cefr || 'B1',
        freqTag: cardInput.freqTag || existing?.freqTag || 'tag 2k',
        rank: cardInput.rank ?? existing?.rank ?? 2200,
        phonetic: cardInput.phonetic || (existing ? existing.phonetic : `/${cleanWord}/`),
        translationFa: cardInput.translationFa,
        miniMeaningsFa: cardInput.miniMeaningsFa || (existing ? existing.miniMeaningsFa : []),
        aiExplanationFa: cardInput.aiExplanationFa || (existing ? existing.aiExplanationFa : ''),
        posEntries: cardInput.posEntries || (existing ? existing.posEntries : []),
        englishDefinition:
          cardInput.englishDefinition || (existing ? existing.englishDefinition : ''),
        tatoebaExamples:
          cardInput.tatoebaExamples || (existing ? existing.tatoebaExamples : []),
        contextSentenceEn:
          cardInput.contextSentenceEn || (existing ? existing.contextSentenceEn : ''),
        contextSentenceFa:
          cardInput.contextSentenceFa || (existing ? existing.contextSentenceFa : ''),
        videoId: cardInput.videoId || 'ai-image-gen-2026',
        videoTitle: cardInput.videoTitle || 'YouTube Dual-Subtitle Video',
        videoTimestampSec: cardInput.videoTimestampSec ?? 0,
        box,
        nextReviewAt: status === 'known' ? now + 30 * DAY_MS : now - 1000,
        lastReviewedAt: now,
        reviewCount: existing ? existing.reviewCount : 0,
        lapseCount: existing ? existing.lapseCount : 0,
        easeFactor: existing ? existing.easeFactor : 2.5,
        createdAt: existing ? existing.createdAt : now,
      };

      if (auth.currentUser) {
        upsertCloudCard(auth.currentUser.uid, newCard).catch(() => {});
      }

      if (existing) {
        return prev.map((c) => (c.id === existing.id ? newCard : c));
      }
      return [newCard, ...prev];
    });
  };

  const handleUpdateCardBack = (
    cardId: string,
    patch: {
      translationFa?: string;
      customNotesFa?: string;
      contextSentenceEn?: string;
      contextSentenceFa?: string;
      aiExplanationFa?: string;
      miniMeaningsFa?: string[];
    }
  ) => {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;
        const updated = updateCardBackContent(c, patch);
        if (auth.currentUser) {
          upsertCloudCard(auth.currentUser.uid, updated).catch(() => {});
        }
        return updated;
      })
    );
  };

  const handleUpdateCardStatus = (
    cardId: string,
    status: 'learning' | 'known' | 'ignored'
  ) => {
    const now = Date.now();
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;
        const nextBox = status === 'known' ? 6 : 1;
        const updated: LeitnerCard = {
          ...c,
          status,
          box: nextBox,
          ankiState: status === 'known' ? 'review' : 'new',
          intervalDays: status === 'known' ? 30 : 0,
          pumpStage:
            status === 'known' ? 'learned' : status === 'ignored' ? 'ignored' : 'marked',
          nextReviewAt: status === 'known' ? now + 30 * DAY_MS : now - 1000,
        };
        if (auth.currentUser) {
          upsertCloudCard(auth.currentUser.uid, updated).catch(() => {});
        }
        return updated;
      })
    );
  };

  const handleSaveSentence = (sentenceInput: Omit<SavedSentence, 'id' | 'createdAt'>) => {
    setSavedSentences((prev) => {
      const exists = prev.some((s) => s.sentenceEn === sentenceInput.sentenceEn);
      if (exists) return prev;
      const newEntry: SavedSentence = {
        ...sentenceInput,
        id: `sent_${Date.now()}`,
        createdAt: Date.now(),
      };
      if (auth.currentUser) {
        upsertCloudSentence(auth.currentUser.uid, newEntry).catch(() => {});
      }
      return [newEntry, ...prev];
    });
  };

  const handleDeleteSentence = (sentenceId: string) => {
    setSavedSentences((prev) => prev.filter((s) => s.id !== sentenceId));
    if (auth.currentUser) {
      deleteCloudSentence(auth.currentUser.uid, sentenceId).catch(() => {});
    }
  };

  const handleGradeCard = (cardId: string, grade: AnkiGrade) => {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;
        const graded = gradeAnkiCard(c, grade, Date.now());
        if (auth.currentUser) {
          upsertCloudCard(auth.currentUser.uid, graded).catch(() => {});
        }
        return graded;
      })
    );
  };

  const handleDeleteCard = (cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    if (auth.currentUser) {
      deleteCloudCard(auth.currentUser.uid, cardId).catch(() => {});
    }
  };

  const handleBulkImport = (imported: LeitnerCard[]) => {
    const now = Date.now();
    const valid = imported
      .filter((item) => item && item.word && item.translationFa)
      .map((item) => ({
        ...item,
        id: sanitizeFirestoreId(
          item.id || `word_${String(item.word).toLowerCase().replace(/[^a-z0-9]/gi, '_')}`,
          'word'
        ),
        box: Number(item.box) || 1,
        nextReviewAt: Number(item.nextReviewAt) || now - 1000,
      }));
    if (valid.length > 0) {
      setCards(valid);
      if (auth.currentUser) {
        for (const c of valid) {
          upsertCloudCard(auth.currentUser.uid, c).catch(() => {});
        }
      }
    }
  };

  const pipelineCounts = computePhrasePumpPipelineCounts(cards);
  const ankiCounts = computeAnkiDeckCounts(cards);

  const portalSubView: PortalSubView =
    activeNav === 'saved'
      ? 'saved'
      : activeNav === 'drills'
        ? 'drills'
        : activeNav === 'settings'
          ? 'settings'
          : 'phrasepump';

  return (
    <div
      dir="ltr"
      className="min-h-screen bg-[#0B0D14] text-slate-100 flex"
      style={{
        backgroundImage:
          'radial-gradient(circle at 18% 0%, rgba(124, 92, 252, 0.14), transparent 40%), radial-gradient(circle at 85% 12%, rgba(16, 185, 129, 0.08), transparent 36%)',
      }}
    >
      {/* LEFT SIDEBAR NAVIGATION (Trancy Aesthetic + Cunt Academy Brand) */}
      <aside className="w-60 shrink-0 bg-[#121521]/95 border-r border-white/10 flex flex-col justify-between p-4 select-none backdrop-blur-xl">
        <div className="space-y-4">
          {/* Cunt Academy Logo Brand */}
          <div
            onClick={() => setActiveNav('media')}
            className="flex items-center gap-3 px-2 py-1.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 via-indigo-600 to-emerald-500 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-violet-600/30">
              CA
            </div>
            <div className="leading-tight">
              <div className="text-[11px] text-violet-300 font-extrabold tracking-widest uppercase">
                Cunt
              </div>
              <div className="text-base font-black tracking-wider text-white">ACADEMY</div>
            </div>
          </div>

          {/* Cloud Account Quick Card in Sidebar */}
          <button
            type="button"
            data-testid="sidebar-cloud-account-btn"
            onClick={() => setCloudModalOpen(true)}
            className={`w-full text-left p-2.5 rounded-xl border transition-all ${
              authUser
                ? 'bg-emerald-500/15 border-emerald-500/40 hover:bg-emerald-500/20'
                : 'bg-violet-600/15 border-violet-500/40 hover:bg-violet-600/25'
            }`}
          >
            {authUser ? (
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-xs shrink-0">
                  {(authUser.displayName || authUser.email || 'U').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-extrabold text-emerald-300 truncate">
                    ☁ اکانت جیمیل متصل شد
                  </div>
                  <div className="text-[10px] font-mono text-slate-300 truncate">
                    {authUser.email}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-0.5" dir="rtl">
                <div className="text-[11px] font-extrabold text-violet-200 flex items-center justify-between">
                  <span>☁ ورود با جیمیل + دامین عمومی</span>
                  <span className="text-[10px] text-emerald-300">رایگان</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  همگام‌سازی فلش‌کارت‌ها و اکستنشن روی همه دستگاه‌ها
                </div>
              </div>
            )}
          </button>

          {/* Main Sidebar Navigation Items */}
          <nav className="space-y-1 text-xs font-bold">
            <button
              type="button"
              data-testid="nav-media"
              onClick={() => setActiveNav('media')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                activeNav === 'media'
                  ? 'bg-violet-600/25 text-white border border-violet-500/45 shadow-sm'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-violet-400">▶</span>
                <span>YouTube Studio</span>
              </span>
              <span className="text-[10px] font-mono text-violet-300">LR+Trancy</span>
            </button>

            <button
              type="button"
              data-testid="nav-phrasepump"
              onClick={() => setActiveNav('phrasepump')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                activeNav === 'phrasepump'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/45 shadow-sm'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-emerald-400">⚡</span>
                <span>AnkiDroid Flashcards</span>
              </span>
              <span
                data-testid="sidebar-anki-due-badge"
                className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px]"
              >
                {ankiCounts.totalDueToday}
              </span>
            </button>

            <button
              type="button"
              data-testid="nav-saved"
              onClick={() => setActiveNav('saved')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                activeNav === 'saved'
                  ? 'bg-violet-600/25 text-white border border-violet-500/45'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-amber-400">📚</span>
                <span>Saved Words &amp; Idioms</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {cards.length}
              </span>
            </button>

            <button
              type="button"
              data-testid="nav-drills"
              onClick={() => setActiveNav('drills')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                activeNav === 'drills'
                  ? 'bg-violet-600/25 text-white border border-violet-500/45'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-sky-400">🎙</span>
                <span>Shadowing &amp; Recall</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-400">FREE</span>
            </button>

            <button
              type="button"
              data-testid="nav-settings"
              onClick={() => setActiveNav('settings')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                activeNav === 'settings'
                  ? 'bg-violet-600/25 text-white border border-violet-500/45'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-slate-300">⚙</span>
                <span>Subtitle &amp; LR Settings</span>
              </span>
            </button>

            <button
              type="button"
              data-testid="nav-extension"
              onClick={() => setActiveNav('extension')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                activeNav === 'extension'
                  ? 'bg-violet-600/25 text-white border border-violet-500/45'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-violet-400">🧩</span>
                <span>Install (Zen &amp; Chrome)</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-400">v4.6 Cloud</span>
            </button>
          </nav>
        </div>

        {/* Bottom Download Extension CTAs (Zen/Firefox + Chrome) */}
        <div className="pt-4 border-t border-white/10 space-y-2">
          <a
            href="/cunt-academy-zen-firefox.xpi"
            download="cunt-academy-zen-firefox.xpi"
            className="block w-full text-center py-2 px-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg"
          >
            ⬇ نصب Zen / Firefox (.xpi)
          </a>
          <a
            href="/cunt-academy-chrome.zip"
            download="cunt-academy-chrome.zip"
            className="block w-full text-center py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg"
          >
            ⬇ نصب Chrome (.zip)
          </a>
          <div className="text-[10px] text-slate-500 text-center">
            Cunt Academy v4.6 • Gmail Cloud Sync
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Strip */}
        <header className="px-6 py-3 bg-[#121521]/90 border-b border-white/10 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-extrabold text-white">
              Cunt Academy v4.6 — سیستم فلش‌کارت AnkiDroid SM-2 + سینک ابری جیمیل + دامین عمومی
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold">
              Gmail Sync + Anki SM-2 + Lexa AI
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <button
              type="button"
              data-testid="header-cloud-account-btn"
              onClick={() => setCloudModalOpen(true)}
              className={`px-3.5 py-1.5 rounded-xl font-extrabold transition-all flex items-center gap-2 shadow-md ${
                authUser
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/45 text-emerald-200'
                  : 'bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950'
              }`}
            >
              <span>☁</span>
              <span>
                {authUser
                  ? `اکانت ابری: ${authUser.email}`
                  : 'ورود با جیمیل + لینک دامین عمومی (Cloud Sync)'}
              </span>
            </button>

            <a
              href="/cunt-academy-zen-firefox.xpi"
              download="cunt-academy-zen-firefox.xpi"
              className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-colors"
            >
              ⬇ دانلود Zen / Firefox (.xpi)
            </a>
            <a
              href="/cunt-academy-chrome.zip"
              download="cunt-academy-chrome.zip"
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors"
            >
              ⬇ دانلود Chrome (.zip)
            </a>
            <button
              type="button"
              onClick={() => setActiveNav('extension')}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-violet-200 font-bold transition-colors"
            >
              🧩 راهنمای نصب و سینک
            </button>
          </div>
        </header>

        {/* Active View Content */}
        <main className="flex-1 p-5 max-w-[1440px] w-full mx-auto">
          {activeNav === 'media' && (
            <PlayerSimulatorView
              cards={cards}
              savedSentences={savedSentences}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onSaveCard={handleSaveCard}
              onUpdateCardBack={handleUpdateCardBack}
              onSaveSentence={handleSaveSentence}
              onOpenPhrasePump={() => setActiveNav('phrasepump')}
              onOpenSettingsPage={() => setActiveNav('settings')}
            />
          )}

          {(activeNav === 'phrasepump' ||
            activeNav === 'saved' ||
            activeNav === 'drills' ||
            activeNav === 'settings') && (
            <LeitnerCenterView
              activeSubView={portalSubView}
              onChangeSubView={(sub) => setActiveNav(sub)}
              cards={cards}
              savedSentences={savedSentences}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onGradeCard={handleGradeCard}
              onUpdateCardBack={handleUpdateCardBack}
              onUpdateCardStatus={handleUpdateCardStatus}
              onDeleteCard={handleDeleteCard}
              onDeleteSentence={handleDeleteSentence}
              onAddCard={handleSaveCard}
              onBulkImport={handleBulkImport}
            />
          )}

          {activeNav === 'extension' && (
            <ExtensionPackageView
              user={authUser}
              onOpenCloudModal={() => setCloudModalOpen(true)}
              onSignInGoogle={handleSignInGoogle}
            />
          )}
        </main>
      </div>

      {/* Cloud Account, Google Login & Public Domain Modal */}
      <CloudAccountModal
        isOpen={cloudModalOpen}
        onClose={() => setCloudModalOpen(false)}
        user={authUser}
        authLoading={authLoading}
        syncStatus={syncStatus}
        syncError={syncError}
        cardsCount={cards.length}
        sentencesCount={savedSentences.length}
        onSignInGoogle={handleSignInGoogle}
        onSignInDirectEmail={handleSignInDirectEmail}
        onSignInSyncToken={handleSignInSyncToken}
        onSignOutGoogle={handleSignOutGoogle}
        onForcePushLocalToCloud={handleForcePushLocalToCloud}
      />
    </div>
  );
}
