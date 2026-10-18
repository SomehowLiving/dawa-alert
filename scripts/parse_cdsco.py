#!/usr/bin/env python3
"""Parse CDSCO alert PDFs (central NSQ, state NSQ, spurious) into data/alerts.json.

Usage: python3 -I scripts/parse_cdsco.py [--raw data/raw] [--out data/alerts.json]

The three list types use different column layouts and date styles, so columns are
located by header keywords, and rows with an empty S.No are treated as continuations
of the previous row (the PDFs split long names over several physical rows).
"""
import argparse, json, re, sys
from datetime import date, timedelta
from pathlib import Path

import pdfplumber

MON = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def clean(s):
    s = re.sub(r"-\n(?=[A-Za-z])", "-", s or "")  # "Gastro-\nResistant" is one hyphenated word
    return re.sub(r"\s+", " ", s.replace("”", '"').replace("“", '"')).strip()


def parse_ym(s):
    """'09/2024' | 'Apr-24' | 'Jun-2026' | '30/06/2026' | Excel serial 46327 | '0 9 / 2 0 2 6 .' -> (y, m) or None."""
    s = re.sub(r"\s+", "", clean(s).lower()).rstrip(".")
    if not s:
        return None
    if re.fullmatch(r"\d{5}", s):  # Excel serial date leaked into the PDF text
        d = date(1899, 12, 30) + timedelta(days=int(s))
        return (d.year, d.month) if 2000 <= d.year <= 2100 else None
    m = re.fullmatch(r"\d{1,2}[/\-.](\d{1,2})[/\-.](\d{4})", s)  # dd/mm/yyyy
    if m:
        mo, y = int(m.group(1)), int(m.group(2))
    else:
        m = re.fullmatch(r"(\d{1,2})[/\-.](\d{4}|\d{2})", s)
        if m:
            mo, y = int(m.group(1)), int(m.group(2))
        else:
            m = re.fullmatch(r"([a-z]{3})[a-z]*[\-/.,']*(\d{4}|\d{2})", s)
            if not m or m.group(1) not in MON:
                return None
            mo, y = MON[m.group(1)], int(m.group(2))
    y = y + 2000 if y < 100 else y
    return (y, mo) if 1 <= mo <= 12 and 2000 <= y <= 2100 else None


def colmap(header):
    """Map logical fields to column indexes from a header row."""
    h = [clean(c).lower() for c in header]
    m = {}
    for i, c in enumerate(h):
        if re.fullmatch(r"batch(\s*(no|number)\.?)?", c):
            m["batch"] = i
        elif "expiry" in c:
            m["expiry"] = i
        elif ("manufa" in c or "mfg" in c) and "date" in c.replace(" ", "") and "by" not in c:
            m["mfg"] = i
        elif "manufactured by" in c or c.startswith("manufactured by") or (c.startswith("manufactured") and "date" not in c):
            m["mfr"] = i
        elif "result" in c or "reason" in c:
            m["reason"] = i
        elif "reported by" in c or "drawn by" in c:
            m["lab"] = i
        elif "name" in c or "product" in c:
            m.setdefault("name", i)
    return m


def is_header(row):
    return any(re.fullmatch(r"batch(\s*(no|number)\.?)?", clean(c).lower()) for c in row)


# Layout of spurious/NSQ "drug alert" tables when a continuation page repeats no header.
FALLBACK = {10: {"name": 1, "batch": 2, "mfg": 3, "expiry": 4, "mfr": 5, "reason": 6, "lab": 7}}


def rows_of(pdf):
    maps = dict(FALLBACK)
    for page in pdf.pages:
        for table in page.extract_tables():
            for row in table:
                if not row:
                    continue
                if is_header(row):
                    maps[len(row)] = colmap(row)
                    yield ("header", maps[len(row)], row)
                elif len(row) in maps:
                    yield ("row", maps[len(row)], row)


def extract(path: Path, meta: dict):
    kind, month = meta["kind"], meta["month"]
    records = []
    with pdfplumber.open(path) as pdf:
        cur = None

        def flush():
            nonlocal cur
            if cur is None:
                return
            cells = {i: " ".join(x for x in v if x) for i, v in enumerate(cur["_cells"])}
            cm = cur["cmap"]
            g = lambda k: cells.get(cm.get(k, -1), "")
            nc = range(cm.get("name", 1), cm.get("batch", 2))
            product = clean(" ".join(cells.get(i, "") for i in nc))
            batch = clean(g("batch"))
            mfg, exp = parse_ym(g("mfg")), parse_ym(g("expiry"))
            if product and batch:
                records.append({
                    "source": kind,
                    "list_month": month,
                    "row": cur["row"],
                    "product": product,
                    "batch": batch,
                    "mfg_ym": f"{mfg[0]}-{mfg[1]:02d}" if mfg else None,
                    "expiry_ym": f"{exp[0]}-{exp[1]:02d}" if exp else None,
                    "expiry_raw": clean(g("expiry")),
                    "manufacturer": clean(g("mfr")),
                    "reason": clean(g("reason")),
                    "lab": clean(g("lab")),
                    "doc": path.name,
                    "doc_sha256": meta.get("sha256"),
                    "doc_url": meta.get("url"),
                    "retrieved_at": meta.get("retrieved_at"),
                    "extraction": "pdf-table-parse",
                })
            cur = None

        for typ, cm, row in rows_of(pdf):
            if typ == "header":
                flush()
                continue
            sno = clean(row[0])
            if re.match(r"^\d+\.?$", sno):
                flush()
                cur = {"row": int(sno.rstrip(".")), "cmap": cm, "_cells": [[clean(c)] for c in row]}
            elif cur is not None and not sno:
                for i, c in enumerate(row):
                    if clean(c):
                        cur["_cells"][i].append(clean(c))
        flush()
    return records


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="data/raw")
    ap.add_argument("--out", default="data/alerts.json")
    a = ap.parse_args()
    raw = Path(a.raw)
    manifest = json.loads((raw / "manifest.json").read_text()) if (raw / "manifest.json").exists() else {}
    all_records, stats = [], {}
    for pdf in sorted(raw.glob("*.pdf")):
        meta = manifest.get(pdf.name)
        if meta is None:  # a hand-added fixture, e.g. nsq-2025-03.pdf
            import hashlib
            meta = {"kind": "cdsco_nsq", "month": "2025-03",
                    "sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(), "url": None}
        recs = extract(pdf, meta)
        stats[pdf.name] = len(recs)
        all_records.extend(recs)
    # de-duplicate (revised lists repeat rows): same source+product+batch keeps the first
    seen, uniq = set(), []
    for r in all_records:
        k = (r["source"], r["product"].lower(), r["batch"].lower())
        if k not in seen:
            seen.add(k)
            uniq.append(r)
    tmp = Path(a.out + ".tmp")
    tmp.write_text(json.dumps(uniq, indent=1, ensure_ascii=False))
    tmp.replace(a.out)
    for k, v in stats.items():
        print(f"{k:34} {v:4}")
    print(f"total {len(all_records)} -> {len(uniq)} unique -> {a.out}")


if __name__ == "__main__":
    main()
