import React, { useState } from 'react';
import {
  Download,
  Copy,
  Check,
  FileCode,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Cloud,
  Globe,
  LogIn,
  KeyRound,
} from 'lucide-react';
import { User, AppAccountUser, generateExtensionSyncToken } from '../firebase';
import { PUBLIC_SHARED_APP_URL } from './CloudAccountModal';

const EXTENSION_FILES_PREVIEW: Record<string, { title: string; path: string; code: string }> = {
  manifestZen: {
    title: 'manifest.json (Zen / Firefox v4.6 Cloud)',
    path: 'linguatube-pro/manifest.json',
    code: `{
  "manifest_version": 2,
  "name": "Cunt Academy — Language Reactor & Trancy 1:1 Free Edition",
  "version": "4.6.0",
  "browser_specific_settings": {
    "gecko": {
      "id": "linguatube-pro@zenbrowser.ext",
      "strict_min_version": "109.0"
    }
  },
  "permissions": [
    "storage",
    "unlimitedStorage",
    "activeTab",
    "tabs",
    "*://*.youtube.com/*",
    "*://*.googleapis.com/*",
    "*://api.dictionaryapi.dev/*",
    "*://api.mymemory.translated.net/*",
    "*://tatoeba.org/*",
    "<all_urls>"
  ]
}`,
  },
  manifestChrome: {
    title: 'manifest.json (Chrome / Edge v4.6 Cloud)',
    path: 'linguatube-pro/manifest.chrome.json',
    code: `{
  "manifest_version": 3,
  "name": "Cunt Academy — Language Reactor & Trancy 1:1 Free Edition",
  "version": "4.6.0",
  "permissions": ["storage", "unlimitedStorage", "activeTab", "tabs", "scripting"],
  "host_permissions": [
    "*://*.youtube.com/*",
    "*://*.googleapis.com/*",
    "*://api.dictionaryapi.dev/*",
    "*://api.mymemory.translated.net/*",
    "*://tatoeba.org/*"
  ],
  "background": {
    "service_worker": "background-sw.js"
  }
}`,
  },
  featuresV4: {
    title: 'v4.6 Cloud Sync + Anki Engine',
    path: 'linguatube-pro/src/shared/db.js',
    code: `// Cunt Academy v4.6 — Google Account Cloud Sync + AnkiDroid SM-2 + Instant Multi-POS Dictionary:
// 1. Direct Firebase Firestore Cloud Sync across Web App + Zen/Firefox & Chrome Extensions
// 2. Authentic AnkiDroid SM-2 Flashcards (Again <10m, Hard 1d, Good 1d/4d/10d, Easy 4d) + Editable Back of Card
// 3. 0ms Instant Multi-POS Persian Dictionary (noun/verb/adj/adv) + non-blocking <200ms lookup
// 4. Exact End-of-Current-Line Hover Lock + Proportional Word Timestamp Interpolation`,
  },
};

interface ExtensionPackageViewProps {
  user?: User | AppAccountUser | null;
  onOpenCloudModal?: () => void;
  onSignInGoogle?: () => Promise<void>;
}

export const ExtensionPackageView: React.FC<ExtensionPackageViewProps> = ({
  user,
  onOpenCloudModal,
  onSignInGoogle,
}) => {
  const [selectedFileKey, setSelectedFileKey] = useState<string>('manifestZen');
  const [copiedZenUrl, setCopiedZenUrl] = useState<boolean>(false);
  const [copiedChromeUrl, setCopiedChromeUrl] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedDomain, setCopiedDomain] = useState<boolean>(false);
  const [copiedSyncKey, setCopiedSyncKey] = useState<boolean>(false);

  const syncToken = user ? generateExtensionSyncToken(user) : '';

  const copyZenDebuggingUrl = () => {
    navigator.clipboard?.writeText('about:debugging#/runtime/this-firefox');
    setCopiedZenUrl(true);
    setTimeout(() => setCopiedZenUrl(false), 2000);
  };

  const copyChromeExtensionsUrl = () => {
    navigator.clipboard?.writeText('chrome://extensions');
    setCopiedChromeUrl(true);
    setTimeout(() => setCopiedChromeUrl(false), 2000);
  };

  const copySelectedCode = () => {
    const file = EXTENSION_FILES_PREVIEW[selectedFileKey];
    if (!file) return;
    navigator.clipboard?.writeText(file.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyPublicDomain = () => {
    navigator.clipboard?.writeText(PUBLIC_SHARED_APP_URL);
    setCopiedDomain(true);
    setTimeout(() => setCopiedDomain(false), 2000);
  };

  const copySyncToken = () => {
    if (!syncToken) return;
    navigator.clipboard?.writeText(syncToken);
    setCopiedSyncKey(true);
    setTimeout(() => setCopiedSyncKey(false), 2200);
  };

  const activeFile = EXTENSION_FILES_PREVIEW[selectedFileKey];

  return (
    <div className="space-y-6" dir="rtl">
      {/* 0. Public Domain & Google Account Cloud Sync Banner */}
      <section className="bg-gradient-to-l from-emerald-950/50 via-[#121521] to-violet-950/50 border-2 border-emerald-500/45 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-emerald-300 font-extrabold text-sm">
            <Cloud className="w-5 h-5 shrink-0 text-emerald-400" />
            <span>
              دامین عمومی رایگان + اکانت جیمیل شخصی (دسترسی به فلش‌کارت‌ها و اکستنشن روی تمام دستگاه‌ها)
            </span>
          </div>
          {onOpenCloudModal && (
            <button
              type="button"
              onClick={onOpenCloudModal}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold transition-colors"
            >
              ☁ تنظیمات کامل اکانت ابری و کد سینک
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Public Domain Card */}
          <div className="p-4 rounded-xl bg-[#0B0D14]/90 border border-white/10 space-y-2.5">
            <div className="font-bold text-emerald-300 flex items-center gap-1.5">
              <Globe className="w-4 h-4 shrink-0" />
              <span>آدرس دامین عمومی سایت (بدون هزینه، روی موبایل و دسکتاپ):</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              از هر دستگاهی وارد این لینک شوید و با جیمیل خود لاگین کنید تا تمام فلش‌کارت‌های AnkiDroid شما بالا بیاید:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                dir="ltr"
                value={PUBLIC_SHARED_APP_URL}
                className="flex-1 bg-[#161926] border border-white/15 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-emerald-300 select-all"
              />
              <button
                type="button"
                onClick={copyPublicDomain}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1 shrink-0"
              >
                {copiedDomain ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedDomain ? 'کپی شد' : 'کپی لینک'}</span>
              </button>
            </div>
          </div>

          {/* Google Account & Extension Sync Key Card */}
          <div className="p-4 rounded-xl bg-[#0B0D14]/90 border border-white/10 space-y-2.5">
            <div className="font-bold text-amber-300 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>اتصال اکستنشن به اکانت جیمیل شخصی شما:</span>
            </div>
            {!user ? (
              <div className="space-y-2">
                <p className="text-slate-300 leading-relaxed">
                  با جیمیل خود وارد شوید تا کد اتصال اکستنشن ساخته شود و هر کلمه‌ای که در یوتیوب سیو می‌کنید مستقیم به اکانت شما اضافه شود:
                </p>
                {onSignInGoogle && (
                  <button
                    type="button"
                    onClick={onSignInGoogle}
                    className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 hover:from-violet-500 hover:to-emerald-500 text-white font-extrabold flex items-center justify-center gap-2"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>ورود / ثبت‌نام با جیمیل (Sign in with Google)</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-slate-300 leading-relaxed">
                  متصل به <strong dir="ltr" className="text-emerald-300">{user.email}</strong> — این کد را در بخش <code dir="ltr" className="text-amber-300">☁ اتصال اکانت جیمیل</code> داخل اکستنشن قرار دهید:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    dir="ltr"
                    value={syncToken}
                    className="flex-1 bg-[#161926] border border-amber-500/35 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-amber-200 select-all"
                  />
                  <button
                    type="button"
                    onClick={copySyncToken}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold flex items-center gap-1 shrink-0"
                  >
                    {copiedSyncKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSyncKey ? 'کپی شد' : 'کپی کد سینک'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 1. What's New in Cunt Academy v4.6 Banner */}
      <section className="bg-gradient-to-l from-violet-950/45 via-[#121521] to-emerald-950/35 border border-violet-500/40 rounded-2xl p-5 space-y-3 shadow-xl">
        <div className="flex items-center gap-2.5 text-violet-300 font-extrabold text-sm">
          <Sparkles className="w-5 h-5 shrink-0 text-violet-400" />
          <span>آپدیت Cunt Academy v4.6 — سینک ابری با جیمیل، فلش‌کارت AnkiDroid SM-2، ویرایش پشت کارت و دیکشنری آنی چندمعنایی</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-200 leading-relaxed">
          <div className="p-3.5 rounded-xl bg-[#0B0D14]/90 border border-white/10 space-y-1.5">
            <div className="font-bold text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>۱. فلش‌کارت دقیق با الگوریتم AnkiDroid SM-2 + سینک ابری جیمیل:</span>
            </div>
            <p className="text-slate-300">
              • زمان‌بندی دقیق <strong>AnkiDroid</strong> با ۴ دکمه (<code dir="ltr">Again &lt;10m</code>، <code dir="ltr">Hard 1d</code>، <code dir="ltr">Good 1d / 4d / 10d</code>، <code dir="ltr">Easy 4d</code>)؛ کارت‌های پاسخ داده شده به روزهای آینده منتقل می‌شوند.
              <br />• همگام‌سازی خودکار تمام کلمات و فلش‌کارت‌ها روی اکانت جیمیل شخصی شما در تمام دستگاه‌ها.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0B0D14]/90 border border-white/10 space-y-1.5">
            <div className="font-bold text-violet-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>۲. دیکشنری فوق‌سریع چندمعنایی + قفل مکث در انتهای همان خط + رفع بهم‌ریختگی تایم زیرنویس:</span>
            </div>
            <p className="text-slate-300">
              • نمایش فوری معانی فارسی در تمام نقش‌های دستوری (اسم، فعل، صفت، قید) بدون مکث و بدون جا ماندن روی کلمه قبلی.
              <br />• <strong>قفل مکث دقیق در انتهای خط فعلی:</strong> هنگام نگه‌داشتن موس روی کلمه، ویدیو دقیقاً در انتهای همان خط متوقف می‌شود و هرگز وارد اول خط بعدی نمی‌شود.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Dual Ready-to-Install Download Cards: Zen Browser / Firefox + Google Chrome / Edge / Brave */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ZEN BROWSER & FIREFOX CARD */}
        <section className="bg-[#121521] border-2 border-violet-500/45 rounded-2xl p-6 flex flex-col justify-between space-y-5 shadow-xl">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="px-3 py-1 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-300 text-xs font-bold">
                مخصوص Zen Browser و Firefox
              </span>
              <span dir="ltr" className="text-xs font-mono text-emerald-400 font-bold">
                Cunt Academy v4.6 • Cloud Sync
              </span>
            </div>

            <h2 className="text-lg font-black text-white">
              نصب آماده Cunt Academy در Zen Browser و Firefox
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              پکیج <code dir="ltr" className="text-violet-300 font-mono">cunt-academy-zen-firefox.xpi</code> آماده بارگذاری در <code dir="ltr">about:debugging</code> است.
            </p>

            <div className="space-y-2.5 pt-2 text-xs text-slate-200">
              <div className="p-3 rounded-xl bg-[#0B0D14] border border-white/10">
                <strong className="text-violet-300">گام ۱:</strong> آدرس{' '}
                <code dir="ltr" className="text-amber-300 font-mono">
                  about:debugging#/runtime/this-firefox
                </code>{' '}
                را در Zen باز کنید.
              </div>
              <div className="p-3 rounded-xl bg-[#0B0D14] border border-white/10">
                <strong className="text-violet-300">گام ۲:</strong> روی <strong>Load Temporary Add-on...</strong> (یا <strong>Reload</strong> اگر قبلاً نصب کرده‌اید) کلیک کنید و فایل <code dir="ltr" className="text-violet-300 font-mono">cunt-academy-zen-firefox.xpi</code> را انتخاب نمایید.
              </div>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <div className="flex flex-wrap gap-2.5">
              <a
                href="/cunt-academy-zen-firefox.xpi"
                download="cunt-academy-zen-firefox.xpi"
                data-testid="download-zen-xpi"
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>دانلود Cunt Academy v4.6 برای Zen / Firefox (.xpi)</span>
              </a>

              <a
                href="/cunt-academy-zen-firefox.zip"
                download="cunt-academy-zen-firefox.zip"
                className="py-3 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>نسخه .ZIP</span>
              </a>
            </div>

            <button
              type="button"
              onClick={copyZenDebuggingUrl}
              className="w-full py-2.5 px-4 rounded-xl bg-[#0B0D14] hover:bg-slate-900 border border-white/15 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {copiedZenUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedZenUrl ? 'آدرس about:debugging کپی شد!' : 'کپی آدرس about:debugging#/runtime/this-firefox'}</span>
            </button>
          </div>
        </section>

        {/* GOOGLE CHROME / BRAVE / EDGE CARD */}
        <section className="bg-[#121521] border-2 border-emerald-500/45 rounded-2xl p-6 flex flex-col justify-between space-y-5 shadow-xl">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                مخصوص Google Chrome / Edge / Brave
              </span>
              <span dir="ltr" className="text-xs font-mono text-emerald-400 font-bold">
                Cunt Academy v4.6 • Manifest V3
              </span>
            </div>

            <h2 className="text-lg font-black text-white">
              نصب دائمی Cunt Academy در Google Chrome
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              پکیج <code dir="ltr" className="text-emerald-300 font-mono">cunt-academy-chrome.zip</code> مخصوص کروم، بریو و اج است و پس از بستن مرورگر هم همیشه نصب باقی می‌ماند.
            </p>

            <div className="space-y-2.5 pt-2 text-xs text-slate-200">
              <div className="p-3 rounded-xl bg-[#0B0D14] border border-white/10">
                <strong className="text-emerald-300">گام ۱:</strong> فایل <code dir="ltr" className="text-emerald-300 font-mono">cunt-academy-chrome.zip</code> را دانلود و در یک پوشه Extract کنید.
              </div>
              <div className="p-3 rounded-xl bg-[#0B0D14] border border-white/10">
                <strong className="text-emerald-300">گام ۲:</strong> در <code dir="ltr" className="text-amber-300 font-mono">chrome://extensions</code> گزینه <strong>Developer mode</strong> را روشن کرده و با <strong>Load unpacked</strong> پوشه را انتخاب نمایید.
              </div>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <a
              href="/cunt-academy-chrome.zip"
              download="cunt-academy-chrome.zip"
              data-testid="download-chrome-zip"
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>دانلود Cunt Academy v4.6 برای Google Chrome (.zip)</span>
            </a>

            <button
              type="button"
              onClick={copyChromeExtensionsUrl}
              className="w-full py-2.5 px-4 rounded-xl bg-[#0B0D14] hover:bg-slate-900 border border-white/15 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {copiedChromeUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedChromeUrl ? 'آدرس chrome://extensions کپی شد!' : 'کپی آدرس chrome://extensions'}</span>
            </button>
          </div>
        </section>
      </div>

      {/* 3. Verification & Code Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-[#121521] border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>ویژگی‌های نسخه v4.6 Cunt Academy</span>
          </div>
          <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
            <li>✓ <strong>سینک ابری با جیمیل:</strong> کلمات ذخیره‌شده در اکستنشن یوتیوب و فلش‌کارت‌های داخل سایت به صورت دوطرفه روی اکانت جیمیل شما همگام می‌شوند.</li>
            <li>✓ <strong>پاپ‌آپ فیروزه‌ای هاور + تشخیص ترکیب‌ها:</strong> تشخیص خودکار عبارات دو/سه‌کلمه‌ای و مکث خودکار در پایان خط تا زمان کنار رفتن موس.</li>
            <li>✓ <strong>روشن شدن کلمه به کلمه (Trancy):</strong> همگام با صدای گوینده به همراه ۵ استایل متنی و انتخاب فونت.</li>
            <li>✓ <strong>انتخاب چند کلمه با هم (Phrasal Verbs):</strong> با کشیدن موس روی کلمات یا Shift+Click کل عبارت را یکجا ذخیره و در فلش‌کارت‌ها تمرین کنید.</li>
          </ul>
        </div>

        <div className="lg:col-span-7 bg-[#121521] border border-white/10 rounded-2xl overflow-hidden flex flex-col">
          <div className="p-3.5 bg-[#0B0D14] border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {Object.entries(EXTENSION_FILES_PREVIEW).map(([key, item]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedFileKey(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    selectedFileKey === key
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span dir="ltr">{item.title}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={copySelectedCode}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'کپی شد' : 'کپی کد'}</span>
            </button>
          </div>

          <pre
            dir="ltr"
            className="p-4 text-xs font-mono text-slate-200 bg-[#0B0D14] overflow-x-auto leading-relaxed max-h-[280px]"
          >
            <code>{activeFile.code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
