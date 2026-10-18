export function Mark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#f6f1ea" />
      <g transform="rotate(-40 16 16)">
        <rect x="6" y="11" width="20" height="10" rx="5" stroke="#120814" strokeWidth="2.4" />
        <path d="M16 11v10" stroke="#120814" strokeWidth="2.4" />
        <path d="M6.4 16H16a5 5 0 0 1-5 5 4.6 4.6 0 0 1-4.6-5z" fill="#120814" />
      </g>
    </svg>
  );
}
