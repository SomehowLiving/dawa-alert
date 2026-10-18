const TEXT: Record<string, string> = {
  WHO: "WHO",
  CDSCO: "CDSCO",
  "State drug lab": "LAB",
  "State drug controller": "SDC",
  Community: "COM",
};

/** Monogram for the body that raised an alert. Deliberately not an official emblem. */
export function Tile({ authority, size = 36 }: { authority: string; size?: number }) {
  return (
    <span
      title={authority}
      className="inline-grid shrink-0 place-items-center rounded-[11px] bg-white/[0.06] text-[10px] font-semibold tracking-wide text-ink/90 hairline"
      style={{ width: size, height: size }}
    >
      {TEXT[authority] ?? authority.slice(0, 3).toUpperCase()}
    </span>
  );
}
