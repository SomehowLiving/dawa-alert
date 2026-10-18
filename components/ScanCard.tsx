"use client";

import { useT } from "@/components/I18n";
import { readLabel, type LabelReading } from "@/lib/ocr-client";
import { useEffect, useRef, useState } from "react";

type Phase =
  | { k: "idle" }
  | { k: "working"; msg: string; pct: number; thumb: string }
  | { k: "done"; reading: LabelReading; thumb: string }
  | { k: "error"; msg: string };

/** "Scan the batch number". The reading is a suggestion the person must confirm, never an auto-fill. */
export function ScanCard({ server, onUse }: { server: boolean; onUse: (batch: string, product: string | null) => void }) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const thumbRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const run = useRef(0); // whichever read the person last started owns the screen; a slower one is ignored
  const [aiBusy, setAiBusy] = useState(false);
  useEffect(() => () => { if (thumbRef.current) URL.revokeObjectURL(thumbRef.current); }, []);

  async function onFile(file: File) {
    if (thumbRef.current) URL.revokeObjectURL(thumbRef.current);
    const thumb = (thumbRef.current = URL.createObjectURL(file));
    fileRef.current = file;
    const mine = ++run.current;
    setPhase({ k: "working", msg: t("ocrLoading"), pct: 0, thumb });
    try {
      // Always the device first: the photo stays on the phone unless the person asks for AI reading below.
      const reading = await readLabel(file, {
        server: false,
        onStatus: (key, i, n) => mine === run.current && setPhase((p) => (p.k === "working" ? { ...p, msg: key === "loading" ? t("ocrLoading") : t("ocrReading", i ?? 1, n ?? 1) } : p)),
        onProgress: (pct) => mine === run.current && setPhase((p) => (p.k === "working" ? { ...p, pct } : p)),
      });
      if (mine === run.current) setPhase({ k: "done", reading, thumb });
    } catch (e) {
      if (mine === run.current) setPhase({ k: "error", msg: (e as Error).message });
    }
  }

  async function tryAi() {
    const file = fileRef.current, thumb = thumbRef.current;
    if (!file || !thumb) return;
    const mine = ++run.current; // supersedes a device read that is still running
    setAiBusy(true);
    setPhase({ k: "working", msg: t("aiWorking"), pct: 100, thumb });
    try {
      const reading = await readLabel(file, { server: true });
      if (mine === run.current) setPhase({ k: "done", reading, thumb });
    } catch (e) {
      if (mine === run.current) setPhase({ k: "error", msg: (e as Error).message });
    } finally {
      if (mine === run.current) setAiBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex w-full items-center gap-4 rounded-[22px] border border-dashed border-white/15 bg-black/20 p-4 text-left transition hover:border-[#e8c9a0]/50 hover:bg-black/30"
      >
        <span className="orb grid h-11 w-11 shrink-0 place-items-center">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
        </span>
        <span>
          <span className="block text-[14px] font-medium">{t("scanT")}</span>
          <span className="block text-[12px] text-mute">{t("scanS")}</span>
        </span>
      </button>
      <input
        ref={input} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
      />

      {phase.k === "working" ? (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-black/25 p-3 hairline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={phase.thumb} alt="" className="h-14 w-14 rounded-xl object-cover" />
          <div className="flex-1 text-[13px]">
            {phase.msg}
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#e8c9a0] transition-all" style={{ width: `${phase.pct}%` }} /></div>
            {server && !aiBusy ? (
              <div className="mt-2.5">
                <button type="button" onClick={() => void tryAi()} className="rounded-full bg-white/[0.07] px-3.5 py-1.5 text-[12px] hairline hover:bg-white/10">{t("aiFaster")}</button>
                <span className="ml-2 text-[11px] text-mute">{t("aiNote")}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase.k === "done" ? (
        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-black/25 p-3 hairline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={phase.thumb} alt="" title={t("ocrZoom")} className="h-14 w-14 cursor-zoom-in rounded-xl object-cover" onClick={() => window.open(phase.thumb, "_blank", "noopener")} />
          <div className="flex-1 text-[13px]">
            {phase.reading.batch ? (
              <>
                <div className="font-medium">{t("ocrGuess")}</div>
                <div className="my-2 flex flex-wrap items-center gap-2">
                  <code className="rounded-lg bg-black/40 px-2.5 py-1 font-[family-name:var(--font-mono)] text-[15px] text-[#f3d5a8] hairline">{phase.reading.batch}</code>
                  {phase.reading.product ? <span className="text-mute">{phase.reading.product}</span> : null}
                  <button type="button" onClick={() => onUse(phase.reading.batch!, phase.reading.product)} className="btn-cream rounded-full px-3.5 py-1.5 text-[12px] font-medium">{t("ocrUse")}</button>
                </div>
                <div className="text-[12px] text-[#fb7185]">{t("ocrWarn")}</div>
              </>
            ) : <div className="font-medium">{t("ocrNone")}</div>}
            <div className="mt-1.5 text-[12px] text-mute">{t(phase.reading.via === "server" ? "ocrServer" : "ocrWhere")}</div>
            {server && phase.reading.via === "device" ? (
              <div className="mt-2.5">
                <button type="button" disabled={aiBusy} onClick={() => void tryAi()} className="rounded-full bg-white/[0.07] px-3.5 py-1.5 text-[12px] hairline hover:bg-white/10 disabled:opacity-60">
                  {aiBusy ? t("aiWorking") : t("aiTry")}
                </button>
                <span className="ml-2 text-[11px] text-mute">{t("aiNote")}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase.k === "error" ? <p className="mt-3 text-[13px] text-[#fb7185]">{phase.msg}</p> : null}
    </div>
  );
}
