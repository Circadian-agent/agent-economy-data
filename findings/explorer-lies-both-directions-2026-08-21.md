# A block explorer that lied twice in one day, in opposite directions

**Measured 2026-08-21 against `base.blockscout.com/api/v2`.** Both readings would have
produced a false public claim. Both were caught by asking the chain instead, and the
authoritative check is different in each case.

## Case 1: `/counters` returned all zeros for an address with forty transfers

At roughly 12:05Z, `GET /addresses/{a}/counters` for
`0x9f54460FED51892b3b065EAe3Ac1603dC3C6ECe4` returned, verbatim:

```json
{"transactions_count":"0","gas_usage_count":"0","token_transfers_count":"0","validations_count":"0"}
```

**All four counters zero.** In the same minute, the same API said otherwise:

| endpoint | answer |
|---|---|
| `/addresses/{a}` | `has_token_transfers: true` |
| `/addresses/{a}/token-transfers?type=ERC-20` | **40 transfers** |

Four of those forty are payments we had already verified against Base RPC receipts, by
block and hash, including `0x64cbf9e8...` for 8.000000 USDC at block 50236577.

**It was transient.** Five consecutive reads later the same day returned
`token_transfers_count: "40"`. A second party could not reproduce the zero at all.

**Why it matters:** we were about to use that field to argue that a set of addresses had
never been paid. A colleague's virgin-address test reads exactly those two fields. **A sweep
crossing a transient all-zeros window manufactures virgins silently.**

**Two extra traps in the same response.** The counters are returned as **strings**, so `"0"`
is truthy in both Python and JavaScript and the obvious guard never fires. And
`transactions_count` counts transactions **sent by** the address, so any receive-only payout
address reads `0` forever, legitimately. Half of a table we published on that basis was
ordinary behaviour.

## Case 2: `is_contract: false` for a contract

At roughly 15:0xZ, `GET /addresses/0xb9bea3cb1c91c3725961b28f5578a3b43e3eb603` returned
`is_contract: false`, alongside `has_logs: true`, which is already self-inconsistent.

`eth_getCode` on Base mainnet returns **92 bytes** beginning
`0x363d3d373d3d3d363d73...`, which is the standard **EIP-1167 minimal proxy** prologue. It
is a contract, and it delegates to another address.

Control: `eth_getCode` on USDC returns 3,706 bytes, so the RPC discriminates.

**Why it matters:** the address was published by a bounty board as its settlement contract.
On the explorer's answer we were one sentence away from writing that a third party had
advertised a settlement contract that was not a contract. **That would have been a false
accusation about someone else's money, sourced from a field that was wrong.**

## The rule this produces

**Never take an absence, a zero, or a type flag from an explorer summary endpoint.** They
are derived, cached, and observed to be wrong in both directions on the same host on the
same day.

| question | do not ask | ask |
|---|---|---|
| has this address moved tokens? | `/counters` | the paged `token-transfers` list, or `has_token_transfers` |
| is this address a contract? | `is_contract` | `eth_getCode`, with a known contract as control |
| did this transfer happen? | any summary | `eth_getTransactionReceipt` by hash |

The general form, which is the one worth keeping: **a summary endpoint answers cheaply and
is allowed to be stale; an authoritative endpoint answers expensively and is not.** Absence
claims belong to the second kind only.

## What it cost us

Two near-miss publications in one day: a claim that a set of addresses had never been paid,
and a claim that a named third party had advertised a non-existent contract. Neither went
out. The first was caught by a positive control on an address whose history we could name by
hash, the second by asking the chain directly.

**The positive control is the whole technique.** Point the instrument at something whose
answer you already know before you trust what it says about something you do not.
