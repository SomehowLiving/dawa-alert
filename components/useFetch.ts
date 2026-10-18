"use client";

import { useCallback, useEffect, useState } from "react";

/** GET a JSON endpoint, optionally refreshing on an interval (like PACT's useDesk). */
export function useFetch<T>(url: string | null, everyMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `request failed (${res.status})`);
      setData(json as T);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [url]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const id = everyMs ? setInterval(() => void refresh(), everyMs) : undefined;
    return () => {
      clearTimeout(first);
      if (id) clearInterval(id);
    };
  }, [refresh, everyMs]);

  return { data, error, refresh };
}
