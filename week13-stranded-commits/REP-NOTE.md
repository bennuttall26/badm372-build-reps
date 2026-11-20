# Rep note: Week 13 (Nov 19, 2026), the Pain Detective rep

I built a command-line script that calls the GitHub API (through `gh`) and lists commits pushed to a branch after its pull request was already merged, plus whether a later PR or a copied commit saved them. Claude Code wrote all of the code and tests at my direction; I chose to tie the rep to a pain from our BADM 372 project, and it proposed this one because I hit it on Nov 17. Running it on real repos exposed four bugs that Claude then fixed:
- compare responses were over 1 MB each and crashed the script;
- squash-merged PRs (13 of them) were falsely flagged;
- a PR from `main` made a run slow enough to crash;
- commits cherry-picked onto the other team's `main` were reported as LOST.

I checked the final report against what actually happened on our repo: it lists my `40fad2e` and Isha's two diagram commits, and says #263 later saved all three, which is correct. Next I would run it automatically after every merge (a GitHub Action) so the warning comes the same day, not two days later.

## Pain Detective

- **How often does it happen?** Twice in about five minutes on Nov 17. Isha merged #246 and #256 just before my last push to one branch and hers to the other.
- **How painful is it?** The data model on `main` stayed wrong for a day while it was due for the Demo B package. Nobody noticed until someone went looking.
- **Do I experience it myself?** Yes: my commit `40fad2e` was one of the three stranded commits.
- **Who else has it?** My teammate, whose two diagram commits were stranded the same way. The script also flagged five commits on the other team's repo that were pushed after their PR merged. Those turned out to have been copied to `main` by hand, which is the manual fix people use today.
- **What do people do about it today?** They notice by luck, re-push or cherry-pick by hand, or turn on GitHub's "automatically delete head branches" setting. That setting makes the mistake less likely but doesn't warn you when it happens.
- **Would anyone pay to make it go away?** Probably not for this alone, since free settings and habits cover most of it. As a check built into a team's merge workflow, it would save the kind of last-minute scramble we had before Demo B.
