#!/usr/bin/env node
// Measure the GitHub side of the MCP server registry.
//
// The official registry (registry.modelcontextprotocol.io) tells you a server
// exists and, for most entries, which GitHub repository it comes from. It tells
// you nothing about whether that repository is alive, who maintains it, whether
// anyone starred it, or whether it still exists at all. That gap is the whole
// point of this scanner: the registry is a claim, the repository is the evidence.
//
// Method, reproducible by anyone with a GitHub token:
//
//   1. CRAWL   registry.modelcontextprotocol.io/v0/servers, cursor-paged, no auth.
//              Every record is a VERSION of a server, not a server. Collapse to
//              one row per name before counting anything, preferring the record
//              flagged isLatest.
//
//   2. RESOLVE each server's declared repository.url where repository.source is
//              "github". The URL is authoritative; the reverse-DNS server name
//              (io.github.owner/thing) is NOT, because the trailing segment is the
//              server's name and need not match the repository. Deriving owner/repo
//              from the name would silently invent repositories that do not exist,
//              which is the same class of error as the npm retraction.
//
//   3. QUERY   GitHub GraphQL in batches of aliased repository() lookups. A repo
//              that has been deleted, renamed away, or made private comes back as
//              a null alias with an entry in errors[]. That is DATA, not failure:
//              it is one of the things worth counting.
//
// Three outcomes are kept distinct, because collapsing them is the bug the npm
// census shipped in July:
//   PRESENT    GitHub returned the repository
//   ABSENT     GitHub explicitly said it could not be resolved (NOT_FOUND)
//   UNKNOWN    we never got a clean answer (network, rate limit, anything else)
// Nothing downstream is allowed to treat UNKNOWN as ABSENT.
//
// Usage:
//   node tools/mcp_github_scan.mjs --out research/data/mcp-github-<date>
//   node tools/mcp_github_scan.mjs --limit 500        # quick shape check

import fs from "node:fs";
import path from "node:path";
import { ghGraphQL } from "./lib/github.mjs";

const REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers";
const UA = "circadian-agent.com MCP ecosystem research (ops@circadian-agent.com)";
const BATCH = 50; // aliases per GraphQL document

const args = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const OUT = argOf("--out", null);
const LIMIT = Number(argOf("--limit", 0)) || 0;

const log = (...a) => console.error(...a);

// ------------------------------------------------------------------ 1. crawl

async function crawlRegistry() {
  const byName = new Map(); // name -> {record, isLatest}
  let cursor = null;
  let pages = 0;
  let versionRecords = 0;

  for (;;) {
    const url = new URL(REGISTRY);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    if (!r.ok) throw new Error(`registry ${r.status} on page ${pages}`);
    const page = await r.json();

    for (const entry of page.servers || []) {
      const s = entry.server;
      const meta = entry._meta?.["io.modelcontextprotocol.registry/official"] || {};
      versionRecords++;
      const prev = byName.get(s.name);
      // Prefer the record the registry flags as latest; otherwise keep the last
      // one seen, which is the newest published version in registry order.
      if (!prev || meta.isLatest || !prev.isLatest) {
        byName.set(s.name, { server: s, meta, isLatest: !!meta.isLatest });
      }
    }

    pages++;
    cursor = page.metadata?.nextCursor || null;
    if (pages % 20 === 0) log(`  registry page ${pages}, ${byName.size} distinct servers`);
    if (!cursor) break;
    if (LIMIT && byName.size >= LIMIT) break;
  }

  log(`registry: ${versionRecords} version records -> ${byName.size} distinct servers (${pages} pages)`);
  return { byName, versionRecords, pages };
}

// --------------------------------------------------------------- 2. resolve

// Accepts https://github.com/owner/repo, with or without .git, trailing slash,
// or a deep path (some entries point at a subdirectory of a monorepo).
function parseGitHubUrl(u) {
  if (!u) return null;
  let m;
  try {
    const url = new URL(u);
    if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
    m = url.pathname.replace(/^\/+/, "").split("/");
  } catch {
    return null;
  }
  if (m.length < 2) return null;
  const owner = m[0];
  const repo = m[1].replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) return null;
  return { owner, repo, key: `${owner.toLowerCase()}/${repo.toLowerCase()}` };
}

// -------------------------------------------------------------- 3. graphql

const REPO_FIELDS = `
  nameWithOwner
  isArchived
  isFork
  isPrivate
  isMirror
  stargazerCount
  forkCount
  createdAt
  pushedAt
  updatedAt
  diskUsage
  licenseInfo { spdxId }
  primaryLanguage { name }
  owner { __typename login }
  defaultBranchRef { name }
  openIssues: issues(states: OPEN) { totalCount }
`;

async function fetchRepoBatch(batch) {
  const aliases = batch
    .map((r, i) => `r${i}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.repo)}) { ${REPO_FIELDS} }`)
    .join("\n");
  const query = `query { ${aliases} rateLimit { remaining resetAt cost } }`;

  const { data, errors } = await ghGraphQL(query);
  const out = [];
  for (let i = 0; i < batch.length; i++) {
    const node = data[`r${i}`];
    if (node) {
      out.push({ ...batch[i], state: "PRESENT", repo_data: node });
    } else {
      // Distinguish "GitHub says it does not exist" from "something else broke".
      const err = errors.find((e) => (e.path || []).includes(`r${i}`));
      const notFound = err && String(err.type || "").toUpperCase() === "NOT_FOUND";
      out.push({ ...batch[i], state: notFound ? "ABSENT" : "UNKNOWN", error: err?.message || null });
    }
  }
  return { rows: out, rateLimit: data.rateLimit || null };
}

// ------------------------------------------------------------------- report

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const daysBetween = (a, b) => Math.floor((a - b) / 86400000);

async function main() {
  const pulledAt = new Date().toISOString();
  const { byName, versionRecords, pages } = await crawlRegistry();

  // Map every distinct server to a declared GitHub repository, if it has one.
  const servers = [];
  const repoIndex = new Map(); // key -> {owner, repo, servers: []}
  let noRepoField = 0;
  let nonGitHubRepo = 0;
  let unparseable = 0;

  for (const [name, { server, meta }] of byName) {
    const repository = server.repository;
    const row = { name, version: server.version, published_at: meta.publishedAt, updated_at: meta.updatedAt, status: meta.status };
    if (!repository) {
      noRepoField++;
      row.repo_key = null;
    } else if (String(repository.source || "").toLowerCase() !== "github") {
      nonGitHubRepo++;
      row.repo_key = null;
      row.repo_source = repository.source;
    } else {
      const parsed = parseGitHubUrl(repository.url);
      if (!parsed) {
        unparseable++;
        row.repo_key = null;
      } else {
        row.repo_key = parsed.key;
        if (!repoIndex.has(parsed.key)) repoIndex.set(parsed.key, { ...parsed, servers: [] });
        repoIndex.get(parsed.key).servers.push(name);
      }
    }
    servers.push(row);
  }

  const targets = [...repoIndex.values()];
  log(
    `repositories: ${targets.length} distinct GitHub repos declared by ${servers.filter((s) => s.repo_key).length} servers ` +
      `(${noRepoField} servers declare no repository, ${nonGitHubRepo} declare a non-GitHub host, ${unparseable} unparseable)`
  );

  // ---- query GitHub
  const results = [];
  let lastRate = null;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    let rows;
    try {
      ({ rows, rateLimit: lastRate } = await fetchRepoBatch(batch));
    } catch (e) {
      log(`  batch at ${i} failed: ${e.message}`);
      rows = batch.map((r) => ({ ...r, state: "UNKNOWN", error: e.message }));
    }
    results.push(...rows);
    if ((i / BATCH) % 20 === 0) {
      log(`  ${results.length}/${targets.length} repos, rate limit remaining ${lastRate?.remaining ?? "?"}`);
    }
  }

  const present = results.filter((r) => r.state === "PRESENT");
  const absent = results.filter((r) => r.state === "ABSENT");
  const unknown = results.filter((r) => r.state === "UNKNOWN");
  log(`resolved: ${present.length} present, ${absent.length} absent, ${unknown.length} unknown`);

  // ---- aggregate, over PRESENT only, and say so everywhere
  const now = new Date(pulledAt);
  const stars = present.map((r) => r.repo_data.stargazerCount);
  const staleDays = present.map((r) => daysBetween(now, new Date(r.repo_data.pushedAt)));
  const ownerTypes = {};
  const licenses = {};
  const languages = {};
  for (const r of present) {
    ownerTypes[r.repo_data.owner.__typename] = (ownerTypes[r.repo_data.owner.__typename] || 0) + 1;
    const lic = r.repo_data.licenseInfo?.spdxId || "(none declared)";
    licenses[lic] = (licenses[lic] || 0) + 1;
    const lang = r.repo_data.primaryLanguage?.name || "(none)";
    languages[lang] = (languages[lang] || 0) + 1;
  }

  const totalStars = stars.reduce((a, b) => a + b, 0);
  const sortedStars = [...stars].sort((a, b) => b - a);
  const topShare = (n) => pct(sortedStars.slice(0, n).reduce((a, b) => a + b, 0), totalStars);

  // Owners publishing many servers: the registry counts servers, not builders.
  const byOwner = {};
  for (const r of present) {
    const o = r.repo_data.owner.login;
    byOwner[o] = (byOwner[o] || 0) + r.servers.length;
  }
  const topOwners = Object.entries(byOwner).sort((a, b) => b[1] - a[1]).slice(0, 25);

  const multiServerRepos = present.filter((r) => r.servers.length > 1);

  const summary = {
    pulled_utc: pulledAt,
    method: "registry crawl -> declared repository.url (source=github) -> GitHub GraphQL repository() lookups",
    registry: {
      version_records: versionRecords,
      pages: pages,
      distinct_servers: byName.size,
      servers_declaring_github_repo: servers.filter((s) => s.repo_key).length,
      servers_declaring_no_repository: noRepoField,
      servers_declaring_non_github_host: nonGitHubRepo,
      servers_with_unparseable_repo_url: unparseable,
    },
    repositories: {
      distinct_declared: targets.length,
      present,
      absent: absent.length,
      unknown: unknown.length,
      absent_pct_of_answered: pct(absent.length, present.length + absent.length),
      note: "every percentage below is over PRESENT repositories only; UNKNOWN is never counted as ABSENT",
    },
    attention: {
      total_stars: totalStars,
      median_stars: median(stars),
      mean_stars: present.length ? Math.round((totalStars / present.length) * 100) / 100 : null,
      zero_star_repos: stars.filter((s) => s === 0).length,
      zero_star_pct: pct(stars.filter((s) => s === 0).length, present.length),
      under_10_stars_pct: pct(stars.filter((s) => s < 10).length, present.length),
      over_100_stars: stars.filter((s) => s >= 100).length,
      over_1000_stars: stars.filter((s) => s >= 1000).length,
      top10_share_of_stars_pct: topShare(10),
      top100_share_of_stars_pct: topShare(100),
    },
    maintenance: {
      median_days_since_push: median(staleDays),
      pushed_last_30d_pct: pct(staleDays.filter((d) => d <= 30).length, present.length),
      pushed_last_90d_pct: pct(staleDays.filter((d) => d <= 90).length, present.length),
      no_push_180d_pct: pct(staleDays.filter((d) => d > 180).length, present.length),
      archived: present.filter((r) => r.repo_data.isArchived).length,
      forks: present.filter((r) => r.repo_data.isFork).length,
      mirrors: present.filter((r) => r.repo_data.isMirror).length,
    },
    who_builds_them: {
      owner_types: ownerTypes,
      organization_pct: pct(ownerTypes.Organization || 0, present.length),
      distinct_owners: Object.keys(byOwner).length,
      top_owners_by_server_count: topOwners.map(([login, n]) => ({ login, servers: n })),
      repos_publishing_more_than_one_server: multiServerRepos.length,
      max_servers_from_one_repo: multiServerRepos.reduce((m, r) => Math.max(m, r.servers.length), 0),
    },
    licensing: {
      declared_pct: pct(present.length - (licenses["(none declared)"] || 0), present.length),
      top: Object.entries(licenses).sort((a, b) => b[1] - a[1]).slice(0, 12),
    },
    languages: Object.entries(languages).sort((a, b) => b[1] - a[1]).slice(0, 15),
    what_we_do_not_know: [
      "Stars measure attention, not use. A server with no stars may be used heavily inside one company.",
      "ABSENT means GitHub could not resolve the declared URL now. It does not distinguish deleted from renamed from made-private.",
      "The registry is self-declared. A repository URL is a claim by the publisher, not something the registry verifies.",
      "Servers that declare no repository at all are excluded from every repository figure and counted separately.",
    ],
  };

  // Keep the summary readable: strip the full node payload out of `present`.
  summary.repositories.present = present.length;

  const rows = results.map((r) => ({
    repo: `${r.owner}/${r.repo}`,
    state: r.state,
    servers: r.servers,
    ...(r.repo_data
      ? {
          stars: r.repo_data.stargazerCount,
          forks: r.repo_data.forkCount,
          pushed_at: r.repo_data.pushedAt,
          created_at: r.repo_data.createdAt,
          archived: r.repo_data.isArchived,
          is_fork: r.repo_data.isFork,
          owner_type: r.repo_data.owner.__typename,
          owner: r.repo_data.owner.login,
          license: r.repo_data.licenseInfo?.spdxId || null,
          language: r.repo_data.primaryLanguage?.name || null,
          open_issues: r.repo_data.openIssues.totalCount,
        }
      : {}),
  }));

  console.log(JSON.stringify(summary, null, 2));

  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(`${OUT}-summary.json`, JSON.stringify(summary, null, 2));
    fs.writeFileSync(`${OUT}-repos.json`, JSON.stringify(rows, null, 1));
    fs.writeFileSync(`${OUT}-servers.json`, JSON.stringify(servers, null, 1));
    log(`wrote ${OUT}-summary.json, -repos.json, -servers.json`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
