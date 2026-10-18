#!/usr/bin/env python3
"""Download CDSCO monthly alert PDFs and record provenance (url + sha256).

Usage: python3 scripts/fetch_cdsco.py [--since 2025-01] [--out data/raw]

Only public regulatory lists are fetched: central NSQ, state NSQ and spurious-drug lists.
"""
import argparse, datetime, hashlib, html, json, re, sys, urllib.parse, urllib.request
from pathlib import Path
from urllib.parse import urljoin

LISTING = "https://cdsco.gov.in/opencms/opencms/en/Notifications/Alerts/"
UA = {"User-Agent": "dawa-alert-hackathon/0.1 (public regulatory data mirror)"}

MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def classify(title: str):
    t = title.lower()
    if "spurious" in t:
        return "cdsco_spurious"
    if "state" in t and "nsq" in t:
        return "cdsco_state_nsq"
    if "nsq" in t or "drug alert" in t:
        return "cdsco_nsq"
    return None


def month_of(title: str):
    m = re.search(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-,.]*(20\d\d)", title.lower())
    return f"{m.group(2)}-{MONTHS[m.group(1)]:02d}" if m else None


def parse_listing(page: str):
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        link = re.search(r"href='([^']*download_file_division[^']*)'", row)
        cells = [re.sub(r"<[^>]+>", " ", c) for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if not link or len(cells) < 3:
            continue
        title = re.sub(r"\s+", " ", html.unescape(cells[1])).strip()
        kind, month = classify(title), month_of(title)
        if kind and month:
            yield {"title": title, "released": cells[2].strip(), "kind": kind,
                   "month": month, "url": urljoin(LISTING, link.group(1))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="2025-01")
    ap.add_argument("--out", default="data/raw")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    items = [i for i in parse_listing(get(LISTING).decode("utf-8", "ignore")) if i["month"] >= a.since]
    manifest = {}
    mf = out / "manifest.json"
    if mf.exists():
        manifest = json.loads(mf.read_text())
    seen = set()
    for it in items:
        name = f"{it['kind']}-{it['month']}.pdf"
        if name in seen:  # revised lists reuse the same month; keep the first (newest) one
            continue
        seen.add(name)
        try:
            data = get(it["url"])
            if not data.startswith(b"%PDF"):  # endpoint wraps the real file in an <iframe>
                m = re.search(rb"src='([^']+)'", data)
                if m:
                    data = get(urljoin(LISTING, urllib.parse.quote(m.group(1).decode(), safe="/:")))
        except Exception as e:  # noqa: BLE001
            print(f"! {name}: {e}", file=sys.stderr)
            continue
        if not data.startswith(b"%PDF"):
            print(f"! {name}: not a PDF", file=sys.stderr)
            continue
        (out / name).write_bytes(data)
        manifest[name] = {**it, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
                          "retrieved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}
        print(f"ok {name} {len(data)//1024} KB")
    mf.write_text(json.dumps(manifest, indent=2, sort_keys=True))
    print(f"{len(seen)} files, manifest -> {mf}")


if __name__ == "__main__":
    main()
