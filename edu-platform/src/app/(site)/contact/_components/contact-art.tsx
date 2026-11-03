/** رسم «تواصل معنا»: فقاعات محادثة ملونة وظرف وهاتف حول شمس دافئة. زخرفي بالكامل. */
export function ContactArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 320" className={className} width="100%" height="100%" aria-hidden focusable="false">
      <defs>
        <linearGradient id="ca-teal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2DC2B3" />
          <stop offset="1" stopColor="#0A6B66" />
        </linearGradient>
        <linearGradient id="ca-coral" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFA07A" />
          <stop offset="1" stopColor="#E8483F" />
        </linearGradient>
        <linearGradient id="ca-violet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C09CFF" />
          <stop offset="1" stopColor="#6A3FE0" />
        </linearGradient>
        <radialGradient id="ca-sun" cx=".4" cy=".4" r=".7">
          <stop offset="0" stopColor="#FFF0BF" />
          <stop offset=".6" stopColor="#FFC531" />
        </radialGradient>
      </defs>
      {/* شمس وحلقات */}
      <circle cx="214" cy="160" r="128" fill="#FFC531" opacity=".1" />
      <circle cx="214" cy="160" r="96" fill="#FFC531" opacity=".14" />
      <circle cx="214" cy="160" r="66" fill="url(#ca-sun)" />
      {/* نقاط */}
      <g fill="#0A6B66" opacity=".22">
        {[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3].map((c) => <circle key={`${r}-${c}`} cx={330 + c * 16} cy={210 + r * 16} r="2.4" />))}
      </g>
      {/* فقاعة كبيرة فيروزية */}
      <g transform="rotate(-5 150 110)">
        <path d="M60 60h170a26 26 0 0 1 26 26v62a26 26 0 0 1-26 26h-108l-38 30 6-30H60a26 26 0 0 1-26-26V86a26 26 0 0 1 26-26Z" fill="url(#ca-teal)" />
        <circle cx="104" cy="117" r="12" fill="#fff" />
        <circle cx="145" cy="117" r="12" fill="#fff" opacity=".85" />
        <circle cx="186" cy="117" r="12" fill="#FFC531" />
      </g>
      {/* فقاعة بيضاء صغيرة */}
      <g transform="rotate(6 300 90)">
        <path d="M262 40h86a20 20 0 0 1 20 20v40a20 20 0 0 1-20 20h-14l4 22-28-22h-48a20 20 0 0 1-20-20V60a20 20 0 0 1 20-20Z" fill="#fff" />
        <rect x="266" y="62" width="70" height="9" rx="4.5" fill="#18B9A7" opacity=".5" />
        <rect x="266" y="82" width="48" height="9" rx="4.5" fill="#E0D2BA" />
      </g>
      {/* ظرف ذهبي */}
      <g transform="rotate(8 300 230)">
        <rect x="240" y="186" width="124" height="86" rx="16" fill="#fff" />
        <path d="M240 202l62 40 62-40" fill="none" stroke="#FFC531" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="256" y="252" width="40" height="8" rx="4" fill="#FFE29A" />
      </g>
      {/* هاتف مرجاني */}
      <circle cx="96" cy="250" r="44" fill="url(#ca-coral)" />
      <path
        d="M80 232c3-3 8-3 10 1l5 9c2 3 1 7-2 9l-4 3c3 7 9 13 16 16l3-4c2-3 6-4 9-2l9 5c4 2 4 7 1 10l-5 5c-5 5-14 4-25-3-10-7-18-15-24-25-7-11-7-19-2-24Z"
        fill="#fff"
      />
      {/* قلب بنفسجي */}
      <circle cx="372" cy="150" r="22" fill="url(#ca-violet)" />
      <path d="M372 160c-8-6-12-10-12-15a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 5-4 9-12 15Z" fill="#fff" />
      {/* نجوم */}
      <path d="M40 28l4 9 9 4-9 4-4 9-4-9-9-4 9-4Z" fill="#FFC531" />
      <path d="M392 36l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#18B9A7" />
      <path d="M176 284l3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="#FF6B5A" />
    </svg>
  );
}
