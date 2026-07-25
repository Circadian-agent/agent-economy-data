#!/usr/bin/env python3
"""Measure the whole x402 economy from the public CDP Bazaar discovery API.

The Bazaar is the only place that publishes per-listing demand: each record
carries a `quality` object with Coinbase's own l30DaysTotalCalls,
l30DaysUniquePayers and lastCalledAt. No API key is needed to read it.

Usage:
    python3 tools/x402_market_scan.py                 # summary to stdout
    python3 tools/x402_market_scan.py --csv out.csv   # also write top-500 extract
    python3 tools/x402_market_scan.py --json raw.json # also dump the raw snapshot

Method notes (keep these stable so numbers stay comparable across wakes):
  - Only listings priced in Base-mainnet USDC at <= $100 are counted. The rest
    are other chains or junk (one listing is priced at ten billion dollars).
  - A listing quoting several USDC prices is counted at its LOWEST (conservative).
  - Revenue is an estimate: price x l30DaysTotalCalls. Coinbase does not document
    how it counts calls, so these are its numbers, reported faithfully.
"""

import argparse
import csv
import json
import re
import statistics
import sys
import time
import urllib.request

API = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources"
BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
PRICE_CAP = 100.0
PAGE = 1000


def fetch_all(verbose=True):
    items, offset = [], 0
    while True:
        url = f"{API}?limit={PAGE}&offset={offset}"
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=60) as fh:
                    data = json.load(fh)
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        batch = data["items"]
        items += batch
        total = data["pagination"]["total"]
        if verbose:
            print(f"  fetched {len(items):>6,}/{total:,}", file=sys.stderr)
        offset += PAGE
        if offset >= total or not batch:
            return items


def quality(rec, key):
    return (rec.get("quality") or {}).get(key, 0) or 0


def price(rec):
    """Lowest Base-mainnet USDC price across the accepts entries, or None."""
    found = []
    for acc in rec.get("accepts", []):
        if (acc.get("asset") or "").lower() != BASE_USDC:
            continue
        raw = acc.get("amount") or acc.get("maxAmountRequired")
        if raw:
            try:
                found.append(int(raw) / 1e6)
            except (TypeError, ValueError):
                pass
    return min(found) if found else None


CATEGORIES = [
    ("Social and Twitter data", r"twitter|tweet|\bsocial\b|reddit|discord|telegram"),
    ("Web search", r"\bsearch\b|serp|tavily|\bexa\b"),
    ("Crypto market data", r"price|token|swap|\bdex\b|ohlc|candle|market.?data|ticker|coin"),
    ("Onchain and wallet data", r"wallet|onchain|on-chain|transaction|balance|holder|portfolio|nft"),
    ("AI and LLM inference", r"\bllm\b|inference|gpt|claude|completion|embedding|chat"),
    ("Research and reports", r"research|brief|report|analys|summar"),
    ("Email and messaging", r"email|\bmail\b|\bsms\b|notification"),
    ("News and feeds", r"news|headline|article|\brss\b|feed"),
    ("Web extraction and scraping", r"extract|scrap|markdown|crawl|readab|html"),
    ("Media generation", r"image|video|audio|\btts\b|speech|render"),
    ("Weather", r"weather|forecast"),
]
_RX = [(name, re.compile(pat, re.I)) for name, pat in CATEGORIES]


def categorise(rec):
    hay = " ".join([
        rec.get("serviceName") or "",
        rec.get("description") or "",
        " ".join(rec.get("tags") or []),
        rec.get("resource") or "",
    ])
    for name, rx in _RX:
        if rx.search(hay):
            return name
    return "Everything else"


def rows_from(items):
    out = []
    for rec in items:
        usd = price(rec)
        if usd is None or usd > PRICE_CAP:
            continue
        calls = quality(rec, "l30DaysTotalCalls")
        out.append({
            "service": (rec.get("serviceName") or "").strip()[:60],
            "host": re.sub(r"^https?://([^/]+).*", r"\1", rec.get("resource", "")),
            "price_usd": usd,
            "calls_30d": calls,
            "payers_30d": quality(rec, "l30DaysUniquePayers"),
            "est_rev_30d": round(usd * calls, 2),
            "last_called": (rec.get("quality") or {}).get("lastCalledAt", "")[:10],
            "category": categorise(rec),
        })
    return out


def report(rows, raw_count):
    rev = sorted((r["est_rev_30d"] for r in rows), reverse=True)
    calls = sum(r["calls_30d"] for r in rows)
    gmv = sum(rev)
    print(f"records returned by API      : {raw_count:,}")
    print(f"counted (Base USDC, <=${PRICE_CAP:.0f}) : {len(rows):,}")
    print(f"paid calls, 30 days          : {calls:,}")
    print(f"estimated volume, 30 days    : ${gmv:,.0f}")
    print(f"median listing earns / month : ${statistics.median(rev):,.2f}")
    print(f"mean listing earns / month   : ${gmv/len(rows):,.2f}")
    for bar in (100, 10, 1):
        n = sum(1 for x in rev if x >= bar)
        print(f"listings earning >= ${bar:<4}/mo   : {n:,} ({n/len(rows)*100:.2f}%)")
    n = sum(1 for x in rev if x < 1)
    print(f"listings earning <  $1/mo    : {n:,} ({n/len(rows)*100:.1f}%)")
    top10 = sum(sorted((r["calls_30d"] for r in rows), reverse=True)[:10])
    print(f"top 10 listings' share of calls: {top10/calls*100:.0f}%")
    print(f"distinct seller hosts        : {len({r['host'] for r in rows}):,}")

    print("\ncategory                        listings     calls    volume   each")
    agg = {}
    for r in rows:
        a = agg.setdefault(r["category"], [0, 0, 0.0])
        a[0] += 1
        a[1] += r["calls_30d"]
        a[2] += r["est_rev_30d"]
    for name, (n, c, g) in sorted(agg.items(), key=lambda kv: -kv[1][1]):
        print(f"{name:<30}{n:>9,}{c:>10,}{g:>10,.0f}{g/n:>7.2f}")

    print("\ntop 10 by estimated 30d revenue")
    for r in sorted(rows, key=lambda x: -x["est_rev_30d"])[:10]:
        label = r["service"] or r["host"]
        print(f"  ${r['est_rev_30d']:>9,.0f}  ${r['price_usd']:>8.4f} x {r['calls_30d']:>7,} calls  "
              f"{r['payers_30d']:>5,} payers  {label[:40]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="write a top-500-by-revenue extract here")
    ap.add_argument("--json", help="dump the raw API snapshot here")
    args = ap.parse_args()

    items = fetch_all()
    if args.json:
        json.dump(items, open(args.json, "w"))
    rows = rows_from(items)
    report(rows, len(items))

    if args.csv:
        top = [r for r in sorted(rows, key=lambda x: -x["est_rev_30d"]) if r["calls_30d"] > 0][:500]
        with open(args.csv, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(top[0].keys()))
            w.writeheader()
            w.writerows(top)
        print(f"\nwrote {len(top)} rows to {args.csv}")


if __name__ == "__main__":
    main()
