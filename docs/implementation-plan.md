# Book Explorer: Implementation Plan

*Living document, last updated 2026-10-12 (Phase 6). Employer requirements: `Development_Take-Home_Assignment.md`. Product requirements: `docs/spec.md`. Technical design: `docs/architecture.md`.*

## 1. Purpose and how this plan is used

This document is the roadmap for building Book Explorer:
- the order of the phases
- what each phase delivers
- what each phase depends on
- which acceptance criteria it covers
- when it counts as done

It refers to requirements by their spec IDs (for example AC-N6, J9) and to design decisions by architecture section, rather than restating them. If this plan ever disagrees with the spec or the architecture, they win and this plan is corrected. The assignment takes precedence over all three.

**Planned one phase at a time.** This plan stays at the level of milestones. Each phase gets a detailed plan just before it starts, written from the codebase as it is then and from the approved documents. Every phase follows the same loop:

1. **Plan.** Write the phase's detailed plan and get it approved before any code is written.
2. **Build.** Build a vertical slice: backend, frontend and tests together.
3. **Verify.** Run the automated tests and quality checks, then the browser acceptance checks (§4).
4. **Review.** Review the work and resolve what it finds.
5. **Close.** Update the docs, commit, and explicitly approve the phase before the next one starts.

Phases 4 and 5 add a lightweight checkpoint inside step 2 (§9, D2):

1. Build the phase's backend and its tests.
2. Give the backend a focused review.
3. Resolve the findings and commit.
4. Continue with the frontend and integration.
5. Finish with the phase's normal verification, review, commit and approval.

The checkpoint isn't a separate phase. It has no detailed plan or formal approval of its own. The phase is still one vertical slice, and it's finished only after the frontend and backend are integrated and the acceptance criteria are verified.

**Status**

| Phase | Status |
|---|---|
| 0A Product discovery (`docs/spec.md`) | Complete |
| 0B Technical architecture (`docs/architecture.md`) | Approved 2026-10-10 |
| 0C Implementation roadmap (this document) | Approved 2026-10-10 |
| 0D Project instructions (`CLAUDE.md`) | Approved 2026-10-10 |
| 1 Foundation | Complete, approved 2026-10-11 |
| 2 Book discovery | Complete, approved 2026-10-11 |
| 3 Authentication | Complete, approved 2026-10-11 |
| 4 User-specific notes | Complete, approved 2026-10-12 |
| 5 Search, filtering and sorting | Complete, approved 2026-10-12 |
| 6 Visual design | In progress |
| 7 Final integration and delivery | Not started |

## 2. Phases at a glance

| Phase | Delivers | Depends on |
|---|---|---|
| 1 Foundation | A running skeleton, the dev proxy, tooling and CI, the API contract pipeline, the custom user model, a deny-by-default API | — |
| 2 Book discovery | Catalog models, the seed migration, public list and detail API and pages | 1 |
| 3 Authentication | 401 session authentication, login and logout, CSRF, a single session state, the private-data cache boundary, demo users | 1, 2 |
| 4 User-specific notes | Ownership-safe notes CRUD, paging, drafts at session boundaries | 2, 3 |
| 5 Search, filtering and sorting | Search and filters, author and genre endpoints, the filter controls, "Books with my notes", the full list state in the URL | 2, 3, 4 |
| 6 Visual design | A palette and shared styles, a tidier filter toolbar, a sticky header, styled cards, notes, states and login, and a genre panel that closes on an outside click | 1–5 |
| 7 Final integration and delivery | Core acceptance walkthrough, optional enhancements, README, clean-clone check, submission | 1–6 |

The order follows the dependencies:
- Notes need authentication and books.
- "Books with my notes" needs notes.
- The catalog needs neither.

No phase depends on a later one. A few foundations are built earlier than their feature, and a few acceptance criteria are finished across more than one phase (§6).

**Phase 0D (`CLAUDE.md`)** starts as soon as this plan is approved. It must be finished before the first commit, which is the first step of Phase 1.
- **Scope:**
  - persistent project instructions based on the approved documents
  - the commit and code-style rules the user has set:
    - short commit messages, never a wall of text
    - no AI attribution in commits or pull requests
    - code comments kept to a minimum, explaining only what isn't obvious from the code
  - how those rules are enforced
- **Enforcement options:**
  - **A rule in `CLAUDE.md`:** guidance Claude follows.
  - **A Claude Code hook:** rejects Claude's non-conforming `git commit` calls. It's Claude Code configuration, not a git hook.
  - **A CI check:** covers every commit, but adds tooling.
- A git `commit-msg` hook is ruled out, because architecture §9.4 says there are no pre-commit hooks and checks are enforced in CI.
- **Decided:** a rule in `CLAUDE.md`, plus Claude Code's `attribution` setting in the untracked `.claude/settings.local.json`. No hook and no CI check.

## 3. Definition of done for every phase

A phase is done when all of the following hold, in addition to the phase-specific criteria in §5:

1. Its detailed plan was approved before coding started.
2. Its tests pass, and so does every test from earlier phases.
3. Ruff (lint and format), ESLint, Prettier, the type check and the build are clean, and `makemigrations --check` reports nothing.
4. Every API change has regenerated `openapi.yaml` and the TypeScript types in the same commit.
5. Its acceptance criteria have been verified, each with the method suited to it (§4, §7). User-facing behaviour is checked in the running app through `:5173`: with Playwright MCP where possible, and by manual testing otherwise. The results are recorded.
6. The README and docs reflect what changed. If a decision in `docs/spec.md` or `docs/architecture.md` changed, that document is updated in the same commit.
7. CI is green.
8. It has been reviewed, committed and explicitly approved.

**Dependencies are added in the phase that first uses them.** Nothing beyond the libraries and tools approved in architecture §3 is added without explicit approval.

## 4. How acceptance is verified

| Layer | What | Where it runs | Role |
|---|---|---|---|
| Backend tests | Django's test runner with DRF `APITestCase` (architecture §9.1), including the migration tests for creating, rolling back and reapplying the seed | Locally and in CI | Catches regressions in authorization, security behaviour, validation, database integrity, API behaviour, queries and migrations |
| Frontend tests | Vitest, React Testing Library and MSW (architecture §9.2) | Locally and in CI | Catches regressions in the API client, the 401 rule, private data and drafts at authentication boundaries, failed note changes, and URL state |
| Contract checks | Regenerating `openapi.yaml` and the TypeScript types produces no diff (architecture §7.7) | Locally and in CI | Keeps the frontend's types in line with the API |
| Browser checks | Claude Code drives the running app through **Playwright MCP**: navigating, clicking, typing, reading the accessibility tree, taking screenshots, using more than one tab | Claude Code session, against the local dev servers | Verifies the applicable user-facing acceptance criteria in each phase and in the Phase 7 checklist, whenever technically possible |
| Manual testing | The user, in the running app | The running app | Usability, visual polish, and scenarios Playwright MCP can't verify reliably |

- **The automated tests are mandatory in every phase.** Browser checks add to them; they never replace them.
- **This is not an automated end-to-end test suite.**
  - No browser test code is committed, nothing browser-based runs in CI, and reviewers install nothing extra.
  - Architecture §9.3 still holds. Its acceptance walkthrough is carried out through Playwright MCP where possible, and by hand otherwise.
  - §9.3 gets a one-sentence note saying so in Phase 1, when the tool is set up.
- **Playwright MCP is configured at local scope** (`claude mcp add`), outside the repository. The repo and reviewer setup are unchanged. `CLAUDE.md` and the README describe how verification was done.
- **When Playwright MCP falls short.** If a tooling limitation means Playwright MCP can't reliably verify a scenario, that scenario is flagged for manual verification and recorded as such. A tooling limitation alone never blocks a phase; the scenario is still verified, by hand.
- **Results are recorded per criterion:**
  - passed or failed
  - the method used
  - any limitation still outstanding

  Screenshots are working material and are never committed.
- **Known limits of browser checks:**
  - A browser check is a one-off observation, not a regression test. The automated tests remain the safety net.
  - The session re-check when a tab regains focus (architecture §8.5) may not fire reliably in a browser driven by automation. The two-tab AC-A8 cases that rely on it are expected to need manual verification.
  - Visual polish, and how the app feels to use, need a person's judgment.

## 5. Phases

### 5.1 Phase 1 — Foundation

**Objective.** A complete skeleton with no features. Both servers run and talk through the proxy, and every quality tool runs, so Phase 2 starts with feature work only.

**Deliverables**

- **Repository:**
  - `git init`
  - the first commit holds the approved Phase 0 documents, before any code
  - `backend/`, `frontend/` and `docs/` directories, and `.gitignore`
  - a private GitHub repository
- **Backend:**
  - venv, with `requirements.txt` and `requirements-dev.txt` pinned to exact versions
  - the Django 5.2 project in `config/`, with `SECRET_KEY` and `DEBUG` read from environment variables
  - the `accounts` app: the custom `User` model (architecture §5), `AUTH_USER_MODEL`, the initial migration, and the user admin
  - DRF defaults (architecture §4):
    - `IsAuthenticated` by default
    - JSON-only request bodies
    - the drf-spectacular schema class
    - no global pagination
  - drf-spectacular serving `/api/schema/` and `/api/docs/`
  - Ruff and coverage.py configuration
- **Frontend:**
  - Vite, React 19 and strict TypeScript; the build runs `tsc` before `vite build`
  - ESLint and Prettier
  - SCSS modules and the shared `styles/` partials
  - a react-router-dom v7 app shell
  - the Vite proxy from `/api` to `:8000`
  - Vitest and React Testing Library, proven by a smoke test
- **API contract pipeline (architecture §7.7):**
  - a command that exports the committed `openapi.yaml`
  - an openapi-typescript script that generates the committed TypeScript types
  - both proven end to end before any feature endpoint exists
- **CI (GitHub Actions)** with the jobs in architecture §9.4, including the drift checks for the schema and the types.
- **README skeleton** with local setup instructions.
- **Playwright MCP**, configured at local scope for Claude Code (§4), plus the note in architecture §9.3.
- **The open items in architecture §10, settled and recorded in `docs/architecture.md`:**
  - exact version pins, including the Node version
  - where the schema file lives
  - the Swagger UI asset source
  - the Sass package
  - how the Vite proxy handles `Host`

**Depends on.** Nothing. The custom user model is the one ordering constraint that can't move: it has to exist before the first `migrate`.

**Acceptance criteria.** None directly. This phase puts in place the architecture's ground rules that later criteria depend on:
- the custom user model
- deny-by-default permissions
- a single origin in development
- the API contract pipeline

**Done when**

- On a clean clone, following the README:
  - the backend migrates and runs
  - `npm ci` and the dev server run
  - `:5173` serves the app shell
- `:5173/api/docs/` loads through the proxy. Both checks are made through Playwright MCP, which also proves the browser-verification setup.
- `createsuperuser` and an admin login work with the custom user model.
- Both test runners pass their smoke tests.
- Regenerating the schema and the types produces no diff.
- CI is green on GitHub.

**Sequencing**

- Deny-by-default comes before any endpoint exists, so every public endpoint has to opt in deliberately (architecture §6.6).
- Left out on purpose, because each arrives with its first use:
  - the `catalog` and `notes` apps
  - the 401 authentication class
  - the pagination class
  - the API client
  - TanStack Query, django-filter and MSW

### 5.2 Phase 2 — Book discovery

**Objective.** A visitor browses the paginated catalog and opens any book (J1), backed by the seed data migration.

**Deliverables**

- **Backend:**
  - the `catalog` app with the **complete** catalog schema from architecture §5:
    - Author `name` and `sort_name`
    - Genre
    - Book
    - unique `(title, author)`
    - `PROTECT` on author and genre
  - admin for books, authors and genres
  - the seed migration (spec §5.2, architecture §5):
    - 100 curated books, each checked against a documented source
    - uses historical models
    - reversible as AC-M2 describes
    - the forward step reuses authors and genres that survived a rollback
  - `GET /api/books/` and `GET /api/books/{id}/`, explicitly public
  - the strict page-number pagination class (architecture §7.4, §7.5):
    - `page_size` from 1 to 100; invalid values give 400
    - a page out of range gives 404
  - a fixed default order: title ignoring case, then id
  - the schema and types regenerated with these first real endpoints
- **Frontend:**
  - the API client for reads, built on the generated types (architecture §8.3):
    - JSON
    - `ApiError` and a separate network-error type
    - the abort signal
    - query strings built with `URLSearchParams`
  - TanStack Query, with public query keys
  - Layout and Header, without authentication controls yet
  - the book list:
    - 12 per page
    - page number in the URL
    - a "This page doesn't exist" view with a link to page 1
  - a controlled `Pagination` component
  - the book detail page:
    - a non-numeric id shows "Book not found" without calling the API
    - an API 404 shows the same view
  - the "Page not found" route
  - loading, error-with-retry and empty states
- **README:** a description of the dataset and how it was verified.

**Tests**

- Seed:
  - the 100 seeded books exist after migrating
  - a rollback round trip: seeded books are removed, a book added outside the seed by a seeded author is kept along with that author, and migrating forward again reuses the author
- List and detail return 200 to a visitor; an unknown id returns 404.
- Pagination: page sizes work, an invalid `page_size` gives 400, a page out of range gives 404.
- Books with tied titles come back in a stable order across pages.
- `PROTECT` on author and genre.
- The list takes the same number of queries for 3 books as for 30.
- Frontend: the API client's error mapping. MSW is introduced here.

**Depends on.** Phase 1.

**Acceptance criteria.**
- Built and verified here: AC-L1–L4, AC-D1, AC-D2, AC-D4, AC-M1, AC-M3.
- Started here and finished later:
  - AC-D3: the page only; finished in Phase 5
  - AC-M2: the catalog side; finished in Phase 4
  - AC-M4: the README section; final pass in Phase 7
- J1, for the page number.

**Done when**

- A visitor can page through all 100 books, and direct links and refreshes work.
- Rolling back the seed and migrating forward again has been run.
- Every seed entry has been checked against the documented source.

**Sequencing**

- **Catalog schema before the seed.** The catalog schema is finished before the seed, so the seed is the catalog's last migration when the notes migration is generated (architecture §5).
- **Curate the data first.** Curating it is the longest task in this phase. The verification source is chosen in the Phase 2 plan.
- **Fixed default order now.** Pagination ships before sorting, so the default order has to be fixed from the start or pages could repeat or skip books.
- **`Pagination` stays controlled.** It takes the page in and reports changes out, so the notes section can reuse it with a page held in component state. The list page owns the binding to the URL.
- **List state in one place.** It's read and written in one place, so Phase 5 extends it instead of rewriting it.

### 5.3 Phase 3 — Authentication

**Objective.** Readers log in and out, and a login survives a refresh. The app has one source of truth for who is logged in, one rule for 401 responses, and a private-data boundary in place before any private data exists.

**Deliverables**

- **Backend:**
  - the `SessionAuthentication` subclass that returns 401, set as the DRF default (architecture §6.5)
  - the auth endpoints (architecture §6.7):
    - `GET /api/auth/session/`: ensures the CSRF cookie is set
    - `POST /api/auth/login/`: CSRF enforced explicitly, one generic 400 error, deactivated users rejected
    - `POST /api/auth/logout/`: CSRF enforced explicitly, always 204
  - schema annotations for these endpoints and for the authentication class
  - the demo-user command (spec §5.4)
- **Frontend:**
  - the API client adds `X-CSRFToken` to POST, PATCH and DELETE, reading the cookie each time
  - the session query and `useAuth`, with a startup loading state, so a logged-in reader never sees the logged-out header
  - **one session-transition function**, the only owner of authentication state. Login, logout, any 401 and the re-check on regaining focus all go through it (architecture §8.5).
  - global 401 handlers on the query and mutation caches: they mark the reader as logged out and never redirect
  - **the private-data cache boundary** (architecture §8.5):
    - private query keys follow `['private', readerId, …]`
    - private queries run only while a reader is logged in
    - whenever the reader changes, the session function cancels in-flight private queries and removes everything under the `private` root; public data stays cached
  - the login page:
    - submit disabled until both fields are filled
    - one generic error
    - the return target passed in router state (architecture §8.6)
    - a redirect to the catalog if the reader is already logged in
  - the Header, showing the username and Log out, or Log in
- **README:**
  - the demo users, documented as development-only, with the credentials and a production warning
  - `createsuperuser`

**Tests**

- Login:
  - valid and invalid logins
  - a wrong password and an unknown username give identical errors
  - a deactivated user can't log in
- CSRF is enforced on login and logout (`APIClient(enforce_csrf_checks=True)`).
- The session endpoint returns the documented shapes.
- Logout deletes the session on the server: the old cookie afterwards gets `{"user": null}`.
- The catalog is still public under the new authentication class.
- The demo-user command meets AC-U1–U3, including leaving alone an existing user whose password was changed.
- Frontend:
  - the CSRF header
  - a 401 marks the reader as logged out
  - the boundary removes private entries on logout, on login and on a 401, and keeps public entries

**Depends on.**
- Phase 1: the custom user model and the proxy's `Host` handling.
- Phase 2: the layout, and pages to return to after login.

**Acceptance criteria.**
- Built and verified here: AC-A1–A4, AC-A6, AC-U1–U3.
- Started here and finished later:
  - AC-A5: the server side here; Phase 4 shows that an old cookie is rejected by the notes API
  - AC-A7: the 401 mechanism here; the notes API in Phase 4
  - AC-A8: the cache boundary here; private data and drafts in Phases 4 and 5
  - AC-U4: the README section; final pass in Phase 7
- Re-checked: AC-L3, under the new authentication class.
- J3, from the header. J8 and J10 in part.

**Done when**

- Logging in as `alice` works through `:5173`, which proves that CSRF and the proxy work together.
- A refresh keeps the login, and logging out ends the session on the server.
- Running the demo-user command twice is harmless.

**Sequencing**

- **Login is the first unsafe request.** That makes it the first proof of the proxy's `Host` handling chosen in Phase 1 (architecture §6.2).
- **401 before any login-required endpoint.** The switch from 403 to 401 happens before any endpoint needs a login, so no endpoint ever ships answering 403 for logged-out requests.
- **The cache boundary comes before private data.** Notes (Phase 4) and "Books with my notes" (Phase 5) only add queries under the `private` root; they never change the clean-up.
- **Draft rules wait for Phase 4.** Note forms are the only drafts.

### 5.4 Phase 4 — User-specific notes

**Objective.** The primary feature. A reader keeps a private, paginated journal of notes for each book. Notes are ownership-safe from the database to the screen, and they behave correctly when a session ends or the reader changes.

**Deliverables**

- **Backend:**
  - the `notes` app and the Note model (architecture §5):
    - `user` → `CASCADE`, `book` → `PROTECT`
    - check constraints
    - the composite index
    - `edited_at`, set by the model only when the text or page actually changes
  - the notes migration
  - the notes admin: deleting a book with notes is refused, and admin lists the notes that block it
  - `GET` and `POST /api/books/{id}/notes/`:
    - owner-filtered
    - newest first: `created_at`, then id
    - 20 per page with the shared pagination class
    - 404 for an unknown book
  - `GET`, `PATCH` and `DELETE /api/notes/{id}/`:
    - owner-filtered, so another reader's note returns 404
    - PUT returns 405
  - the serializer:
    - trims the body and rejects a body of only whitespace
    - accepts a page from 1 to 10,000, or null
    - takes the owner from the session and the book from the URL
    - ignores `user` and `book` in the request body
  - schema annotations for the 401 and 404 responses
- **Frontend:**
  - the notes API module and its query and mutation hooks. These are the first private queries, and they use the Phase 3 key convention and clean-up from the start.
  - the notes section for readers; for visitors, a "Log in to add notes" prompt that returns them to the same book
  - the note form, used for both creating and editing:
    - limits mirrored on the client
    - Save disabled while saving
    - DRF field errors shown next to their fields
  - each note shows:
    - its text as plain text, with line breaks kept
    - a "p. N" label when it has a page
    - when it was created
    - an "edited" marker with the edit time
  - delete confirmation with the native `<dialog>`
  - the notes page held in component state, behaving as AC-N13 describes
  - a note deleted elsewhere: the reader is told, and the list refreshes
  - draft rules added to the session function (architecture §8.5):
    - drafts are kept after a 401, or a re-check that finds nobody
    - drafts are discarded after a logout in this tab or any login, by remounting the notes section

**Tests**

- **Authorization matrix** (architecture §6.6). Operations on a book's notes act on the requesting reader's own notes. Operations on one specific note answer 404 to anyone but its owner.

  | Operation | Visitor | Logged-in reader |
  |---|---|---|
  | List a book's notes | 401 | 200, only that reader's notes |
  | Create a note on a book | 401 | 201, owned by the logged-in reader |
  | Read another reader's note | 401 | 404 |
  | Edit another reader's note | 401 | 404 |
  | Delete another reader's note | 401 | 404 |

  - On their own note, the owner gets 200 for read, 200 for edit and 204 for delete.
  - **No unauthorized request changes data:**
    - a visitor's create attempt creates nothing
    - when a visitor or another reader tries to edit or delete a note, the note stays unchanged in the database
  - A 404 for another reader's note looks exactly like the 404 for a note that doesn't exist (AC-N6).
  - Another reader's notes on the same book never appear in a list, and change neither `count` nor the page boundaries.
  - The owner always comes from the session. `user` and `book` in the request body are ignored (AC-N7).
  - An unknown book returns 404 for both list and create (AC-N8).
- **Security:**
  - CSRF is enforced on note writes
  - an old session cookie gets 401 from the notes API after logout
- **Validation:**
  - body rules
  - page rules, including `null` clearing the page
  - `edited_at` stays empty on create and is set only on a real change
- **Paging:**
  - 21 notes make pages of 20 and 1
  - ties on `created_at` keep a fixed order
  - a page out of range gives 404
  - an invalid `page_size` gives 400
- **Delete rules:**
  - deleting a book that has notes is refused
  - deleting a user removes only that user's notes
- **AC-M2 round trip, extended:** rolling back the seed also unapplies the notes migrations, so the notes table no longer exists.
- **Frontend:**
  - an unsaved note form survives a 401 (AC-N12)
  - the AC-A8 note scenarios in architecture §9.2:
    - Alice gets a 401 and Bob logs in; checked both while Bob's requests are pending and after they finish
    - a late response for Alice doesn't reappear for Bob
    - a draft is discarded when a re-check finds Bob
    - logging out discards the draft
    - the public catalog stays cached
  - failed note changes (AC-N9), with MSW returning error responses:
    - a failed create shows an error and keeps the entered text and page in the form
    - a failed edit shows an error and keeps the unsaved changes
    - a failed delete shows an error and leaves the note visible
    - a failed operation is never shown as successful
  - notes paging (AC-N13)
  - double-submit protection (AC-N2)

**Checkpoint** (§1). The model, migration, admin, endpoints and every backend test above get a focused review, and the findings are resolved and committed, before UI work starts.

**Depends on.**
- Phase 2: Book, the seed, the detail page, and the pagination class and component.
- Phase 3: the 401 class, the session function with its cache boundary, the CSRF header, and the return after login.

**Acceptance criteria.**
- Built and verified here: AC-N1–N13.
- Finished here: AC-A5, AC-A7, AC-M2.
- AC-A8 for notes and drafts.
- Journeys:
  - J4, J5, J6 and J9
  - J10 finished
  - the notes part of J8
- Spec §6 edge cases:
  - a note deleted in another tab
  - authentication expiring while writing
  - an administrator deleting a book that has notes

**Done when**

- The authorization matrix is complete and green.
- `alice` and `bob` see separate notes in the running app.
- An open draft survives a session ending on its own, for example a logout in another tab.
- Admin refuses to delete a book that has notes.
- Swagger UI's "Try it out" works for note writes while logged in.

**Sequencing**

- **Authorization is proven first.** The checkpoint means the UI is built on an API whose authorization has already been reviewed.
- **The notes migration waits for the seed.** It's generated only once the seed migration is final, because its dependency on the seed is the behaviour AC-M2 documents.

### 5.5 Phase 5 — Search, filtering and sorting

**Objective.** Visitors and readers find books by search, author and any of several genres. Readers can also show only the books they've written notes on. The list is sorted and paginated, and the whole view lives in the URL.

**Deliverables**

- **Backend:**
  - django-filter
  - the book FilterSet (architecture §7.5, §7.6):
    - `search`: several terms over title and author, at most 100 characters, `%` and `_` matched literally
    - `author`: an id
    - `genre`: repeated ids combined with OR
    - `has_notes`: an `EXISTS` subquery; 401 for visitors
    - `sort`: six values, ignoring case, with tiebreakers
  - `GET /api/authors/`: `search`, and `limit` from 1 to 20 (default 10). It returns only authors with books, ordered by `sort_name` then id, as a plain list.
  - `GET /api/authors/{id}/`
  - `GET /api/genres/`: only genres with books, by name, as a plain list
  - malformed values return 400 and never 500; unknown parameter names are ignored
  - schema annotations for the repeated `genre` parameter and the author `limit`
- **Frontend:**
  - the Phase 2 list-state module, extended to every list parameter (architecture §8.7):
    - search text goes into the URL after a 300 ms pause and replaces the current history entry
    - the author
    - the genres, sorted and deduplicated
    - `has_notes`
    - the sort
    - the page
  - changing a filter or the sort resets the page and adds a history entry
  - the controls (architecture §8.8):
    - the search box
    - the author combobox: loading, no-match and error states; restores the selected author's name from `?author=`
    - the genre multiselect
    - the sort `<select>`
    - the "Books with my notes" toggle, for readers only
    - Clear all
  - empty states, including the explanation for a reader with no notes
  - the "This link contains invalid filters" view
  - for visitors, `has_notes` is removed by replacing the history entry; logging out also drops it
  - **book-list query keys:** one function decides whether a list is public or private. A `has_notes` list goes under the reader's `private` root.

**Tests**

- **Backend** (architecture §9.1 item 4):
  - every filter, alone and combined
  - several genres combined with the other filters
  - searches with several words
  - literal `%` and `_`
  - case-insensitivity
  - every sort, in both directions
  - ties across pages
  - author suggestions
  - bad input gives 400, and unknown parameters are ignored
- **`has_notes`:** 401 for a visitor; `alice` and `bob` each see only their own books.
- **Query efficiency:** the query count stays constant with `has_notes`.
- **Frontend:**
  - `has_notes` is removed for visitors
  - changing a filter returns to page 1
  - several genres survive a reload and back/forward
  - search debouncing
  - the author selector: debounced suggestions, keyboard selection, restoring the selection from `?author=`
  - the AC-A8 scenarios for `has_notes` lists

**Checkpoint** (§1). The FilterSet, the author and genre endpoints, and their backend tests get a focused review, and the findings are resolved and committed, before UI work starts.

**Depends on.**
- Phase 2: the list, pagination and the list-state module.
- Phase 3: authentication, for the 401 on `has_notes`.
- Phase 4: the Note model, for the `EXISTS` subquery.

**Acceptance criteria.**
- Built and verified here: AC-S1–S10.
- Finished here: AC-D3, and AC-A8 for the core.
- Journeys: J2 and J7; J1 and J8 finished.
- Spec §6 edge cases:
  - a visitor opening a `has_notes` link
  - a reader with no notes turning the filter on

**Done when**

- Every combination of filters survives a refresh, back/forward and a shared link.
- `alice` and `bob` opening the same `has_notes` URL each see their own books, and a visitor gets the public catalog.

**Sequencing**

- **Existing URLs keep working.** Phase 2's default order becomes `sort=title`, and URLs from before behave exactly as they did.
- **`has_notes` stays in one FilterSet method.** It is the catalog's only dependency on notes (architecture §2).

### 5.6 Phase 6 — Visual design

**Objective.** Give the finished core a deliberate, consistent look, without changing what it does except where an item below says so.

**Ground rules**

- No new dependencies: SCSS modules, the shared variables, the system font stack and inline SVG icons (architecture §3). No dark theme.
- Nothing behaves differently unless an item deliberately changes it, and each such change has a test.
- Markup changes stay small, so the tests keep finding elements by role and accessible name.
- Text meets WCAG AA contrast, the edges of controls reach 3:1 (WCAG 1.4.11), and keyboard focus stays visible and is never hidden under the header (WCAG 2.4.11).
- The layout works at phone width. Book cards stay text only (spec §3).

**Deliverables**, in build order

- **Design variables:** a palette (an ink-blue header `#1d3346`, a teal accent `#0b6e69`, an amber mark `#e9b44c`, a warm paper background `#f8f6f1`, and tints for badges and states), a type scale, shadows, corner radii and one control height. They live in `_variables.scss`, with shared mixins.
- **Controls and buttons:** one style for every input, the select and the Genres button; default, primary, danger and text buttons; consistent hover, focus and disabled states.
- **Filter toolbar:** the controls in one aligned panel that wraps on narrow screens. The sort is a field `<select>` and a button that flips the direction (the sort decision below).
- **Author and search fields:** the author's Clear button becomes an × inside the field. It stays a real button named "Clear author" and still returns focus to the input. The search box's native × is restyled to match; Firefox shows none.
- **Genre filter:** styled as a dropdown with a chevron. The panel also closes on a click outside it, or when focus leaves the control.
- **Header:** sticky, with a wordmark and the account controls. `scroll-padding-top` keeps a focused element clear of it. No footer.
- **Book list:** refined cards, each clickable as a whole, with one badge colour for every genre.
- **Detail page:** one column, the book's facts as chips, notes as cards with quiet Edit and Delete buttons, and a styled delete dialog.
- **States and login:** styled loading, empty, error and not-found views, and a styled login page. No skeleton loaders.
- **Finishing touches:** a book favicon in place of Vite's, a checkbox accent colour, short transitions that respect reduced motion, and balanced wrapping for titles.

**Sort decision.** The user judged the restyled sort `<select>` in the browser once the toolbar was built, and didn't keep it (2026-10-12). The sort is a field `<select>` (Title, Author, Year) plus one button that flips the direction, shown as an up or down arrow and named "Ascending" or "Descending". The URL's `sort` values don't change. Both controls have tests, and architecture §8.8 describes them.

**Tests**

- **Genre filter:** a click outside closes the panel, focus leaving the control closes it, and moving between checkboxes or clicking inside keeps it open.
- **Browser only**, because jsdom has no layout: clicking anywhere on a card opens the book, and a focused element is never hidden under the sticky header.
- Every existing test still passes. A query broken by a markup change is updated deliberately, never loosened.

**Depends on.** Phases 1–5: it styles finished screens.

**Acceptance criteria.** None new. Every criterion verified so far still holds. The user judges the look by hand (§9, D4).

**Done when**

- Every view is checked in the browser at 1280 px and 390 px, logged out and as a reader.
- Architecture §8.8 and §10, and the README, describe the shared styles, the palette's contrast ratios and the genre panel's closing rule.

**Sequencing**

- The variables and control styles come first; every other item uses them.
- The toolbar comes next, so the sort decision is made early.

### 5.7 Phase 7 — Final integration and delivery

**Objective.** Prove the whole application meets the spec on a clean machine, finish the documentation, and submit.

**Steps, in order**

1. **Core acceptance.**
   - Write `docs/acceptance-checklist.md`. It covers J1–J10 and every core acceptance criterion, including the two-tab AC-A8 cases.
   - Verify each item with the method suited to it (§4, §7). Playwright MCP alone doesn't verify the checklist:
     - **backend tests:** authorization, validation, database integrity and API behaviour
     - **migration tests:** seed creation, rollback and reapplication
     - **contract checks:** the OpenAPI schema and the generated TypeScript types agree
     - **Playwright MCP:** applicable user-facing behaviour in the browser
     - **manual testing or inspection:** usability, documentation, and scenarios browser automation doesn't cover reliably
   - Record each item's result and method, and any limitations still outstanding.
   - Fix whatever fails.
   - Commit and tag the core, so a submittable version exists before any optional work.
2. **Enhancements (optional).** Start only after step 1 passes. Each one can be dropped on its own.
   - **AC-X2 first:** the author link on the detail page.
   - **Then AC-X1, per-reader note counts:**
     - every book list a reader fetches becomes private
     - the counts are computed in the list query
     - the public-or-private key decision from Phase 5 changes
     - the AC-A8 tests and checklist rows are run again, along with a query-count test for the counts
3. **Delivery.**
   - **Complete the README:**
     - every section the assignment requires
     - the TypeScript deviation and the 401 decision
     - the draft-loss tradeoff (spec §6)
     - known limitations
     - the coverage report
     - development-only warnings
     - Swagger UI
     - how acceptance was verified
   - **Docs match what was built:** confirm that the spec, architecture and this plan describe the finished app.
   - **Clean clone:** follow the README word for word from a fresh clone.
   - **Submit:** get CI green on the final commit, push, and give reviewers access.

**Depends on.** Phases 1–6.

**Acceptance criteria.** All of them, verified end to end. AC-M4 and AC-U4 in their final form. AC-X1 and AC-X2 if built.

**Done when**

- The checklist passes, and its results, methods and any outstanding limitations are recorded.
- A clean clone works exactly as the README describes.
- CI is green on the final commit.
- The repository is pushed and reviewers can access it.

## 6. Cross-phase dependencies

These items are built earlier than the feature they serve, or finished across more than one phase.

| Item | Where | Why |
|---|---|---|
| Custom user model and user admin | Phase 1 | Has to exist before the first migration (architecture §5) |
| Deny-by-default permission | Phase 1 | Each public endpoint then opts in deliberately |
| API contract pipeline and its drift checks | Phase 1 | Proven on a clean machine before any endpoint depends on it |
| Complete catalog schema | Phase 2 | The seed should be the catalog's last migration when notes are added |
| Strict pagination class and controlled `Pagination` component | Phase 2 | Reused by notes in Phase 4 |
| Fixed default order | Phase 2 | Pagination ships before sorting |
| One list-state module | Phase 2 | Extended in Phase 5 |
| Proxy `Host` handling | Decided in 1, proven in 3 | Login is the first request that is checked for CSRF |
| Session-transition function and private-data cache boundary | Phase 3 | Phases 4 and 5 only add private queries, plus Phase 4's draft rules |
| AC-M2 | Phase 2 → 4 | The notes table must exist before its removal can be tested |
| AC-A5, AC-A7 | Phase 3 → 4 | Need an endpoint that requires login |
| AC-A8 | Phase 3 → 4 → 5 (→ AC-X1) | Private data arrives in stages |
| AC-D3 | Phase 2 → 5 | The full list state arrives in Phase 5 |

## 7. Acceptance criteria by phase

How each criterion is verified:
- **BE:** backend tests
- **FE:** frontend tests
- **Browser:** Playwright MCP check (§4)
- **Manual:** manual testing by the user
- **README:** documentation

Where a criterion spans phases, it is finished in the last phase listed.

| Criteria | Phase | Verified by |
|---|---|---|
| AC-L1, AC-L2, AC-D1, AC-D4 | 2 | Browser |
| AC-L3 | 2, re-checked in 3 | BE, Browser |
| AC-L4, AC-D2 | 2 | BE, Browser |
| AC-D3 | 2 → 5 | FE, Browser |
| AC-M1 | 2 | BE |
| AC-M2 | 2 → 4 | BE |
| AC-M3 | 2 | BE (round trip), review |
| AC-M4 | 2 → 7 | README |
| AC-A1, AC-A3, AC-A4, AC-A6 | 3 | Browser |
| AC-A2 | 3 | BE, Browser |
| AC-A5 | 3 → 4 | BE |
| AC-A7 | 3 → 4 | BE, FE, Browser |
| AC-A8 | 3 → 4 → 5 | FE, Browser (two tabs), Manual (focus re-check) |
| AC-U1–U3 | 3 | BE |
| AC-U4 | 3 → 7 | README |
| AC-N1, AC-N6, AC-N7, AC-N8 | 4 | BE |
| AC-N2 | 4 | BE, FE |
| AC-N3, AC-N4 | 4 | BE, Browser |
| AC-N5, AC-N10, AC-N11 | 4 | Browser |
| AC-N9 | 4 | FE, Browser |
| AC-N12 | 4 | FE, Browser |
| AC-N13 | 4 | BE, FE |
| AC-S1, AC-S2, AC-S4, AC-S8 | 5 | BE |
| AC-S3 | 5 | BE, FE |
| AC-S5 | 5 | BE, FE, Browser |
| AC-S6, AC-S9 | 5 | FE |
| AC-S7 | 5 | Browser |
| AC-S10 | 5 | BE, FE, Browser |
| AC-X1 (optional) | 7 | BE (query count), FE, Browser |
| AC-X2 (optional) | 7 | Browser |

**User journeys**

| Journey | Phase |
|---|---|
| J1 | 2, finished in 5 |
| J2, J7 | 5 |
| J3 | 3 (the "Log in to add notes" prompt in 4) |
| J4, J5, J6, J9 | 4 |
| J8 | 3 → 4 → 5 |
| J10 | 3 → 4 |

Every journey is walked through end to end in Phase 7.

**Other core items** (spec §3)
- Django admin: books in Phase 2, notes in Phase 4.
- Loading, empty and error states: in every phase that loads data.
- Automated backend tests: in every phase.

## 8. Risks that shape this plan

| Risk | Consequence if ignored | Mitigation in this plan |
|---|---|---|
| The private-data boundary (AC-A8) is built across Phases 3–5, and AC-X1 changes it | One reader's notes or results reach the next reader | The session function and cache boundary are built in Phase 3, before any private data exists. One function decides whether a book list is public or private. The AC-A8 tests are extended in every phase that adds private data. |
| Curating 100 accurate books is slow, and accuracy is a requirement | Phase 2 stalls, or wrong data ships | Curation starts first in Phase 2. The verification source is chosen in its plan and recorded in the README. |
| Shortcuts taken in Phase 2 | Rework in Phases 4 and 5 | The pagination class and component, the list-state module and the default order are built once, for their later users |
| The schema and generated types drift apart | The frontend compiles against an API that no longer exists | The pipeline and CI drift checks exist from Phase 1, and every API change regenerates both |
| Phases 4 and 5 are large | Authorization bugs found late, after UI is built on them | A backend checkpoint inside each phase |
| Optional work destabilizes the core | A broken submission | Enhancements come only after a verified, tagged core |
| The visual pass changes behaviour or markup the tests rely on | Regressions hidden behind a new look | Phase 6 changes behaviour only where an item says so, each with a test; markup changes stay small, and tests keep finding elements by role and name |

## 9. Decisions recorded in this plan

| ID | Decision | Why |
|---|---|---|
| D1 | A private GitHub repository with GitHub Actions from Phase 1, including the schema and type drift checks. Every phase is approved on a green CI run. In Phase 7 the repository is shared with reviewers or made public. | Clean-machine problems (a missing pin, a forgotten migration, stale types) show up in the phase that causes them, not at submission |
| D2 | Phases 4 and 5 each have one detailed plan and one approval. Each includes a lightweight backend checkpoint before any UI work: a focused review, then fixes and a commit. The checkpoint has no plan or approval of its own (§1). | Authorization and query correctness are reviewed before UI is built on them, without turning each phase into two |
| D3 | Enhancements are an optional step in Phase 7, after the core checklist passes and the core is tagged. AC-X2 comes before AC-X1. | A submittable core exists before any optional work. AC-X1 goes last because it changes the private-data boundary. |
| D4 | In each phase and in the Phase 7 checklist, Claude Code verifies the applicable user-facing acceptance criteria through Playwright MCP whenever technically possible, and records the results. The user also tests by hand, especially usability, visual polish and scenarios flagged as not reliably verifiable by automation. A tooling limitation is flagged, never treated as a blocker. | User-facing behaviour is checked in a real browser without maintaining an end-to-end suite, and people cover what automation can't judge |
| D5 | Playwright MCP is configured at local scope, outside the repository | The repository and reviewer setup stay unchanged |
| D6 | Each phase is built on its own branch (`phase-N-<name>`) with a pull request that runs CI. After the phase is approved, the user merges it with GitHub's merge button, never squashing. | The user reviews each phase's diff on GitHub, and `main` only ever holds approved phases. Every commit is kept, each merge commit marks where a phase ends, and CI runs on the pull request and again on `main` |
| D7 | A visual design phase (Phase 6) comes after the core features and before final integration, which becomes Phase 7. Its scope was agreed on 2026-10-12 (§5.6). | The core was built with plain styling; the look now matters for the submission. Because it comes before the acceptance walkthrough, the final checklist verifies the app as it is submitted. |

## 10. Deferred to phase planning

Left open on purpose. Each item is decided in the detailed plan for the phase named.

- **Phase 0D:** how the commit and code-style rules (§2) are enforced. Decided; see §2.
- **Phase 1:** settled.
  - Exact versions, including Node, are recorded in architecture §10.
  - Playwright MCP is `@playwright/mcp` 0.0.83, driving the system Google Chrome with an isolated profile.
  - Nothing besides code and the docs is committed. The employer's brief and the Phase 0 working notes stay out of the repository; the docs cite the brief by filename.
- **Phase 2:** settled.
  - The seed books are checked against English Wikipedia (architecture §5); the README describes the dataset.
  - The seed data sits inline in the migration (architecture §5).
- **Every phase:**
  - names of modules, components and hooks below the structure in architecture §8.2
  - wording of UI copy and error messages
  - exact test cases beyond the priorities in architecture §9
- **Phase 6:** settled.
  - The type scale, shadows and tints are in `styles/_variables.scss`, and their contrast ratios in architecture §8.8.
  - The shared mixins live in `styles/_mixins.scss`. A component chooses a button style by including a variant in its own module class (architecture §8.8).
  - The restyled sort `<select>` wasn't kept. The sort is a field `<select>` and a direction button (§5.6, architecture §8.8 and §10).
- **Phase 7:**
  - the format of the acceptance checklist
  - whether the repository is made public or shared privately with reviewers
