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

**Fourth correction, and it withdraws a test rather than a number.** The zero-call
comparison (1 of 51 against 0.96 expected) is **too underpowered to be worth stating**:
it can reject enrichment at or above **4.8x** and nothing smaller, and its power against
a 2x effect is **0.12**. Reaching 80% power on 2x needs about **500** zero-call rows; the
bucket holds 51 and has held 51 across every sweep taken. It is not fixable by waiting.

**Fifth, and this is the one to carry away.** Asked of the whole catalog instead, the
question is well powered, significant, and an **artifact**:

| test | n | P(invalid > valid) | z |
|---|---|---|---|
| per listing | 276 vs 14,872 | **0.679** | **10.18** |
| per host, one median each | 59 vs 1,535 | 0.541 | **1.06** |

Per listing, invalid rows look markedly busier: median 2 against 1, q75 6 against 3, q90
29 against 7. **Per host it vanishes**, with the median of host medians at 2.0 on both
sides. The cause is clustering: **127 of the 276 violations sit on 3 hosts** (81, 33,
13), and those hosts are busy.

**Sixth correction: netloc was the wrong clustering unit, and the null does not survive
the right one.** `payTo` is present on every row and is the operator identity. Clustered
on it:

| unit | violating | clean | P(violating > clean) | z |
|---|---|---|---|---|
| listing | 276 | 14,872 | 0.679 | **10.18** |
| netloc | 59 | 1,535 | 0.541 | 1.06 |
| **`payTo`** | **30** | **1,237** | **0.615** | **+2.15** |

Median of operator medians is **4 against 2**. So a **modest operator-level association
survives**, and the "no relationship" line below is retracted.

netloc is not a conservative netloc-for-operator swap; it errs **in both directions**.
The zero-call cohort is 51 rows over **14 netloc but 17 `payTo`** (netloc merges
operators); the violating cohort is 276 listings over **59 netloc but 30 `payTo`** (netloc
splits them). The unit was raised by novadyne-hq in `#3045`.

**Seventh correction: "the size confound is absent" was wrong, and it was wrong because
it measured the other quantity.** Operator size does not predict per-listing **intensity**
(median 2 calls per listing at every size), but it strongly predicts **throughput**:
novadyne-hq's sweep gives median total calls of 2 / 7 / 14 / **75** across the size bands,
monotone and 37.5x. The causal story attached to the result was about throughput, so the
confound was present on the measure the story named.

**Controlled properly, the association survives.** Three ways:

| method | result |
|---|---|
| **intensity** (mean calls per listing, size-invariant by construction) | AUC 0.622, **z = +2.29**, medians 4.00 vs 2.14 |
| **exact-size matching** (each violating operator against clean operators of *identical* listing count) | 28 of 30 matched, **20 wins, 8 losses, 0 ties, p = 0.018** |
| seven finer strata | direction holds in **6 of 7** testable bands; strongest at 13-20 listings (AUC 0.802, z +2.45) |

**A modelling choice, disclosed because two people can both say "clustered on `payTo`" and
mean different partitions.** Operator identity here is the **sorted set of distinct `payTo`
across a listing's `accepts[]`**. That matters because **37.5% of listings quote more than
one** address (2: 4,389 rows; 3: 240; 4: 1,054; 5: 4), and **138 of the 276 violations**
are among them. The alternative, union-find over shared addresses, gives 1,200 operators
against 1,267 and moves nothing: z +2.31, sign test 19-8-1, p 0.026.

**The predicate is published as runnable code** in
[x402#3045](https://github.com/x402-foundation/x402/issues/3045#issuecomment-5363563707),
with the any-violation lifting rule, so an independent party can reproduce rather than
reconstruct.

**INDEPENDENTLY REPLICATED.** novadyne-hq ran that predicate mechanically against their
own sweep, on **three operator partitions that genuinely disagree on 37% of the catalog**
(our sorted-set key, union-find over shared addresses, and first-in-`accepts`-order, which
is neither of ours). All three give **30 violating operators** and **z between +2.30 and
+2.33**, and our sorted-set sign test reproduced at exactly **20-8-0**. The partition
choice was the live worry; it is now measured, three ways, by two parties. Their standing
flag holds: **6 operators in the 13-to-20 band carry the result.**

**Eighth correction: a bug in the published predicate, found because they asked about the
denominator.** The `is_violating` gate checked `schema["required"]` plus one level into
`properties`, while `missing_required` recurses arbitrarily deep. **The gate and the test
disagreed about which rows were in scope.** Corrected to use the same traversal:

| | evaluated | violating | rate |
|---|---|---|---|
| published gate | 14,691 | 276 | 1.88% |
| **corrected gate** | **14,695** | **276** | **1.88%** |

Four rows wrongly skipped, **zero violations missed**. Real bug, real fix, moves nothing.

**The not-evaluated class is three things, not one.** Of the 464: **260** declare no
`required` key anywhere reachable, **159** declare `"required": []` - an **explicitly
empty** array, which asserts *nothing is required* and is a different claim from omitting
the key - and 45 sit deeper than the old gate looked. `bool([])` collapses the first two,
so any checker gating on truthiness merges an explicit statement with an absent one. Ours
did.

**Prevalence, both denominators:** 276/14,695 = **1.88%** of rows where the predicate can
bind; 276/15,155 = **1.82%** of rows published.

**A standing hazard for every presence claim here.** novadyne-hq caught the catalog serving
15,171 raw rows containing only 15,041 distinct resources for about five minutes: 130
listings silently absent, replaced by twins, stable across three sweeps, then cleared. **An
instrument reading absence off a single sweep would have produced 130 false absences and
cleared them without explanation.** Our own sweep had **0 duplicate keys** (15,155 raw =
15,155 distinct), so it was not in that state, but the rule stands: **two sweeps before any
absence is reported.**

**What this is not:** causal, or strong. z = +2.15 on 30 clusters. The plausible story is
that operators shipping more traffic hand-roll and iterate more, and hand-rolled
declarations break. That is a story, not a result.

**What is untouched:** the 276 itself. It is an **exhaustive enumeration of a closed
class**, not a sample, so it has no sampling distribution to inflate. Clustering damages
the significance tests built on the count, not the count.

The retracted claim follows.

~~So there is no host-level relationship~~ between a declaration failing its own schema
and how much a service is called. The earlier "indistinguishable on traffic" line was
right by accident: it was read off means, which a few large valid outliers were holding
up, and the means hid a real rank shift that turns out to be publisher identity.

**The general warning: this catalog is not a sample of independent listings.** 15,155
rows sit on roughly 1,594 hosts and the violating class is far more clustered than that.
Any test here that counts listings will find publisher clustering, at whatever
significance the listing count buys. This one did, at z = 10.

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

**That sentence was retracted the same evening and is now un-retracted, so read it with
both moves attached.** It was retracted in `x402#3045` because the reporter there settles
through Coinbase's own facilitator and was absent too. On 2026-08-21 they resolved their
case: the cause was a **v1 envelope**, which the discovery pipeline ignores entirely, and a
v2 envelope indexed them on 2026-08-12. **Removing a counterexample is not evidence**, so
the sentence is back on the open list rather than restored as a conclusion.

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
