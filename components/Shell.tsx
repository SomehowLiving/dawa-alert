"use client";

import { Mark } from "@/components/Mark";
import { Orb } from "@/components/Orb";
import { useT } from "@/components/I18n";
import type { Key } from "@/lib/dict";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: { href: string; key: Key }[] = [
  { href: "/", key: "navFloor" },
  { href: "/alerts", key: "navAlerts" },
  { href: "/map", key: "navMap" },
  { href: "/report", key: "navReport" },
  { href: "/about", key: "navAbout" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { t, lang, setLang } = useT();
  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="relative mx-auto flex min-h-screen max-w-[1180px] flex-col px-4 pb-8 pt-5">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <Mark size={34} />
          <div className="leading-none">
            <div className="font-[family-name:var(--font-serif)] text-[26px] italic tracking-tight">dawa alert</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-mute">{t("tagline")}</div>
          </div>
        </Link>

        <nav className="hidden items-center rounded-full bg-black/25 p-1 hairline md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on(n.href) ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-[13px] ${on(n.href) ? "bg-white/10 text-ink" : "text-mute hover:text-ink"}`}
            >
              {t(n.key)}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setLang(lang === "hi" ? "en" : "hi")}
          className="rounded-full bg-black/25 px-4 py-2 text-[13px] text-ink hairline"
          aria-label="Switch language"
        >
          {t("langBtn")}
        </button>
      </header>

      <main className="mt-8 flex-1">{children}</main>

      <footer className="mt-12 flex flex-col gap-2 border-t border-white/[0.08] pt-5 text-[12px] text-mute md:flex-row md:justify-between">
        <span>{t("foot")}</span>
        <a href="https://github.com/arkiv-network" className="underline-offset-4 hover:underline">
          built on arkiv
        </a>
      </footer>

      <nav className="sticky bottom-3 mx-auto mt-6 flex w-full max-w-[420px] items-center justify-between rounded-full bg-black/60 px-5 py-2.5 hairline backdrop-blur-xl md:hidden">
        <Link href="/alerts" className={on("/alerts") ? "text-ink" : "text-mute"}>{t("navAlerts")}</Link>
        <Link href="/map" className={on("/map") ? "text-ink" : "text-mute"}>{t("navMap")}</Link>
        <Link href="/" className="-my-3" aria-label={t("ctaCheck")}><Orb size={46} /></Link>
        <Link href="/report" className={on("/report") ? "text-ink" : "text-mute"}>{t("navReport")}</Link>
        <Link href="/about" className={on("/about") ? "text-ink" : "text-mute"}>{t("navAbout")}</Link>
      </nav>
    </div>
  );
}
