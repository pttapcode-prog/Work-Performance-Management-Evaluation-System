import React, { useId } from 'react';

const SIZE_MAP = {
  xs: { box: 'w-6 h-6', text: 'text-sm', sub: 'text-[10px]', gap: 'gap-1.5' },
  sm: { box: 'w-8 h-8', text: 'text-base', sub: 'text-[11px]', gap: 'gap-2' },
  md: { box: 'w-9 h-9', text: 'text-base', sub: 'text-[11px]', gap: 'gap-2.5' },
  lg: { box: 'w-12 h-12', text: 'text-xl', sub: 'text-xs', gap: 'gap-3' },
};

export default function WpmesLogo({
  size = 'md',
  variant = 'default', // 'default' | 'light' | 'dark'
  showWordmark = false,
  subtitle = '',
  className = '',
}) {
  const uid = useId().replace(/:/g, '');
  const s = SIZE_MAP[size] || SIZE_MAP.md;

  const isLightOnGradient = variant === 'light';
  const isDarkSurface = variant === 'dark';

  return (
    <div className={`inline-flex items-center ${s.gap} ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        fill="none"
        className={`${s.box} shrink-0 drop-shadow-sm`}
        aria-label="WPMES Logo"
      >
        <defs>
          <linearGradient id={`wpmes-bg-${uid}`} x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={isLightOnGradient ? '#FFFFFF' : '#0F172A'} stopOpacity={isLightOnGradient ? '0.24' : '1'} />
            <stop offset="50%" stopColor={isLightOnGradient ? '#E0F2FE' : '#1D4ED8'} stopOpacity={isLightOnGradient ? '0.18' : '1'} />
            <stop offset="100%" stopColor={isLightOnGradient ? '#67E8F9' : '#4F46E5'} stopOpacity={isLightOnGradient ? '0.25' : '1'} />
          </linearGradient>
          <radialGradient
            id={`wpmes-glow-${uid}`}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(52 12) rotate(135) scale(40)"
          >
            <stop offset="0%" stopColor="#22D3EE" stopOpacity={isLightOnGradient ? '0.35' : '0.55'} />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`wpmes-stroke-${uid}`} x1="12" y1="44" x2="52" y2="18" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E0F2FE" />
            <stop offset="55%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#67E8F9" />
          </linearGradient>
        </defs>

        <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#wpmes-bg-${uid})`} />
        <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#wpmes-glow-${uid})`} />
        <rect
          x="2.75"
          y="2.75"
          width="58.5"
          height="58.5"
          rx="15.25"
          stroke="white"
          strokeOpacity={isLightOnGradient ? '0.35' : '0.18'}
          strokeWidth="1.5"
        />
        <line
          x1="13"
          y1="49"
          x2="51"
          y2="49"
          stroke="white"
          strokeOpacity="0.22"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M12.5 23.5L20 43L29.5 27.5L36.5 41.5L49.5 18.5"
          stroke={`url(#wpmes-stroke-${uid})`}
          strokeWidth="5.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M42.5 18.5H49.5V25.5"
          stroke="#67E8F9"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M29.5 11.5L30.8 14.8L34.1 16.1L30.8 17.4L29.5 20.7L28.2 17.4L24.9 16.1L28.2 14.8L29.5 11.5Z"
          fill="#67E8F9"
        />
      </svg>

      {showWordmark && (
        <div className="leading-tight">
          <div className={`${s.text} font-black tracking-tight flex items-center gap-1`}>
            <span className={isDarkSurface || isLightOnGradient ? 'text-white' : 'text-slate-900'}>
              WP
            </span>
            <span
              className={
                isLightOnGradient
                  ? 'text-cyan-200'
                  : 'bg-gradient-to-r from-[#2563EB] via-[#4F46E5] to-[#06B6D4] bg-clip-text text-transparent'
              }
            >
              MES
            </span>
          </div>
          {subtitle && (
            <p
              className={`${s.sub} ${
                isDarkSurface || isLightOnGradient ? 'text-blue-100' : 'text-slate-500'
              } font-medium`}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
