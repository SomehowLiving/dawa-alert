"use client";

import { useT } from "@/components/I18n";
import { Tile } from "@/components/Tile";
import { entityUrl, fmtMmYyyy, fmtYm } from "@/lib/format";
import type { Match, Verdict } from "@/lib/types";
import Link from "next/link";

const TONE = {
  flagged: { band: "from-[#fb7185]/20 to-[#fb7185]/5", ring: "ring-[#fb7185]/35", text: "text-[#fb7185]", dot: "bg-[#fb7185]" },
  possible_match: { band: "from-[#e8c9a0]/18 to-[#e8c9a0]/4", ring: "ring-[#e8c9a0]/35", text: "text-[#e8c9a0]", dot: "bg-[#e8c9a0]" },
  not_found: { band: "from-white/10 to-white/[0.02]", ring: "ring-white/10", text: "text-mute", dot: "bg-mute" },
} as const;

function SourceRow({ m }: { m: Match }) {
  const { t } = useT();
  const press = m.proof?.extraction === "press-report";
  return (
    <div className="grid grid-cols-[36px_1fr_auto] items-center gap-x-3 gap-y-0.5 border-t border-white/[0.07] py-3 first:border-t-0 md:grid-cols-[36px_1fr_1.8fr_auto_auto] md:gap-x-4">
      <Tile authority={m.authority} />
      <span className="text-[14px] font-medium leading-tight">{m.authority}</span>
      <span className="col-span-3 col-start-2 row-start-2 line-clamp-2 text-[13px] text-mute md:col-span-1 md:col-start-auto md:row-start-auto" title={m.reason}>
        {m.reason.slice(0, 120)}{press ? ` (${t("press")})` : ""}
      </span>
      <span className="hidden whitespace-nowrap text-[13px] text-mute md:block">{fmtYm(m.listMonth, t("unknown"))}</span>
      {m.proof?.url ? (
        <a href={m.proof.url} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-[13px] underline underline-offset-4 decoration-white/30 hover:decoration-white">
          {t("view")} ↗
        </a>
      ) : <span />}
    </div>
  );
}

/** The answer to "is this batch flagged?", in PACT's verdict language. */
export function VerdictCard({ v, detail = false }: { v: Verdict; detail?: boolean }) {
  const { t } = useT();
  const tone = TONE[v.status];
  const shown = v.matches.length ? v.matches : v.otherProducts;
  const top = shown[0];
  const sev = v.severity === 3 || v.severity === 2 ? v.severity : 1;

  let kicker: string, title: string, body: string;
  if (v.status === "flagged") {
    kicker = t("flagged"); title = t("flaggedIn", shown.length, v.authorities.length);
    body = `${t(`head${sev}` as "head1")}. ${t(`adv${sev}` as "adv1")}`;
  } else if (v.status === "possible_match") {
    kicker = t("possible");
    title = v.query.product ? t("possibleH") : t("askH");
    body = v.query.product ? t("possibleP") : t("askP");
  } else {
    kicker = t("notFoundK"); title = t("notFoundH"); body = t("notFoundP");
  }

  return (
    <div className={`overflow-hidden rounded-[28px] bg-black/20 ring-1 ${tone.ring}`}>
      <div className={`flex gap-4 bg-gradient-to-b ${tone.band} p-5 md:p-6`}>
        <span className={`mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full ${tone.dot} text-[#120814]`} aria-hidden>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            {v.status === "not_found" ? <path d="M9.5 9a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 4M12 17h.01" /> : <path d="M12 7v6M12 17h.01" />}
          </svg>
        </span>
        <div>
          <div className={`text-[11px] font-medium uppercase tracking-[0.22em] ${tone.text}`}>{kicker}</div>
          <h3 className="mt-1 font-[family-name:var(--font-serif)] text-[26px] italic leading-tight">{title}</h3>
          <p className="mt-1.5 text-[14px] text-ink/80">{body}</p>
        </div>
      </div>

      {top ? (
        <>
          <div className="grid grid-cols-2 gap-px bg-white/[0.07] md:grid-cols-4">
            {([
              ["product", top.product], ["batch", top.batch], ["mfg", fmtMmYyyy(top.mfgYm, t("unknown"))], ["exp", fmtMmYyyy(top.expiryYm, t("unknown"))],
            ] as const).map(([k, val]) => (
              <div key={k} className="bg-[#0d0812]/80 px-5 py-3.5">
                <div className="text-[10px] uppercase tracking-[0.2em] text-mute">{t(k)}</div>
                <div className="num mt-1 truncate text-[15px] font-medium" title={String(val)}>{val}</div>
              </div>
            ))}
          </div>

          <div className="p-5 md:p-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-mute">{t("alertSources")}</div>
            <div className="mt-2">{shown.map((m) => <SourceRow key={m.key} m={m} />)}</div>
            {top.manufacturer ? (
              <p className="mt-3 text-[13px] text-mute"><span className="text-ink/70">{t("maker")}:</span> {top.manufacturer.slice(0, detail ? 260 : 150)}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
              {shown.every((m) => m.readonly) ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8c9a0]/12 px-3 py-1 text-[#e8c9a0]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
                  {t("unchangeable")}
                </span>
              ) : null}
              {v.sightings.count ? <span className="rounded-full bg-white/[0.06] px-3 py-1 text-mute hairline">{t("sightN", v.sightings.count)}</span> : null}
            </div>
            <details className="mt-3 text-[12px] text-mute" open={detail}>
              <summary className="cursor-pointer">{t("entity")}</summary>
              {shown.map((m) => (
                <a
                  key={m.key} href={entityUrl(m.key)} target="_blank" rel="noopener noreferrer" title={t("viewOnArkiv")}
                  className="mt-1.5 block break-all font-[family-name:var(--font-mono)] text-[11px] text-[#f3d5a8] underline decoration-white/25 underline-offset-4 hover:decoration-[#f3d5a8]"
                >
                  {m.key} ↗
                </a>
              ))}
            </details>
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                target="_blank" rel="noopener noreferrer"
                href={`https://wa.me/?text=${encodeURIComponent(`${top.product} (batch ${top.batch}) is flagged by ${v.authorities.join(", ")}. Check yours: ${typeof location === "undefined" ? "" : location.origin}/batch?batch=${encodeURIComponent(top.batch)}&product=${encodeURIComponent(top.product)}`)}`}
                className="rounded-full bg-black/25 px-4 py-2 text-[13px] hairline hover:bg-white/10"
              >{t("share")}</a>
              <Link href={`/report?batch=${encodeURIComponent(top.batch)}`} className="rounded-full bg-black/25 px-4 py-2 text-[13px] hairline hover:bg-white/10">{t("reportThis")}</Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
