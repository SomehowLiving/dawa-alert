"use client";

import { AlertHead, AlertRow } from "@/components/AlertRow";
import { useT } from "@/components/I18n";
import { PageHead } from "@/components/PageHead";
import { fmtYm } from "@/lib/format";
import type { BrowseResult, Match } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const AUTHS = ["WHO", "CDSCO", "State drug lab", "State drug controller"];

export function AlertsBrowser() {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [by, setBy] = useState<"product" | "manufacturer">("product");
  const [sev, setSev] = useState("");
  const [auth, setAuth] = useState("");
  const [month, setMonth] = useState("");
  const [list, setList] = useState<Match[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const token = useRef(0);

  const months = useMemo(() => {
    const d = new Date(), out: string[] = [];
    for (let i = 0; i < 14; i++) {
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
      out.push(`${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, []);

  const load = useCallback(async (reset: boolean, cursor: string | null) => {
    const mine = ++token.current;
    setLoading(true); setError(null);
    try {
      if (q.trim().length >= 2) {
        // Search mode: prefix match on the name, then narrow on the client.
        const res = await fetch(`/api/alerts?${new URLSearchParams({ q: q.trim(), by, limit: "100" })}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error);
        if (mine !== token.current) return;
        setList((j.results as Match[]).filter((m) => (!sev || String(m.severity) === sev) && (!auth || m.authority === auth) && (!month || m.listMonth === month)));
        setNext(null); setCapped(false);
      } else {
        const p = new URLSearchParams();
        if (sev) p.set("severity", sev); if (auth) p.set("authority", auth); if (month) p.set("month", month);
        if (cursor) p.set("cursor", cursor);
        const res = await fetch(`/api/browse?${p}`);
        const j = (await res.json()) as BrowseResult & { error?: string };
        if (!res.ok) throw new Error(j.error);
        if (mine !== token.current) return;
        setList((prev) => (reset ? j.results : prev.concat(j.results))); setNext(j.next); setCapped(j.capped);
      }
    } catch (e) {
      if (mine === token.current) setError((e as Error).message);
    } finally {
      if (mine === token.current) setLoading(false);
    }
  }, [q, by, sev, auth, month]);

  useEffect(() => {
    const id = setTimeout(() => void load(true, null), q ? 350 : 0);
    return () => clearTimeout(id);
  }, [load, q]);

  const sevs: [string, string][] = [["", t("sevAll")], ["3", t("pillContam")], ["2", t("pillSpurious")], ["1", t("pillQuality")]];

  return (
    <div>
      <PageHead eyebrow={t("aEyebrow")} title={t("aTitle")} lede={t("aLede")} />

      <div className="glass mt-8 rounded-[32px] p-5 md:p-7">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mute" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <input className="input pl-11" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("aSearch")} aria-label={t("aSearch")} />
          </div>
          <div className="flex gap-2" role="group">
            {(["product", "manufacturer"] as const).map((b) => (
              <button key={b} type="button" aria-pressed={by === b} onClick={() => setBy(b)} className="chip-btn h-[52px] px-5">{t(b === "product" ? "byProduct" : "byMfr")}</button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {sevs.map(([v, label]) => <button key={v} type="button" className="chip-btn" aria-pressed={sev === v} onClick={() => setSev(v)}>{label}</button>)}
          <select className="input !h-9 !w-auto !rounded-full !px-4 !pr-9 text-[13px]" value={auth} onChange={(e) => setAuth(e.target.value)} aria-label="Authority">
            <option value="">{t("authAll")}</option>{AUTHS.map((a) => <option key={a}>{a}</option>)}
          </select>
          <select className="input !h-9 !w-auto !rounded-full !px-4 !pr-9 text-[13px]" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            <option value="">{t("monthAll")}</option>{months.map((m) => <option key={m} value={m}>{fmtYm(m)}</option>)}
          </select>
          <span className="ml-auto text-[12px] text-mute">{list.length ? t("showing", list.length) : ""}</span>
        </div>

        <div className="mt-5">
          <AlertHead />
          {list.map((m) => <AlertRow key={m.key} m={m} />)}
          {!loading && !list.length && !error ? <p className="p-6 text-center text-mute">{t("none")}</p> : null}
          {loading && !list.length ? <p className="p-6 text-center text-mute">…</p> : null}
          {error ? <p className="p-6 text-center text-[#fb7185]">{error}</p> : null}
        </div>

        <div className="mt-4 text-center">
          {next ? <button type="button" disabled={loading} onClick={() => void load(false, next)} className="chip-btn h-11 px-7 disabled:opacity-50">{t("loadMore")}</button> : null}
          {capped ? <p className="mt-3 text-[12px] text-mute">{t("capNote")}</p> : null}
        </div>
      </div>
    </div>
  );
}
