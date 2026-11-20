# Week 13 rep: find commits stranded after a PR merge

A command-line script that asks GitHub which branches got new commits **after** their pull request was already merged. Those commits never reach `main` unless someone opens another PR for them.

For each recent merged PR, it compares the PR's last commit with the branch as it is now. For every commit pushed later, it reports one of four states:
- **in open PR #N:** already part of an open pull request.
- **saved: merged later in PR #N:** a later PR carried it into the base branch.
- **saved: copied to main as abc1234:** the same change reached `main` as a cherry-picked or rebased copy (same author and message, new ID).
- **LOST:** none of the above. Open a PR for it, or it never reaches the base branch.

## Run it

You need Node.js 18 or newer and the GitHub CLI (`gh`), signed in to an account that can see the repo. There's nothing to install: the script has no dependencies.

```sh
git clone https://github.com/bennuttall26/badm372-build-reps.git
cd badm372-build-reps/week13-stranded-commits
gh auth status                                   # must say you're logged in
node stranded.mjs BADM372/badm372-project-5      # checks the 30 most recent merged PRs
node stranded.mjs BADM372/badm372-project-5 --limit 100
node --test stranded.test.mjs                    # offline tests, no network
```

It makes one or two API calls per merged PR, so 30 PRs take about 30 seconds. A branch it couldn't check (for example after a dropped connection) is listed at the end as "Couldn't check", not silently skipped.

## Files

| File | What it is |
|---|---|
| `stranded.mjs` | The command: GitHub calls through `gh` |
| `stranded-core.mjs` | The decision logic, with no network, so it can be tested |
| `stranded.test.mjs` | 8 tests with fixtures shaped like real `gh` output |
| `run-badm372-project-5.txt` | Real output on our team repo, Nov 19, 2026 |
| `run-badm372-project-2.txt` | Real output on the other team's repo, Nov 19, 2026 |
| `REP-NOTE.md` | The rep note |

## Limits

- **Only the 15 PRs merged soonest after a stranded commit are checked as possible rescues**, to keep the run short. A commit rescued by a much later PR could show as LOST, so check any LOST commit by hand before acting on it.
- **A "copied" match uses author and first message line only.** A copy whose message was edited shows as LOST.
- **PRs whose source branch is the default branch** (for example, syncing `main` into another branch) are skipped.
