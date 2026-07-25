#!/usr/bin/env node
// Estimate how many npm packages the MCP registry names are genuinely absent,
// using a polite random sample instead of a census.
//
//   node tools/npm_sample_check.mjs > research/data/npm-sample-2026-07-25.json
//
// WHY A SAMPLE
// The census is what got us into trouble. Asking npm for ~7,000 packages quickly
// earns a 429 on every request, and the previous scan recorded those failures as
// "package does not exist", which became a published and then retracted claim.
// npm's download API is free and someone else pays for it. A sample of a few
// hundred at one request every 2.5 seconds answers the question to within a few
// percent, costs them almost nothing, and never needs a rate limit worked around.
//
// TWO STRATA
//   suspect  packages the broken scan called missing. If these mostly exist, the
//            retracted figure was measurement error, and this quantifies how much.
//   control  packages the broken scan resolved. These should be ~100 percent
//            present; if they are not, something else is wrong and the whole
//            estimate should be distrusted.
//
// Sampling is seeded and the seed is printed, so anyone can draw the same sample.

import { readFileSync } from "node:fs";

const SRC = "research/data/mcp-npm-downloads-2026-07-25.json";
const SEED = 20260725;
const PER_STRATUM = { suspect: 300, control: 150 };
const DELAY_MS = 2500;

// Deterministic PRNG (mulberry32) so the sample is reproducible by anyone.
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(list, n, rand) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(pkg) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res;
    try {
      res = await fetch(
        "https://api.npmjs.org/downloads/point/last-month/" + encodeURIComponent(pkg),
        { headers: { accept: "application/json" } }
      );
    } catch {
      await sleep(4000 * attempt);
      continue;
    }
    if (res.status === 404) return "absent";
    if (res.status === 200) return "present";
    // Throttled or server-side. Back off hard; never call it an answer.
    await sleep(8000 * attempt);
  }
  return "unknown";
}

// Wilson score interval: the right one for proportions near 0, where the normal
// approximation gives nonsense like a negative lower bound.
function wilson(successes, n, z = 1.96) {
  if (n === 0) return [0, 0];
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - spread) / d), Math.min(1, (centre + spread) / d)];
}

const servers = JSON.parse(readFileSync(SRC, "utf8")).filter((s) => s.npm?.length);
const suspectPool = servers.filter((s) => s.downloads === null).map((s) => s.npm[0]);
const controlPool = servers.filter((s) => s.downloads !== null).map((s) => s.npm[0]);

const rand = rng(SEED);
const strata = {
  suspect: sample(suspectPool, PER_STRATUM.suspect, rand),
  control: sample(controlPool, PER_STRATUM.control, rand),
};

const result = { seed: SEED, delay_ms: DELAY_MS, pools: {}, strata: {} };
result.pools = { suspect: suspectPool.length, control: controlPool.length };

for (const [name, pkgs] of Object.entries(strata)) {
  const tally = { present: 0, absent: 0, unknown: 0 };
  const absentList = [];
  for (let i = 0; i < pkgs.length; i++) {
    const verdict = await check(pkgs[i]);
    tally[verdict]++;
    if (verdict === "absent") absentList.push(pkgs[i]);
    await sleep(DELAY_MS);
    if ((i + 1) % 50 === 0) {
      process.stderr.write(
        `  ${name} ${i + 1}/${pkgs.length}  present ${tally.present} absent ${tally.absent} unknown ${tally.unknown}\n`
      );
    }
  }
  const answered = tally.present + tally.absent;
  const [lo, hi] = wilson(tally.absent, answered);
  result.strata[name] = {
    sampled: pkgs.length,
    ...tally,
    answered,
    absent_rate: answered ? tally.absent / answered : null,
    absent_rate_95ci: [lo, hi],
    absent_examples: absentList.slice(0, 20),
  };
  process.stderr.write(`${name}: absent ${tally.absent}/${answered}\n`);
}

process.stdout.write(JSON.stringify(result, null, 1));
