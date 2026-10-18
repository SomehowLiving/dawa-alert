"use client";

import { useT } from "@/components/I18n";
import { SeverityPill } from "@/components/SeverityPill";
import { batchHref, fmtYm } from "@/lib/format";
import type { Match } from "@/lib/types";
import Link from "next/link";

const COLS = "grid-cols-[minmax(0,1fr)_auto_14px] md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_auto_minmax(80px,0.8fr)_14px]";

/** One alert as a row that opens the batch's own page. */
export function AlertRow({ m }: { m: Match }) {
  const { t } = useT();
  return (
    <Link href={batchHref(m)} className={`row-link grid ${COLS} items-center gap-4 rounded-2xl px-3 py-3.5`}>
      <span className="truncate text-[14px] font-medium" title={m.product}>{m.product}</span>
      <span className="hidden truncate text-[13px] text-mute md:block">{t("batch")} {m.batch}</span>
      <SeverityPill severity={m.severity} />
      <span className="hidden text-right text-[13px] text-mute md:block">{fmtYm(m.listMonth, t("unknown"))}</span>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-mute" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
    </Link>
  );
}

export function AlertHead() {
  const { t } = useT();
  return (
    <div className={`hidden ${COLS} gap-4 px-3 pb-2 text-[11px] uppercase tracking-[0.18em] text-mute md:grid`}>
      <span>{t("colProduct")}</span><span>{t("colBatch")}</span><span>{t("colType")}</span><span className="text-right">{t("colListed")}</span><span />
    </div>
  );
}
