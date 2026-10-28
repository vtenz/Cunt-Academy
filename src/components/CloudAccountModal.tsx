import React, { useState } from 'react';
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
} from 'lucide-react';
import { User, AppAccountUser, generateExtensionSyncToken } from '../firebase';

export const PUBLIC_SHARED_APP_URL =
  'https://ais-pre-kpvvaywqip7q5ueoy2ov3t-258196294078.us-east1.run.app';

interface CloudAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | AppAccountUser | null;
  authLoading: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  syncError: string | null;
  cardsCount: number;
  sentencesCount: number;
  onSignInGoogle: () => Promise<void>;
  onSignInDirectEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  onSignInSyncToken: (token: string) => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  onForcePushLocalToCloud: () => Promise<void>;
}

export const CloudAccountModal: React.FC<CloudAccountModalProps> = ({
  isOpen,
  onClose,
  user,
  authLoading,
  syncStatus,
  syncError,
  cardsCount,
  sentencesCount,
  onSignInGoogle,
  onSignInDirectEmail,
  onSignInSyncToken,
  onSignOutGoogle,
  onForcePushLocalToCloud,
}) => {
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [copiedSyncKey, setCopiedSyncKey] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [syncTokenInput, setSyncTokenInput] = useState('');
  const [showTokenPaste, setShowTokenPaste] = useState(false);

  if (!isOpen) return null;

  const currentOrigin =
    typeof window !== 'undefined' &&
    window.location?.origin &&
    !window.location.origin.includes('localhost')
      ? window.location.origin
      : PUBLIC_SHARED_APP_URL;

  const extensionSyncToken = user ? generateExtensionSyncToken(user) : '';

  const handleCopyDomain = () => {
    navigator.clipboard?.writeText(currentOrigin);
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
    await onSignInDirectEmail(emailInput, passwordInput, nameInput);
  };

  const handleSyncTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSignInSyncToken(syncTokenInput);
    setSyncTokenInput('');
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
                حساب کاربری جیمیل، دامین عمومی و همگام‌سازی ابری
              </h2>
              <p className="text-xs font-bold duo-text-muted">
                بدون وابستگی به سرور بک‌اند (۱۰۰٪ سازگار با Netlify) + دسترسی به فلش‌کارت‌ها روی تمام دستگاه‌ها
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
          {/* SECTION 1: PUBLIC DOMAIN LINK */}
          <div className="p-5 duo-card-subtle space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black text-[#58CC02]">
                <Globe className="w-4 h-4 shrink-0" />
                <span>۱. آدرس دامین عمومی سایت شما (موبایل، لپ‌تاپ و هر مرورگر):</span>
              </div>
              <span className="px-2.5 py-1 rounded-xl bg-[#58CC02]/15 text-[#58CC02] text-[10px] font-black">
                Netlify &amp; Cloud Ready
              </span>
            </div>
            <p className="text-xs font-bold duo-text-muted leading-relaxed">
              این لینک عمومی برنامه شماست. می‌توانید آن را روی موبایل، تبلت یا هر سیستم دیگری باز کنید و وارد اکانت خود شوید تا تمام فلش‌کارت‌های AnkiDroid و تمرین‌های دولینگو شما بالا بیاید:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                dir="ltr"
                value={currentOrigin}
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
          </div>

          {/* SECTION 2: AUTHENTICATION */}
          <div className="p-5 duo-card-subtle space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black text-[#1CB0F6]">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>۲. ساخت اکانت و ورود (مستقیم روی کلاینت بدون نیاز به سرور بک‌اند):</span>
              </div>
              {user && (
                <span className="px-3 py-1 rounded-xl bg-[#58CC02] text-white text-[11px] font-black flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>اکانت فعال</span>
                </span>
              )}
            </div>

            {!user ? (
              <div className="space-y-4">
                {/* Option A: Direct Email / Gmail Registration & Login */}
                <form
                  onSubmit={handleDirectEmailSubmit}
                  className="p-4 rounded-2xl duo-surface-main border-2 duo-border space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-black text-[#58CC02]">
                      <Mail className="w-4 h-4 shrink-0" />
                      <span>ثبت‌نام / ورود فوری با جیمیل و رمز عبور (توصیه‌شده برای Netlify):</span>
                    </div>
                    <span className="text-[10px] text-[#58CC02] font-black">بدون نیاز به بک‌اند</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="نام نمایشی (اختیاری)"
                      data-testid="direct-name-input"
                      className="duo-surface-secondary border-2 duo-border rounded-2xl px-3 py-2.5 text-xs font-bold duo-text-main focus:outline-none focus:border-[#58CC02]"
                    />
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
                      type="password"
                      required
                      dir="ltr"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="رمز عبور (حداقل ۴ کاراکتر)"
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
                    <span>ساخت اکانت / ورود فوری با جیمیل</span>
                  </button>
                </form>

                {/* Option B: Firebase Google Popup */}
                <div className="space-y-2.5">
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
                        : 'ورود با پنجره پاپ‌آپ گوگل (Google Sign-In Popup)'}
                    </span>
                  </button>

                  <div className="flex items-center justify-between text-xs font-bold duo-text-muted px-1">
                    <span>آیا از قبل کد اتصال ابری (Sync Key) دارید؟</span>
                    <button
                      type="button"
                      onClick={() => setShowTokenPaste((prev) => !prev)}
                      className="text-[#FF9600] hover:underline font-black"
                    >
                      {showTokenPaste ? 'بستن فرم کد سینک' : 'ورود با کد سینک ابری (Sync Key)'}
                    </button>
                  </div>

                  {showTokenPaste && (
                    <form
                      onSubmit={handleSyncTokenSubmit}
                      className="p-3 rounded-2xl duo-surface-main border-2 duo-border flex items-center gap-2"
                    >
                      <input
                        type="text"
                        dir="ltr"
                        value={syncTokenInput}
                        onChange={(e) => setSyncTokenInput(e.target.value)}
                        placeholder="Paste Cloud Sync Key..."
                        className="flex-1 duo-surface-secondary border-2 duo-border rounded-xl px-3 py-2 text-xs font-mono font-bold duo-text-main focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="duo-btn duo-btn-yellow px-4 py-2 text-xs shrink-0"
                      >
                        اتصال و سینک
                      </button>
                    </form>
                  )}
                </div>
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
                      className="duo-btn duo-btn-green px-3.5 py-2 text-xs"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
                      />
                      <span>
                        {syncStatus === 'syncing'
                          ? 'در حال همگام‌سازی...'
                          : 'ذخیره و همگام‌سازی کارت‌ها'}
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
          </div>

          {/* SECTION 3: EXTENSION CLOUD SYNC KEY */}
          <div className="p-5 duo-card-subtle space-y-3">
            <div className="flex items-center gap-2 text-xs font-black text-[#FF9600]">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>۳. اتصال اکستنشن مرورگر (Zen / Firefox / Chrome) به اکانت شما روی هر دستگاه:</span>
            </div>

            {!user ? (
              <p className="text-xs font-bold duo-text-muted leading-relaxed">
                ابتدا در بخش بالا وارد اکانت جیمیل خود شوید تا <strong>کد اتصال اکستنشن (Extension Cloud Sync Key)</strong> اختصاصی شما ساخته شود.
              </p>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs font-bold duo-text-muted leading-relaxed">
                  هر زمان روی لپ‌تاپ یا سیستم جدیدی اکستنشن <code dir="ltr" className="text-[#1CB0F6] font-black">Cunt Academy</code> را نصب کردید، این کد را کپی کنید و در صفحه فلش‌کارت اکستنشن (<code dir="ltr" className="text-[#58CC02] font-black">☁ اتصال اکانت جیمیل</code>) قرار دهید:
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
                    <span>{copiedSyncKey ? 'کد اتصال کپی شد!' : 'کپی کد اتصال اکستنشن'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs font-bold duo-text-muted pt-1">
              <ShieldCheck className="w-4 h-4 text-[#58CC02] shrink-0" />
              <span>
                سایت و سیستم اکانت ۱۰۰٪ سمت کلاینت (SPA) اجرا می‌شوند و روی Netlify بدون نیاز به هیچ سرور بک‌اندی کار می‌کنند.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
