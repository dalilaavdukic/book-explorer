---
name: assess-solution
description: Independent, read-only senior-level assessment of the whole solution by the solution-assessor agent, in a fresh context.
disable-model-invocation: true
context: fork
agent: solution-assessor
background: false
allowed-tools: Bash(git branch --show-current) Bash(git status *) Bash(git log *) Bash(git ls-files *)
---

Assess the whole Book Explorer solution on the current branch, as it stands at `HEAD`, and report in your standard format.

## Branch

!`git branch --show-current`

## HEAD

!`git log -1 --format='%h %s'`

## Uncommitted and untracked files

!`git status --short --untracked-files=all`

## Tracked files

!`git ls-files --full-name`
