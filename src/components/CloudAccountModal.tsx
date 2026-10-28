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
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[#121521] border border-violet-500/40 rounded-2xl shadow-2xl overflow-hidden text-slate-100"
      >
        {/* Top Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-l from-violet-950/70 via-[#121521] to-emerald-950/50 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">
                حساب کاربری جیمیل، دامین عمومی (Netlify / Cloud) و همگام‌سازی ابری
              </h2>
              <p className="text-[11px] text-slate-300">
                بدون وابستگی به سرور بک‌اند (۱۰۰٪ سازگار با Netlify) + دسترسی به فلش‌کارت‌های AnkiDroid روی تمام دستگاه‌ها
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="close-cloud-modal-btn"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* SECTION 1: PUBLIC DOMAIN LINK (NETLIFY OR CLOUD RUN URL) */}
          <div className="p-4 rounded-2xl bg-[#0B0D14] border border-emerald-500/35 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-300">
                <Globe className="w-4 h-4 shrink-0" />
                <span>۱. آدرس دامین عمومی سایت شما (قابل باز شدن در موبایل، لپ‌تاپ و هر مرورگر):</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
                Netlify &amp; Cloud Ready
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              این لینک عمومی برنامه شماست. می‌توانید آن را روی موبایل، تبلت یا هر سیستم دیگری باز کنید و وارد اکانت خود شوید تا تمام فلش‌کارت‌های AnkiDroid شما بالا بیاید:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                dir="ltr"
                value={currentOrigin}
                data-testid="public-domain-input"
                className="flex-1 bg-[#161926] border border-white/15 rounded-xl px-3 py-2 text-xs font-mono text-emerald-300 select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyDomain}
                data-testid="copy-public-domain-btn"
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors"
              >
                {copiedDomain ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedDomain ? 'کپی شد!' : 'کپی لینک سایت'}</span>
              </button>
            </div>
          </div>

          {/* SECTION 2: AUTHENTICATION (GOOGLE POPUP + DIRECT NETLIFY EMAIL/GMAIL SIGNUP + SYNC TOKEN) */}
          <div className="p-4 rounded-2xl bg-[#0B0D14] border border-violet-500/40 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-extrabold text-violet-300">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>۲. ساخت اکانت و ورود (مستقیم روی کلاینت بدون نیاز به سرور بک‌اند):</span>
              </div>
              {user && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>اکانت فعال</span>
                </span>
              )}
            </div>

            {!user ? (
              <div className="space-y-4">
                {/* Option A: Direct Email / Gmail Registration & Login (Works on ANY Netlify domain with zero config) */}
                <form
                  onSubmit={handleDirectEmailSubmit}
                  className="p-3.5 rounded-xl bg-[#161926] border border-emerald-500/35 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-300">
                      <Mail className="w-4 h-4 shrink-0" />
                      <span>ثبت‌نام / ورود فوری با جیمیل و رمز عبور (توصیه‌شده برای دامین Netlify):</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-bold">بدون نیاز به بک‌اند</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="نام نمایشی (اختیاری)"
                      data-testid="direct-name-input"
                      className="bg-[#0B0D14] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                    />
                    <input
                      type="email"
                      required
                      dir="ltr"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="you@gmail.com"
                      data-testid="direct-email-input"
                      className="bg-[#0B0D14] border border-white/15 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-400"
                    />
                    <input
                      type="password"
                      required
                      dir="ltr"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="رمز عبور (حداقل ۴ کاراکتر)"
                      data-testid="direct-password-input"
                      className="bg-[#0B0D14] border border-white/15 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    data-testid="direct-email-submit-btn"
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-md transition-all"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>ساخت اکانت / ورود فوری با جیمیل</span>
                  </button>
                </form>

                {/* Option B: Firebase Google Popup */}
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={onSignInGoogle}
                    data-testid="modal-google-signin-btn"
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-700 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-extrabold flex items-center justify-center gap-2.5 shadow-lg transition-all disabled:opacity-50"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>
                      {authLoading
                        ? 'در حال اتصال به پنجره گوگل...'
                        : 'ورود با پنجره پاپ‌آپ گوگل (Google Sign-In Popup)'}
                    </span>
                  </button>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                    <span>آیا از قبل کد اتصال ابری (Sync Key) دارید؟</span>
                    <button
                      type="button"
                      onClick={() => setShowTokenPaste((prev) => !prev)}
                      className="text-amber-300 hover:text-amber-200 font-bold underline"
                    >
                      {showTokenPaste ? 'بستن فرم کد سینک' : 'ورود با کد سینک ابری (Sync Key)'}
                    </button>
                  </div>

                  {showTokenPaste && (
                    <form
                      onSubmit={handleSyncTokenSubmit}
                      className="p-3 rounded-xl bg-[#161926] border border-amber-500/35 flex items-center gap-2"
                    >
                      <input
                        type="text"
                        dir="ltr"
                        value={syncTokenInput}
                        onChange={(e) => setSyncTokenInput(e.target.value)}
                        placeholder="Paste Cloud Sync Key..."
                        className="flex-1 bg-[#0B0D14] border border-white/15 rounded-lg px-3 py-1.5 text-xs font-mono text-amber-200 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shrink-0"
                      >
                        اتصال و سینک
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-[#161926] border border-white/10 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'User'}
                        className="w-10 h-10 rounded-full border border-emerald-400/50"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white font-black text-sm">
                        {(user.displayName || user.email || 'U').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-extrabold text-white">
                        {user.displayName || 'کاربر Cunt Academy'}
                      </div>
                      <div dir="ltr" className="text-[11px] font-mono text-emerald-300">
                        {user.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onForcePushLocalToCloud}
                      disabled={syncStatus === 'syncing'}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
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
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-bold flex items-center gap-1 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>خروج</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-[#161926]/80 border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">فلش‌کارت‌های اکانت شما:</span>
                    <strong className="text-emerald-300 font-mono">{cardsCount} کارت</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#161926]/80 border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">جملات ذخیره‌شده:</span>
                    <strong className="text-violet-300 font-mono">{sentencesCount} جمله</strong>
                  </div>
                </div>
              </div>
            )}

            {syncError && (
              <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-[11px] leading-relaxed">
                {syncError}
              </div>
            )}
          </div>

          {/* SECTION 3: EXTENSION CLOUD SYNC KEY FOR ANY DEVICE */}
          <div className="p-4 rounded-2xl bg-[#0B0D14] border border-amber-500/35 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold text-amber-300">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>۳. اتصال اکستنشن مرورگر (Zen / Firefox / Chrome) به اکانت شما روی هر دستگاه:</span>
            </div>

            {!user ? (
              <p className="text-xs text-slate-400 leading-relaxed">
                ابتدا در بخش بالا وارد اکانت جیمیل خود شوید تا <strong>کد اتصال اکستنشن (Extension Cloud Sync Key)</strong> اختصاصی شما ساخته شود.
              </p>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs text-slate-300 leading-relaxed">
                  هر زمان روی لپ‌تاپ یا سیستم جدیدی اکستنشن <code dir="ltr" className="text-violet-300">Cunt Academy</code> را نصب کردید، این کد را کپی کنید و در صفحه فلش‌کارت اکستنشن (<code dir="ltr" className="text-emerald-300">☁ اتصال اکانت جیمیل</code>) قرار دهید:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    dir="ltr"
                    value={extensionSyncToken}
                    data-testid="extension-sync-token-input"
                    className="flex-1 bg-[#161926] border border-amber-500/30 rounded-xl px-3 py-2 text-[11px] font-mono text-amber-200 select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopySyncKey}
                    data-testid="copy-extension-sync-key-btn"
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    {copiedSyncKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedSyncKey ? 'کد اتصال کپی شد!' : 'کپی کد اتصال اکستنشن'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                سایت و سیستم اکانت ۱۰۰٪ سمت کلاینت (SPA) اجرا می‌شوند و روی Netlify بدون نیاز به هیچ سرور بک‌اندی (`server.ts`) کار می‌کنند.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
