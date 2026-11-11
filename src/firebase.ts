import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  LeitnerCard,
  SavedSentence,
  LanguageReactorSettings,
} from './utils/linguatubeLogic';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export function sanitizeFirestoreId(rawId: string, fallbackPrefix = 'item'): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : `${fallbackPrefix}_${Date.now()}`;
}

function clampString(val: unknown, maxLen: number, fallback = ''): string {
  const str = typeof val === 'string' ? val.trim() : '';
  const effective = str.length > 0 ? str : fallback;
  return effective.slice(0, maxLen);
}

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export async function signInWithGoogleAccount(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutGoogleAccount(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged };
export type { User };

export async function ensureUserProfileDoc(
  user: User,
  settings: LanguageReactorSettings
): Promise<void> {
  const uid = sanitizeFirestoreId(user.uid, 'user');
  const path = `userProfiles/${uid}`;
  const ref = doc(db, 'userProfiles', uid);

  const preset =
    settings.wordColorPreset === 'default-lr' ||
    settings.wordColorPreset === 'kevin-hunting' ||
    settings.wordColorPreset === 'custom'
      ? settings.wordColorPreset
      : 'default-lr';

  const baseFields = {
    displayName: clampString(user.displayName || user.email?.split('@')[0] || 'Learner', 100, 'Learner'),
    photoURL: clampString(user.photoURL || '', 500, ''),
    vocabLevel: clampNumber(settings.vocabLevel, 100, 50000, 2500),
    wordColorPreset: preset,
    lrEnabled: Boolean(settings.lrEnabled),
    wordByWordHighlight: Boolean(settings.wordByWordHighlight),
    hoverPauseAtCueEnd: Boolean(settings.hoverPauseAtCueEnd),
    autoPauseAfterCue: Boolean(settings.autoPauseAfterCue),
  };

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        ...baseFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...baseFields,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function upsertCloudCard(userId: string, card: LeitnerCard): Promise<void> {
  const uid = sanitizeFirestoreId(userId, 'user');
  const cardId = sanitizeFirestoreId(card.id || `word_${card.word}`, 'word');
  const path = `userProfiles/${uid}/cards/${cardId}`;
  const ref = doc(db, 'userProfiles', uid, 'cards', cardId);

  const status =
    card.status === 'learning' || card.status === 'known' || card.status === 'ignored'
      ? card.status
      : 'learning';
  const pumpStage =
    card.pumpStage === 'marked' ||
    card.pumpStage === 'learning_now' ||
    card.pumpStage === 'learned' ||
    card.pumpStage === 'ignored'
      ? card.pumpStage
      : status === 'known'
        ? 'learned'
        : 'marked';
  const ankiState =
    card.ankiState === 'new' ||
    card.ankiState === 'learning' ||
    card.ankiState === 'review' ||
    card.ankiState === 'relearning'
      ? card.ankiState
      : 'new';

  const miniMeaningsFa = Array.isArray(card.miniMeaningsFa)
    ? card.miniMeaningsFa
        .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
        .slice(0, 12)
        .map((m) => m.trim().slice(0, 200))
    : [];

  const updatablePayload = {
    word: clampString(card.word, 120, 'word'),
    lemma: clampString(card.lemma || card.word, 120, 'word'),
    isPhrase: Boolean(card.isPhrase),
    status,
    pumpStage,
    ankiState,
    intervalDays: clampNumber(card.intervalDays, 0, 36500, 0),
    learningStep: clampNumber(card.learningStep, 0, 20, 0),
    customNotesFa: clampString(card.customNotesFa || '', 1000, ''),
    cefr: clampString(card.cefr || 'B1', 10, 'B1'),
    freqTag: clampString(card.freqTag || 'tag 2k', 32, 'tag 2k'),
    rank: clampNumber(card.rank, 0, 100000, 2200),
    phonetic: clampString(card.phonetic || '', 120, ''),
    translationFa: clampString(card.translationFa, 500, 'ترجمه'),
    miniMeaningsFa,
    aiExplanationFa: clampString(card.aiExplanationFa || '', 2000, ''),
    englishDefinition: clampString(card.englishDefinition || '', 1000, ''),
    contextSentenceEn: clampString(card.contextSentenceEn || '', 1000, ''),
    contextSentenceFa: clampString(card.contextSentenceFa || '', 1000, ''),
    videoId: clampString(card.videoId || 'youtube-video', 64, 'youtube-video'),
    videoTitle: clampString(card.videoTitle || 'YouTube Video', 300, 'YouTube Video'),
    videoTimestampSec: clampNumber(card.videoTimestampSec, 0, 864000, 0),
    box: clampNumber(card.box, 1, 6, 1),
    nextReviewAt: clampNumber(card.nextReviewAt, 0, 9999999999999, Date.now()),
    lastReviewedAt: clampNumber(card.lastReviewedAt, 0, 9999999999999, Date.now()),
    reviewCount: clampNumber(card.reviewCount, 0, 100000, 0),
    lapseCount: clampNumber(card.lapseCount, 0, 100000, 0),
    easeFactor: clampNumber(card.easeFactor, 1.3, 5.0, 2.5),
  };

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: cardId,
        ownerId: uid,
        ...updatablePayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...updatablePayload,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudCard(userId: string, cardIdRaw: string): Promise<void> {
  const uid = sanitizeFirestoreId(userId, 'user');
  const cardId = sanitizeFirestoreId(cardIdRaw, 'word');
  const path = `userProfiles/${uid}/cards/${cardId}`;
  try {
    await deleteDoc(doc(db, 'userProfiles', uid, 'cards', cardId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertCloudSentence(
  userId: string,
  sentence: SavedSentence
): Promise<void> {
  const uid = sanitizeFirestoreId(userId, 'user');
  const sentenceId = sanitizeFirestoreId(sentence.id, 'sent');
  const path = `userProfiles/${uid}/sentences/${sentenceId}`;
  const ref = doc(db, 'userProfiles', uid, 'sentences', sentenceId);

  const updatablePayload = {
    sentenceEn: clampString(sentence.sentenceEn, 1000, 'Subtitle sentence'),
    sentenceFa: clampString(sentence.sentenceFa || '', 1000, ''),
    videoId: clampString(sentence.videoId || 'youtube-video', 64, 'youtube-video'),
    videoTitle: clampString(sentence.videoTitle || 'YouTube Video', 300, 'YouTube Video'),
    timestampSec: clampNumber(sentence.timestampSec, 0, 864000, 0),
  };

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: sentenceId,
        ownerId: uid,
        ...updatablePayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...updatablePayload,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudSentence(userId: string, sentenceIdRaw: string): Promise<void> {
  const uid = sanitizeFirestoreId(userId, 'user');
  const sentenceId = sanitizeFirestoreId(sentenceIdRaw, 'sent');
  const path = `userProfiles/${uid}/sentences/${sentenceId}`;
  try {
    await deleteDoc(doc(db, 'userProfiles', uid, 'sentences', sentenceId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserCloudData(
  userId: string,
  onCardsUpdate: (cards: LeitnerCard[]) => void,
  onSentencesUpdate: (sentences: SavedSentence[]) => void
): Unsubscribe {
  const uid = sanitizeFirestoreId(userId, 'user');
  const cardsPath = `userProfiles/${uid}/cards`;
  const sentencesPath = `userProfiles/${uid}/sentences`;

  const unsubCards = onSnapshot(
    collection(db, 'userProfiles', uid, 'cards'),
    (snapshot) => {
      const loaded: LeitnerCard[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        loaded.push({
          id: String(d.id || docSnap.id),
          word: String(d.word || ''),
          lemma: String(d.lemma || d.word || ''),
          isPhrase: Boolean(d.isPhrase),
          status: (d.status as LeitnerCard['status']) || 'learning',
          pumpStage: (d.pumpStage as LeitnerCard['pumpStage']) || 'marked',
          ankiState: (d.ankiState as LeitnerCard['ankiState']) || 'new',
          intervalDays: Number(d.intervalDays ?? 0),
          learningStep: Number(d.learningStep ?? 0),
          customNotesFa: String(d.customNotesFa || ''),
          cefr: String(d.cefr || 'B1'),
          freqTag: String(d.freqTag || 'tag 2k'),
          rank: Number(d.rank ?? 2200),
          phonetic: String(d.phonetic || ''),
          translationFa: String(d.translationFa || ''),
          miniMeaningsFa: Array.isArray(d.miniMeaningsFa) ? d.miniMeaningsFa.map(String) : [],
          aiExplanationFa: String(d.aiExplanationFa || ''),
          posEntries: [],
          englishDefinition: String(d.englishDefinition || ''),
          contextSentenceEn: String(d.contextSentenceEn || ''),
          contextSentenceFa: String(d.contextSentenceFa || ''),
          tatoebaExamples: [],
          videoId: String(d.videoId || 'youtube-video'),
          videoTitle: String(d.videoTitle || 'YouTube Video'),
          videoTimestampSec: Number(d.videoTimestampSec ?? 0),
          box: Number(d.box ?? 1),
          nextReviewAt: Number(d.nextReviewAt ?? Date.now()),
          lastReviewedAt: Number(d.lastReviewedAt ?? Date.now()),
          reviewCount: Number(d.reviewCount ?? 0),
          lapseCount: Number(d.lapseCount ?? 0),
          easeFactor: Number(d.easeFactor ?? 2.5),
          createdAt: Number(d.lastReviewedAt ?? Date.now()),
        });
      });
      loaded.sort((a, b) => b.lastReviewedAt - a.lastReviewedAt);
      onCardsUpdate(loaded);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, cardsPath);
    }
  );

  const unsubSentences = onSnapshot(
    collection(db, 'userProfiles', uid, 'sentences'),
    (snapshot) => {
      const loaded: SavedSentence[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        loaded.push({
          id: String(d.id || docSnap.id),
          sentenceEn: String(d.sentenceEn || ''),
          sentenceFa: String(d.sentenceFa || ''),
          videoId: String(d.videoId || 'youtube-video'),
          videoTitle: String(d.videoTitle || 'YouTube Video'),
          timestampSec: Number(d.timestampSec ?? 0),
          createdAt: Date.now(),
        });
      });
      onSentencesUpdate(loaded);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, sentencesPath);
    }
  );

  return () => {
    unsubCards();
    unsubSentences();
  };
}

export interface AppAccountUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  refreshToken?: string;
  authMode?: 'firebase-google' | 'cloud-token' | 'direct-account';
}

export function generateExtensionSyncToken(
  user: User | AppAccountUser,
  cardsSnapshot?: LeitnerCard[],
  geminiApiKey?: string
): string {
  const compactCards = Array.isArray(cardsSnapshot)
    ? cardsSnapshot.slice(0, 150).map((c) => ({
        w: c.word,
        t: c.translationFa,
        b: c.box || 1,
        s: c.status || 'learning',
        c: c.contextSentenceEn || '',
        cf: c.contextSentenceFa || '',
        n: c.customNotesFa || '',
        p: c.phonetic || '',
        ce: c.cefr || 'B1',
        iv: c.intervalDays || 0,
        nr: c.nextReviewAt || Date.now(),
        pg: Array.isArray(c.posEntries)
          ? c.posEntries.slice(0, 3).map((pe) => ({ pos: pe.pos, meanings: pe.terms }))
          : undefined,
        tx: Array.isArray(c.tatoebaExamples)
          ? c.tatoebaExamples.slice(0, 2).map((ex) => ({ en: ex.en, fa: ex.fa }))
          : undefined,
      }))
    : undefined;

  const payload = {
    v: 2,
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email?.split('@')[0] || 'User',
    rt: user.refreshToken || 'direct_client_session',
    projectId: firebaseConfig.projectId,
    dbId: firebaseConfig.firestoreDatabaseId,
    apiKey: firebaseConfig.apiKey,
    mode: (user as AppAccountUser).authMode || 'firebase-google',
    gk: geminiApiKey || undefined,
    cards: compactCards,
  };
  return btoa(encodeURIComponent(JSON.stringify(payload)));
}

const DIRECT_SESSION_STORAGE_KEY = 'cunt_academy_direct_session_v1';
const DIRECT_ACCOUNTS_REGISTRY_KEY = 'cunt_academy_direct_accounts_v1';

export function getStoredDirectSession(): AppAccountUser | null {
  try {
    const raw = localStorage.getItem(DIRECT_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.uid === 'string' && parsed.email) {
      return parsed as AppAccountUser;
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearStoredDirectSession(): void {
  try {
    localStorage.removeItem(DIRECT_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function deterministicUidFromEmail(email: string): string {
  const clean = email.trim().toLowerCase();
  let hash = 5381;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 33) ^ clean.charCodeAt(i);
  }
  const safeEmailPart = clean.replace(/[^a-z0-9]/g, '_').slice(0, 40);
  return `acct_${safeEmailPart}_${Math.abs(hash >>> 0).toString(16)}`;
}

export function signInOrRegisterDirectEmailAccount(
  emailRaw: string,
  passwordRaw?: string,
  displayNameRaw?: string
): AppAccountUser {
  const email = String(emailRaw || '').trim().toLowerCase();
  const password = String(passwordRaw || '').trim() || 'cunt_academy_default';
  if (!email || !email.includes('@')) {
    throw new Error('لطفاً یک آدرس جیمیل معتبر (مثلاً you@gmail.com) وارد کنید.');
  }

  let registry: Record<
    string,
    { uid: string; email: string; displayName: string; passwordHash: string }
  > = {};
  try {
    const rawReg = localStorage.getItem(DIRECT_ACCOUNTS_REGISTRY_KEY);
    if (rawReg) registry = JSON.parse(rawReg) || {};
  } catch {
    registry = {};
  }

  const uid = deterministicUidFromEmail(email);
  const simpleHash = btoa(encodeURIComponent(`${email}::${password}`));
  const existing = registry[email];

  const displayName =
    (displayNameRaw && displayNameRaw.trim()) ||
    existing?.displayName ||
    email.split('@')[0] ||
    'کاربر Cunt Academy';

  registry[email] = {
    uid,
    email,
    displayName,
    passwordHash: simpleHash,
  };

  try {
    localStorage.setItem(DIRECT_ACCOUNTS_REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    // ignore
  }

  const sessionUser: AppAccountUser = {
    uid,
    email,
    displayName,
    photoURL: null,
    refreshToken: `direct_${simpleHash.slice(0, 32)}`,
    authMode: 'direct-account',
  };

  try {
    localStorage.setItem(DIRECT_SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
  } catch {
    // ignore
  }

  return sessionUser;
}

export function convertExtensionCardToWebCard(raw: Record<string, unknown>): LeitnerCard | null {
  const word = String(raw.word || raw.w || '')
    .trim()
    .toLowerCase();
  if (!word) return null;
  const translationFa = String(
    raw.translationFa || raw.translation || raw.t || word
  ).trim();
  const box = Number(raw.box ?? raw.leitnerBox ?? raw.b ?? 1) || 1;
  const status = (raw.status || raw.s || (box >= 5 ? 'known' : 'learning')) as LeitnerCard['status'];
  const pumpStage: LeitnerCard['pumpStage'] =
    status === 'known' || box >= 5
      ? 'learned'
      : status === 'ignored'
        ? 'ignored'
        : box >= 2
          ? 'learning_now'
          : 'marked';

  const rawPosGroups = (raw.posEntries || raw.posGroups || raw.pg) as
    | Array<{ pos?: string; terms?: string[]; meanings?: string[] }>
    | undefined;
  const posEntries = Array.isArray(rawPosGroups)
    ? rawPosGroups
        .map((g) => ({
          pos: String(g?.pos || 'word'),
          terms: Array.isArray(g?.terms)
            ? g.terms.map(String)
            : Array.isArray(g?.meanings)
              ? g.meanings.map(String)
              : [],
        }))
        .filter((g) => g.terms.length > 0)
    : [];

  const rawTatoeba = (raw.tatoebaExamples || raw.tx) as
    | Array<{ en?: string; fa?: string }>
    | undefined;
  const tatoebaExamples = Array.isArray(rawTatoeba)
    ? rawTatoeba
        .filter((ex) => ex && ex.en)
        .map((ex) => ({
          en: String(ex.en || ''),
          fa: String(ex.fa || ''),
          source: 'Tatoeba' as const,
        }))
    : [];

  return {
    id: sanitizeFirestoreId(
      String(raw.id || `word_${word.replace(/[^a-z0-9]/gi, '_')}`),
      'word'
    ),
    word,
    lemma: String(raw.lemma || word),
    isPhrase: Boolean(raw.isPhrase ?? /\s+/.test(word)),
    status,
    pumpStage,
    ankiState: (raw.ankiState as LeitnerCard['ankiState']) || (box > 1 ? 'review' : 'new'),
    intervalDays: Number(raw.intervalDays ?? raw.iv ?? 0),
    learningStep: Number(raw.learningStep ?? 0),
    customNotesFa: String(raw.customNotesFa || raw.customNotes || raw.n || ''),
    cefr: (String(raw.cefr || raw.ce || 'B1') as LeitnerCard['cefr']) || 'B1',
    freqTag: String(raw.freqTag || 'tag 2k'),
    rank: Number(raw.rank || 2200),
    phonetic: String(raw.phonetic || raw.p || `/${word}/`),
    translationFa,
    miniMeaningsFa: Array.isArray(raw.miniMeaningsFa) ? (raw.miniMeaningsFa as string[]) : [],
    aiExplanationFa: String(raw.aiExplanationFa || raw.aiExplanation || ''),
    posEntries,
    englishDefinition: String(raw.englishDefinition || ''),
    contextSentenceEn: String(raw.contextSentenceEn || raw.contextSentence || raw.c || ''),
    contextSentenceFa: String(raw.contextSentenceFa || raw.contextTranslation || raw.cf || ''),
    tatoebaExamples,
    videoId: String(raw.videoId || 'youtube-video'),
    videoTitle: String(raw.videoTitle || 'YouTube Video'),
    videoTimestampSec: Number(raw.videoTimestampSec ?? raw.timestamp ?? 0),
    box: Math.min(6, Math.max(1, box)),
    nextReviewAt: Number(raw.nextReviewAt ?? raw.nr ?? Date.now() - 1000),
    lastReviewedAt: Number(raw.lastReviewedAt ?? Date.now()),
    reviewCount: Number(raw.reviewCount ?? 0),
    lapseCount: Number(raw.lapseCount ?? 0),
    easeFactor: Number(raw.easeFactor ?? 2.5),
    createdAt: Number(raw.createdAt ?? Date.now()),
  };
}

export async function signInWithCloudSyncToken(rawToken: string): Promise<{
  user: AppAccountUser;
  cloudCards: LeitnerCard[];
  geminiApiKey?: string;
}> {
  const clean = String(rawToken || '').trim();
  if (!clean) {
    throw new Error('لطفاً کد اتصال ابری یا آدرس جیمیل خود را وارد کنید.');
  }

  // Allow user to directly type their Gmail in the token field as well!
  if (clean.includes('@') && !clean.includes('{')) {
    const directUser = signInOrRegisterDirectEmailAccount(clean);
    return { user: directUser, cloudCards: [] };
  }

  let parsed: {
    uid?: string;
    email?: string;
    displayName?: string;
    rt?: string;
    projectId?: string;
    dbId?: string;
    apiKey?: string;
    gk?: string;
    geminiApiKey?: string;
    cards?: Array<Record<string, unknown>>;
  } | null = null;
  try {
    parsed = JSON.parse(decodeURIComponent(atob(clean)));
  } catch {
    try {
      parsed = JSON.parse(atob(clean));
    } catch {
      throw new Error('فرمت کد اتصال ابری معتبر نیست.');
    }
  }

  if (!parsed || (!parsed.uid && !parsed.email)) {
    throw new Error('کد اتصال ابری ناقص است.');
  }

  const resolvedEmail = parsed.email || 'user@gmail.com';
  const resolvedUid = parsed.uid || deterministicUidFromEmail(resolvedEmail);

  const sessionUser: AppAccountUser = {
    uid: resolvedUid,
    email: resolvedEmail,
    displayName: parsed.displayName || resolvedEmail.split('@')[0] || 'کاربر ابری',
    photoURL: null,
    refreshToken: parsed.rt || 'direct_client_session',
    authMode: 'cloud-token',
  };

  const cloudCards: LeitnerCard[] = [];

  // 1. Extract any embedded cards inside the Sync Token (e.g. from Extension Popup or Website)
  if (Array.isArray(parsed.cards)) {
    for (const rawCard of parsed.cards) {
      const converted = convertExtensionCardToWebCard(rawCard);
      if (converted) cloudCards.push(converted);
    }
  }

  // 2. If a real Firebase OAuth refresh token is present, also fetch from Firestore REST API
  if (
    parsed.rt &&
    !parsed.rt.startsWith('direct_') &&
    parsed.apiKey &&
    parsed.projectId &&
    parsed.dbId
  ) {
    try {
      const tokenRes = await fetch(
        `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(parsed.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(parsed.rt)}`,
        }
      );
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        const idToken = tokenData.id_token;
        if (idToken) {
          const uid = sanitizeFirestoreId(resolvedUid, 'user');
          const listUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(parsed.projectId)}/databases/${encodeURIComponent(parsed.dbId)}/documents/userProfiles/${encodeURIComponent(uid)}/cards?pageSize=250`;
          const listRes = await fetch(listUrl, {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (listRes.ok) {
            const listData = await listRes.json();
            const docs = Array.isArray(listData.documents) ? listData.documents : [];
            for (const docItem of docs) {
              const f = docItem.fields || {};
              const word = f.word?.stringValue || '';
              if (!word) continue;
              const converted = convertExtensionCardToWebCard({
                id: f.id?.stringValue || sanitizeFirestoreId(`word_${word}`, 'word'),
                word,
                lemma: f.lemma?.stringValue || word,
                isPhrase: Boolean(f.isPhrase?.booleanValue),
                status: f.status?.stringValue || 'learning',
                pumpStage: f.pumpStage?.stringValue || 'marked',
                ankiState: f.ankiState?.stringValue || 'new',
                intervalDays: Number(f.intervalDays?.integerValue || 0),
                learningStep: Number(f.learningStep?.integerValue || 0),
                customNotesFa: f.customNotesFa?.stringValue || '',
                cefr: f.cefr?.stringValue || 'B1',
                freqTag: f.freqTag?.stringValue || 'tag 2k',
                rank: Number(f.rank?.integerValue || 2200),
                phonetic: f.phonetic?.stringValue || '',
                translationFa: f.translationFa?.stringValue || '',
                aiExplanationFa: f.aiExplanationFa?.stringValue || '',
                englishDefinition: f.englishDefinition?.stringValue || '',
                contextSentenceEn: f.contextSentenceEn?.stringValue || '',
                contextSentenceFa: f.contextSentenceFa?.stringValue || '',
                videoId: f.videoId?.stringValue || 'youtube-video',
                videoTitle: f.videoTitle?.stringValue || 'YouTube Video',
                videoTimestampSec: Number(f.videoTimestampSec?.integerValue || 0),
                box: Number(f.box?.integerValue || 1),
                nextReviewAt: Number(f.nextReviewAt?.integerValue || Date.now()),
                lastReviewedAt: Number(f.lastReviewedAt?.integerValue || Date.now()),
                reviewCount: Number(f.reviewCount?.integerValue || 0),
                lapseCount: Number(f.lapseCount?.integerValue || 0),
                easeFactor: Number(f.easeFactor?.doubleValue || f.easeFactor?.integerValue || 2.5),
              });
              if (converted && !cloudCards.some((c) => c.word === converted.word)) {
                cloudCards.push(converted);
              }
            }
          }
        }
      }
    } catch {
      // continue with local/embedded cards seamlessly
    }
  }

  try {
    localStorage.setItem(DIRECT_SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
  } catch {
    // ignore
  }

  const syncedGeminiKey = String(parsed.gk || parsed.geminiApiKey || '').trim();
  return { user: sessionUser, cloudCards, geminiApiKey: syncedGeminiKey || undefined };
}


