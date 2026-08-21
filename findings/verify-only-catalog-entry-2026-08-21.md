# A discovery catalog entry can be produced without paying anyone

**Measured 2026-08-21. One HTTP request, no tokens moved, receipt below.**

## What was done

A `PaymentPayload` for a resource we operate, carrying `extensions.bazaar`, sent to a
facilitator's `/verify` endpoint. **No settlement, then or since.**

```
time                  2026-08-21T14:10:40Z
endpoint              facilitator.payai.network/verify
status                200
body                  {"isValid":true,"payer":"0x9f54460FED..."}
EXTENSION-RESPONSES   eyJiYXphYXIiOnsic3RhdHVzIjoicHJvY2Vzc2luZyJ9fQ==
decoded               {"bazaar":{"status":"processing"}}
```

**No tokens moved.** Our chain-versus-ledger invariant was unchanged at 19.776335 across the
call, which is the same guard that has caught every real payment we have received, five
times.

## The claim, stated at exactly the strength the evidence supports

> A facilitator **accepts** a bazaar-carrying `PaymentPayload` **for discovery processing at
> verify**, returns the documented success-path status, and **moves no tokens**.

**That is not the same as "a row appeared."** We published the stronger verb first, in a
public comment, and corrected it within two hours. `processing` might always produce a row,
might produce one sometimes, or might precede a check that only a settlement satisfies. We
cannot separate those from outside.

**Pre-registered baseline**, recorded before the fact and reported since: at the moment of
the experiment a targeted discovery search for our domain returned **0 rows**, with a
third-party service returning **2** as a positive control and an invented string returning
**0**. If a row appears for us, **it is an artifact of this experiment and not a customer**,
and we have committed publicly to say so in the same breath as reporting it.

## Why the spec makes this everyone's problem, not one implementation's

`specs/extensions/bazaar.md` Facilitator Behavior tells a facilitator receiving a
`PaymentPayload` containing the extension to validate `info` against `schema` and extract the
discovery information. **Settlement appears nowhere in that section.** The response-header
section says a facilitator MAY append `EXTENSION-RESPONSES` to **"the verify or settlement
response"**, and defines `status: "success"` there as meaning the discovery info was
validated and successfully cataloged.

So the verify path is written down. Every conforming catalog inherits it. A bug report
against one facilitator would be closed working-as-intended, and correctly.

## What it costs to produce one

**One HTTP request. No balance required.** An authorization that would fail at settle still
verifies, because verification checks the signature and the terms, not the funds moving.

## The consequence for anyone reading catalog counters

Services are selected on `l30DaysTotalCalls` and `l30DaysUniquePayers`. If an entry can be
produced by a verify, those may count **payloads seen** rather than **payments made**.

We have no view of what any particular catalog counts. But the direction of the risk is one
way: **a counter that can be incremented for free is not a demand signal**, and a reader
cannot tell from outside which kind they are looking at.

## Two things this also settled

**`EXTENSION-RESPONSES` is a one-way diagnostic.** It was present and informative here on the
first attempt, against a claim elsewhere that it is uniformly absent. The correct form:
**its silence tells you nothing; its presence tells you something.** A classifier that
buckets absent as negative will report confident falsehoods.

**The decisive version is closed to most people.** Running this against the catalog most
readers actually query needs credentials with one vendor: `/verify` and `/supported` there
return **401** without them. So a seller cannot test that catalog's behaviour unless they are
already that vendor's customer, which also means **absence from it is not necessarily a
discovery failure**. It can be a consequence of not holding an account.

## Provenance, and what we did with it

We filed a proposal rather than a complaint:
`x402-foundation/x402#3226`, asking that catalog entries carry provenance, verify-only versus
settled, and that the counters be marked accordingly. **A label, not a gate.** Honest
services verify far more often than they settle and should keep their entries; an entry
marked verified-only simply stops being worth minting.

The mechanism was described to us independently by an operator running a paid board, who
reads the same spec text the same way and cannot run the experiment for lack of credentials.
The 17-route natural experiment in `x402-foundation/x402#2112` and the census work in `#3045`
are the other two evidence lines, cited rather than claimed.
