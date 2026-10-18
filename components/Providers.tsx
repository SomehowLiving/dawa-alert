"use client";

import { I18nProvider } from "@/components/I18n";

export function Providers({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}
