import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  showText?: boolean;
  showWordmark?: boolean;
  subtitle?: string;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showText,
  showWordmark,
  subtitle,
  className = '',
}) => {
  const displayWordmark = showWordmark ?? showText ?? false;
  const presetDimensions =
    typeof size === 'string'
      ? {
          sm: 'w-7 h-7',
          md: 'w-10 h-10',
          lg: 'w-12 h-12',
          xl: 'w-16 h-16',
        }[size]
      : '';

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <div
        className={`${presetDimensions} relative shrink-0 rounded-2xl overflow-hidden border-2 border-b-4 border-[#1899D6] bg-[#1CB0F6]`}
        data-testid="cunt-academy-emblem"
      >
        <svg
          width={typeof size === 'number' ? size : undefined}
          height={typeof size === 'number' ? size : undefined}
          viewBox="0 0 128 128"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={typeof size === 'number' ? 'block' : 'w-full h-full'}
          role="img"
          aria-label="Cunt Academy Emblem Logo"
        >
          {/* Duolingo Flat Feather Green + Macaw Blue Emblem */}
          <rect width="128" height="128" rx="26" fill="#131F24" />

          {/* Outer Feather Ring */}
          <rect
            x="7"
            y="7"
            width="114"
            height="114"
            rx="22"
            stroke="#58CC02"
            strokeWidth="4"
          />

          {/* Stacked Leitner Flashcard Wings */}
          <rect
            x="24"
            y="30"
            width="80"
            height="58"
            rx="12"
            transform="rotate(-7 64 59)"
            fill="#CE82FF"
            stroke="#A568CC"
            strokeWidth="3"
          />
          <rect
            x="24"
            y="30"
            width="80"
            height="58"
            rx="12"
            transform="rotate(7 64 59)"
            fill="#1CB0F6"
            stroke="#1899D6"
            strokeWidth="3"
          />

          {/* Main Central Academy Crest Card */}
          <rect
            x="22"
            y="28"
            width="84"
            height="62"
            rx="14"
            fill="#1B2B32"
            stroke="#58CC02"
            strokeWidth="4"
          />

          {/* Central YouTube Language Play Prism */}
          <path
            d="M53 44.5C53 42.1 55.6 40.6 57.7 41.8L81.2 55.3C83.3 56.5 83.3 59.5 81.2 60.7L57.7 74.2C55.6 75.4 53 73.9 53 71.5V44.5Z"
            fill="#58CC02"
          />

          {/* Dual-Subtitle Bars at Bottom (EN White + FA Bee Yellow) */}
          <rect x="28" y="98" width="72" height="6" rx="3" fill="#F1F7FB" />
          <rect x="38" y="109" width="52" height="6" rx="3" fill="#FFC800" />

          {/* Top AI Sparkle Star */}
          <path
            d="M64 10L66.8 16.8L73.6 19.6L66.8 22.4L64 29.2L61.2 22.4L54.4 19.6L61.2 16.8L64 10Z"
            fill="#FFC800"
          />
        </svg>
      </div>

      {displayWordmark && (
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#58CC02] font-black tracking-widest uppercase">
              Cunt
            </span>
            <span className="text-[10px] font-mono text-[#1CB0F6] font-extrabold">v4.8</span>
          </div>
          <div className="text-base font-black tracking-wider duo-text-main">ACADEMY</div>
          {subtitle && <div className="text-[10px] duo-text-muted font-bold mt-0.5">{subtitle}</div>}
        </div>
      )}
    </div>
  );
};
