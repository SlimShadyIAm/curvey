export function ArenaPreview() {
  return (
    <svg
      className="arena-preview"
      viewBox="0 0 720 720"
      role="img"
      aria-label="Illustration of colored trails curving through an arena"
    >
      <defs>
        <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#293033" />
        </pattern>
      </defs>
      <rect width="720" height="720" fill="#101415" />
      <rect width="720" height="720" fill="url(#dots)" />
      <g fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path
          stroke="#80c7ff"
          d="M0 140 H170 Q250 140 250 220 V410 Q250 450 290 450 H460 Q500 450 500 410 V360"
        />
        <path stroke="#80c7ff" d="M500 342 V280 Q500 240 540 240 H620 Q660 240 660 200 V0" />
        <path
          stroke="#c4ec78"
          d="M720 560 H510 Q440 560 440 490 V330 Q440 295 405 295 H355 Q320 295 320 330 V505 Q320 590 235 590 H165 Q105 590 105 530 V320 Q105 275 150 275 H170"
        />
        <path stroke="#c4ec78" d="M188 275 H204" />
        <path
          stroke="#ff927d"
          d="M360 0 V130 Q360 195 425 195 H540 Q590 195 590 145 V80 Q590 40 550 40 H490 Q450 40 450 80 V105"
        />
        <path stroke="#d5a4ff" d="M610 720 V645 Q610 610 575 610 H400 Q365 610 365 645 V670" />
        <path stroke="#d5a4ff" d="M365 690 V720" />
      </g>
      <g fill="#c4ec78">
        <circle cx="204" cy="275" r="5" />
        <circle cx="204" cy="275" r="12" fill="none" stroke="#c4ec78" opacity=".65" />
      </g>
      <circle cx="450" cy="105" r="5" fill="#ff927d" />
      <g fill="#929f9e" fontFamily="system-ui" fontSize="11" letterSpacing="2">
        <text x="28" y="687">
          ONE ARENA. NO SECOND CHANCES.
        </text>
      </g>
    </svg>
  );
}
