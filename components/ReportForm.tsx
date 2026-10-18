"use client";

import { useT } from "@/components/I18n";
import { PageHead } from "@/components/PageHead";
import Link from "next/link";
import { useState } from "react";

const ROLES = [["chemist", "roleChemist"], ["health_worker", "roleHealth"], ["parent", "roleParent"], ["inspector", "roleInspector"]] as const;

export function ReportForm({ initialBatch = "" }: { initialBatch?: string }) {
  const { t } = useT();
  const [batch, setBatch] = useState(initialBatch);
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("chemist");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg({ ok: true, text: t("writing") });
    try {
      const res = await fetch("/api/sightings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ batch, pincode: pin, reporterType: role }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `request failed (${res.status})`);
      setMsg({ ok: true, text: t(j.status === "created" ? "thanks" : "renewed") });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const List = ({ title, items }: { title: string; items: string[] }) => (
    <section className="glass rounded-[28px] p-6">
      <h2 className="font-[family-name:var(--font-serif)] text-[24px] italic">{title}</h2>
      <ul className="mt-3 grid list-disc gap-2 pl-5 text-[14px] text-ink/80">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </section>
  );

  return (
    <div>
      <PageHead eyebrow={t("rEyebrow")} title={t("rTitle")} lede={t("rLede")} />
      <div className="mt-8 grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <form onSubmit={submit} className="glass rounded-[32px] p-6 md:p-8" noValidate>
          <label className="mb-2 block text-[12px] text-mute" htmlFor="rbatch">{t("rBatch")}</label>
          <input id="rbatch" className="input" value={batch} onChange={(e) => setBatch(e.target.value)} placeholder={t("phBatchShort")} autoComplete="off" required />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-[12px] text-mute" htmlFor="pin">{t("rPin")}</label>
              <input id="pin" className="input" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={6} placeholder={t("phPin")} required />
            </div>
            <div>
              <label className="mb-2 block text-[12px] text-mute" htmlFor="role">{t("rRole")}</label>
              <select id="role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={busy} className="btn-cream mt-6 h-[52px] w-full rounded-[18px] text-[14px] font-medium disabled:opacity-60">{t("rBtn")}</button>
          <p className={`mt-4 min-h-5 text-[13px] ${msg && !msg.ok ? "text-[#fb7185]" : "text-mute"}`} role="status" aria-live="polite">
            {msg?.text} {msg?.ok && msg.text.startsWith(t("thanks").slice(0, 8)) ? <Link href="/map" className="underline underline-offset-4">{t("navMap")} →</Link> : null}
          </p>
        </form>
        <aside className="grid gap-5">
          <List title={t("rStore")} items={[t("rS1"), t("rS2"), t("rS3")]} />
          <List title={t("rNever")} items={[t("rN1"), t("rN2"), t("rN3")]} />
        </aside>
      </div>
    </div>
  );
}
