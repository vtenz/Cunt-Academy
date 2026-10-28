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
import { BrandLogo } from './components/BrandLogo';
import { DuoPracticeView } from './components/DuoPracticeView';
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

export type MainNavSection =
  | 'media'
  | 'duopractice'
  | 'phrasepump'
  | 'saved'
  | 'drills'
  | 'settings'
  | 'extension';

export default function App() {
  const [activeNav, setActiveNav] = useState<MainNavSection>('media');
  const [duoTheme, setDuoTheme] = useState<'light' | 'dark'>(() => {
    try {
      const savedTheme = localStorage.getItem('cunt_academy_duo_theme');
      if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    } catch {
      // ignore
    }
    return 'dark';
  });
  const [userXp, setUserXp] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('cunt_academy_duo_xp');
      return raw ? Number(raw) || 340 : 340;
    } catch {
      return 340;
    }
  });
  const [streakDays] = useState<number>(7);
  const [authUser, setAuthUser] = useState<User | AppAccountUser | null>(() =>
    getStoredDirectSession()
  );
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [cloudModalOpen, setCloudModalOpen] = useState<boolean>(false);
  const [toolbarPopupOpen, setToolbarPopupOpen] = useState<boolean>(false);
  const [popupFlipped, setPopupFlipped] = useState<boolean>(false);
  const [popupBoxFilter, setPopupBoxFilter] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', duoTheme);
    try {
      localStorage.setItem('cunt_academy_duo_theme', duoTheme);
    } catch {
      // ignore
    }
  }, [duoTheme]);

  const handleEarnXp = (delta: number) => {
    setUserXp((prev) => {
      const next = prev + delta;
      try {
        localStorage.setItem('cunt_academy_duo_xp', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

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
      data-theme={duoTheme}
      className="min-h-screen duo-surface-main flex"
    >
      {/* LEFT SIDEBAR NAVIGATION (100% Duolingo Feather Design System — Clean, Flat & Tactile) */}
      <aside className="w-64 shrink-0 duo-surface-main border-r-2 duo-border-color flex flex-col justify-between p-5 select-none">
        <div className="space-y-5">
          {/* Cunt Academy Emblem Brand */}
          <div
            onClick={() => setActiveNav('media')}
            className="flex items-center gap-3 px-2 py-1 cursor-pointer"
          >
            <BrandLogo size={42} showWordmark={true} subtitle="Duolingo + LR + Anki" />
          </div>

          {/* Cloud Account Quick Card in Sidebar (Tactile 3D Card) */}
          <button
            type="button"
            data-testid="sidebar-cloud-account-btn"
            onClick={() => setCloudModalOpen(true)}
            className={`w-full text-left p-3 rounded-2xl border-2 border-b-4 transition-all active:border-b-0 active:translate-y-[4px] ${
              authUser
                ? 'bg-[#58CC02]/15 border-[#58CC02]'
                : 'duo-surface-secondary duo-border-color'
            }`}
          >
            {authUser ? (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#58CC02] border-b-2 border-[#58A700] text-white font-black flex items-center justify-center text-xs shrink-0">
                  {(authUser.displayName || authUser.email || 'U').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-extrabold text-[#58CC02] truncate">
                    ☁ اکانت جیمیل متصل شد
                  </div>
                  <div className="text-[10px] font-mono duo-text-muted truncate">
                    {authUser.email}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-0.5" dir="rtl">
                <div className="text-xs font-extrabold flex items-center justify-between">
                  <span>☁ ورود با جیمیل</span>
                  <span className="px-2 py-0.5 rounded-lg bg-[#58CC02] text-white text-[10px] font-black">
                    رایگان
                  </span>
                </div>
                <div className="text-[11px] duo-text-muted font-bold">
                  سینک خودکار فلش‌کارت‌ها و اکستنشن
                </div>
              </div>
            )}
          </button>

          {/* Main Duolingo Pill Navigation Items */}
          <nav className="space-y-2 text-xs font-extrabold">
            <button
              type="button"
              data-testid="nav-media"
              onClick={() => setActiveNav('media')}
              className={`duo-nav-item ${activeNav === 'media' ? 'is-active' : ''}`}
            >
              <span className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-xl bg-[#1CB0F6] border-b-2 border-[#1899D6] text-white flex items-center justify-center text-xs">
                  ▶
                </span>
                <span>ویدیو و زیرنویس (Learn)</span>
              </span>
            </button>

            <button
              type="button"
              data-testid="nav-duopractice"
              onClick={() => setActiveNav('duopractice')}
              className={`duo-nav-item ${activeNav === 'duopractice' ? 'is-active' : ''}`}
            >
              <span className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-xl bg-[#58CC02] border-b-2 border-[#58A700] text-white flex items-center justify-center text-xs">
                  🎯
                </span>
                <span>تمرین دولینگویی (Duo)</span>
              </span>
              <span className="px-2 py-0.5 rounded-xl bg-[#FFC800] border-b-2 border-[#E5B400] text-[#3C3C3C] font-black text-[10px]">
                NEW
              </span>
            </button>

            <button
              type="button"
              data-testid="nav-phrasepump"
              onClick={() => setActiveNav('phrasepump')}
              className={`duo-nav-item ${activeNav === 'phrasepump' ? 'is-active' : ''}`}
            >
              <span className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-xl bg-[#FF9600] border-b-2 border-[#CC7800] text-white flex items-center justify-center text-xs">
                  ⚡
                </span>
                <span>فلش‌کارت AnkiDroid</span>
              </span>
              <span
                data-testid="sidebar-anki-due-badge"
                className="px-2 py-0.5 rounded-xl bg-[#FF9600] border-b-2 border-[#CC7800] text-white font-mono text-[10px] font-black"
              >
                {ankiCounts.totalDueToday}
              </span>
            </button>

            <button
              type="button"
              data-testid="nav-saved"
              onClick={() => setActiveNav('saved')}
              className={`duo-nav-item ${activeNav === 'saved' ? 'is-active' : ''}`}
            >
              <span className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-xl bg-[#CE82FF] border-b-2 border-[#A568CC] text-white flex items-center justify-center text-xs">
                  📚
                </span>
                <span>بانک لغات ({cards.length})</span>
              </span>
            </button>

            <button
              type="button"
              data-testid="nav-drills"
              onClick={() => setActiveNav('drills')}
              className={`duo-nav-item ${activeNav === 'drills' ? 'is-active' : ''}`}
            >
              <span className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-xl bg-[#FF4B4B] border-b-2 border-[#EA2B2B] text-white flex items-center justify-center text-xs">
                  🎙
                </span>
                <span>شنیداری و دیکته</span>
              </span>
            </button>

            <button
              type="button"
              data-testid="nav-settings"
              onClick={() => setActiveNav('settings')}
              className={`duo-nav-item ${activeNav === 'settings' ? 'is-active' : ''}`}
            >
              <span className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-xl bg-[#1CB0F6] border-b-2 border-[#1899D6] text-white flex items-center justify-center text-xs">
                  ⚙
                </span>
                <span>تنظیمات زیرنویس</span>
              </span>
            </button>

            <button
              type="button"
              data-testid="nav-extension"
              onClick={() => setActiveNav('extension')}
              className={`duo-nav-item ${activeNav === 'extension' ? 'is-active' : ''}`}
            >
              <span className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-xl bg-[#58CC02] border-b-2 border-[#58A700] text-white flex items-center justify-center text-xs">
                  🧩
                </span>
                <span>نصب اکستنشن یوتیوب</span>
              </span>
            </button>
          </nav>
        </div>

        {/* Bottom Tactile 3D Download Extension CTAs */}
        <div className="pt-4 border-t-2 duo-border-color space-y-2.5">
          <a
            href="/cunt-academy-zen-firefox.xpi"
            download="cunt-academy-zen-firefox.xpi"
            className="duo-btn duo-btn-purple w-full py-2.5 px-3 text-xs text-center"
          >
            ⬇ نصب Zen / Firefox (.xpi)
          </a>
          <a
            href="/cunt-academy-chrome.zip"
            download="cunt-academy-chrome.zip"
            className="duo-btn duo-btn-green w-full py-2.5 px-3 text-xs text-center"
          >
            ⬇ نصب Chrome (.zip)
          </a>
        </div>
      </aside>

      {/* MAIN VIEWPORT CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* DUOLINGO STATUS BAR (HEADER) */}
        <header className="px-6 py-3.5 duo-surface-main border-b-2 duo-border-color flex flex-wrap items-center justify-between gap-4 relative z-30">
          {/* Left: Duolingo Gamification Stats (Streak 🔥, Gems/Words 💎, XP ⚡) */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Streak Flame (#FF9600) */}
            <div
              data-testid="duo-stat-streak"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border-2 border-b-4 border-[#CC7800] bg-[#FF9600] text-white font-black text-xs"
              title="روزهای متوالی تمرین (Streak)"
            >
              <span>🔥</span>
              <span>{streakDays} روز</span>
            </div>

            {/* Saved Words / Gems (#1CB0F6) */}
            <button
              type="button"
              data-testid="duo-stat-gems"
              onClick={() => setActiveNav('saved')}
              className="duo-btn duo-btn-blue px-3.5 py-1.5 text-xs"
              title="تعداد لغات و اصطلاحات ذخیره‌شده"
            >
              <span>💎</span>
              <span>{cards.length} لغت</span>
            </button>

            {/* XP Score (#FFC800) */}
            <button
              type="button"
              data-testid="duo-stat-xp"
              onClick={() => setActiveNav('duopractice')}
              className="duo-btn duo-btn-yellow px-3.5 py-1.5 text-xs"
              title="امتیاز تجربه (XP) — کلیک برای شروع تمرین دولینگویی"
            >
              <span>⚡</span>
              <span>{userXp} XP</span>
            </button>
          </div>

          {/* Right: Quick Actions + Toolbar Popup + Cloud Account + Theme Switcher */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {/* Quick Start Duo Practice CTA */}
            <button
              type="button"
              data-testid="header-start-duo-practice-btn"
              onClick={() => setActiveNav('duopractice')}
              className="duo-btn duo-btn-green px-3.5 py-1.5 text-xs"
            >
              <span>🎯</span>
              <span>تمرین دولینگویی</span>
            </button>

            {/* Browser Toolbar Extension Popup Trigger (Compact Leitner Box in Corner) */}
            <button
              type="button"
              data-testid="header-toolbar-popup-btn"
              onClick={() => {
                setToolbarPopupOpen((prev) => !prev);
                setPopupFlipped(false);
              }}
              className="duo-btn duo-btn-purple px-3.5 py-1.5 text-xs"
              title="مشاهده پاپ‌آپ جمع‌وجور جعبه لایتنر بالای مرورگر"
            >
              <span>📦</span>
              <span>لایتنر تلبار ({ankiCounts.totalDueToday})</span>
            </button>

            {/* Cloud Account Button */}
            <button
              type="button"
              data-testid="header-cloud-account-btn"
              onClick={() => setCloudModalOpen(true)}
              className={`duo-btn px-3.5 py-1.5 text-xs ${
                authUser ? 'duo-btn-green' : 'duo-btn-blue'
              }`}
            >
              <span>☁</span>
              <span>
                {authUser ? authUser.email : 'ورود با جیمیل'}
              </span>
            </button>

            {/* Duolingo Official Dual Theme Switcher (Snow Light / Dark Slate) */}
            <button
              type="button"
              data-testid="duo-theme-toggle-btn"
              onClick={() => setDuoTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
              className="duo-btn duo-btn-neutral px-3.5 py-1.5 text-xs"
              title="تغییر تم دولینگو (روشن کلاسیک / تاریک سرمه‌ای)"
            >
              <span>{duoTheme === 'light' ? '🌙 تم تاریک' : '☀️ تم روشن'}</span>
            </button>
          </div>

          {/* COMPACT BROWSER TOOLBAR LEITNER POPUP WIDGET IN TOP-RIGHT CORNER */}
          {toolbarPopupOpen && (() => {
            const activeDeck = cards.filter((c) => c.status !== 'ignored');
            const filteredDeck =
              popupBoxFilter === 0
                ? activeDeck.filter((c) => c.box < 6)
                : activeDeck.filter((c) => c.box === popupBoxFilter);
            const dueDeck = filteredDeck.filter((c) => c.nextReviewAt <= Date.now() || c.box === 1);
            const currentPopupCard = dueDeck[0] || filteredDeck[0] || null;

            return (
              <div
                data-testid="toolbar-leitner-popup-drawer"
                dir="rtl"
                className="fixed top-16 right-6 z-50 w-[375px] duo-card overflow-hidden flex flex-col"
              >
                {/* Popup Header */}
                <div className="px-4 py-3 duo-surface-secondary border-b-2 duo-border-color flex items-center justify-between">
                  <div className="flex items-center gap-2" dir="ltr">
                    <BrandLogo size={28} />
                    <div>
                      <div className="text-[10px] font-black tracking-widest text-[#1CB0F6]">
                        CUNT ACADEMY
                      </div>
                      <div className="text-xs font-extrabold">Leitner &amp; Anki Popup</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-xl bg-[#58CC02] text-white text-[10px] font-black">
                      {authUser ? '☁ سینک فعال' : '☁ آماده سینک'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setToolbarPopupOpen(false)}
                      className="duo-btn duo-btn-neutral w-7 h-7 text-xs font-black"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Anki Counters Strip */}
                <div className="grid grid-cols-4 gap-2 p-3 duo-surface-secondary border-b-2 duo-border-color text-center">
                  <div className="p-1.5 rounded-xl duo-surface-main border-2 duo-border-color">
                    <div className="text-xs font-black font-mono text-[#1CB0F6]">{ankiCounts.newCount}</div>
                    <div className="text-[9px] font-bold duo-text-muted">جدید (New)</div>
                  </div>
                  <div className="p-1.5 rounded-xl duo-surface-main border-2 duo-border-color">
                    <div className="text-xs font-black font-mono text-[#FF9600]">{ankiCounts.learningCount}</div>
                    <div className="text-[9px] font-bold duo-text-muted">در حال یادگیری</div>
                  </div>
                  <div className="p-1.5 rounded-xl duo-surface-main border-2 duo-border-color">
                    <div className="text-xs font-black font-mono text-[#58CC02]">{ankiCounts.reviewDueCount}</div>
                    <div className="text-[9px] font-bold duo-text-muted">مرور امروز</div>
                  </div>
                  <div className="p-1.5 rounded-xl duo-surface-main border-2 duo-border-color">
                    <div className="text-xs font-black font-mono text-[#CE82FF]">{pipelineCounts.learnedCount}</div>
                    <div className="text-[9px] font-bold duo-text-muted">تثبیت‌شده ★</div>
                  </div>
                </div>

                {/* 5-Box Leitner Mini Filter Chips */}
                <div className="px-3 py-2 duo-surface-main border-b-2 duo-border-color flex items-center gap-1.5 overflow-x-auto">
                  {[
                    { box: 0, label: `همه (${activeDeck.length})` },
                    { box: 1, label: 'جعبه ۱' },
                    { box: 2, label: 'جعبه ۲' },
                    { box: 3, label: 'جعبه ۳' },
                    { box: 4, label: 'جعبه ۴' },
                    { box: 5, label: 'جعبه ۵' },
                  ].map((item) => (
                    <button
                      key={item.box}
                      type="button"
                      onClick={() => {
                        setPopupBoxFilter(item.box);
                        setPopupFlipped(false);
                      }}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black whitespace-nowrap border-2 transition-colors ${
                        popupBoxFilter === item.box
                          ? 'bg-[#1CB0F6] border-[#1899D6] text-white'
                          : 'duo-surface-secondary duo-border-color'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Compact Flashcard Area */}
                <div className="p-3.5 space-y-3 duo-surface-main">
                  {currentPopupCard ? (
                    <div className="p-4 rounded-2xl duo-surface-secondary border-2 border-b-4 duo-border-color space-y-3">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="px-2.5 py-0.5 rounded-lg bg-[#CE82FF] text-white font-black">
                          جعبه {currentPopupCard.box} لایتنر
                        </span>
                        <span dir="ltr" className="font-mono font-bold duo-text-muted">
                          {currentPopupCard.cefr} • {currentPopupCard.freqTag}
                        </span>
                      </div>

                      <div className="text-center py-2" dir="ltr">
                        <div className="text-xl font-black">{currentPopupCard.word}</div>
                        <div className="text-xs font-mono duo-text-muted">{currentPopupCard.phonetic}</div>
                      </div>

                      {currentPopupCard.contextSentenceEn && (
                        <div
                          dir="ltr"
                          className="p-2.5 rounded-xl duo-surface-main border-2 duo-border-color text-xs font-bold text-center"
                        >
                          {currentPopupCard.contextSentenceEn}
                        </div>
                      )}

                      {!popupFlipped ? (
                        <button
                          type="button"
                          data-testid="popup-show-answer-btn"
                          onClick={() => setPopupFlipped(true)}
                          className="duo-btn duo-btn-blue w-full py-2.5 text-xs"
                        >
                          👁 نمایش پاسخ و زمان‌بندی AnkiDroid
                        </button>
                      ) : (
                        <div className="space-y-3 pt-2 border-t-2 duo-border-color">
                          <div className="text-center text-base font-black text-[#58CC02]">
                            {currentPopupCard.translationFa}
                          </div>
                          {currentPopupCard.aiExplanationFa && (
                            <div className="p-2.5 rounded-xl duo-surface-main border-2 duo-border-color text-[11px] font-bold leading-relaxed">
                              ✨ {currentPopupCard.aiExplanationFa}
                            </div>
                          )}
                          <div className="grid grid-cols-4 gap-1.5" dir="ltr">
                            <button
                              type="button"
                              onClick={() => {
                                handleGradeCard(currentPopupCard.id, 'again');
                                setPopupFlipped(false);
                              }}
                              className="duo-btn duo-btn-red py-1.5 text-[10px]"
                            >
                              Again &lt;10m
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleGradeCard(currentPopupCard.id, 'hard');
                                setPopupFlipped(false);
                              }}
                              className="duo-btn duo-btn-orange py-1.5 text-[10px]"
                            >
                              Hard 1d
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleGradeCard(currentPopupCard.id, 'good');
                                setPopupFlipped(false);
                              }}
                              className="duo-btn duo-btn-green py-1.5 text-[10px]"
                            >
                              Good 4d
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleGradeCard(currentPopupCard.id, 'easy');
                                setPopupFlipped(false);
                              }}
                              className="duo-btn duo-btn-blue py-1.5 text-[10px]"
                            >
                              Easy 7d
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs font-bold duo-text-muted">
                      تمام کارت‌های این جعبه مرور شده‌اند!
                    </div>
                  )}
                </div>

                {/* Bottom Direct Website Link & Full Portal Footer */}
                <div className="p-3 duo-surface-secondary border-t-2 duo-border-color flex items-center gap-2">
                  <a
                    href="https://ais-pre-kpvvaywqip7q5ueoy2ov3t-258196294078.us-east1.run.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="popup-direct-website-link"
                    className="duo-btn duo-btn-green flex-1 py-2 px-3 text-[11px] text-center"
                  >
                    🌐 ورود مستقیم به سایت اصلی Cunt Academy ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setToolbarPopupOpen(false);
                      setActiveNav('phrasepump');
                    }}
                    className="duo-btn duo-btn-neutral py-2 px-3 text-[11px]"
                  >
                    🪭 پنل کامل
                  </button>
                </div>
              </div>
            );
          })()}
        </header>

        {/* Active View Content (Spacious Duolingo p-6 & gap-6 Layout) */}
        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto">
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

          {activeNav === 'duopractice' && (
            <DuoPracticeView
              cards={cards}
              onGradeCard={handleGradeCard}
              onEarnXp={handleEarnXp}
              onExit={() => setActiveNav('media')}
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
