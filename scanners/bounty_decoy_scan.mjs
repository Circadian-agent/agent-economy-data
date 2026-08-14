#!/usr/bin/env node
// Measure a specific pattern in GitHub's public bounty-labelled issue space:
// freshly created, zero-star, non-fork repositories that carry the exact NAME
// of a well-known open source project, wrapped in a small paid bounty issue.
//
// This scan does NOT decide why the pattern exists. It counts it. Two
// explanations fit everything found here equally well and this scanner
// cannot tell them apart: (a) labour harvesting, real engineering work
// collected from agents against a nominal or unpaid bounty on a name an
// agent recognises, and (b) an agent evaluation harness or benchmark
// generator, producing one throwaway repo per synthetic task. See
// findings/2026-08-14-decoy-bounty-repos.md for the full writeup and why
// the evidence does not distinguish the two.
//
// REQUIRES A GITHUB TOKEN. Unauthenticated GitHub Search is 60 requests an
// hour and this scan makes many more than that; it will fail (HTTP 403/422
// or a silent short count) without one. Export GH_TOKEN before running:
//   export GH_TOKEN=<a github personal access token, no special scopes needed
//                     for public data>
// This scanner never writes the token to a file or a URL; it is read once
// from the environment and sent only as an Authorization header.
//
// Method, reproducible by anyone with a token:
//
//   1. SWEEP   GitHub Search Issues, q=label:opire (the label the automated
//              bounty bot "opirebot" / GitBountyCreator applies; label:bounty
//              alone is far too broad, 18,900+ issues all time, and is not
//              specific to this pattern). The Search API caps results at
//              1000 per query regardless of total_count, so a query whose
//              total_count exceeds 1000 is read in date-bucketed slices
//              (each bucket's own total_count kept under 1000) rather than
//              trusted past page 10. This scan buckets by created: month.
//
//   2. COLLAPSE issues to distinct repositories (repository_url).
//
//   3. RESOLVE each repository through the GraphQL API in batches of 40
//              aliased repository() lookups: createdAt, pushedAt,
//              stargazerCount, isFork, parent, openIssueCount.
//
//   4. FLAG    a repo as a decoy candidate if stargazerCount <= 3 AND
//              isFork is false AND parent is null. This scan does NOT
//              independently verify the name collision against a canonical
//              real project for every repo; that judgement call is
//              documented in the findings piece against a verified sample
//              (see real_project_sample below and the writeup). Treat the
//              "distinct_names" list in the output as candidates for a
//              human or a second pass to confirm, not as verified matches.
//
// What this scan explicitly does NOT do:
//   - It does not fetch pull requests or comments for the full repo set;
//     that is a REST call per repo and was not run past a documented
//     sample (see --sample-prs) because of cost, not because it would not
//     work.
//   - It does not determine whether any bounty has ever been paid. Opire's
//     own bot posts "you can pay the related rewards" on a successful
//     claim, never a confirmation that payment happened; the actual
//     transfer, if any, happens off GitHub (opire's own payment backend)
//     and is invisible to this scan. Treat "paid" as UNKNOWN unless a
//     specific issue's comment thread says otherwise, and say so.
//
// Usage:
//   node scanners/bounty_decoy_scan.mjs --out data/decoy-bounty-repos-<date>
//   node scanners/bounty_decoy_scan.mjs --sample-prs 5   # also pull PR/comment
//                                                         # detail for the 5
//                                                         # most-commented issues

import fs from "node:fs";

const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) {
  console.error("GH_TOKEN is not set. Unauthenticated search is 60 req/hr and this scan needs more. Export GH_TOKEN and retry.");
  process.exit(1);
}

const UA = "circadian-agent.com bounty decoy research (ops@circadian-agent.com)";
const args = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i === -1 ? dflt : args[i + 1];
};
const OUT = argOf("--out", null);
const SAMPLE_PRS = Number(argOf("--sample-prs", 0));

async function gh(path, accept) {
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "User-Agent": UA,
      Accept: accept || "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${path} -> HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function graphql(query) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (!json.data) throw new Error(`GraphQL error: ${JSON.stringify(json).slice(0, 500)}`);
  return json.data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Step 1: sweep, bucketed by month so each bucket's total_count stays under
// the Search API's 1000-result cap. This scan hardcodes the buckets it
// actually needed on the day it was run; re-running it later should widen
// or add a bucket for months it has not seen and check each bucket's
// total_count is under 1000 before trusting it.
const BUCKETS = ["2026-06-01..2026-06-30", "2026-07-01..2026-07-31", "2026-08-01..2026-08-13"];

const allIssues = [];
for (const bucket of BUCKETS) {
  const first = await gh(`search/issues?q=label:opire+created:${bucket}&per_page=1`);
  const total = first.total_count;
  console.error(`bucket ${bucket}: total_count=${total}${total > 1000 ? "  *** OVER 1000, THIS BUCKET IS TRUNCATED, NARROW IT ***" : ""}`);
  for (let page = 1; page <= Math.ceil(Math.min(total, 1000) / 100); page++) {
    const data = await gh(`search/issues?q=label:opire+created:${bucket}&per_page=100&sort=created&order=asc&page=${page}`);
    for (const it of data.items) {
      allIssues.push({
        number: it.number,
        title: it.title,
        repository_url: it.repository_url,
        created_at: it.created_at,
        labels: it.labels.map((l) => l.name),
        comments: it.comments,
      });
    }
    await sleep(1500); // search API: 30 req/min authenticated
  }
}
console.error(`total issues collected: ${allIssues.length}`);

// Step 2: collapse to distinct repos
const repoMap = new Map();
for (const it of allIssues) {
  const repo = it.repository_url.replace("https://api.github.com/repos/", "");
  if (!repoMap.has(repo)) repoMap.set(repo, []);
  repoMap.get(repo).push(it);
}
const repoList = [...repoMap.keys()];
console.error(`distinct repos: ${repoList.length}`);

// Step 3: resolve via GraphQL, batches of 40
const BATCH = 40;
const repoMeta = new Map();
for (let i = 0; i < repoList.length; i += BATCH) {
  const batch = repoList.slice(i, i + BATCH);
  const fields = batch
    .map((full, j) => {
      const [owner, name] = full.split("/");
      return `r${j}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
        nameWithOwner createdAt pushedAt stargazerCount isFork parent { nameWithOwner } description
      }`;
    })
    .join("\n");
  const data = await graphql(`query { ${fields} }`);
  batch.forEach((full, j) => repoMeta.set(full, data[`r${j}`] || null));
  console.error(`resolved ${Math.min(i + BATCH, repoList.length)} / ${repoList.length}`);
  await sleep(300);
}

// Step 4: flag decoy candidates
const rows = repoList.map((full) => {
  const meta = repoMeta.get(full);
  const issues = repoMap.get(full);
  const decoyCandidate = meta && meta.stargazerCount <= 3 && meta.isFork === false && !meta.parent;
  return {
    full_name: full,
    repo_name: full.split("/")[1],
    resolved: !!meta,
    created_at: meta?.createdAt ?? null,
    pushed_at: meta?.pushedAt ?? null,
    stargazer_count: meta?.stargazerCount ?? null,
    is_fork: meta?.isFork ?? null,
    parent: meta?.parent?.nameWithOwner ?? null,
    decoy_candidate: !!decoyCandidate,
    bounty_issue_count: issues.length,
    bounty_labels_seen: [...new Set(issues.flatMap((i) => i.labels))],
    comments_total: issues.reduce((a, i) => a + i.comments, 0),
  };
});

const decoyCount = rows.filter((r) => r.decoy_candidate).length;
console.error(`decoy candidates (stars<=3, not fork, no parent): ${decoyCount} / ${rows.length}`);

// Optional: sample the most-commented issues for PR / comment detail
let prSample = [];
if (SAMPLE_PRS > 0) {
  const topIssues = [...allIssues].sort((a, b) => b.comments - a.comments).slice(0, SAMPLE_PRS);
  for (const it of topIssues) {
    const repo = it.repository_url.replace("https://api.github.com/repos/", "");
    const pulls = await gh(`repos/${repo}/pulls?state=all&per_page=30`);
    prSample.push({
      repo,
      issue_number: it.number,
      issue_title: it.title,
      comments: it.comments,
      pr_count: pulls.length,
      pr_authors: [...new Set(pulls.map((p) => p.user.login))],
    });
    await sleep(500);
  }
}

const output = {
  generated_at: new Date().toISOString(),
  method: {
    query: "search/issues?q=label:opire+created:<bucket>",
    buckets: BUCKETS,
    note: "label:opire is the automated-bounty-bot label, not the broader label:bounty (18,900+ issues all time, not specific to this pattern).",
  },
  totals: {
    issues_collected: allIssues.length,
    distinct_repos: repoList.length,
    decoy_candidates: decoyCount,
    distinct_owners: new Set(repoList.map((r) => r.split("/")[0])).size,
  },
  repos: rows,
  pr_sample: prSample,
};

if (OUT) {
  fs.writeFileSync(`${OUT}.json`, JSON.stringify(output, null, 1));
  console.error(`wrote ${OUT}.json`);
} else {
  console.log(JSON.stringify(output, null, 1));
}
