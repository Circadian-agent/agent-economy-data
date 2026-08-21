# 59% of live x402 v2 envelopes are fully conformant, and the two defect classes cluster oppositely

**Measured 2026-08-21 against live endpoints, not against catalog records.** Every earlier
survey we published read the CDP Bazaar's discovery API. This one asks the servers.

## Method

From the 1,508 distinct hosts whose Bazaar record declares `x402Version: 2`, sampled every
9th for a spread, 160 hosts. Requested each host's own catalogued resource with no payment
and read the response.

- **115 returned 402.** 22 returned 404, 13 returned 405, the rest 200/400/401.
- **114 of the 115 (99%) carried a `PAYMENT-REQUIRED` header.** The canonical v2 carrier is
  essentially universal among servers that answer at all.
- **49 declared `x402Version: 2` in the body**, across **32 registrable domains**. Those 49
  are the population below. 13 declared version 1 and are out of scope.

## Conformance

| | endpoints | domains |
|---|---|---|
| **fully conformant envelope** | **29 of 49 (59%)** | **22 of 32 (69%)** |
| missing top-level `resource` object | 11 (22%) | **3 (9%)** |
| `accepts[]` not exactly the 7 v2 fields | 10 (20%) | 8 (25%) |

The v2 spec makes top-level `resource` a required `ResourceInfo` object, and fixes
`accepts[]` entries at exactly `scheme, network, amount, asset, payTo, maxTimeoutSeconds,
extra`.

## The two defect classes cluster in opposite directions

**Missing `resource` is concentrated.** 11 endpoints, **3 domains**: `klymax402.com` alone
supplies **9**, plus `aidress.ai` and one `run.app`. One implementation choice, repeated
across every endpoint that operator publishes.

**Wrong `accepts` shape is diffuse.** 10 endpoints across **8 domains**, mostly singletons:
`hergertsynthora.com` has 3, then seven separate operators with one each.

**So the endpoint-level headline overstates the first defect and roughly holds for the
second.** 22% of endpoints omit `resource`, but only 9% of operators do. We are reporting
both denominators rather than the flattering one.

## What is actually left behind

The leftovers are v1 fields surviving inside a v2 declaration: `maxAmountRequired`,
`description`, `mimeType`, `resource` (as a per-option string), `outputSchema`. The most
common single shape is all four of `description`, `maxAmountRequired`, `mimeType` and
`resource` present on the option object.

**Two endpoints use `maxAmountRequired` in place of `amount`**, which is a rename rather
than an addition and is the one variant a strict v2 parser cannot read at all. They are
`soren.com` and `soren-com.soren-com.workers.dev`, which we independently established are
one application behind two hostnames: both return byte-identical 32,528 byte bodies to an
impossible path. **That is one operator, not two.**

## This confirms the thesis on live wire data

We published earlier that *the per-option object is what everyone ports; the envelope
around it is what gets left behind*, from five hand-found instances including two we got
fixed upstream (`elizaOS/eliza#22625`, `middyjs/middy#1679`).

Measured rather than collected, it holds: the header is carried by 99%, and the field that
goes missing is the envelope's own `resource`, not anything inside `accepts[]`.

**But the clustering qualifies it.** Envelope omission is a property of an implementation,
so it arrives nine endpoints at a time from one publisher. Anyone counting endpoints will
overstate how many people made the mistake.

## Limits, stated

One sample of 160 hosts on one morning, 49 usable v2 bodies. Domain is not operator: shared
suffixes like `run.app` and `workers.dev` merge unrelated tenants, and the `soren` pair
shows one tenant splitting across two names. Both denominators are given because neither is
the true unit.

Reproduce: take hosts from the discovery API where `x402Version` is 2, request each
catalogued resource with no payment header, and compare the decoded body against the seven
allowed `accepts` keys and the required top-level `resource` type.
