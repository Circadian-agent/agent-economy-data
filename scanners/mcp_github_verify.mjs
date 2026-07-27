#!/usr/bin/env node
// Independently verify the ABSENT figure from tools/mcp_github_scan.mjs before it
// is published anywhere.
//
// WHY THIS EXISTS. The July npm census published "37.8% of registry-named npm
// packages 404" and had to be retracted the same day, wrong by about 43x. The
// cause was a measurement that could not tell "the server said no" from "we never
// got an answer", and the tell was sitting in our own output where nobody looked.
// The correction that worked was not a better census. It was a POLITE SAMPLE WITH
// A CONTROL STRATUM, and the control is what made it publishable: if the repos we
// believe are present also came back missing, the method would be broken and we
// would know before a reader did.
//
// So this checks a random sample of both strata against a completely different
// mechanism: anonymous, unauthenticated HTTPS to github.com, no token, no GraphQL.
//
//   SUSPECT stratum   repos the scan called ABSENT   -> expect 404
//   CONTROL stratum   repos the scan called PRESENT  -> expect 200, and any 404
//                     here means the method is wrong and nothing may be published
//
// What a 404 to an anonymous request does and does not mean:
//   it DOES mean the repository is not publicly reachable at that path now
//   it does NOT distinguish deleted from renamed-away from made-private
// GitHub 301-redirects a renamed repository, so a rename would show as 200 here
// and as NOT_FOUND in GraphQL. That difference is exactly what this is looking for.
//
// Deterministic sample: a fixed seed, so re-running reproduces the same draw and
// the number in the write-up can be checked by anyone.
//
// Usage:
//   node tools/mcp_github_verify.mjs research/data/mcp-github-2026-07-27-repos.json
//   node tools/mcp_github_verify.mjs <file> --n 40 --seed 20260727

import fs from "node:fs";

const args = process.argv.slice(2);
const FILE = args.find((a) => !a.startsWith("--"));
const argOf = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : d;
};
const N = Number(argOf("--n", 40));
const SEED = Number(argOf("--seed", 20260727));
// Anonymous github.com, unauthenticated, one request at a time with a pause. This
// is somebody else's free service being used for our research; the sample is small
// precisely so it can be taken politely rather than worked around.
const DELAY_MS = Number(argOf("--delay", 1200));

if (!FILE) {
  console.error("usage: node tools/mcp_github_verify.mjs <repos.json> [--n 40] [--seed 20260727]");
  process.exit(2);
}

// mulberry32: small, seeded, and reproducible. Math.random would make the sample
// unverifiable by anyone else, which defeats the point of publishing a method.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(arr, n, rand) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(repo) {
  try {
    const r = await fetch(`https://github.com/${repo}`, {
      redirect: "follow",
      headers: { "user-agent": "circadian-agent.com MCP ecosystem research (ops@circadian-agent.com)" },
    });
    return { status: r.status, finalUrl: r.url };
  } catch (e) {
    // Never collapses into "missing". An unanswered probe is its own outcome and
    // is excluded from both numerators and denominators below.
    return { status: null, error: e.message };
  }
}

const rows = JSON.parse(fs.readFileSync(FILE, "utf8"));
const absent = rows.filter((r) => r.state === "ABSENT").map((r) => r.repo);
const present = rows.filter((r) => r.state === "PRESENT").map((r) => r.repo);

console.log(`scan says: ${present.length} PRESENT, ${absent.length} ABSENT`);
console.log(`sampling ${Math.min(N, absent.length)} suspect and ${Math.min(N, present.length)} control, seed ${SEED}\n`);

const rand = rng(SEED);
const strata = [
  { name: "SUSPECT (scan said ABSENT)", repos: sample(absent, Math.min(N, absent.length), rand), expect: 404 },
  { name: "CONTROL (scan said PRESENT)", repos: sample(present, Math.min(N, present.length), rand), expect: 200 },
];

const results = {};
for (const s of strata) {
  let agree = 0, disagree = 0, unanswered = 0;
  const disagreements = [];
  for (const repo of s.repos) {
    const { status, finalUrl, error } = await probe(repo);
    if (status === null) {
      unanswered++;
    } else if (status === s.expect || (s.expect === 200 && status >= 200 && status < 300)) {
      agree++;
    } else {
      disagree++;
      disagreements.push({ repo, status, finalUrl, error });
    }
    await sleep(DELAY_MS);
  }
  const answered = agree + disagree;
  results[s.name] = { sampled: s.repos.length, agree, disagree, unanswered, agreement_pct: answered ? Math.round((agree / answered) * 1000) / 10 : null, disagreements };
  console.log(`${s.name}`);
  console.log(`  sampled ${s.repos.length}, answered ${answered}, unanswered ${unanswered}`);
  console.log(`  agreed with the scan: ${agree}  disagreed: ${disagree}  (${results[s.name].agreement_pct}%)`);
  for (const d of disagreements.slice(0, 10)) {
    console.log(`    DISAGREE ${d.repo} -> ${d.status ?? d.error} ${d.finalUrl && !d.finalUrl.endsWith(d.repo) ? `(redirected to ${d.finalUrl})` : ""}`);
  }
  console.log();
}

const control = results["CONTROL (scan said PRESENT)"];
const suspect = results["SUSPECT (scan said ABSENT)"];

console.log("================ VERDICT ================");
if (control.disagree > 0) {
  console.log(`FAIL. ${control.disagree} of ${control.sampled} repositories the scan called PRESENT are not`);
  console.log("reachable anonymously. The two methods disagree on repos that should be easy,");
  console.log("so the ABSENT figure is NOT publishable until that is explained.");
  process.exitCode = 1;
} else if (suspect.agreement_pct !== null && suspect.agreement_pct < 90) {
  console.log(`FAIL. Only ${suspect.agreement_pct}% of the suspect sample confirms as unreachable.`);
  console.log("GraphQL NOT_FOUND is probably catching renames that github.com redirects.");
  console.log("Report the CONFIRMED rate from this sample, not the raw scan figure.");
  process.exitCode = 1;
} else {
  console.log(`PASS. Control clean (${control.agree}/${control.sampled} reachable, zero false absences)`);
  console.log(`and ${suspect.agreement_pct}% of the suspect sample independently confirms as unreachable.`);
  console.log("The ABSENT figure may be published, WITH the caveat that unreachable does not");
  console.log("distinguish deleted from renamed-away from made-private.");
}

console.log(`\nseed ${SEED}, n ${N} per stratum, anonymous HTTPS, ${DELAY_MS}ms apart. Reproducible.`);
