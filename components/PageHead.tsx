export function PageHead({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <div className="max-w-[44rem]">
      <div className="text-[11px] uppercase tracking-[0.22em] text-mute">{eyebrow}</div>
      <h1 className="mt-3 font-[family-name:var(--font-serif)] text-[40px] italic leading-[1.04] tracking-tight md:text-[54px]">{title}</h1>
      {lede ? <p className="mt-4 text-[15px] leading-relaxed text-ink/70">{lede}</p> : null}
    </div>
  );
}
