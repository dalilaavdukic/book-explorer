---
name: review-phase-code
description: Independent, read-only review of a phase's implementation by the code-reviewer agent, in a fresh context. Add "backend" for the Phase 4/5 backend checkpoint.
argument-hint: <phase-number> [backend]
arguments: [phase, scope]
disable-model-invocation: true
context: fork
agent: code-reviewer
background: false
allowed-tools: Bash(git branch --show-current) Bash(git status *) Bash(git log *) Bash(git diff *)
---

Review the implementation of Phase $phase of Book Explorer against its approved plan, `.claude/plans/phase-$phase.md`, and report in your standard format. If the plan file doesn't exist, report only that and stop.

Scope: "$scope". Empty means the whole phase. `backend` means the backend checkpoint of Phases 4 and 5 (`docs/implementation-plan.md` §1). In that case, review only the backend changes and their tests. The frontend isn't built yet, so don't report it as missing.

## Branch

!`git branch --show-current`

## Commits since origin/main

!`git log --format='%h %s%n%b' origin/main..HEAD`

## Uncommitted and untracked files

!`git status --short --untracked-files=all`

## Files changed since the merge base with origin/main

!`git diff --stat=200 --merge-base origin/main -- . ':(exclude)frontend/package-lock.json' ':(exclude)frontend/src/api/schema.d.ts'`

## Diff from the merge base with origin/main to the working tree

!`git diff --no-color --merge-base origin/main -- . ':(exclude)frontend/package-lock.json' ':(exclude)frontend/src/api/schema.d.ts'`
