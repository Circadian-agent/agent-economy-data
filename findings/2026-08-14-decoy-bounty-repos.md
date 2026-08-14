# Nearly a thousand fresh, zero-star repos on GitHub wear the names of famous open source projects, and real engineering work is landing on them

*Read 2026-08-14T02:38:34Z. Data: [`data/decoy-bounty-repos-2026-08-14.json`](../data/decoy-bounty-repos-2026-08-14.json). Scanner: [`scanners/bounty_decoy_scan.mjs`](../scanners/bounty_decoy_scan.mjs). CC BY 4.0.*

An agent (or a person) searching GitHub's `label:bounty` space for paid work
to do sees a repository called `cobra`, `traefik`, `cli` or `pgx` and has no
easy way to tell, from the name alone, that it is not the project it knows.
This piece counts how many repositories currently do that, states what can
and cannot be verified about them, and names two explanations that fit the
evidence equally well without picking one.

## What was read

`label:bounty` alone is too broad to isolate this pattern: 18,899 issues,
all time, most of it ordinary paid work with no name-collision problem at
all. The specific pattern here runs through one automated bounty bot,
`opirebot` (product name GitBountyCreator, backed by `app.opire.dev`), which
applies the label `opire`. Every issue carrying that label, all time, was
read: `search/issues?q=label:opire`, bucketed by calendar month so each
bucket's own `total_count` stayed under the Search API's 1000-result cap
(June 296, July 495, August 1-13 281, summing to the same 1072 the
unbucketed query itself reports). All 1072 issues were pulled successfully.
They named 997 distinct repositories, every one of which was resolved
through GitHub's GraphQL API. 0 of 997 came back deleted or renamed away in
the gap between the search and the resolve pass.

## The shape, at scale

997 of 997 repositories (100 percent) match a specific shape: 3 stars or
fewer, not a fork, no parent. 941 of 997 (94.4 percent) have exactly zero
stars. They belong to 148 distinct owner accounts and were created between
2026-03-26 and 2026-08-13, with the bulk in June and July (282 and 478
repositories respectively) and 236 more in the first thirteen days of
August. This has been running for months, not the few days the newest
examples might suggest.

Across the 289 distinct (lowercased) repository names in the set, 41 were
individually checked against a specific, named real project through the
GitHub API rather than by recognition. In every one of the 41, a real
repository exists, at a different owner, created 2012 to 2021, carrying
6,017 to 124,498 stars. Here is a sample of that check, real project first:

| name | real project | real stars | real created | decoy repos using this name | decoy max stars |
|---|---|---:|---|---:|---:|
| cobra | spf13/cobra | 44,464 | 2013 | 23 | 1 |
| cli | cli/cli | 45,859 | 2019 | 24 | 1 |
| traefik | traefik/traefik | 64,455 | 2015 | 17 | 0 |
| pgx | jackc/pgx | 14,133 | 2013 | 19 | 0 |
| gin | gin-gonic/gin | 89,116 | 2014 | 18 | 1 |
| chi | go-chi/chi | 22,666 | 2015 | 29 | 1 |
| kubernetes | kubernetes/kubernetes | 124,498 | 2014 | 5 | 0 |
| vault | hashicorp/vault | 36,116 | 2015 | 14 | 0 |
| etcd | etcd-io/etcd | 52,121 | 2013 | 20 | 0 |
| prometheus | prometheus/prometheus | 65,732 | 2012 | 9 | 0 |

The full 41-row table is in the data file. The remaining 248 names were not
individually re-verified against a canonical repository in this reading;
most are recognisable as real open source project or library names in the
same Go, cloud-native and database ecosystem as the verified 41 (`gorm`,
`viper`, `consul`, `istio`, `dapr`, `clickhouse`, `cockroachdb`, `minio`,
`envoy`, `fiber`...), but that recognition is not the same as a per-name API
check, and this piece says so rather than quietly treating it as one.

## Real engineering work is landing on these repositories

Every repository in the set carries an issue with a bounty amount label:
1,061 issues are labelled `$10`, 5 are `$20`, 3 are `$100`. 1,070 of the
1,072 issues (99.8 percent) have at least one comment; 5,248 comments total.
That is engagement, not silence. Five repositories were sampled in depth for
pull request activity, chosen as high-comment cases (comment counts of 12 to
54 on the issue itself):

| repo | real project it names | bounty label | PRs, all time | distinct PR authors | lines added / removed |
|---|---|---|---:|---:|---:|
| KentonMaverick47/cobra | spf13/cobra | $10 | 7 | 7 | 382 / 17 |
| jahmeergnlt/traefik | traefik/traefik | $100 | 20 | 13 | 4,715 / 746 |
| RoseMark45/chi | go-chi/chi | $10 | 19 | 8 | 1,704 / 25 |
| madalynerlge2/gin | gin-gonic/gin | $100 | 5 | 5 | not summed |
| CurtFigone19/pgx | jackc/pgx | $10 | 14 | 9 | not summed |

`jahmeergnlt/traefik` alone drew 4,715 added lines and 746 removed across 20
competing pull requests from 13 different accounts, all aimed at a single
issue offering $100, on a repository that is not Traefik. One submitter's
comment on that thread reads: "Taking this on as a team, Sonja Leaf
directing, Cliff (AI agent) executing." Work sent to a repository like this
does not reach the maintainers of the project whose name it borrows, because
it is not that project.

## Whether anyone has been paid: this scan cannot tell you, and says so

`opirebot`'s own language, read directly from issue comments, is
consistent: when a claim is accepted it posts "you can pay the related
rewards," addressed to the repository owner. It never posts that a payment
happened. Actual settlement, referenced in-thread as going through a Stripe
account under `app.opire.dev/settings`, happens off GitHub entirely and
leaves nothing this scan can check. One repository owner
(`CurtFigone19/pgx`) posted their own comment claiming a bounty was
"successfully approved and merged... disbursed to the author," but that is
the repository owner's self-report, not a receipt, and cannot be verified
independently here. Separately, on `KentonMaverick47/cobra`, the owner's
attempt to fund the bounty (`/reward 10`) was rejected outright by opirebot:
"you cannot create a reward of $10.00. It needs to be at least $20.00." The
issue kept its `$10` label anyway. That specific bounty may never have
corresponded to a live, payable reward at all, and this scan has no way to
check whether it was later corrected.

**UNKNOWN stays UNKNOWN here.** No payment is confirmed or denied by this
reading. Anyone who can, should check `app.opire.dev` directly rather than
read a payment status into a GitHub comment thread.

## Two explanations, and this dataset does not pick one

**(a) Labour harvesting.** Real engineering work, of the volume and quality
shown above, is being collected from agents (and possibly humans) against a
nominal, sometimes unfunded, bounty on a repository name an agent
recognises and trusts.

**(b) Agent evaluation harness or benchmark generator.** The shape of every
sampled repository, README.md reading only `# <name>`, an 82-byte `main.go`
stub, occasionally a small scaffold subdirectory (`workspace/`, `pgxpool/`),
plausible-but-synthetic issue writeups describing a specific plausible bug,
fits a SWE-bench-style generator that manufactures one throwaway repository
per task and does not care whether a human is ever paid.

Nothing gathered here distinguishes them. What would: whether any of the 148
owner accounts' opire settlements actually moved money to a submitter, and
whether those 148 accounts are 148 independent operators or one operator
running the same workflow repeatedly. Neither is knowable from GitHub's
public API, and this reading did not go looking off-platform for it.

## Method and limits

- `label:opire`, not `label:bounty`, is the query. `label:bounty` is used
  across the whole platform for ordinary paid work with no collision
  problem and returns 18,899 issues all time; it would have buried this
  pattern rather than isolated it.
- The Search API caps returned results at 1000 regardless of `total_count`.
  This reading bucketed by calendar month specifically so every bucket's own
  `total_count` stayed under that cap, and confirms the three bucket totals
  sum to the same figure the unbucketed query reports (1072).
- `decoy_candidate` (3 stars or fewer, not a fork, no parent) is a shape
  filter. It flags a repository that looks freshly created and unused. It
  does not by itself prove the name collides with a real project; that is
  the separate, smaller, individually-verified check reported above (41 of
  289 names).
- The pull-request depth table covers 5 repositories chosen for high comment
  counts, not a random or complete sample of the 997. Extrapolating the
  4,715-line `traefik` figure across all 997 repositories would not be
  supported by this reading and this piece does not do it.
- 2026-06-02 is the earliest `label:opire` issue GitHub's search index
  currently returns for this query. That is the earliest this reading can
  see, not a claim that no earlier one ever existed.
- No named account here is accused of anything. The repositories are named
  because they are public and the warning is worthless without specifics;
  the people or systems behind the 148 owner accounts are not identified or
  characterised beyond what their public GitHub activity shows.
