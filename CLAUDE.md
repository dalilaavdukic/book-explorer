# Book Explorer

A take-home assignment: a Django + DRF backend and a React (TypeScript) frontend for browsing a book catalog, with private per-reader notes as the main feature. Development is phased; the current phase and its status are in `docs/implementation-plan.md` §1.

## Sources of truth

In order of precedence:

1. `Development_Take-Home_Assignment.md`: the employer's requirements.
2. `docs/spec.md`: product decisions, user journeys (J1–J10) and acceptance criteria (AC-*).
3. `docs/architecture.md`: technical decisions and their rationale.
4. `docs/implementation-plan.md`: phases, dependencies, definition of done (§3), and how each criterion is verified (§4, §7).

Planning notes the user shares are background only; the files above are canonical.

- Refer to requirements and decisions by ID or section (AC-N6, J9, architecture §6.6) instead of restating them.
- If documents conflict, or a requirement is ambiguous, stop and raise it: quote the passages, recommend a resolution and wait. By default the lower-ranked document is corrected to match.
- Approved decisions are settled, including those where the user chose differently from Claude's recommendation. Reopen one only for a concrete new problem, and ask first. Never change one silently; if a decision changes, update `docs/spec.md` or `docs/architecture.md` in the same commit.

## Phase workflow

Every phase follows this loop:

1. Read the current code and the documents relevant to the phase.
2. Write a detailed plan for the next phase only.
3. Discuss meaningful decisions and get the plan approved before writing code.
4. Build the phase as a vertical slice: backend, frontend and tests together.
5. Run the automated checks (below).
6. Verify the phase's user-facing acceptance criteria in the browser (below).
7. Review the work and resolve the findings.
8. Update the docs and README, and commit.
9. Get explicit approval of the phase before starting the next one.

Phases 4 and 5 add a checkpoint inside step 4: build the backend and its tests, review them, fix and commit, then build the frontend. It isn't a separate phase and has no plan or approval of its own.

**Automated checks.** Run everything that applies: backend and frontend tests, Ruff lint and format, ESLint, Prettier, type check and build, `makemigrations --check`, and confirming that regenerating `openapi.yaml` and the TypeScript types leaves no diff against the committed files. CI runs the same checks and must be green.

**Browser checks.** Verify user-facing criteria with Playwright MCP against the app at `http://localhost:5173`. If it can't verify a scenario reliably, flag the scenario for manual testing by the user; a tooling limitation never blocks a phase. Browser checks add to the automated tests and never replace them. Screenshots and browser test code are never committed.

**Reporting.** When closing a phase, report each acceptance criterion with its result, how it was verified, and any limitation still outstanding. The durable record is the Phase 6 checklist, `docs/acceptance-checklist.md`.

Never say a test or check passed unless it ran and you saw its output. State what was skipped, and why.

## Engineering guardrails

- Prefer the simplest design that meets the spec: DRF generic views and viewsets, no service or repository layers, no speculative abstractions.
- Build only the current phase. Work pulled into an earlier phase is exactly what plan §6 lists. The enhancements (AC-X1, AC-X2) wait for Phase 6, after the core is tagged.
- Use only the libraries and tools approved in architecture §3, each added in the phase that first needs it. Any other dependency, service or infrastructure needs approval.
- Authorization lives on the server (architecture §6.5, §6.6). Endpoints require login by default; public ones, such as the catalog, opt in and work without logging in. A logged-out request to a protected endpoint, or for personalized results (`has_notes=true`), gets 401; a failed CSRF check gets 403. A logged-in reader can list and create only their own notes on a book. Every notes query starts from the reader's own notes, so another reader's individual note returns 404 (AC-N6). A note's owner comes from the session and its book from the URL.
- Private data in the browser (architecture §8.5, AC-A8): private query keys go under the reader's `private` root, and every change of reader goes through the single session-transition function. One reader must never see another's notes, personalized results or unsaved draft.
- Add tests with each feature, prioritized as in architecture §9: authorization first.
- An API change means regenerating `openapi.yaml` and the TypeScript types and committing them with the change; regenerating again afterwards must produce no diff. Change them only through the generators, and never write API types by hand.

## Working with the user

- The user decides anything that changes scope, architecture, workflow or dependencies.
- Give a clear recommendation with its tradeoffs, not a neutral list of options. Keep explanations concise and technically grounded.
- Don't ask about details the documents already settle.
- When asking several questions, track the unanswered ones and return to them before raising new ones.
- Surface blockers early.
- Make no unrelated changes. Mention issues noticed outside the task instead of fixing them.

## Git and code style

- Commit messages: a short subject line, plus a body of a few lines only when the reason isn't obvious.
- Keep each commit to one logical change.
- Do not include AI attribution in commit messages or pull request descriptions, including co-author trailers or generated-by notices.
- Comment only where the code can't speak for itself: a constraint, a workaround, a security reason. No comments that restate the code, and no commented-out code.
- Let Ruff and Prettier handle formatting.
- Ask before pushing, force-pushing or rewriting history.
