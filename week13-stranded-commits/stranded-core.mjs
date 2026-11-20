// Pure logic, no network. A commit is "stranded" when it was pushed to a PR's branch after the
// PR's last reviewed commit (headRefOid) and the PR was then merged without it. Comparing with
// the PR's own head, not with main, works for merge, squash and rebase merges alike.

// mergedPrs: [{ number, title, headRefName, headRefOid, baseRefName, mergedAt }]
// openPrs:   [{ number, title, headRefName, headRefOid }]
// commitsAfter(headRefOid, branch, baseRefName) -> null if the branch is gone, else [{ sha, date, author, message }]
// contains(headRefOid, sha) -> true if that commit is part of the given PR head's history
// baseCopies(baseRefName, sinceDate) -> [{ sha, author, message }] commits on the base branch since
//   that date; a cherry-picked or rebased copy keeps the author and message but gets a new sha
export const LATER_PR_CHECKS = 15;

export function findStranded({ mergedPrs, openPrs, commitsAfter, contains, baseCopies = () => [], defaultBranch = "main" }) {
  const openBranches = new Set(openPrs.map((pr) => pr.headRefName));
  const newestFirst = [...mergedPrs].sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));
  const seen = new Set();
  const results = [];
  for (const pr of newestFirst) {
    if (seen.has(pr.headRefName)) continue; // judge a reused branch by its latest merge only
    seen.add(pr.headRefName);
    if (openBranches.has(pr.headRefName)) continue; // reused for a new PR that's still open
    // A PR *from* the default branch (e.g. syncing main into another branch) isn't a feature
    // branch: main always moves on after it, which isn't stranded work.
    if (pr.headRefName === defaultBranch) continue;
    const after = commitsAfter(pr.headRefOid, pr.headRefName, pr.baseRefName);
    if (after && after.error) { results.push({ pr, commits: [], error: after.error }); continue; }
    if (!after || after.length === 0) continue; // branch deleted, or nothing pushed after
    const commits = after.map((commit) => {
      const open = openPrs.find((o) => contains(o.headRefOid, commit.sha));
      // Check only the PRs merged soonest after the commit (a rescue PR usually follows within
      // days); checking every later PR costs one API call each and took minutes on a real repo.
      const candidates = newestFirst.filter((m) => m.number !== pr.number && m.mergedAt > commit.date).reverse().slice(0, LATER_PR_CHECKS);
      const later = !open && candidates.find((m) => contains(m.headRefOid, commit.sha));
      const copy = !open && !later && baseCopies(pr.baseRefName, commit.date).find((c) => c.sha !== commit.sha && c.message === commit.message && c.author === commit.author);
      return { ...commit, savedBy: open ? { state: "open", number: open.number } : later ? { state: "merged", number: later.number } : copy ? { state: "copied", sha: copy.sha } : null };
    });
    results.push({ pr, commits });
  }
  return results;
}

export function formatReport(repo, allResults) {
  const unchecked = allResults.filter((r) => r.error);
  const results = allResults.filter((r) => !r.error);
  const lost = results.flatMap((r) => r.commits).filter((c) => !c.savedBy);
  const footer = unchecked.length ? ["", `Couldn't check ${unchecked.length} branch(es): ${unchecked.map((r) => `${r.pr.headRefName} (#${r.pr.number})`).join(", ")}. Run again to retry.`] : [];
  if (!results.length) return [`${repo}: no stranded commits. Nothing was pushed to a branch after its PR was merged.`, ...footer].join("\n");
  const lines = [`${repo}: ${results.length} merged PR branch(es) got commits after their PR's last commit.`, ""];
  for (const { pr, commits } of results) {
    lines.push(`#${pr.number} ${pr.title}`);
    lines.push(`  branch ${pr.headRefName} -> ${pr.baseRefName}, merged ${pr.mergedAt}`);
    for (const c of commits) {
      const status = !c.savedBy ? "LOST: not in any later PR or on the base branch"
        : c.savedBy.state === "open" ? `in open PR #${c.savedBy.number}`
        : c.savedBy.state === "copied" ? `saved: copied to ${pr.baseRefName} as ${c.savedBy.sha.slice(0, 7)}`
        : `saved: merged later in PR #${c.savedBy.number}`;
      lines.push(`  ${c.sha.slice(0, 7)} ${c.date} ${c.author}: ${c.message}  [${status}]`);
    }
    lines.push("");
  }
  lines.push(lost.length ? `${lost.length} commit(s) are lost: open a PR for them, or they never reach the base branch.` : "No commits are lost: each one is in a later PR.");
  return [...lines, ...footer].join("\n");
}
