"use client";

import { en, hi, type Key } from "@/lib/dict";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Lang = "en" | "hi";
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: <K extends Key>(k: K, ...a: (typeof en)[K] extends (...x: infer P) => string ? P : []) => string };

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Start in English so server and client agree; switch after mount if the visitor chose Hindi before.
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("lang"); } catch {}
    const next: Lang = saved === "hi" || saved === "en" ? saved : navigator.language.startsWith("hi") ? "hi" : "en";
    const id = setTimeout(() => setLangState(next), 0);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("lang", l); } catch {}
  }, []);

  const value = useMemo<Ctx>(() => ({
    lang,
    setLang,
    t: ((k: Key, ...args: unknown[]) => {
      const v = (lang === "hi" ? hi[k] : undefined) ?? en[k];
      return typeof v === "function" ? (v as (...a: unknown[]) => string)(...args) : (v as string);
    }) as Ctx["t"],
  }), [lang, setLang]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useT() {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("useT outside I18nProvider");
  return c;
}
