"use client";

import { useT } from "@/components/I18n";
import { ScanCard } from "@/components/ScanCard";
import { VerdictCard } from "@/components/VerdictCard";
import { useFetch } from "@/components/useFetch";
import type { Health, Verdict } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/** The check form, the photo reader and the result. Used on the floor and (with a preset) elsewhere. */
export function CheckPanel({ initialBatch = "", initialProduct = "" }: { initialBatch?: string; initialProduct?: string }) {
  const { t } = useT();
  const [batch, setBatch] = useState(initialBatch);
  const [product, setProduct] = useState(initialProduct);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: health } = useFetch<Health>("/api/health");
  const batchInput = useRef<HTMLInputElement>(null);

  const check = useCallback(async (b: string, p: string) => {
    if (!b.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/check?${new URLSearchParams({ batch: b, product: p })}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `request failed (${res.status})`);
      setVerdict(json as Verdict);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (initialBatch) { const id = setTimeout(() => void check(initialBatch, initialProduct), 0); return () => clearTimeout(id); }
  }, [initialBatch, initialProduct, check]);

  return (
    <section id="check" className="glass scroll-mt-24 rounded-[32px] p-6 md:p-7">
      <div className="mb-5 flex items-center gap-6 border-b border-white/[0.08] text-[14px]">
        <span className="-mb-px border-b-2 border-[#e8c9a0] pb-3 text-ink">{t("tabCheck")}</span>
        <Link href="/report" className="pb-3 text-mute hover:text-ink">{t("tabReport")}</Link>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void check(batch, product); }} noValidate>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mute" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <input ref={batchInput} className="input pl-11" value={batch} onChange={(e) => setBatch(e.target.value)} placeholder={t("phBatch")} aria-label={t("batch")} autoComplete="off" />
          </div>
          <button type="submit" disabled={busy || !batch.trim()} className="btn-cream h-[52px] rounded-[18px] px-7 text-[14px] font-medium disabled:opacity-50">
            {busy ? "…" : t("btnCheck")}
          </button>
        </div>
        <input className="input mt-3" value={product} onChange={(e) => setProduct(e.target.value)} placeholder={t("phProduct")} aria-label={t("product")} autoComplete="off" />
        <p className="mt-2.5 text-[12px] text-mute">{t("lblProduct")} {t("hintBatch")}</p>

        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-mute/80 before:h-px before:flex-1 before:bg-white/[0.08] after:h-px after:flex-1 after:bg-white/[0.08]">{t("or")}</div>

        <ScanCard
          server={Boolean(health?.features.ocr)}
          onUse={(b, p) => { setBatch(b); if (p && !product) setProduct(p); batchInput.current?.focus(); }}
        />
        <p className="mt-3 min-h-5 text-[13px] text-mute" role="status" aria-live="polite">{busy ? t("checking") : ""}{error ? <span className="text-[#fb7185]">{error}</span> : null}</p>
      </form>

      {verdict ? <div className="mt-2" aria-live="polite"><VerdictCard v={verdict} /></div> : null}
    </section>
  );
}
