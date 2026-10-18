"use client";

import { useT } from "@/components/I18n";

const TONE: Record<number, string> = {
  3: "bg-[#fb7185]/15 text-[#fb7185]",
  2: "bg-[#c084fc]/15 text-[#e9d5ff]",
  1: "bg-[#e8c9a0]/15 text-[#e8c9a0]",
};

export function SeverityPill({ severity }: { severity: number }) {
  const { t } = useT();
  const sev = severity === 3 || severity === 2 ? severity : 1;
  const label = sev === 3 ? t("pillContam") : sev === 2 ? t("pillSpurious") : t("pillQuality");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${TONE[sev]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
