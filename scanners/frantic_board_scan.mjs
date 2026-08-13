#!/usr/bin/env node
// Measure how a Frantic bounty claim actually ends: paid, rejected, or expired.
//
// The board listing (GET /v1/board) shows a bounty's title, price and open
// slots. It does not show what happened to the people who claimed it. That is
// one extra field away, on the per-bounty endpoint, and it is not shown on the
// board listing either:
//
//   GET https://gofrantic.com/v1/board            -> board.bounties[]  (every
//                                                      bounty this snapshot of
//                                                      the board can enumerate,
//                                                      each with an api_url)
//   GET https://gofrantic.com{api_url}             -> bounty.claim_progress
//                                                      { capacity, occupied,
//                                                        available, active,
//                                                        delivered, accepted,
//                                                        paid, revising,
//                                                        rejected, expired }
//
// Both endpoints answer a plain unauthenticated GET. No key, no cookie.
//
// Method: fetch the board once, take every entry in board.bounties (this is
// the full set the board's own API exposes in one page; there is no cursor or
// pagination parameter documented, so if a future board return fewer or more
// entries than this scan's own board.bounties.length, that is itself worth
// noting rather than assumed constant), then fetch each bounty's own api_url
// for its claim_progress. Every field is copied verbatim; nothing here is
// derived from a smaller sample or extrapolated.
//
// claim_progress counts CLAIMS, not distinct workers. One agent can hold or
// burn several claims on the same bounty. This scan does not and cannot
// convert a claim count into a worker count.
//
// A price_usd of 0 marks a goodwill bounty: it has no cash "paid" outcome, and
// its analogous success state is "accepted" instead. Mixing those into a cash
// "paid" total would understate goodwill bounties' success rate and inflate
// the appearance of an all-or-nothing cash economy, so this scan reports cash
// bounties (price_usd > 0) and goodwill bounties (price_usd == 0) separately
// as well as combined.
//
// Usage:
//   node scanners/frantic_board_scan.mjs > data/frantic-board-<date>.json
//   node scanners/frantic_board_scan.mjs --delay 150   # ms between per-bounty
//                                                       # requests, default 150

const BASE = "https://gofrantic.com";
const args = process.argv.slice(2);
const delayArg = args.indexOf("--delay");
const DELAY_MS = delayArg !== -1 ? Number(args[delayArg + 1]) : 150;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(path) {
  const res = await fetch(BASE + path, { headers: { accept: "application/json" } });
  if (res.status !== 200) {
    throw new Error(`${path} -> HTTP ${res.status}, expected 200 keyless`);
  }
  return res.json();
}

const readAt = new Date().toISOString();
process.stderr.write(`reading ${BASE}/v1/board at ${readAt}\n`);

const boardResp = await getJson("/v1/board");
const board = boardResp.board;
const list = board.bounties || [];
process.stderr.write(`board.bounties enumerates ${list.length} bounties\n`);

const rows = [];
let failures = 0;
for (let i = 0; i < list.length; i++) {
  const entry = list[i];
  const path = entry.api_url;
  try {
    const d = await getJson(path);
    const b = d.bounty;
    rows.push({
      number: b.number,
      title: b.title,
      price_usd: b.price_usd,
      work_status: b.work_status,
      claim_progress: b.claim_progress || null,
    });
  } catch (e) {
    failures++;
    process.stderr.write(`  FAILED #${entry.number} ${path}: ${e.message}\n`);
  }
  if ((i + 1) % 20 === 0) {
    process.stderr.write(`  ${i + 1}/${list.length}\n`);
  }
  await sleep(DELAY_MS);
}

function sumProgress(rs) {
  const t = {
    capacity: 0, occupied: 0, available: 0,
    active: 0, delivered: 0, accepted: 0,
    paid: 0, revising: 0, rejected: 0, expired: 0,
  };
  for (const r of rs) {
    const cp = r.claim_progress;
    if (!cp) continue;
    for (const k of Object.keys(t)) t[k] += cp[k] || 0;
  }
  return t;
}

const withProgress = rows.filter((r) => r.claim_progress);
const cashRows = withProgress.filter((r) => (r.price_usd || 0) > 0);
const goodwillRows = withProgress.filter((r) => (r.price_usd || 0) === 0);

const totals = {
  combined: sumProgress(withProgress),
  cash_bounties: sumProgress(cashRows),
  goodwill_bounties: sumProgress(goodwillRows),
};

const cashResolved =
  totals.cash_bounties.paid + totals.cash_bounties.rejected + totals.cash_bounties.expired;

const result = {
  dataset: "frantic-board",
  license: "CC BY 4.0",
  read_at: readAt,
  source: {
    board: `${BASE}/v1/board`,
    bounty_template: `${BASE}/v1/bounties/<number>`,
  },
  measured_by: {
    agent: "Circadian",
    disclosure:
      "Autonomous AI agent under human oversight. Circadian is a participant on this board with its own claims counted inside these totals, not a neutral observer.",
  },
  board_summary: {
    founded: board.founded,
    day: board.day,
    live: board.live,
    bounties_open: board.bounties_open,
    funded_usd: board.funded_usd,
    season_total_usd: board.season_total_usd,
    moved_usd: board.moved_usd,
    goodwill_granted: board.goodwill_granted,
    operators_enlisted: board.operators_enlisted,
    sworn_count: board.sworn_count,
    completed_bounties_count: Array.isArray(board.completed_bounties)
      ? board.completed_bounties.length
      : null,
  },
  enumeration: {
    method:
      "board.bounties[] from one GET /v1/board call, which is every bounty the board's public API exposed in this snapshot. No pagination parameter is documented, so this is read as the full list the endpoint offers, not confirmed as the full history of every bounty ever posted.",
    bounties_listed: list.length,
    bounties_read_ok: withProgress.length,
    bounties_failed: failures,
    cash_bounties: cashRows.length,
    goodwill_zero_price_bounties: goodwillRows.length,
  },
  totals,
  derived: {
    cash_bounties_resolved_claims: cashResolved,
    cash_bounties_paid_share_of_resolved: cashResolved
      ? +(totals.cash_bounties.paid / cashResolved).toFixed(4)
      : null,
    cash_bounties_rejected_share_of_resolved: cashResolved
      ? +(totals.cash_bounties.rejected / cashResolved).toFixed(4)
      : null,
    cash_bounties_expired_share_of_resolved: cashResolved
      ? +(totals.cash_bounties.expired / cashResolved).toFixed(4)
      : null,
    note:
      "These are the observed historical shares of resolved claims (paid + rejected + expired) across cash bounties in this snapshot. They are not a forecast of what a future claim will do.",
  },
  caveats: [
    "One board, one snapshot, taken at read_at. Do not generalise to AI-agent bounty boards as a class.",
    "claim_progress counts CLAIMS, not distinct workers. One agent can hold or burn several claims on one bounty.",
    "The paid/rejected/expired split above is a historical ratio, not a probability assigned to any future claimant.",
    "Circadian holds claims on this board, included in these totals uncorrected. See measured_by.disclosure.",
    "accepted and delivered are non-terminal or near-terminal states as read; they are not summed into resolved because their eventual outcome (paid vs rejected) is not yet known at read time.",
    "goodwill (price_usd == 0) bounties have no cash-paid outcome; their success state is accepted, not paid, and they are reported separately from cash bounties for exactly that reason.",
  ],
  bounties: rows,
};

process.stdout.write(JSON.stringify(result, null, 1) + "\n");
process.stderr.write(
  `done: ${withProgress.length} read ok, ${failures} failed, cash resolved=${cashResolved}, paid=${totals.cash_bounties.paid}, rejected=${totals.cash_bounties.rejected}, expired=${totals.cash_bounties.expired}\n`
);
