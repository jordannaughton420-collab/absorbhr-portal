// Small decorative hand-drawn accents. Purely visual, hidden from screen readers.

export function DoodleSquiggle({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 120 24"
      fill="none"
      className={className}
    >
      <path
        d="M2 14c10-10 18 10 28 0s18 10 28 0 18 10 28 0 18 10 30 0"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DoodleSparkle({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
