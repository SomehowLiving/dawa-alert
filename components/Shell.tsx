"use client";

import { Mark } from "@/components/Mark";
import { Orb } from "@/components/Orb";
import { useT } from "@/components/I18n";
import type { Key } from "@/lib/dict";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"), 0);
    return () => clearTimeout(id);
  }, []);
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    setTheme(next);
  }
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="grid h-9 w-9 place-items-center rounded-full bg-black/25 text-ink hairline"
            aria-label={theme === "light" ? t("themeDark") : t("themeLight")}
            title={theme === "light" ? t("themeDark") : t("themeLight")}
          >
            {theme === "light" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => setLang(lang === "hi" ? "en" : "hi")}
            className="rounded-full bg-black/25 px-4 py-2 text-[13px] text-ink hairline"
            aria-label="Switch language"
          >
            {t("langBtn")}
          </button>
        </div>
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
