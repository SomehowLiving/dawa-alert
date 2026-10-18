"use client";

import { AlertHead, AlertRow } from "@/components/AlertRow";
import { CheckPanel } from "@/components/CheckPanel";
import { Gauge } from "@/components/Gauge";
import { useT } from "@/components/I18n";
import { Orb } from "@/components/Orb";
import { SightingMap } from "@/components/SightingMap";
import { Sparkline } from "@/components/Sparkline";
import { Tile } from "@/components/Tile";
import { useFetch } from "@/components/useFetch";
import { fmtYm } from "@/lib/format";
import { groupRegions } from "@/lib/regions";
import type { District, Match, Stats } from "@/lib/types";
import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] uppercase tracking-[0.22em] text-mute">{children}</div>
);

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="border-l border-white/10 pl-5 first:border-l-0 first:pl-0">
      <div className="num font-[family-name:var(--font-serif)] text-[34px] leading-none">{n}</div>
      <div className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-mute">{label}</div>
    </div>
  );
}

export function Floor() {
  const { t } = useT();
  const { data: stats } = useFetch<Stats>("/api/stats", 5 * 60_000);
  const { data: recent } = useFetch<{ results: Match[] }>("/api/recent", 5 * 60_000);
  const { data: map } = useFetch<{ districts: District[] }>("/api/sightings/map", 30_000);
  const regions = useMemo(() => groupRegions(map?.districts ?? []), [map]);

  const total = stats?.alerts ?? 0;
  const sev = stats?.bySeverity ?? {};
  const grave = (sev["3"] ?? 0) + (sev["2"] ?? 0);
  const months = stats?.byMonth ?? [];
  const spark = months.length > 1 ? { pts: months.map((m) => m.n), labels: months.map((m) => fmtYm(m.ym)) } : { pts: [0, 0, 0], labels: [] };
  const n = (x?: number) => (x === undefined ? "…" : x.toLocaleString());

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1.25fr_0.95fr]">
      <div className="grid gap-5">
      {/* hero */}
      <section className="glass relative isolate overflow-hidden rounded-[32px] p-6 md:p-9 lg:min-h-[560px]">
        <Image src="/brand/hero.jpg" alt="" fill priority sizes="(min-width: 1024px) 60vw, 100vw" className="-z-10 object-cover object-[88%_40%] opacity-90" />
        <div className="hero-fade-x absolute inset-0 -z-10" />
        <div className="hero-fade-y absolute inset-0 -z-10" />
        <div className="flex h-full max-w-[26rem] flex-col">
          <Label>{t("eyebrow")}</Label>
          <h1 className="mt-4 max-w-[5em] font-[family-name:var(--font-serif)] text-[54px] italic leading-[0.98] tracking-tight md:text-[72px]">{t("heroTitle")}</h1>
          <p className="mt-5 max-w-[22rem] text-[15px] leading-relaxed text-ink/75">{t("heroLede")}</p>
          <div className="mt-7 flex flex-wrap items-center gap-5">
            <a href="#check" className="btn-cream inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium">
              {t("ctaCheck")}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
            <Link href="/about" className="text-[14px] text-ink/80 underline decoration-white/30 underline-offset-4 hover:decoration-white">{t("ctaAbout")}</Link>
          </div>
          <div className="mt-auto flex gap-5 pt-12">
            <Stat n={stats ? String(Object.keys(stats.byAuthority).length) : "…"} label={t("stAuthorities")} />
            <Stat n={n(stats?.alerts)} label={t("stAlerts")} />
            <Stat n={n(stats?.sightings)} label={t("stSightings")} />
          </div>
        </div>
      </section>

      {/* by month */}
      <section className="glass rounded-[32px] p-6 md:p-8">
        <div className="flex items-start justify-between">
          <div>
            <Label>{t("flagByMonth")}</Label>
            <div className="num mt-2 font-[family-name:var(--font-serif)] text-[52px] leading-none md:text-[64px]">{n(stats?.alerts)}</div>
            <div className="mt-2 text-sm text-mute">{t("flagByMonthSub")}</div>
          </div>
          <span className="rounded-full bg-[#e8c9a0]/12 px-3 py-1 text-[12px] text-[#e8c9a0]">
            {stats?.indexedThrough ? `${t("indexed")} ${fmtYm(stats.indexedThrough)}` : "…"}
          </span>
        </div>
        <div className="mt-1 h-[140px]">
          <Sparkline points={spark.pts} labels={spark.labels} format={(v) => String(Math.round(v))} tip={(v) => `${Math.round(v)} ${t("alertsWord")}`} className="h-full w-full" />
        </div>
      </section>

      {/* recent alerts */}
      <section className="glass rounded-[32px] p-6 md:p-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-[family-name:var(--font-serif)] text-[30px] italic leading-tight">{t("recent")}</h2>
          <Link href="/alerts" className="text-[13px] text-mute hover:text-ink">{t("viewAll")} →</Link>
        </div>
        <div className="mt-4">
          <AlertHead />
          {recent ? recent.results.slice(0, 6).map((m) => <AlertRow key={m.key} m={m} />) : <p className="p-4 text-mute">…</p>}
        </div>
      </section>
      </div>

      <div className="grid gap-5">
      <CheckPanel />

      {/* severity mix */}
      <section className="glass rounded-[32px] p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] text-mute">{t("mixTitle")}</div>
            <div className="mt-1 text-sm text-ink/80">{t("mixSub")}</div>
          </div>
          <Orb size={44} />
        </div>
        <Gauge value={grave} max={Math.max(total, 1)} label={`${total ? Math.round((grave / total) * 100) : 0}%`} sub={t("mixFoot")} />
        <div className="mt-2 grid grid-cols-2 gap-3 text-[12px] text-mute">
          <div className="rounded-2xl bg-black/25 p-3 hairline">{t("perOrder")}<div className="num mt-1 text-[18px] text-ink">{n(sev["3"])}</div></div>
          <div className="rounded-2xl bg-black/25 p-3 hairline">{t("chain")}<div className="num mt-1 text-[18px] text-ink">{n(sev["2"])}</div></div>
        </div>
      </section>

      {/* sightings + sources */}
        <div className="glass rounded-[32px] p-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-[family-name:var(--font-serif)] text-[26px] italic">{t("sightings")}</h2>
            <Link href="/map" className="text-[13px] text-mute hover:text-ink">{t("viewMap")} →</Link>
          </div>
          <SightingMap regions={regions} className="h-[240px]" />
        </div>
        <div className="glass rounded-[32px] p-6">
          <Label>{t("sources")}</Label>
          <div className="mt-4 grid gap-3.5">
            {[
              ["WHO", "World Health Organization", "Medical Product Alerts"],
              ["CDSCO", "CDSCO", "Central Drugs Standard Control Org."],
              ["State drug controller", "State drug controllers", "Telangana and others"],
            ].map(([a, name, sub]) => (
              <div key={a} className="flex items-center gap-3">
                <Tile authority={a!} size={40} />
                <div className="leading-tight"><div className="text-[14px] font-medium">{name}</div><div className="text-[12px] text-mute">{sub}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
