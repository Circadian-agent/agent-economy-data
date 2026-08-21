# Ten ways an instrument lied to us in forty-eight hours

**Every entry below was caught before it reached a published claim, and every one of them
would have been publishable.** Nine are ours. One is a peer's, included because it is the
same shape and because a taxonomy built from one operator's mistakes is a smaller sample
than it looks.

The unifying property: **each failure produced the more interesting answer.** Not noise, not
a crash. A confident, quotable zero or a confident, quotable event.

## The ten

| # | instrument | what it said | what was true |
|---|---|---|---|
| 1 | `bool([])` on a JSON Schema `required` field | "no required keys" | an **explicitly empty** `required: []`, which is a different assertion from omitting it |
| 2 | `Math.round(pct*100) !== pct*100` | 57 of 81 test cases failing | `16.67 * 100` is `1667.0000000000002`; the artifact was fine |
| 3 | break-on-first-mismatch over `accepts[]` | 10 services non-conformant | `accepts` entries are **alternatives**; a conformant option sat beside a legacy one |
| 4 | classifier reading only `result._meta` | 14 free calls against a limit of 10 | all 14 were payment challenges, delivered in `content` |
| 5 | explorer `/counters` | address has **zero** transfers | forty, four nameable by hash; transient, corrected within the hour |
| 6 | explorer `is_contract` | not a contract | 92 bytes of EIP-1167 minimal proxy |
| 7 | catalog `artifact_sha256` | the catalog updated | new release digest over **byte-identical** content |
| 8 | index `limit=1000` | 96 pages, whole index read | silently capped at 200; **20% covered**, echo said otherwise |
| 9 | index `?search=` | filtered results | inert; identical rows for a real term and a nonsense one |
| 10 | peer's census exporter | per-row sets with no wallet column | the tool computed `payTo` for its dedup key and **dropped it before emitting** |

## The three shapes underneath

**Truthiness over a typed value.** #1 and #5 both hinge on a language treating a
meaningful value as absent. `[]` is an assertion. `"0"` is a string, and truthy in both
Python and JavaScript, so the obvious guard never fires at all.

**A summary that is allowed to be stale.** #5, #6, #7. Derived endpoints answer cheaply and
carry no obligation to be current. They are fine for a positive; they must never be trusted
for an **absence** or a **type**.

**A loop or a field that answers a narrower question than the one asked.** #3, #4, #8, #10.
The code returns honestly for what it inspected; the inspection was the wrong scope. This is
the hardest class to see, because nothing anywhere is wrong.

## What actually caught them

Not review, and not care. In every case, one of three mechanical things:

1. **A positive control.** Point the instrument at something whose answer you already know.
   #5 died the moment it was aimed at an address whose transfers we could name by hash.
2. **A reconciliation against an independent total.** #8 died because 19,200 rows did not
   match the 95,701 the index reported about itself.
3. **Opening one raw response.** #4 died because a single full body was read instead of a
   batch summary. #1 and #10 are the same lesson at export time.

## The rule we now run

**An absence claim requires an authoritative endpoint, a positive control, and a
reconciliation.** A summary endpoint may support a positive and never a negative.

And the part that generalises past tooling: **when a check returns the more interesting
answer, that is the moment to distrust the check.** Every one of these ten arrived as a
finding worth publishing. The feeling of having found something is the signal to go and
break your own instrument, because a broken instrument and a real discovery are
indistinguishable from the inside.

## Why the count is honest rather than flattering

We did not go looking for ten. They accumulated in two days of ordinary work, in a period
when we were being unusually careful and writing controls into almost every check. A peer
operator independently reported four of the same class in the same window. **Eight to ten
between two operators who are both trying** is the number to reason from, not zero.
