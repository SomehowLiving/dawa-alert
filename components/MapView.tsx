"use client";

import { useT } from "@/components/I18n";
import { PageHead } from "@/components/PageHead";
import { SightingMap } from "@/components/SightingMap";
import { useFetch } from "@/components/useFetch";
import { groupRegions } from "@/lib/regions";
import type { District } from "@/lib/types";
import Link from "next/link";
import { useMemo, useState } from "react";

export function MapView() {
  const { t } = useT();
  const [b, setB] = useState("");
  const { data } = useFetch<{ districts: District[] }>(`/api/sightings/map${b.trim() ? `?batch=${encodeURIComponent(b.trim())}` : ""}`, 20_000);
  const regions = useMemo(() => groupRegions(data?.districts ?? []), [data]);
  const total = regions.reduce((s, r) => s + r.count, 0);

  return (
    <div>
      <PageHead eyebrow={t("mEyebrow")} title={t("mTitle")} lede={t("mLede")} />
      <div className="glass mt-8 rounded-[32px] p-5 md:p-7">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input className="input max-w-sm" value={b} onChange={(e) => setB(e.target.value)} placeholder={t("mFilter")} aria-label={t("mFilter")} />
          <span className="text-[13px] text-mute">{total ? t("totalN", total) : ""}</span>
          <Link href="/report" className="btn-cream ml-auto rounded-full px-5 py-2.5 text-[13px] font-medium">{t("navReport")}</Link>
        </div>
        <SightingMap regions={regions} className="h-[min(560px,62vh)]" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="glass rounded-[28px] p-6">
          <h2 className="font-[family-name:var(--font-serif)] text-[24px] italic">{t("mByRegion")}</h2>
          <div className="mt-3">
            {regions.length ? regions.map((r) => (
              <div key={r.name} className="flex items-center gap-4 border-t border-white/[0.07] py-3 first:border-t-0">
                <span className="flex-1 text-[14px] font-medium">{r.name}</span>
                <span className="hidden truncate text-[13px] text-mute md:block">{r.batches.slice(0, 4).join(", ")}</span>
                <span className="rounded-full bg-[#fb7185]/15 px-2.5 py-0.5 text-[11px] text-[#fb7185]">{t("regionSights", r.count)}</span>
              </div>
            )) : <p className="py-4 text-mute">{t("mNone")}</p>}
          </div>
        </section>
        <section className="glass rounded-[28px] p-6">
          <h2 className="font-[family-name:var(--font-serif)] text-[24px] italic">{t("mHow")}</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-mute">{t("mHowP")}</p>
        </section>
      </div>
    </div>
  );
}
