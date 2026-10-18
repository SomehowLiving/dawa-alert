"use client";

import { useT } from "@/components/I18n";
import { PageHead } from "@/components/PageHead";
import { VerdictCard } from "@/components/VerdictCard";
import { useFetch } from "@/components/useFetch";
import { entityUrl } from "@/lib/format";
import type { Verdict } from "@/lib/types";
import Link from "next/link";

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="glass rounded-[28px] p-6">
    <h2 className="font-[family-name:var(--font-serif)] text-[24px] italic">{title}</h2>
    <div className="mt-3">{children}</div>
  </section>
);

export function BatchView({ batch, product }: { batch: string; product: string }) {
  const { t } = useT();
  const { data: v, error } = useFetch<Verdict>(batch ? `/api/check?${new URLSearchParams({ batch, product })}` : null);

  if (!batch) return <p className="text-mute">No batch given. <Link href="/alerts" className="underline">{t("navAlerts")}</Link></p>;

  const shown = v ? (v.matches.length ? v.matches : v.otherProducts) : [];
  const top = shown[0];
  const sev = v && (v.severity === 3 || v.severity === 2) ? v.severity : 1;
  const steps = !v ? [] : v.status === "not_found" ? ["bNone1", "bNone2", "bNone3"] : [`bStep${sev}a`, `bStep${sev}b`, `bStep${sev}c`];
  const eyebrow = !v ? "…" : t(v.status === "flagged" ? "eyeFlag" : v.status === "possible_match" ? "eyePos" : "eyeNone");

  return (
    <div>
      <Link href="/alerts" className="mb-5 inline-flex text-[13px] text-mute hover:text-ink">← {t("bBack")}</Link>
      <PageHead
        eyebrow={eyebrow}
        title={top ? top.product : batch}
        lede={`${t("batchFor")} ${top ? top.batch : batch}${v?.authorities.length ? ` · ${t("flaggedBy", v.authorities.join(", "))}` : ""}`}
      />
      {error ? <p className="mt-6 text-[#fb7185]">{error}</p> : null}
      {v ? (
        <div className="mt-8 grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
          <VerdictCard v={v} detail />
          <aside className="grid gap-5">
            <Card title={t("bDo")}>
              <ol className="grid list-decimal gap-2 pl-5 text-[14px] text-ink/85">{steps.map((k) => <li key={k}>{t(k as "bNone1")}</li>)}</ol>
            </Card>
            {shown.length ? (
              <Card title={t("bVerify")}>
                <p className="mb-3 text-[13px] text-mute">{t("bVerifyP")}</p>
                {shown.map((m) => (
                  <div key={m.key} className="border-t border-white/[0.07] py-3 first:border-t-0">
                    <div className="text-[13px] font-medium">{m.authority}</div>
                    <a
                      href={entityUrl(m.key)} target="_blank" rel="noopener noreferrer" title={t("viewOnArkiv")}
                      className="mt-1 block break-all font-[family-name:var(--font-mono)] text-[11px] text-[#f3d5a8] underline decoration-white/25 underline-offset-4 hover:decoration-[#f3d5a8]"
                    >
                      {m.key} ↗
                    </a>
                    <div className="mt-1 text-[12px] text-mute">
                      owner {String(m.owner ?? "").slice(0, 10)}… · {m.readonly ? "readonly" : "editable"}
                      {m.proof?.sha256 ? ` · sha256 ${m.proof.sha256.slice(0, 12)}…` : ""}{m.proof?.extraction ? ` · ${m.proof.extraction}` : ""}
                    </div>
                  </div>
                ))}
              </Card>
            ) : null}
            <Card title={t("bShelf")}>
              <p className="mb-4 text-[13px] text-mute">{t("bShelfP")}</p>
              <Link href={`/report?batch=${encodeURIComponent(batch)}`} className="btn-cream inline-block rounded-full px-5 py-2.5 text-[14px] font-medium">{t("report")}</Link>
            </Card>
          </aside>
        </div>
      ) : !error ? <p className="mt-8 text-mute">{t("checking")}</p> : null}
    </div>
  );
}
