#!/usr/bin/env python3
"""Fetch CDSCO's public NSQ / spurious data (cdscoonline.gov.in) into data/alerts_portal.json.

CDSCO moved NSQ alerts from monthly PDFs to this searchable portal in Aug 2025. The portal's
own table calls these unauthenticated JSON endpoints; we make a handful of GETs, one per
month, with a pause between requests.

Usage: python3 -I scripts/fetch_portal.py [--years 2025 2026] [--out data/alerts_portal.json]
"""
import argparse, datetime, hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

BASE = "https://cdscoonline.gov.in/CDSCO"
UA = {
    "User-Agent": "dawa-alert-hackathon/0.1 (public regulatory data mirror)",
    "Accept": "application/json",
    "Referer": "https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug",
}
RETRIES = 3  # attempts per request; retry on 429, 5xx, timeouts and connection errors
RETRIED_AT = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
PAUSE = 1.0


def get(path, **params):
    url = f"{BASE}/{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    for attempt in range(1, RETRIES + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                body = r.read().decode("utf-8", "ignore")
            time.sleep(PAUSE)
            return url, json.loads(body)
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500:
                raise  # a 4xx other than 429 will not get better by retrying
            err = e
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            err = e
        if attempt == RETRIES:
            raise RuntimeError(f"{url}: gave up after {RETRIES} attempts: {err}")
        time.sleep(1.5 * 2 ** (attempt - 1))  # 1.5 s, 3 s


def write_atomic(path, text):
    """Write to a temp file and rename, so a crash never leaves a truncated dataset that looks valid."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


def ym(s):
    """'Jun-2026' -> '2026-06'; anything unparseable -> None."""
    try:
        mon, year = s.strip().split("-")
        return f"{int(year):04d}-{MONTHS.index(mon[:3].title()) + 1:02d}"
    except Exception:  # noqa: BLE001
        return None


def row_hash(row):
    return hashlib.sha256(json.dumps(row, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def normalise(row, kind, url):
    month = row.get("dt_reporting_month_year", "")  # e.g. AUG-2026
    try:
        mon, year = month.split("-")
        list_month = f"{int(year):04d}-{MONTHS.index(mon[:3].title()) + 1:02d}"
    except Exception:  # noqa: BLE001
        list_month = None
    product = row.get("str_product_name") or row.get("product_name_from_dtl") or ""
    return {
        "source": kind,
        "list_month": list_month,
        "row": None,
        "product": " ".join(product.split()),
        "batch": " ".join((row.get("str_batch_no") or "").split()),
        "mfg_ym": ym(row.get("dt_manufacturing_date", "")),
        "expiry_ym": ym(row.get("dt_expiry_date", "")),
        "expiry_raw": row.get("dt_expiry_date", ""),
        "manufacturer": " ".join((row.get("str_manufactured_by") or "").split()),
        "reason": " ".join((row.get("str_nsq_result") or "").split()),
        "lab": " ".join((row.get("str_reported_by_lab_or_state") or "").split()),
        "doc": "cdscoonline.gov.in portal",
        "doc_sha256": row_hash(row),  # hash of the exact portal row, so anyone can re-check it
        "doc_url": url,
        "retrieved_at": RETRIED_AT,
        "extraction": "cdsco-json-api",
    }


REQUIRED = ("str_product_name", "str_batch_no", "dt_expiry_date", "dt_reporting_month_year")


def validate(raw, out_rows, previous_count, force):
    """Refuse to replace a good dataset with a broken one (same safeguard MedicineWatch documents)."""
    problems = []
    if not out_rows:
        problems.append("portal returned no rows at all")
    for label, rows in raw.items():
        if not isinstance(rows, list):
            problems.append(f"{label}: not a list")
            continue
        for r in rows[:50]:
            missing = [k for k in REQUIRED if k not in r]
            if missing:
                problems.append(f"{label}: rows missing {missing}")
                break
    if previous_count and len(out_rows) < 0.8 * previous_count:
        problems.append(f"row count fell from {previous_count} to {len(out_rows)} (more than 20%)")
    if problems and not force:
        sys.exit("refusing to overwrite the previous dataset:\n  - " + "\n  - ".join(problems) + "\n(use --force to override)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", nargs="*", default=["2025", "2026"])
    ap.add_argument("--out", default="data/alerts_portal.json")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    out_rows, raw = [], {}
    for year in a.years:
        _, months = get("publicReportingMonths", year=year, tab="nsq")
        for mon in months:
            label = f"{mon.upper()}-{year}"
            url, d = get("filteredNsqDrugTable", month=label, source="All", tab="nsq")
            rows = d.get("aaData", [])
            raw[label] = rows
            for r in rows:
                kind = "cdsco_portal_nsq" if r.get("str_reporting_source") == "CDSCO Labs" else "cdsco_portal_state_nsq"
                out_rows.append(normalise(r, kind, url))
            print(f"nsq {label}: {len(rows)}", file=sys.stderr)
    _, sp = get("viewPublicSpuriousDrugData")
    for r in sp.get("aaData", []):
        out_rows.append(normalise(r, "cdsco_portal_spurious", f"{BASE}/viewPublicSpuriousDrugData"))
    print(f"spurious: {len(sp.get('aaData', []))}", file=sys.stderr)
    prev = Path(a.out)
    previous_count = len(json.loads(prev.read_text())) if prev.exists() else 0
    validate(raw, out_rows, previous_count, a.force)
    Path("data/raw").mkdir(parents=True, exist_ok=True)
    write_atomic(Path("data/raw/portal_months.json"), json.dumps(raw, ensure_ascii=False))
    write_atomic(Path(a.out), json.dumps(out_rows, indent=1, ensure_ascii=False))
    print(f"{len(out_rows)} rows -> {a.out}")


if __name__ == "__main__":
    main()
