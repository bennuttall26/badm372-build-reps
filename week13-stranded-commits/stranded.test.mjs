// node --test stranded.test.mjs   (no network; fixtures shaped like real gh output)
import test from "node:test";
import assert from "node:assert/strict";
import { findStranded, formatReport } from "./stranded-core.mjs";

const pr = (number, headRefName, mergedAt, headRefOid = `head${number}`) => ({ number, title: `PR ${number}`, headRefName, headRefOid, baseRefName: "main", mergedAt });
const commit = (sha, date = "2026-11-17T23:59:56Z") => ({ sha, date, author: "Synthetic Dev", message: `commit ${sha}` });
const run = (over) => findStranded({ openPrs: [], contains: () => false, ...over });

test("a commit pushed after the PR's last commit is reported as lost", () => {
  const results = run({ mergedPrs: [pr(1, "late-push", "2026-11-17T23:55:25Z")], commitsAfter: () => [commit("aaaaaaa1")] });
  assert.equal(results.length, 1);
  assert.equal(results[0].commits[0].savedBy, null);
  assert.match(formatReport("o/r", results), /1 commit\(s\) are lost/);
});

test("squash-merged PRs with nothing pushed afterwards are not reported", () => {
  // A squash merge leaves the branch's own commits off main; only commits after headRefOid matter.
  assert.deepEqual(run({ mergedPrs: [pr(268, "squashed", "2026-11-19T04:08:17Z")], commitsAfter: () => [] }), []);
});

test("deleted branches and branches reused for an open PR are skipped", () => {
  const asked = [];
  const results = run({
    mergedPrs: [pr(2, "deleted", "2026-11-16T00:00:00Z"), pr(4, "reused", "2026-11-14T00:00:00Z")],
    openPrs: [{ number: 9, title: "follow-up", headRefName: "reused", headRefOid: "open9" }],
    commitsAfter: (_oid, branch) => { asked.push(branch); return branch === "deleted" ? null : [commit("bbbbbbb2")]; },
  });
  assert.deepEqual(results, []);
  assert.deepEqual(asked, ["deleted"]);
});

test("a stranded commit carried by an open PR, or a PR merged later, is marked saved", () => {
  const results = run({
    mergedPrs: [pr(246, "late-push", "2026-11-17T23:55:25Z"), pr(263, "rescue", "2026-11-19T04:00:00Z", "rescueHead")],
    openPrs: [{ number: 7, title: "open rescue", headRefName: "other", headRefOid: "open7" }],
    commitsAfter: (_oid, branch) => (branch === "late-push" ? [commit("aaaaaaa1"), commit("ccccccc3")] : []),
    contains: (head, sha) => (head === "rescueHead" && sha === "aaaaaaa1") || (head === "open7" && sha === "ccccccc3"),
  });
  assert.deepEqual(results[0].commits.map((c) => c.savedBy), [{ state: "merged", number: 263 }, { state: "open", number: 7 }]);
  assert.match(formatReport("o/r", results), /No commits are lost/);
});

test("a branch merged twice is judged by its latest PR only", () => {
  const asked = [];
  run({ mergedPrs: [pr(1, "same", "2026-11-01T00:00:00Z"), pr(2, "same", "2026-11-10T00:00:00Z")], commitsAfter: (oid) => { asked.push(oid); return []; } });
  assert.deepEqual(asked, ["head2"]);
});

test("a clean repo is reported plainly", () => {
  assert.match(formatReport("o/r", []), /no stranded commits/);
});

test("a PR from the default branch is skipped, and a failed check is reported, not thrown", () => {
  const asked = [];
  const results = run({
    mergedPrs: [pr(21, "main", "2026-10-04T21:44:04Z"), pr(5, "flaky", "2026-11-01T00:00:00Z")],
    commitsAfter: (_oid, branch) => { asked.push(branch); return { error: "connection reset by peer" }; },
  });
  assert.deepEqual(asked, ["flaky"]);
  const report = formatReport("o/r", results);
  assert.match(report, /no stranded commits/);
  assert.match(report, /Couldn't check 1 branch\(es\): flaky \(#5\)/);
});

test("a commit cherry-picked or rebased onto the base branch counts as saved, not lost", () => {
  // Seen on a real repo: the same change reached main as a new commit with the same message.
  const results = run({
    mergedPrs: [pr(149, "memo", "2026-11-10T05:09:23Z")],
    commitsAfter: () => [commit("be3b13f0"), commit("27e79570")],
    baseCopies: () => [{ sha: "7c75e210", author: "Synthetic Dev", message: "commit be3b13f0" }],
  });
  assert.deepEqual(results[0].commits.map((c) => c.savedBy), [{ state: "copied", sha: "7c75e210" }, null]);
  const report = formatReport("o/r", results);
  assert.match(report, /saved: copied to main as 7c75e21/);
  assert.match(report, /1 commit\(s\) are lost/);
});
