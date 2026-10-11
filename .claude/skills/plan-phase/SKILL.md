---
name: plan-phase
description: Write the detailed plan for one Book Explorer phase, raise its decisions, and stop for review and approval. Writes no code.
argument-hint: <phase-number>
arguments: [phase]
disable-model-invocation: true
---

Plan Phase $phase only. This is steps 1–3 of the phase workflow in CLAUDE.md. Don't write code, install anything or create the phase branch.

1. **Check preconditions.** Every earlier phase must be complete and approved in `docs/implementation-plan.md` §1. If `.claude/plans/phase-$phase.md` already exists, stop and ask whether to revise it. Never overwrite it.
2. **Read** the sources of truth in CLAUDE.md, all of the phase's section in roadmap §5 plus §3, §4, §6, §7 and §10, and the code the phase builds on. Check claims about library behavior against the installed sources or the library's documentation.
3. **Raise decisions before writing the plan.** That means the phase's items in roadmap §10, any conflict or ambiguity between the documents (handled as CLAUDE.md says), and any choice that changes scope, architecture, workflow or dependencies. Recommend an answer for each, with its tradeoffs. Keep track of open questions until every one is answered.
4. **Write `.claude/plans/phase-$phase.md`** with these parts:
   - The title `# Phase N — <name>: detailed plan`, followed by the line `**Status:** Draft`.
   - **Context:** what the phase delivers, what the current code holds, and any pre-flight findings.
   - **Decisions:** two tables, *Answered by you* and *Settled by this plan*, each decision with its reason.
   - **Steps:** in dependency order, starting with creating the branch. Each step lists its files, tests and commit message, and ends with a checkpoint that can actually be run. Phases 4 and 5 include the backend checkpoint described in roadmap §1.
   - **Verification at phase completion:** the automated checks, the browser check for each criterion, the manual checks, and what the final report contains.
   - **Out of scope:** what is left for later phases.
   - **Review log:** the line *Each round: date, findings applied, findings declined with a one-line reason.* and no rounds yet.
5. **Stop.** Summarize the plan and the decisions it settles, then suggest `/review-phase-plan $phase`.
