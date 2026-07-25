#!/usr/bin/env python3
"""Measure the MCP server ecosystem from public, keyless sources.

Two stages, both reproducible by anyone with curl:

  1. CRAWL  registry.modelcontextprotocol.io/v0/servers  (the official Model Context
     Protocol registry; cursor-paged, no auth, no rate limit encountered).
     Every record is a *version* of a server, not a server: the same name appears
     once per published version, and exactly one carries isLatest=true. We collapse
     to latest-per-name before counting anything.

  2. ENRICH each server published to npm with real adoption numbers:
       npm -> api.npmjs.org/downloads/point/last-month/<pkg>  (bulk, 100/req)
     Public, unauthenticated, and explicitly built for bulk queries. Downloads are
     a noisy proxy for use (CI and mirrors inflate them) but they are the only
     per-server adoption signal in the ecosystem that does not need a key.

     PyPI is deliberately NOT enriched. pypistats.org rate-limits (429) well below
     the ~2,700 requests this would need, and it is a volunteer-run service; working
     around that by retrying would be abuse, not research. Download figures below
     therefore describe the npm-published population only, and every stated figure
     says so. Serving the same disclosure everywhere beats a bigger sample.

  We deliberately do NOT use api.pulsemcp.com: its v0beta is being sunset by
  randomly failing a rising share of requests, and retrying past that would be
  working around a deprecation the maintainers asked callers to respect. Its
  v0.1 replacement needs an API key.

Usage:
  python3 tools/mcp_registry_scan.py --out research/data/mcp-<date>
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers"
NPM_BULK = "https://api.npmjs.org/downloads/point/last-month/"
PYPI_RECENT = "https://pypistats.org/api/packages/{}/recent"
UA = "circadian-agent.com MCP ecosystem research (admin@webfiks.no)"


# Three distinct outcomes, because collapsing them is the bug this scanner shipped.
NOT_FOUND = object()  # the server told us it does not exist
UNKNOWN = object()    # we never got an answer; say so rather than guess


def get(url, tries=4, timeout=60):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            # 404 is a real answer (package not published under that name).
            if e.code == 404:
                return NOT_FOUND
            # 429 and 5xx are us being throttled or the server struggling. They are
            # NOT answers, and treating them as one is what produced the retracted
            # "37.8 percent of packages do not exist" claim on 2026-07-25.
            last = e
        except Exception as e:  # noqa: BLE001
            last = e
        time.sleep(1.5 * (i + 1))
    print(f"  ! giving up on {url[:110]}: {last}", file=sys.stderr)
    return UNKNOWN


def crawl_registry():
    """Every version record in the registry, in publication order."""
    out, cursor, page = [], None, 0
    while True:
        url = REGISTRY + "?limit=100" + (f"&cursor={urllib.parse.quote(cursor)}" if cursor else "")
        d = get(url)
        if not d:
            break
        out.extend(d.get("servers", []))
        cursor = d.get("metadata", {}).get("nextCursor")
        page += 1
        if page % 20 == 0:
            print(f"  ... {len(out)} version records", file=sys.stderr)
        if not cursor:
            break
    return out


def latest_only(records):
    """Collapse version records to one row per server name.

    Prefer the record flagged isLatest; fall back to the newest publishedAt so a
    server whose flag is missing is still counted once rather than dropped.
    """
    by_name = {}
    for rec in records:
        srv = rec.get("server", {})
        name = srv.get("name")
        if not name:
            continue
        meta = rec.get("_meta", {}).get("io.modelcontextprotocol.registry/official", {})
        key = (1 if meta.get("isLatest") else 0, meta.get("publishedAt") or "")
        prev = by_name.get(name)
        if prev is None or key > prev[0]:
            by_name[name] = (key, rec)
    return {n: r for n, (_, r) in by_name.items()}


def npm_downloads(names):
    """Bulk last-month downloads. npm caps bulk queries at 128 names per request
    and rejects scoped packages in bulk, so those go one at a time."""
    out = {}
    plain = [n for n in names if not n.startswith("@")]
    scoped = [n for n in names if n.startswith("@")]
    for i in range(0, len(plain), 100):
        chunk = plain[i : i + 100]
        d = get(NPM_BULK + ",".join(urllib.parse.quote(c, safe="") for c in chunk))
        # Sentinels are not dicts, so a failed chunk contributes nothing rather than
        # silently marking 100 packages as absent.
        if isinstance(d, dict):
            if "downloads" in d and "package" in d:  # single-result shape
                out[d["package"]] = d["downloads"]
            else:
                for k, v in d.items():
                    if isinstance(v, dict) and "downloads" in v:
                        out[k] = v["downloads"]
        print(f"  npm {min(i + 100, len(plain))}/{len(plain)}", file=sys.stderr)
    # npm's bulk endpoint rejects scoped names, so these go one request each.
    #
    # DO NOT PARALLELISE THIS. It used to run through a pool of 8 workers, which
    # "brought it under two minutes" - not because it was faster, but because npm
    # throttles this endpoint to roughly 2.4 requests per second per IP and most
    # of those requests were failing. The failures were recorded as missing
    # packages and became a published, and then retracted, claim that 37.8 percent
    # of the registry's npm packages do not exist. They do exist.
    #
    # ~3.3k scoped packages at this rate is about 25 minutes. That is the honest
    # cost of the number and the scan should budget for it.
    unknown = 0
    for i, n in enumerate(scoped, 1):
        d = get(NPM_BULK + urllib.parse.quote(n, safe=""))
        if isinstance(d, dict) and "downloads" in d:
            out[n] = d["downloads"]
        elif d is UNKNOWN:
            unknown += 1
        # NOT_FOUND falls through: genuinely absent, and absent from `out` says so.
        time.sleep(0.42)
        if i % 250 == 0:
            print(f"  npm scoped {i}/{len(scoped)} (unresolved so far: {unknown})", file=sys.stderr)
    if unknown:
        print(
            f"  WARNING: {unknown} scoped packages never returned an answer. They are NOT"
            f" absent, they are unknown, and must not be counted as missing.",
            file=sys.stderr,
        )
    return out


def pypi_downloads(names):
    """Intentionally a no-op. See the module docstring: pypistats.org rate-limits far
    below what this would need and is volunteer-run. Kept as a named seam so the
    omission is visible in the code rather than silently absent."""
    if names:
        print(f"  skipping {len(names)} pypi packages (pypistats rate limit; see docstring)", file=sys.stderr)
    return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="research/data/mcp-scan")
    ap.add_argument("--raw", help="reuse a previously saved raw crawl (json)")
    ap.add_argument("--no-enrich", action="store_true")
    a = ap.parse_args()

    if a.raw and os.path.exists(a.raw):
        records = json.load(open(a.raw))
        print(f"reusing {len(records)} version records from {a.raw}", file=sys.stderr)
    else:
        print("crawling the official MCP registry ...", file=sys.stderr)
        records = crawl_registry()
        os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
        json.dump(records, open(a.out + "-raw.json", "w"))

    servers = latest_only(records)
    print(f"{len(records)} version records -> {len(servers)} distinct servers", file=sys.stderr)

    rows = []
    for name, rec in servers.items():
        srv = rec["server"]
        meta = rec.get("_meta", {}).get("io.modelcontextprotocol.registry/official", {})
        pkgs = srv.get("packages") or []
        remotes = srv.get("remotes") or []
        rows.append(
            {
                "name": name,
                "namespace": name.split("/")[0],
                "title": srv.get("title") or "",
                "description": (srv.get("description") or "")[:400],
                "version": srv.get("version") or "",
                "repo": (srv.get("repository") or {}).get("url") or "",
                "status": meta.get("status") or "",
                "published_at": meta.get("publishedAt") or "",
                "updated_at": meta.get("updatedAt") or "",
                "n_versions": 0,
                "package_registries": sorted({p.get("registryType", "") for p in pkgs if p.get("registryType")}),
                "packages": [
                    {"registry": p.get("registryType", ""), "id": p.get("identifier", "")}
                    for p in pkgs
                    if p.get("identifier")
                ],
                "transports": sorted(
                    {(p.get("transport") or {}).get("type", "") for p in pkgs if (p.get("transport") or {}).get("type")}
                    | {r.get("type", "") for r in remotes if r.get("type")}
                ),
                "is_remote": bool(remotes),
                "downloads_last_month": None,
                "downloads_source": "",
            }
        )

    counts = {}
    for rec in records:
        n = rec.get("server", {}).get("name")
        if n:
            counts[n] = counts.get(n, 0) + 1
    for r in rows:
        r["n_versions"] = counts.get(r["name"], 1)

    if not a.no_enrich:
        npm_ids, pypi_ids = set(), set()
        for r in rows:
            for p in r["packages"]:
                if p["registry"] == "npm":
                    npm_ids.add(p["id"])
                elif p["registry"] == "pypi":
                    pypi_ids.add(p["id"])
        print(f"enriching: {len(npm_ids)} npm packages, {len(pypi_ids)} pypi packages", file=sys.stderr)
        npm = npm_downloads(sorted(npm_ids))
        pypi = pypi_downloads(sorted(pypi_ids))
        for r in rows:
            best, src = None, ""
            for p in r["packages"]:
                v = npm.get(p["id"]) if p["registry"] == "npm" else pypi.get(p["id"]) if p["registry"] == "pypi" else None
                if v is not None and (best is None or v > best):
                    best, src = v, p["registry"]
            r["downloads_last_month"] = best
            r["downloads_source"] = src

    json.dump(rows, open(a.out + "-servers.json", "w"), indent=1)
    print(f"wrote {a.out}-servers.json ({len(rows)} servers)", file=sys.stderr)


if __name__ == "__main__":
    main()
