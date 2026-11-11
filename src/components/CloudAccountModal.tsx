import React, { useState, useEffect } from 'react';
import {
  Cloud,
  LogIn,
  LogOut,
  Copy,
  Check,
  RefreshCw,
  Globe,
  KeyRound,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Mail,
  UserPlus,
  X,
  Cpu,
} from 'lucide-react';
import { User, AppAccountUser, generateExtensionSyncToken } from '../firebase';
import { LeitnerCard } from '../utils/linguatubeLogic';
import {
  GeminiConnectionConfig,
  loadGeminiConfig,
  verifyServerGeminiConnection,
  getStoredUserGeminiApiKey,
  setStoredUserGeminiApiKey,
} from '../services/geminiService';

export const PUBLIC_SHARED_APP_URL = 'https://cunt-academy.netlify.app/';

interface CloudAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | AppAccountUser | null;
  cards?: LeitnerCard[];
  authLoading: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  syncError: string | null;
  cardsCount: number;
  sentencesCount: number;
  extensionBridgeConnected?: boolean;
  onSignInGoogle: () => Promise<void>;
  onSignInDirectEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  onSignInSyncToken: (token: string) => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  onForcePushLocalToCloud: () => Promise<void>;
  onGeminiConfigChange?: (cfg: GeminiConnectionConfig) => void;
}

export const CloudAccountModal: React.FC<CloudAccountModalProps> = ({
  isOpen,
  onClose,
  user,
  cards = [],
  authLoading,
  syncStatus,
  syncError,
  cardsCount,
  sentencesCount,
  extensionBridgeConnected = false,
  onSignInGoogle,
  onSignInDirectEmail,
  onSignInSyncToken,
  onSignOutGoogle,
  onForcePushLocalToCloud,
  onGeminiConfigChange,
}) => {
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [copiedSyncKey, setCopiedSyncKey] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [syncTokenInput, setSyncTokenInput] = useState('');
  const [showTokenPaste, setShowTokenPaste] = useState(false);
  const [tokenSuccessMsg, setTokenSuccessMsg] = useState<string | null>(null);

  // Server-Side Gemini AI Connection & Extension Sync State
  const [geminiCfg, setGeminiCfg] = useState<GeminiConnectionConfig>(() => loadGeminiConfig());
  const [geminiVerifying, setGeminiVerifying] = useState<boolean>(false);
  const [geminiVerifyError, setGeminiVerifyError] = useState<string | null>(null);
  const [extGeminiKeyInput, setExtGeminiKeyInput] = useState<string>(() =>
    getStoredUserGeminiApiKey()
  );
  const [extKeySavedMsg, setExtKeySavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const latest = loadGeminiConfig();
      setGeminiCfg(latest);
      setExtGeminiKeyInput(getStoredUserGeminiApiKey());
      setGeminiVerifyError(null);
      setExtKeySavedMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const canonicalDomain = PUBLIC_SHARED_APP_URL;
  const extensionSyncToken = user
    ? generateExtensionSyncToken(user, cards, extGeminiKeyInput.trim())
    : '';

  const handleCopyDomain = () => {
    navigator.clipboard?.writeText(canonicalDomain);
    setCopiedDomain(true);
    setTimeout(() => setCopiedDomain(false), 2200);
  };

  const handleCopySyncKey = () => {
    if (!extensionSyncToken) return;
    navigator.clipboard?.writeText(extensionSyncToken);
    setCopiedSyncKey(true);
    setTimeout(() => setCopiedSyncKey(false), 2500);
  };

  const handleDirectEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSignInDirectEmail(emailInput, passwordInput || 'cunt_academy_default', nameInput);
  };

  const handleSyncTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncTokenInput.trim()) return;
    await onSignInSyncToken(syncTokenInput);
    setSyncTokenInput('');
    setExtGeminiKeyInput(getStoredUserGeminiApiKey());
    setTokenSuccessMsg('✓ اکانت جیمیل، تنظیمات Gemini و تمام فلش‌کارت‌های کد سینک با موفقیت وارد سایت شدند!');
    setTimeout(() => setTokenSuccessMsg(null), 4000);
  };

  const handleVerifyGeminiServer = async () => {
    setGeminiVerifying(true);
    setGeminiVerifyError(null);
    try {
      const cleanedKey = setStoredUserGeminiApiKey(extGeminiKeyInput);
      // Also push immediately to the browser extension bridge if installed
      window.postMessage(
        {
          source: 'CUNT_ACADEMY_WEBSITE',
          type: 'PUSH_WEBSITE_STATE',
          cards: cards.slice(0, 250),
          cloudAccount: user
            ? { uid: user.uid, email: user.email, displayName: user.displayName }
            : null,
          geminiApiKey: cleanedKey,
        },
        '*'
      );
      const verifiedCfg = await verifyServerGeminiConnection();
      setGeminiCfg(verifiedCfg);
      onGeminiConfigChange?.(verifiedCfg);
      if (cleanedKey) {
        setExtKeySavedMsg('✓ کلید هوش مصنوعی ذخیره شد و با اکستنشن مرورگر و سایت همگام‌سازی گردید!');
        setTimeout(() => setExtKeySavedMsg(null), 3500);
      }
    } catch (err) {
      setGeminiVerifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeminiVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl duo-card overflow-hidden"
      >
        {/* Top Modal Header */}
        <div className="px-6 py-4 duo-surface-secondary border-b-2 duo-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1CB0F6] border-b-4 border-[#1899D6] flex items-center justify-center text-white">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black duo-text-main">
                ورود با جیمیل، سینک اکستنشن و اتصال هوش مصنوعی Google Gemini
              </h2>
              <p className="text-xs font-bold duo-text-muted">
                دامین رسمی: <span dir="ltr" className="text-[#1CB0F6]">https://cunt-academy.netlify.app/</span> • سینک بدون انقضا بین اکستنشن و سایت
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="close-cloud-modal-btn"
            className="duo-btn duo-btn-neutral p-2 text-xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* SECTION 1: SERVER-SIDE GEMINI AI CONNECTION & EXTENSION KEY SYNC */}
          <div
            data-testid="gemini-connection-section"
            className="p-5 duo-card-subtle space-y-3.5 border-2 border-[#CE82FF]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black text-[#CE82FF]">
                <Cpu className="w-4 h-4 shrink-0" />
                <span>۱. وضعیت سرویس هوش مصنوعی Google Gemini و همگام‌سازی با اکستنشن:</span>
              </div>
              <span
                data-testid="gemini-verified-badge"
                className="px-3 py-1 rounded-xl bg-[#58CC02] text-white text-[11px] font-black flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>متصل به Google Gemini (فعال)</span>
              </span>
            </div>

            <p className="text-xs font-bold duo-text-muted leading-relaxed">
              پرسش و پاسخ هوشمند درباره واژه‌های زیرنویس و تحلیل بافت جمله با Google Gemini فعال است. همچنین اگر می‌خواهید اکستنشن یوتیوب از کلید اختصاصی خودتان استفاده کند، می‌توانید آن را در کادر زیر وارد کنید تا بین سایت و اکستنشن سینک شود:
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                dir="ltr"
                value={extGeminiKeyInput}
                onChange={(e) => setExtGeminiKeyInput(e.target.value)}
                placeholder="Optional: Paste Gemini API Key for Extension Sync..."
                data-testid="extension-gemini-key-sync-input"
                className="flex-1 duo-surface-main border-2 duo-border rounded-2xl px-3.5 py-2.5 text-xs font-mono font-bold duo-text-main focus:outline-none focus:border-[#CE82FF]"
              />
              <button
                type="button"
                onClick={handleVerifyGeminiServer}
                disabled={geminiVerifying}
                data-testid="verify-gemini-key-btn"
                className="duo-btn duo-btn-purple px-4 py-2.5 text-xs shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {geminiVerifying
                    ? 'در حال ذخیره و تست Gemini...'
                    : '✨ ذخیره و تست اتصال Gemini AI'}
                </span>
              </button>
            </div>

            <div
              data-testid="gemini-status-message"
              className="p-3 rounded-2xl bg-[#58CC02]/15 border-2 border-[#58CC02] text-[#58CC02] text-xs font-black flex items-center justify-between gap-2"
            >
              <span>{extKeySavedMsg || geminiCfg.statusMessageFa}</span>
              <span dir="ltr" className="font-mono text-[10px] px-2 py-0.5 rounded-lg bg-[#58CC02] text-white">
                {geminiCfg.model}
              </span>
            </div>

            {geminiVerifyError && (
              <div className="p-3 rounded-2xl bg-[#FF4B4B]/15 border-2 border-[#FF4B4B] text-[#FF4B4B] text-xs font-bold">
                {geminiVerifyError}
              </div>
            )}
          </div>

          {/* SECTION 2: GMAIL ACCOUNT & INSTANT LOGIN */}
          <div className="p-5 duo-card-subtle space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black text-[#1CB0F6]">
                <Mail className="w-4 h-4 shrink-0" />
                <span>۲. ورود با جیمیل و همگام‌سازی دوطرفه فلش‌کارت‌ها:</span>
              </div>
              <div className="flex items-center gap-2">
                {extensionBridgeConnected && (
                  <span className="px-2.5 py-1 rounded-xl bg-[#1CB0F6]/20 text-[#1CB0F6] text-[10px] font-black">
                    🧩 پل ارتباطی اکستنشن فعال
                  </span>
                )}
                {user && (
                  <span className="px-3 py-1 rounded-xl bg-[#58CC02] text-white text-[11px] font-black flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>اکانت جیمیل فعال</span>
                  </span>
                )}
              </div>
            </div>

            {!user ? (
              <div className="space-y-4">
                {/* 1-Click Gmail Login Form */}
                <form
                  onSubmit={handleDirectEmailSubmit}
                  className="p-4 rounded-2xl duo-surface-main border-2 duo-border space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-black text-[#58CC02]">
                      <Mail className="w-4 h-4 shrink-0" />
                      <span>ورود فوری با آدرس جیمیل (۱۰۰٪ سازگار با Netlify و اکستنشن):</span>
                    </div>
                    <span className="text-[10px] text-[#58CC02] font-black">بدون خطای انقضا</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="email"
                      required
                      dir="ltr"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="you@gmail.com"
                      data-testid="direct-email-input"
                      className="duo-surface-secondary border-2 duo-border rounded-2xl px-3 py-2.5 text-xs font-mono font-bold duo-text-main focus:outline-none focus:border-[#58CC02]"
                    />
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="نام نمایشی (اختیاری)"
                      data-testid="direct-name-input"
                      className="duo-surface-secondary border-2 duo-border rounded-2xl px-3 py-2.5 text-xs font-bold duo-text-main focus:outline-none focus:border-[#58CC02]"
                    />
                    <input
                      type="password"
                      dir="ltr"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="رمز عبور (اختیاری)"
                      data-testid="direct-password-input"
                      className="duo-surface-secondary border-2 duo-border rounded-2xl px-3 py-2.5 text-xs font-mono font-bold duo-text-main focus:outline-none focus:border-[#58CC02]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    data-testid="direct-email-submit-btn"
                    className="w-full duo-btn duo-btn-green py-3 px-4 text-xs"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>ورود فوری به اکانت جیمیل و فعال‌سازی سینک</span>
                  </button>
                </form>

                {/* Firebase Google Popup */}
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={onSignInGoogle}
                  data-testid="modal-google-signin-btn"
                  className="w-full duo-btn duo-btn-blue py-3 px-4 text-xs disabled:opacity-50"
                >
                  <LogIn className="w-4 h-4" />
                  <span>
                    {authLoading
                      ? 'در حال اتصال به پنجره گوگل...'
                      : 'ورود با پنجره پاپ‌آپ گوگل (Google Sign-In)'}
                  </span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl duo-surface-main border-2 duo-border flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'User'}
                        className="w-11 h-11 rounded-2xl border-2 border-[#58CC02]"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-2xl bg-[#1CB0F6] border-b-4 border-[#1899D6] flex items-center justify-center text-white font-black text-base">
                        {(user.displayName || user.email || 'U').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-black duo-text-main">
                        {user.displayName || 'کاربر Cunt Academy'}
                      </div>
                      <div dir="ltr" className="text-xs font-mono font-bold text-[#58CC02]">
                        {user.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onForcePushLocalToCloud}
                      disabled={syncStatus === 'syncing'}
                      data-testid="sync-now-modal-btn"
                      className="duo-btn duo-btn-green px-3.5 py-2 text-xs"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
                      />
                      <span>
                        {syncStatus === 'syncing'
                          ? 'در حال همگام‌سازی...'
                          : '🔄 همگام‌سازی فوری با اکستنشن و فضای ابری'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={onSignOutGoogle}
                      data-testid="signout-account-btn"
                      className="duo-btn duo-btn-red px-3.5 py-2 text-xs"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>خروج</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-2xl duo-surface-main border-2 duo-border flex items-center justify-between">
                    <span className="duo-text-muted font-bold">فلش‌کارت‌های اکانت شما:</span>
                    <strong className="text-[#58CC02] font-black">{cardsCount} کارت</strong>
                  </div>
                  <div className="p-3 rounded-2xl duo-surface-main border-2 duo-border flex items-center justify-between">
                    <span className="duo-text-muted font-bold">جملات ذخیره‌شده:</span>
                    <strong className="text-[#1CB0F6] font-black">{sentencesCount} جمله</strong>
                  </div>
                </div>
              </div>
            )}

            {syncError && (
              <div className="p-3 rounded-2xl bg-[#FFDFE0] dark:bg-[#2B161B] border-2 border-[#FF4B4B] text-[#FF4B4B] text-xs font-bold leading-relaxed">
                {syncError}
              </div>
            )}

            {tokenSuccessMsg && (
              <div className="p-3 rounded-2xl bg-[#58CC02]/15 border-2 border-[#58CC02] text-[#58CC02] text-xs font-black">
                {tokenSuccessMsg}
              </div>
            )}
          </div>

          {/* SECTION 3: NON-EXPIRING EXTENSION SYNC KEY & TWO-WAY CODE IMPORT */}
          <div className="p-5 duo-card-subtle space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black text-[#FF9600]">
                <KeyRound className="w-4 h-4 shrink-0" />
                <span>۳. اتصال دائمی اکستنشن مرورگر و انتقال کلمات (بدون انقضا):</span>
              </div>
              <button
                type="button"
                onClick={() => setShowTokenPaste((prev) => !prev)}
                className="text-xs font-black text-[#1CB0F6] hover:underline"
              >
                {showTokenPaste ? 'بستن کادر ورود کد' : '📥 جای‌گذاری کد سینک از اکستنشن'}
              </button>
            </div>

            {user ? (
              <div className="space-y-2.5">
                <p className="text-xs font-bold duo-text-muted leading-relaxed">
                  اگر اکستنشن روی همین مرورگر نصب باشد، کلمات جدید به صورت <strong>خودکار</strong> با سایت سینک می‌شوند. همچنین می‌توانید در پاپ‌آپ اکستنشن، یا همین جیمیل (<code dir="ltr" className="text-[#58CC02] font-black">{user.email}</code>) را وارد کنید یا کد دائمی زیر را کپی کنید:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    dir="ltr"
                    value={extensionSyncToken}
                    data-testid="extension-sync-token-input"
                    className="flex-1 duo-surface-main border-2 duo-border rounded-2xl px-3.5 py-2.5 text-xs font-mono font-bold text-[#FF9600] select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopySyncKey}
                    data-testid="copy-extension-sync-key-btn"
                    className="duo-btn duo-btn-yellow px-4 py-2.5 text-xs shrink-0"
                  >
                    {copiedSyncKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedSyncKey ? 'کد دائمی کپی شد!' : 'کپی کد اتصال اکستنشن'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs font-bold duo-text-muted leading-relaxed">
                در بخش بالا آدرس جیمیل خود را وارد کنید تا کد دائمی اتصال اکستنشن ساخته شود.
              </p>
            )}

            {showTokenPaste && (
              <form
                onSubmit={handleSyncTokenSubmit}
                className="p-3.5 rounded-2xl duo-surface-main border-2 duo-border space-y-2"
              >
                <div className="text-xs font-black text-[#1CB0F6]">
                  جای‌گذاری کد سینک اکستنشن (برای وارد کردن فوری تمام کلمات ذخیره‌شده در پاپ‌آپ اکستنشن به سایت):
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={syncTokenInput}
                    onChange={(e) => setSyncTokenInput(e.target.value)}
                    placeholder="Paste Sync Code from Extension Popup..."
                    data-testid="paste-sync-token-input"
                    className="flex-1 duo-surface-secondary border-2 duo-border rounded-xl px-3 py-2 text-xs font-mono font-bold duo-text-main focus:outline-none"
                  />
                  <button
                    type="submit"
                    data-testid="submit-sync-token-btn"
                    className="duo-btn duo-btn-green px-4 py-2 text-xs shrink-0"
                  >
                    اتصال و دریافت کلمات
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* SECTION 4: CANONICAL PUBLIC DOMAIN LINK */}
          <div className="p-5 duo-card-subtle space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black text-[#58CC02]">
                <Globe className="w-4 h-4 shrink-0" />
                <span>۴. آدرس رسمی سایت شما (موبایل، تبلت، دسکتاپ و اکستنشن):</span>
              </div>
              <span className="px-2.5 py-1 rounded-xl bg-[#58CC02]/15 text-[#58CC02] text-[10px] font-black">
                Official Domain
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                dir="ltr"
                value={canonicalDomain}
                data-testid="public-domain-input"
                className="flex-1 duo-surface-main border-2 duo-border rounded-2xl px-3.5 py-2.5 text-xs font-mono font-bold text-[#1CB0F6] select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyDomain}
                data-testid="copy-public-domain-btn"
                className="duo-btn duo-btn-green px-4 py-2.5 text-xs shrink-0"
              >
                {copiedDomain ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedDomain ? 'کپی شد!' : 'کپی لینک سایت'}</span>
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold duo-text-muted pt-1">
              <ShieldCheck className="w-4 h-4 text-[#58CC02] shrink-0" />
              <span>
                تمام لینک‌های داخل پاپ‌آپ اکستنشن و پنل سایت به صورت یکپارچه به <code dir="ltr" className="text-[#58CC02]">https://cunt-academy.netlify.app/</code> متصل هستند.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
