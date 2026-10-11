---
name: review-phase-plan
description: Independent, read-only review of a phase plan by the plan-reviewer agent, in a fresh context.
argument-hint: <phase-number>
arguments: [phase]
disable-model-invocation: true
context: fork
agent: plan-reviewer
background: false
---

Review the detailed plan for Phase $phase of Book Explorer, in `.claude/plans/phase-$phase.md`. If that file doesn't exist, report only that and stop.

Review the plan as it stands now. Check it against the phase's section in `docs/implementation-plan.md` §5, the other sources of truth and the current code, and report in your standard format.
