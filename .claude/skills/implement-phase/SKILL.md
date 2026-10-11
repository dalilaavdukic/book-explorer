---
name: implement-phase
description: Build one Book Explorer phase from its approved plan, step by step, running each step's checkpoint.
argument-hint: <phase-number>
arguments: [phase]
disable-model-invocation: true
allowed-tools: Bash(git branch --show-current) Bash(git status *) Bash(git log *)
---

Implement Phase $phase from `.claude/plans/phase-$phase.md`. This is steps 4–9 of the phase workflow in CLAUDE.md, and CLAUDE.md's rules apply throughout.

1. **Gate.** Read the plan. If its status line doesn't read `**Status:** Approved <date>`, stop and say so without changing anything, the status line included. Every earlier phase must also be complete in `docs/implementation-plan.md` §1.
2. **Find where to start.** Compare the git state below with the plan's steps to find the first unfinished step. A step with no commit counts as done only if its checkpoint passes when re-run. If the state doesn't match the plan cleanly (uncommitted work, an unexpected branch), stop and ask before going on.
3. **Build one step at a time**, in the plan's order:
   - Do only what the step lists.
   - Run its checkpoint and read the output.
   - Commit with the step's message once the checkpoint passes.
   - Report the step in a line or two: what was done and the checkpoint result.
4. **Stop and ask** in these cases:
   - A checkpoint fails and fixing it would depart from the plan, or the plan turns out to be wrong or ambiguous. Propose the smallest change. If a decision changes, the docs change with it (CLAUDE.md).
   - Before every push or pull request, unless the user has given standing approval for this branch.
   - In Phases 4 and 5, once the backend and its tests are built and committed. Ask the user to run `/review-phase-code $phase backend`, apply only the findings they approve, then continue with the frontend.
5. **Verify** as the plan's verification section says: every automated check in CLAUDE.md, then the browser checks with Playwright MCP through `http://localhost:5173`. Flag for manual testing any scenario Playwright MCP can't verify reliably.
6. **Review.** Ask the user to run `/review-phase-code $phase`. Apply only the findings they approve, commit each fix, and run the checks again.
7. **Close.** Update the docs and README as the plan lists, and commit. Report each acceptance criterion with its result, how it was verified and any limitation still outstanding. Then wait for the user to approve the phase. Once they do, mark it `Complete, approved <date>` in `docs/implementation-plan.md` §1, commit, push and confirm CI is green, so the status merges with the phase. The user merges the pull request. Don't start the next phase.

## Git state

- Branch: !`git branch --show-current`
- Uncommitted changes: !`git status --short`
- Commits since `origin/main`: !`git log --oneline origin/main..HEAD`
