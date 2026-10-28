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
import { BrandLogo } from './BrandLogo';

const EXTENSION_FILES_PREVIEW: Record<string, { title: string; path: string; code: string }> = {
  manifestZen: {
    title: 'manifest.json (Zen / Firefox v4.7 Popup + AI)',
    path: 'linguatube-pro/manifest.json',
    code: `{
  "manifest_version": 2,
  "name": "Cunt Academy — Language Reactor & Trancy 1:1 Free Edition",
  "version": "4.7.0",
  "browser_specific_settings": {
    "gecko": {
      "id": "linguatube-pro@zenbrowser.ext",
      "strict_min_version": "109.0"
    }
  },
  "browser_action": {
    "default_title": "Cunt Academy — جعبه لایتنر AnkiDroid و ورود به سایت",
    "default_popup": "src/popup/popup.html"
  }
}`,
  },
  manifestChrome: {
    title: 'manifest.json (Chrome / Edge v4.7 Popup + AI)',
    path: 'linguatube-pro/manifest.chrome.json',
    code: `{
  "manifest_version": 3,
  "name": "Cunt Academy — Language Reactor & Trancy 1:1 Free Edition",
  "version": "4.7.0",
  "action": {
    "default_title": "Cunt Academy — جعبه لایتنر AnkiDroid و ورود به سایت",
    "default_popup": "src/popup/popup.html"
  },
  "background": {
    "service_worker": "background-sw.js"
  }
}`,
  },
  featuresV4: {
    title: 'v4.7 Lexa AI + Toolbar Leitner Popup',
    path: 'linguatube-pro/src/popup/popup.js',
    code: `// Cunt Academy v4.7 — Lexa AI (Gemini) Dictionary + Compact Toolbar Leitner Popup:
// 1. ✨ Lexa AI (Gemini) Contextual Explanation inside the YouTube Extension Dictionary Drawer
// 2. 📦 Compact Toolbar Leitner & AnkiDroid Popup (src/popup/popup.html) with direct Website link at bottom
// 3. 🛡 Custom Cunt Academy Emblem Logo across Website, Extension Icons (48/96/128), Popup & YouTube Bar`,
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
      <section className="duo-card p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-base font-black duo-text-main">
            <div className="w-10 h-10 rounded-2xl bg-[#58CC02] border-b-4 border-[#58A700] text-white flex items-center justify-center">
              <Cloud className="w-5 h-5 shrink-0" />
            </div>
            <span>
              دامین عمومی رایگان + اکانت جیمیل شخصی (دسترسی به فلش‌کارت‌ها و اکستنشن روی تمام دستگاه‌ها)
            </span>
          </div>
          {onOpenCloudModal && (
            <button
              type="button"
              onClick={onOpenCloudModal}
              className="duo-btn duo-btn-green px-4 py-2 text-xs"
            >
              ☁ تنظیمات کامل اکانت ابری و کد سینک
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
          {/* Public Domain Card */}
          <div className="p-4 duo-card-subtle space-y-3">
            <div className="font-black text-[#58CC02] flex items-center gap-1.5">
              <Globe className="w-4 h-4 shrink-0" />
              <span>آدرس دامین عمومی سایت (بدون هزینه، روی موبایل و دسکتاپ):</span>
            </div>
            <p className="duo-text-muted font-bold leading-relaxed">
              از هر دستگاهی وارد این لینک شوید و با جیمیل خود لاگین کنید تا تمام فلش‌کارت‌های AnkiDroid شما بالا بیاید:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                dir="ltr"
                value={PUBLIC_SHARED_APP_URL}
                className="flex-1 duo-surface-main border-2 duo-border rounded-2xl px-3 py-2 text-[11px] font-mono font-bold text-[#1CB0F6] select-all"
              />
              <button
                type="button"
                onClick={copyPublicDomain}
                className="duo-btn duo-btn-green px-3.5 py-2 text-xs shrink-0"
              >
                {copiedDomain ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedDomain ? 'کپی شد' : 'کپی لینک'}</span>
              </button>
            </div>
          </div>

          {/* Google Account & Extension Sync Key Card */}
          <div className="p-4 duo-card-subtle space-y-3">
            <div className="font-black text-[#FF9600] flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>اتصال اکستنشن به اکانت جیمیل شخصی شما:</span>
            </div>
            {!user ? (
              <div className="space-y-2.5">
                <p className="duo-text-muted font-bold leading-relaxed">
                  با جیمیل خود وارد شوید تا کد اتصال اکستنشن ساخته شود و هر کلمه‌ای که در یوتیوب سیو می‌کنید مستقیم به اکانت شما اضافه شود:
                </p>
                {onSignInGoogle && (
                  <button
                    type="button"
                    onClick={onSignInGoogle}
                    className="w-full duo-btn duo-btn-blue py-2.5 px-4 text-xs"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>ورود / ثبت‌نام با جیمیل (Sign in with Google)</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="duo-text-muted font-bold leading-relaxed">
                  متصل به <strong dir="ltr" className="text-[#58CC02]">{user.email}</strong> — این کد را در بخش <code dir="ltr" className="text-[#FF9600] font-black">☁ اتصال اکانت جیمیل</code> داخل اکستنشن قرار دهید:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    dir="ltr"
                    value={syncToken}
                    className="flex-1 duo-surface-main border-2 duo-border rounded-2xl px-3 py-2 text-[11px] font-mono font-bold text-[#FF9600] select-all"
                  />
                  <button
                    type="button"
                    onClick={copySyncToken}
                    className="duo-btn duo-btn-yellow px-3.5 py-2 text-xs shrink-0"
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

      {/* 1. What's New in Cunt Academy Banner */}
      <section className="duo-card p-6 space-y-4">
        <div className="flex items-center gap-3 text-sm font-black duo-text-main">
          <BrandLogo size={38} />
          <Sparkles className="w-5 h-5 shrink-0 text-[#CE82FF]" />
          <span>تحلیل هوشمند Gemini AI داخل دیکشنری + پاپ‌آپ جعبه لایتنر بالای مرورگر + تمرین دولینگویی</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
          <div className="p-4 duo-card-subtle space-y-2">
            <div className="font-black text-[#58CC02] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>۱. بخش ✨ Gemini AI دقیقاً داخل دیکشنری سایت و اکستنشن یوتیوب:</span>
            </div>
            <p className="duo-text-muted font-bold">
              • دکمه <strong>«✨ تحلیل هوشمند در این جمله»</strong> معنی دقیق کلمه در همان دیالوگ، تحلیل گرامری و ترفند حفظ کردن (Mnemonic) را با Gemini تولید کرده و به پشت فلش‌کارت Anki اضافه می‌کند.
            </p>
          </div>

          <div className="p-4 duo-card-subtle space-y-2">
            <div className="font-black text-[#CE82FF] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>۲. پاپ‌آپ جمع‌وجور جعبه لایتنر با کلیک روی آیکون بالای مرورگر:</span>
            </div>
            <p className="duo-text-muted font-bold">
              • وقتی بالای مرورگر روی آیکون لوگوی اکستنشن کلیک کنید، جعبه لایتنر ۵ مرحله‌ای و فلش‌کارت‌های AnkiDroid همان گوشه باز می‌شود و در پایین آن دکمه <strong>«🌐 ورود به سایت اصلی Cunt Academy»</strong> قرار دارد.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Dual Ready-to-Install Download Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ZEN BROWSER & FIREFOX CARD */}
        <section className="duo-card p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="px-3 py-1 rounded-xl bg-[#CE82FF]/15 text-[#CE82FF] text-xs font-black">
                مخصوص Zen Browser و Firefox
              </span>
              <span dir="ltr" className="text-xs font-mono text-[#58CC02] font-black">
                Cunt Academy • Cloud Sync
              </span>
            </div>

            <h2 className="text-lg font-black duo-text-main">
              نصب آماده Cunt Academy در Zen Browser و Firefox
            </h2>
            <p className="text-xs duo-text-muted font-bold leading-relaxed">
              پکیج <code dir="ltr" className="text-[#CE82FF] font-mono font-black">cunt-academy-zen-firefox.xpi</code> آماده بارگذاری در <code dir="ltr">about:debugging</code> است.
            </p>

            <div className="space-y-2.5 pt-2 text-xs">
              <div className="p-3.5 duo-card-subtle">
                <strong className="text-[#CE82FF] font-black">گام ۱:</strong> آدرس{' '}
                <code dir="ltr" className="text-[#FF9600] font-mono font-bold">
                  about:debugging#/runtime/this-firefox
                </code>{' '}
                را در Zen باز کنید.
              </div>
              <div className="p-3.5 duo-card-subtle">
                <strong className="text-[#CE82FF] font-black">گام ۲:</strong> روی <strong>Load Temporary Add-on...</strong> کلیک کنید و فایل <code dir="ltr" className="text-[#CE82FF] font-mono font-bold">manifest.json</code> داخل پوشه <code dir="ltr" className="font-mono">linguatube-pro</code> را انتخاب نمایید.
              </div>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <div className="flex flex-wrap gap-2.5">
              <a
                href="/cunt-academy-zen-firefox.xpi"
                download="cunt-academy-zen-firefox.xpi"
                data-testid="download-zen-xpi"
                className="flex-1 duo-btn duo-btn-purple py-3 px-4 text-xs"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>دانلود Cunt Academy برای Zen / Firefox (.xpi)</span>
              </a>

              <a
                href="/cunt-academy-zen-firefox.zip"
                download="cunt-academy-zen-firefox.zip"
                className="duo-btn duo-btn-neutral py-3 px-4 text-xs"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>نسخه .ZIP</span>
              </a>
            </div>

            <button
              type="button"
              onClick={copyZenDebuggingUrl}
              className="w-full duo-btn duo-btn-neutral py-2.5 px-4 text-xs"
            >
              {copiedZenUrl ? <Check className="w-4 h-4 text-[#58CC02]" /> : <Copy className="w-4 h-4" />}
              <span>{copiedZenUrl ? 'آدرس about:debugging کپی شد!' : 'کپی آدرس about:debugging#/runtime/this-firefox'}</span>
            </button>
          </div>
        </section>

        {/* GOOGLE CHROME / BRAVE / EDGE CARD */}
        <section className="duo-card p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="px-3 py-1 rounded-xl bg-[#58CC02]/15 text-[#58CC02] text-xs font-black">
                مخصوص Google Chrome / Edge / Brave
              </span>
              <span dir="ltr" className="text-xs font-mono text-[#1CB0F6] font-black">
                Cunt Academy • Manifest V3
              </span>
            </div>

            <h2 className="text-lg font-black duo-text-main">
              نصب دائمی Cunt Academy در Google Chrome
            </h2>
            <p className="text-xs duo-text-muted font-bold leading-relaxed">
              پکیج <code dir="ltr" className="text-[#58CC02] font-mono font-black">cunt-academy-chrome.zip</code> مخصوص کروم، بریو و اج است و پس از بستن مرورگر هم همیشه نصب باقی می‌ماند.
            </p>

            <div className="space-y-2.5 pt-2 text-xs">
              <div className="p-3.5 duo-card-subtle">
                <strong className="text-[#58CC02] font-black">گام ۱:</strong> پوشه <code dir="ltr" className="text-[#58CC02] font-mono font-bold">linguatube-pro</code> را آماده کنید.
              </div>
              <div className="p-3.5 duo-card-subtle">
                <strong className="text-[#58CC02] font-black">گام ۲:</strong> در <code dir="ltr" className="text-[#FF9600] font-mono font-bold">chrome://extensions</code> گزینه <strong>Developer mode</strong> را روشن کرده و با <strong>Load unpacked</strong> پوشه را انتخاب نمایید.
              </div>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <a
              href="/cunt-academy-chrome.zip"
              download="cunt-academy-chrome.zip"
              data-testid="download-chrome-zip"
              className="w-full duo-btn duo-btn-green py-3 px-4 text-xs"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>دانلود Cunt Academy برای Google Chrome (.zip)</span>
            </a>

            <button
              type="button"
              onClick={copyChromeExtensionsUrl}
              className="w-full duo-btn duo-btn-neutral py-2.5 px-4 text-xs"
            >
              {copiedChromeUrl ? <Check className="w-4 h-4 text-[#58CC02]" /> : <Copy className="w-4 h-4" />}
              <span>{copiedChromeUrl ? 'آدرس chrome://extensions کپی شد!' : 'کپی آدرس chrome://extensions'}</span>
            </button>
          </div>
        </section>
      </div>

      {/* 3. Verification & Code Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 duo-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-black text-[#58CC02]">
            <ShieldCheck className="w-4 h-4" />
            <span>ویژگی‌های اکستنشن Cunt Academy</span>
          </div>
          <ul className="space-y-2.5 text-xs duo-text-muted font-bold leading-relaxed">
            <li>✓ <strong className="duo-text-main">سینک ابری با جیمیل:</strong> کلمات ذخیره‌شده در اکستنشن یوتیوب و فلش‌کارت‌های داخل سایت به صورت دوطرفه روی اکانت جیمیل شما همگام می‌شوند.</li>
            <li>✓ <strong className="duo-text-main">پاپ‌آپ فیروزه‌ای هاور + تشخیص ترکیب‌ها:</strong> تشخیص خودکار عبارات دو/سه‌کلمه‌ای و مکث خودکار در پایان خط تا زمان کنار رفتن موس.</li>
            <li>✓ <strong className="duo-text-main">روشن شدن کلمه به کلمه (Trancy):</strong> همگام با صدای گوینده به همراه ۵ استایل متنی و انتخاب فونت.</li>
            <li>✓ <strong className="duo-text-main">انتخاب چند کلمه با هم (Phrasal Verbs):</strong> با کشیدن موس روی کلمات یا Shift+Click کل عبارت را یکجا ذخیره و در فلش‌کارت‌ها تمرین کنید.</li>
          </ul>
        </div>

        <div className="lg:col-span-7 duo-card overflow-hidden flex flex-col">
          <div className="p-4 duo-surface-secondary border-b-2 duo-border flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {Object.entries(EXTENSION_FILES_PREVIEW).map(([key, item]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedFileKey(key)}
                  className={`duo-btn px-3 py-1.5 text-xs ${
                    selectedFileKey === key ? 'duo-btn-blue' : 'duo-btn-neutral'
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
              className="duo-btn duo-btn-neutral px-3 py-1.5 text-xs"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-[#58CC02]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'کپی شد' : 'کپی کد'}</span>
            </button>
          </div>

          <pre
            dir="ltr"
            className="p-5 text-xs font-mono font-bold text-[#F1F7FB] bg-[#131F24] overflow-x-auto leading-relaxed max-h-[280px]"
          >
            <code>{activeFile.code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
