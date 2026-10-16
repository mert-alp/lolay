// Small inline flags for the language switch (no external assets, CSP-safe)
export function FlagTR({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 2) / 3} viewBox="0 0 30 20" aria-hidden className="shrink-0 rounded-[3px] shadow-[0_0_0_1px_rgba(255,255,255,.12)]">
      <rect width="30" height="20" fill="#E30A17" />
      <circle cx="11.25" cy="10" r="5" fill="#fff" />
      <circle cx="12.5" cy="10" r="4" fill="#E30A17" />
      <polygon fill="#fff" points="16.6,10 19.6,11 17.7,8.5 17.7,11.5 19.6,9" />
    </svg>
  )
}

export function FlagGB({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 2) / 3} viewBox="0 0 60 40" aria-hidden className="shrink-0 rounded-[3px] shadow-[0_0_0_1px_rgba(255,255,255,.12)]">
      <clipPath id="gb-c"><rect width="60" height="40" /></clipPath>
      <g clipPath="url(#gb-c)">
        <rect width="60" height="40" fill="#012169" />
        <path d="M0 0l60 40M60 0L0 40" stroke="#fff" strokeWidth="8" />
        <path d="M0 0l60 40M60 0L0 40" stroke="#C8102E" strokeWidth="3" />
        <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="12" />
        <path d="M30 0v40M0 20h60" stroke="#C8102E" strokeWidth="7" />
      </g>
    </svg>
  )
}
