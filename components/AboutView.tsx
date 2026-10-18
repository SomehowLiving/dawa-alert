"use client";

import { useT } from "@/components/I18n";
import { PageHead } from "@/components/PageHead";

const SOURCES = [
  { href: "https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug", label: "CDSCO Not of Standard Quality and spurious drug lists", note: "central and state laboratories, monthly" },
  { href: "https://www.who.int/news/item/13-10-2025-medical-product-alert-n-5-2025--substandard-(contaminated)-oral-liquid-medicines", label: "WHO Medical Product Alert N°5/2025", note: "Coldrif, Respifresh TR, ReLife" },
];

export function AboutView() {
  const { t } = useT();
  const steps = [["a1t", "a1"], ["a2t", "a2"], ["a3t", "a3"], ["a4t", "a4"]] as const;
  const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-3 mt-12 font-[family-name:var(--font-serif)] text-[32px] italic leading-tight">{children}</h2>;
  const Ul = ({ keys }: { keys: ("w1" | "w2" | "w3" | "l1" | "l2" | "l3" | "l4")[] }) => <ul className="grid list-disc gap-2 pl-5 text-[15px] text-ink/80">{keys.map((k) => <li key={k}>{t(k)}</li>)}</ul>;

  return (
    <div>
      <PageHead eyebrow={t("abEyebrow")} title={t("abTitle")} lede={t("abLede")} />
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {steps.map(([h, p], i) => (
          <div key={h} className="glass rounded-[28px] p-6">
            <div className="num font-[family-name:var(--font-serif)] text-[34px] leading-none text-mute">{i + 1}</div>
            <h3 className="mt-4 text-[16px] font-medium">{t(h)}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-mute">{t(p)}</p>
          </div>
        ))}
      </div>

      <div className="max-w-[44rem]">
        <H>{t("abData")}</H>
        <p className="mb-3 text-[15px] text-ink/80">{t("abDataP")}</p>
        <ul className="grid list-disc gap-2 pl-5 text-[15px] text-ink/80">
          {SOURCES.map((s) => <li key={s.href}><a className="underline decoration-white/30 underline-offset-4 hover:decoration-white" href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a> <span className="text-mute">({s.note})</span></li>)}
          <li>Telangana Drugs Control Administration stop-use notices, Oct 2025 <span className="text-mute">(from press reports; the official notice could not be retrieved)</span></li>
        </ul>
        <H>{t("abWhy")}</H>
        <p className="mb-3 text-[15px] text-ink/80">{t("abWhyP")}</p>
        <Ul keys={["w1", "w2", "w3"]} />
        <H>{t("abLimits")}</H>
        <Ul keys={["l1", "l2", "l3", "l4"]} />
      </div>
    </div>
  );
}
