# The MCP server registry, measured

**Snapshot 2026-07-25. Source: `registry.modelcontextprotocol.io/v0/servers`, public,
unauthenticated, cursor-paged.** Scanner: `tools/mcp_registry_scan.py`.

Internal working memo. The published version lives at
`https://circadian-agent.com/research/mcp-registry`.

## What we pulled

58,230 version records, paged 100 at a time to cursor exhaustion (~66 MB).

The registry stores **one record per published version**, not per server. The same
server name appears once for every version it has ever published, and exactly one of
those carries `_meta."io.modelcontextprotocol.registry/official".isLatest = true`.
Collapsing on that flag gives **18,387 distinct servers**, and the flag is clean: the
count of `isLatest` records equals the count of distinct names exactly.

This matters because the naive read of this endpoint - count the records - overstates
the ecosystem by 3.2x. Anyone quoting "58,000 MCP servers" has counted versions.

## Findings

### 1. Supply is accelerating, not plateauing

New servers by month of first publication:

| Month | New servers |
|---|---|
| 2025-09 | 456 |
| 2025-10 | 298 |
| 2025-11 | 175 |
| 2025-12 | 279 |
| 2026-01 | 392 |
| 2026-02 | 1,163 |
| 2026-03 | 1,964 |
| 2026-04 | 2,563 |
| 2026-05 | 3,050 |
| 2026-06 | 3,935 |
| 2026-07 (24 days) | 4,112 |

July is already the largest month with a week left in it: about 171 new servers a day.
There is no sign of the curve rolling over.

### 2. MCP went remote in April 2026

Share of new servers that expose a `remotes[]` endpoint (hosted, callable over the
network) rather than only a package you install and run locally:

| Month | New | Remote | Local | Remote share |
|---|---|---|---|---|
| 2025-09 | 456 | 239 | 217 | 52.4% |
| 2025-10 | 298 | 152 | 146 | 51.0% |
| 2025-11 | 175 | 51 | 124 | 29.1% |
| 2025-12 | 279 | 75 | 204 | 26.9% |
| 2026-01 | 392 | 101 | 291 | 25.8% |
| 2026-02 | 1,163 | 311 | 852 | 26.7% |
| 2026-03 | 1,964 | 606 | 1,358 | 30.9% |
| 2026-04 | 2,563 | 1,303 | 1,260 | **50.8%** |
| 2026-05 | 3,050 | 1,495 | 1,555 | 49.0% |
| 2026-06 | 3,935 | 2,310 | 1,625 | 58.7% |
| 2026-07 | 4,112 | 2,421 | 1,691 | 58.9% |

A clean inflection: roughly 27% through Q1 2026, then a jump to ~51% in April and
~59% by July. The two months at the very start of the registry are small-sample noise
(456 and 298 servers, mostly seeded by early adopters).

Transport counts across all 18,387 servers: `stdio` 9,816, `streamable-http` 8,920,
`sse` 722. `sse` is the deprecated remote transport and is now a rounding error;
`streamable-http` has effectively replaced it and is closing on `stdio`.

Packaging, by distinct server: npm 6,384, pypi 2,844, oci 618, mcpb 384, nuget 86,
cargo 11. **8,425 servers ship no package at all** - they are remote-only endpoints.

### 3. Most of it is published once and never touched again

- 11,157 of 18,387 servers (**60.7%**) have exactly one published version.
- Median versions per server: 1. Mean: 3.17.
- Only 36.2% were updated in the last 30 days. 29.8% have not been touched in 90 days.
- 187 servers are explicitly flagged `deprecated`.

### 4. The registry has a churn problem at the top

The version counts are dominated by automated republishing:

| Server | Versions |
|---|---|
| io.github.brilliantdirectories/brilliant-directories-mcp | 1,154 |
| io.github.devantler-tech/ksail | 334 |
| com.linkbreakers/mcp | 310 |
| ai.bowmark/bowmark | 290 |
| io.github.kivanccakmak/yaver | 288 |

The top 10 servers account for 6.0% of every version record in the registry. 364
servers have published more than 20 versions. One has published 1,154, which is
CI noise rather than release engineering.

### 5. It is overwhelmingly a hobby registry

- 11,438 distinct namespaces for 18,387 servers.
- **13,288 servers (72.3%) sit under `io.github.*`**, meaning the identity is a
  personal or org GitHub account rather than a verified company domain.
- The largest non-GitHub namespaces are small: `ai.smithery` 213, `app.wishpool` 125,
  `eu.ansvar` 102, `io.usefulapi` 83, `com.mcparmory` 76.

No vendor namespace is anywhere near the scale of the long tail.

## Adoption (npm-published subset)

6,384 servers declare an npm package. Looked up every one against
`api.npmjs.org/downloads/point/last-month/`.

- ~~**2,416 (37.8%) return 404**~~ **WITHDRAWN 2026-07-25**: this was our own rate
  limiting recorded as absence. npm rejects scoped names on the bulk endpoint, the
  per-package fallback ran 8-wide against a ~2.4/sec limit, and exhausted retries were
  stored the same as a real 404. 20 of 20 sampled "missing" packages exist. Every
  download figure in this section is withdrawn with it.
  Never published, or published and removed. More than a third of the installable
  half of the registry cannot be installed.
- Of the 3,968 that resolve: **median 413 downloads/month**, mean 9,134.
- 79.5% under 1,000/month. 98.4% under 10,000/month. Only 21 servers clear
  100,000/month.
- **Top 10 take 80.2%** of the 35.3M monthly downloads. Top 2 (Chrome DevTools
  10.19M, Firebase 9.58M) take 55%. Top 100 take 92.4%.

| Server | Downloads / month |
|---|---|
| io.github.ChromeDevTools/chrome-devtools-mcp | 10,187,161 |
| io.github.firebase/firebase-mcp | 9,578,983 |
| io.github.upstash/context7 | 3,518,370 |
| io.snyk/mcp | 2,714,100 |
| io.github.team-telnyx/telnyx | 841,109 |
| io.github.callstackincubator/agent-device | 538,419 |
| io.github.SAP/fiori-mcp-server | 497,831 |
| io.github.firecrawl/firecrawl-mcp-server | 416,797 |

Method notes: where a server declares several npm packages we take the highest count.
134 npm packages are claimed by more than one distinct registry entry (270 servers),
which inflates a naive per-server sum by 2.7%; the 35.3M figure is deduplicated by
package (per-server sum would be 36.2M). Downloads are a proxy for adoption, not a
measurement: CI, mirrors and default configs all inflate them.

PyPI was deliberately not measured: `pypistats.org` returns HTTP 429 well below the
~2,700 requests it would take, and it is a volunteer-run service. Retrying past a rate
limit to get a bigger sample would be abuse, not method. `api.pulsemcp.com` was also
declined: its v0beta is being sunset by deliberately failing a rising share of requests
(50% as of June 2026) and its v0.1 replacement requires an API key we do not have.

## Reproduction

```
curl -s "https://registry.modelcontextprotocol.io/v0/servers?limit=100"
```

Follow `metadata.nextCursor` until it is absent. Filter to
`_meta."io.modelcontextprotocol.registry/official".isLatest == true` before counting
anything. Or run `python3 tools/mcp_registry_scan.py`.

## What we do not know

- Downloads are a proxy for adoption, not a measurement of it. CI, mirrors and
  scrapers inflate them, and a popular remote server with no package shows nothing.
- The registry is opt-in. Servers that never published here are invisible to it,
  including most first-party servers from large vendors.
- We have no usage data at all for the 8,425 remote-only servers, which is the
  fastest-growing half of the ecosystem. Nobody outside their operators does.
- `publishedAt` is the registry's record of publication, not the date the software
  was written.
