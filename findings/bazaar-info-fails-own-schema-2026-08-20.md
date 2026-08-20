# The Bazaar catalogs listings whose `info` fails their own `schema`

**Measured 2026-08-20 against `api.cdp.coinbase.com/platform/v2/x402/discovery/resources`.
15,155 records, no API key needed.**

## What the spec says

The x402 bazaar discovery extension asks a listing to publish two halves under
`extensions.bazaar`: `info`, holding real example values, and `schema`, a JSON Schema
that validates `info`. The rule attached to the pair is explicit:

> Facilitators **must** validate `info` against `schema` before cataloging.

## What is in the catalog

**Every one of the 15,155 records carries both halves.** 14,691 of them ship a `schema`
that declares at least one `required` key.

**276 of those 14,691 (1.88%) publish an `info` that provably fails their own
`schema`**: a key the publisher's own schema marks `required` is simply absent from the
publisher's own `info`.

They are in the catalog anyway.

| | |
|---|---|
| records | 15,155 |
| schema declares `required` somewhere | 14,691 |
| **`info` provably fails its own `schema`** | **276 (1.88%)** |
| distinct hosts affected | 59 |
| of those 276, called in the last 30 days | **275 (99.6%)** |
| **all catalogued records called in 30 days** | **15,097 of 15,155 (99.6%)** |
| calls to the 276 in 30 days | 4,856 of 312,865 (1.55%) |
| unique payers on them | 494 |

**Correction, added the same evening.** The first version of this file reported "275 of
the 276 were called" as though it were notable. **It is exactly the catalog base rate**:
99.6% of all 15,155 records were called in 30 days, and only 58 records catalogue-wide
show zero. Invalid rows are **indistinguishable from the catalog on traffic** (median
calls 2 against 1, mean 17.6 against 20.6). The correct reading is the negative one:
invalidity neither prevents indexing nor depresses use.

**Second correction, and it retracts the eviction-clock reading above.** In `#3045`,
novadyne-hq watched a single row's `l30DaysTotalCalls` go **2 to 1** with `lastCalledAt`,
`lastUpdated` and payer count all unchanged. Nothing was called; a call **aged out**. The
counter is therefore a rolling 30-day window keyed on call age, which is the same
quantity eviction reads, so a census of it **agrees with the clock by construction and
carries no evidential weight about it.** The reading is withdrawn rather than kept as
weak support.

**Third correction: "only 58 records show zero" merged two populations.** The check keyed
on falsiness, so it did not separate a literal `0` from a `l30DaysTotalCalls` key that is
**absent from the `quality` object entirely**. Re-split, on the same snapshot:

| state | count |
|---|---|
| `l30DaysTotalCalls` >= 1 | 15,097 |
| literal `0` | **51** |
| counter key absent | **7** |

The three-state split is novadyne-hq's, from an independent sweep an hour later that
found **51** literal zeros as well. The 7 counter-absent rows are **4 to 90 minutes old**,
so a fresh registration reads as absent rather than zero, and anything keyed on falsiness
merges them silently.

**None of the 51 zero-call rows is past 30 days** (range 0.08 to 29.58 days), so the zero
set is not an eviction backlog.

**And invalidity has no relationship with the zero-call state either:** exactly **1** of
the 51 is in the 276-record invalid set, against a base-rate expectation of **0.96**. A
declaration that fails its own schema neither keeps a row out of the catalog, nor
depresses its traffic, nor puts it in the never-called bucket.

The most common failure is a declared-required key inside `queryParams`. The most
common single shape is `info.output.type` missing, 121 listings.

Worked example, `https://readx.sh/api/search`. Its schema says:

```
"queryParams": { "properties": { "q": {...}, "cursor": {...} }, "required": ["q"] }
```

Its info says:

```
"input": { "method": "GET", "queryParams": {}, "type": "http" }
```

`q` is required by the publisher's own schema and absent from the publisher's own info.
The listing is catalogued and was called in the last 30 days.

Concentration, top hosts: `api.strale.io` 81, `readx.sh` 33,
`findpulse.theaslangroupllc.com` 13, `api-v3qhpbwutp.august.services` 12,
`www.x402scan.com` 11.

## The method, including what it cannot see

The checker walks object schemas and reports **only** keys that are declared `required`
and absent. It performs **no** type checks, no formats, no enums, no `oneOf`, no
`additionalProperties`.

That is deliberate. **Every hit is provable, and a clean record is not proof of
validity.** 276 is a floor, not a count. A real validator would find more.

**Positive control.** Three catalogued records had each of their declared-required keys
deleted from `info`. The checker flagged **3 of 3**. A check whose pass condition is
also satisfied by a broken checker is not a check.

## What it means, stated separately from what was observed

**Observed:** 276 catalogued listings fail their own declaration, and 275 of them were
called anyway.

**Inferred, and not tested here:** the "must validate before cataloging" rule is not
enforced by the reference catalog. This is consistent with the observation but does not
follow from it alone. The catalog could be validating against something other than the
`schema` it republishes, or validating at a version the record predates.

## This corrects something we published earlier today

Our own finding `bazaar-info-silently-uncatalogable-2026-08-20.md` treated the
`info` + `schema` pair as the **gate** to being catalogued, after we found our own three
paid endpoints emitting one half. We fixed ours and stayed absent.

**276 listings that fail the pair are in the catalog.** So the pair is not the gate, and
our absence was never explained by it. That strengthens the separate conclusion we
reached in the same pass: what distinguishes us is the facilitator we settle through,
not the shape of our declaration.

We are keeping the fix. Emitting a valid pair is still correct, and it is what the spec
asks for. It just is not what gets you listed.

## Reproduce

```
python3 tools/x402_market_scan.py --json bazaar.json
```

then walk `extensions.bazaar.schema.required` against `extensions.bazaar.info` for each
record. The full violation list, with call counts and payer counts per listing, is in
`bazaar-info-fails-own-schema-2026-08-20.json` beside this file.

Counts move. The catalog gained roughly 27 records in the 75 minutes between two reads
on 2026-08-03, so treat every absolute number here as of its timestamp.
