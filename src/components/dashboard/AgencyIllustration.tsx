// Grayscale stipple-style line art: browser + phone mockups with design tools.
export function AgencyIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 170" fill="none" className={className} aria-hidden>
      <defs>
        <pattern id="ill-dots" width="3.2" height="3.2" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.75" fill="#8C8C8C" />
        </pattern>
        <pattern id="ill-dots-light" width="3.6" height="3.6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.6" fill="#BDBDBD" />
        </pattern>
        <pattern
          id="ill-hatch"
          width="3.5"
          height="3.5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="3.5" stroke="#A8A8A8" strokeWidth="1" />
        </pattern>
      </defs>

      {/* Back window */}
      <rect x="62" y="8" width="126" height="90" rx="6" fill="url(#ill-dots-light)" stroke="#9A9A9A" />
      <line x1="62" y1="21" x2="188" y2="21" stroke="#9A9A9A" />
      <circle cx="70" cy="14.5" r="1.8" fill="#9A9A9A" />
      <circle cx="76" cy="14.5" r="1.8" fill="#9A9A9A" />
      <circle cx="82" cy="14.5" r="1.8" fill="#9A9A9A" />

      {/* Front browser */}
      <rect x="22" y="36" width="132" height="98" rx="7" fill="#fff" stroke="#3A3A3A" strokeWidth="1.2" />
      <line x1="22" y1="50" x2="154" y2="50" stroke="#3A3A3A" strokeWidth="1.2" />
      <circle cx="30" cy="43" r="2" fill="#3A3A3A" />
      <circle cx="37" cy="43" r="2" fill="#6B6B6B" />
      <circle cx="44" cy="43" r="2" fill="#A3A3A3" />
      <rect x="60" y="40" width="62" height="6" rx="3" fill="#EDEDED" />

      {/* Hero copy + CTA */}
      <rect x="31" y="60" width="56" height="7" rx="2" fill="#2E2E2E" />
      <rect x="31" y="71" width="46" height="3.5" rx="1.75" fill="#BDBDBD" />
      <rect x="31" y="77.5" width="38" height="3.5" rx="1.75" fill="#BDBDBD" />
      <rect x="31" y="86" width="26" height="8" rx="4" fill="rgb(var(--ink))" />

      {/* Hero image */}
      <rect x="96" y="58" width="49" height="40" rx="4" fill="url(#ill-dots)" stroke="#7A7A7A" />
      <path d="M99 94 112 79l9 9 6-6 15 12" stroke="#5A5A5A" strokeWidth="1.1" fill="none" />
      <circle cx="133" cy="67" r="3.5" fill="#fff" stroke="#5A5A5A" />

      {/* Card row */}
      <rect x="31" y="106" width="34" height="20" rx="3" fill="url(#ill-hatch)" stroke="#9A9A9A" />
      <rect x="71" y="106" width="34" height="20" rx="3" fill="url(#ill-hatch)" stroke="#9A9A9A" />
      <rect x="111" y="106" width="34" height="20" rx="3" fill="url(#ill-hatch)" stroke="#9A9A9A" />

      {/* Phone */}
      <rect x="146" y="78" width="42" height="78" rx="8" fill="#fff" stroke="#2E2E2E" strokeWidth="1.2" />
      <rect x="161" y="82" width="12" height="3" rx="1.5" fill="#2E2E2E" />
      <rect x="151" y="91" width="32" height="22" rx="3" fill="url(#ill-dots)" stroke="#8A8A8A" />
      <rect x="151" y="117" width="24" height="4" rx="2" fill="#3A3A3A" />
      <rect x="151" y="124" width="30" height="3" rx="1.5" fill="#C4C4C4" />
      <rect x="151" y="129.5" width="22" height="3" rx="1.5" fill="#C4C4C4" />
      <rect x="151" y="139" width="32" height="9" rx="4.5" fill="rgb(var(--ink))" />

      {/* Bezier pen path */}
      <path d="M6 156c22-26 52 8 78-10s34-8 52 4" stroke="#8A8A8A" strokeDasharray="2.5 3" />
      <rect x="3.5" y="153.5" width="5" height="5" fill="#fff" stroke="#3A3A3A" />
      <rect x="81.5" y="143.5" width="5" height="5" fill="#fff" stroke="#3A3A3A" />
      <line x1="66" y1="132" x2="100" y2="160" stroke="#BDBDBD" />
      <circle cx="66" cy="132" r="2" fill="#3A3A3A" />
      <circle cx="100" cy="160" r="2" fill="#3A3A3A" />

      {/* Colour swatches */}
      <circle cx="16" cy="24" r="10" fill="url(#ill-dots)" stroke="#7A7A7A" />
      <circle cx="30" cy="16" r="7" fill="#fff" stroke="#3A3A3A" />
      <circle cx="40" cy="27" r="5" fill="#2E2E2E" />
    </svg>
  );
}
