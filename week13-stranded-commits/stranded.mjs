#!/usr/bin/env node
// Lists commits pushed to a branch AFTER its pull request was merged, so they never reached
// the base branch. Uses the GitHub CLI (`gh`) for the API calls, so it works on private repos.
// Usage: node stranded.mjs OWNER/REPO [--limit 30]   (how many recent merged PRs to check)
import { execFileSync } from "node:child_process";
import { findStranded, formatReport } from "./stranded-core.mjs";

const repo = process.argv[2];
const limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex === -1 ? "30" : process.argv[limitIndex + 1];
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error("Usage: node stranded.mjs OWNER/REPO [--limit 30]");
  process.exit(2);
}

const trace = process.env.STRANDED_TRACE ? (msg) => process.stderr.write(msg + "\n") : () => {};
function gh(args) {
  const started = Date.now();
  try { return ghOnce(args); } finally { trace(`${((Date.now() - started) / 1000).toFixed(1)}s gh ${args.slice(0, 2).join(" ")}`); }
}
function ghOnce(args) {
  const run = () => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });
  try { return run(); } catch (error) {
    if (String(error.stderr || "").includes("404")) throw error; // a real answer, not a network blip
    return run(); // one retry for a dropped connection
  }
}
const ghJson = (args) => JSON.parse(gh(args));
const fields = "number,title,headRefName,headRefOid,baseRefName,mergedAt";

let mergedPrs, openPrs, defaultBranch;
try {
  defaultBranch = ghJson(["repo", "view", repo, "--json", "defaultBranchRef"]).defaultBranchRef.name;
  mergedPrs = ghJson(["pr", "list", "-R", repo, "--state", "merged", "--limit", limit, "--json", fields]);
  openPrs = ghJson(["pr", "list", "-R", repo, "--state", "open", "--limit", "100", "--json", "number,title,headRefName,headRefOid"]);
} catch (error) {
  console.error(`Couldn't list pull requests for ${repo}. Check that gh is installed and signed in (gh auth status), and that you can see the repo.`);
  process.exit(1);
}

// Commits on the branch now that come after the PR's last commit. The compare API also returns
// every changed file's diff (over 1 MB on a big branch), so --jq keeps only the fields used here.
const commitFields = '[.commits[] | {sha, date: .commit.committer.date, author: .commit.author.name, message: (.commit.message | split("\\n")[0])}]';
function commitsAfter(headRefOid, branch, baseRefName) {
  try {
    const after = ghJson(["api", `repos/${repo}/compare/${headRefOid}...${encodeURIComponent(branch)}`, "--jq", commitFields]);
    if (!after.length) return after;
    // Drop commits that are already on the base branch, e.g. when main was merged into the
    // branch after the PR: those are main's commits, not stranded work.
    const notOnBase = new Set(ghJson(["api", `repos/${repo}/compare/${encodeURIComponent(baseRefName)}...${encodeURIComponent(branch)}`, "--jq", "[.commits[].sha]"]));
    return after.filter((commit) => notOnBase.has(commit.sha));
  } catch (error) {
    if (String(error.stderr || error.message).includes("404")) return null; // branch deleted after merge: the safe case
    return { error: String(error.stderr || error.message).trim().split("\n")[0] };
  }
}

const cache = new Map();
function contains(headRefOid, sha) {
  const key = `${headRefOid}:${sha}`;
  if (!cache.has(key)) {
    try {
      cache.set(key, gh(["api", `repos/${repo}/compare/${sha}...${headRefOid}`, "--jq", ".behind_by"]).trim() === "0");
    } catch { cache.set(key, false); }
  }
  return cache.get(key);
}

// Base-branch commits since a date (one call per base branch and date, cached).
const copies = new Map();
function baseCopies(base, since) {
  const key = `${base}:${since}`;
  if (!copies.has(key)) {
    try {
      copies.set(key, ghJson(["api", `repos/${repo}/commits?sha=${encodeURIComponent(base)}&since=${since}&per_page=100`,
        "--jq", '[.[] | {sha, author: .commit.author.name, message: (.commit.message | split("\\n")[0])}]']));
    } catch { copies.set(key, []); }
  }
  return copies.get(key);
}

console.log(formatReport(repo, findStranded({ mergedPrs, openPrs, commitsAfter, contains, baseCopies, defaultBranch })));
