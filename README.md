# Book Explorer

A Django REST Framework backend and a React (TypeScript) frontend for browsing a book catalog, with private notes for each reader. It's a take-home assignment, built in phases. This README grows with each phase. The design is documented in [`docs/`](docs/).

## Requirements

- **Python 3.12.** On Ubuntu or Debian, also install `python3.12-venv` (`sudo apt install python3.12-venv`). Without it, `python3.12 -m venv` fails.
- **Node.js 24 LTS.** The version is in `frontend/.nvmrc`; with nvm, run `nvm use` in `frontend/`.

## Backend setup

```bash
cd backend
python3.12 -m venv .venv         # Windows: py -3.12 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py create_demo_users
python manage.py runserver
```

`create_demo_users` creates the two demo readers described in [Users](#users).

**Dependencies** are managed with pip:
- `requirements.txt` pins every runtime package to an exact version, including sub-dependencies.
- `requirements-dev.txt` installs those plus the development tools (Ruff, coverage.py).

**Environment variables:**

| Variable | Default | Purpose |
|---|---|---|
| `DJANGO_SECRET_KEY` | An insecure development key | Django's secret key |
| `DJANGO_DEBUG` | `true` | Set to `false` to turn debug mode off |

> **Development only.** These defaults are for running locally. Never deploy with them.

## Frontend setup

```bash
cd frontend
npm ci
npm run dev
```

**Dependencies** are managed with npm, and `package-lock.json` pins every package version. `npm ci` installs exactly what the lockfile lists.

## Running the app

1. Start the backend with `python manage.py runserver`. It runs on port 8000.
2. In a second terminal, start the frontend with `npm run dev`. It runs on port 5173.
3. Open **http://localhost:5173** and log in as `alice` (password `alice-password`), or browse the catalog without logging in.
4. Open a book and add a note as `alice`. Then log out and log in as `bob` (password `bob-password`): the same book shows only his notes, none of hers.
5. Search, filter and sort the catalog as a visitor. Then log in as `alice` and turn on "Books with my notes": only the books she has notes on are listed. Log in as `bob` and do the same: he sees only his.

The Vite dev server forwards `/api`, `/admin` and `/static` to Django, so the whole app is served from one origin:

| URL | What |
|---|---|
| http://localhost:5173/ | The app |
| http://localhost:5173/api/docs/ | API documentation (Swagger UI) |
| http://localhost:5173/api/schema/ | OpenAPI schema |
| http://localhost:5173/admin/ | Django admin |

## Users

**Demo readers.** `python manage.py create_demo_users`, run in `backend/`, creates two readers for trying the app:

| Username | Password |
|---|---|
| `alice` | `alice-password` |
| `bob` | `bob-password` |

- It creates only the users that are missing, so running it again is harmless.
- It never changes an existing user. A user with one of these names is left as it is, password included, and reported as skipped.
- Both are ordinary readers. They can't use Django admin.

> **Development and review only.** These credentials are public. Never run this command on a production database or create these users there.

**Administrators.** No migration or command creates an administrator. To use Django admin, create one with `python manage.py createsuperuser`.

## Seed data

`python manage.py migrate` loads the catalog through a data migration, `backend/catalog/migrations/0002_seed_books.py`, so a new database has a usable catalog straight away. The data is written inline in the migration, so `migrate` never needs the network and always loads the same books. The migration adds catalog data only, never users or notes.

**What it contains:**
- 100 well-known books by 50 authors, in 12 genres, first published between 1719 (*Robinson Crusoe*) and 2006 (*The Road*).
- 31 authors have more than one book, up to five (Agatha Christie), so the author filter has something to narrow.
- The genres: Adventure, Children's, Dystopian, Fantasy, Historical Fiction, Horror, Literary Fiction, Memoir, Mystery, Popular Science, Romance and Science Fiction.

**Conventions:**
- **Title:** the best-known English title.
- **Year:** first publication in the original language. For a work serialized over several years, the year the complete work had appeared.
- **Author:** the name in English, keeping its accents. Each author also has a sort key, set by hand, that puts the surname first: "Orwell, George", "García Márquez, Gabriel", "du Maurier, Daphne", "Le Guin, Ursula K.", or simply "Voltaire". Splitting names automatically gets compound surnames, particles and single names wrong.
- **Genre:** one per book, chosen editorially. Genres aren't checked against a source.
- **Description:** a one-line summary written for this project, not copied from a publisher.

**How it was checked.** On 2026-10-11, every title, author and year was compared with English Wikipedia through the MediaWiki API: the book's article title, and the author and first-publication year in the article's infobox. 75 books matched exactly. The other 25 differ in one or both of two accepted ways:
- the article title has a disambiguator, such as "Dune (novel)"
- the infobox lists several years, for example a serial and its book edition, or the original and a translation; the seed keeps the year the conventions above give

No author differed. One article without an infobox (*The Sun Also Rises*) was checked against its short description.

**Rolling back and re-applying**, in `backend/`:

```bash
python manage.py migrate catalog 0001  # remove the seeded books
python manage.py migrate catalog       # load them again
```

Rolling back removes the seeded books, and the seeded authors and genres that no remaining book uses. Books added through Django admin are kept, with their authors and genres.

## Notes

A logged-in reader keeps private notes on each book, in a section under the book's details. A visitor sees a "Log in to add notes" link there instead.

**Rules** (spec §5.5):
- **Text:** required, up to 5,000 characters. Surrounding whitespace is trimmed, and line breaks are kept. A note is always shown as plain text.
- **Page:** optional, a whole number from 1 to 10,000. It can be cleared when editing.
- **Times:** each note shows when it was created, and "Edited" with a time once its text or page has changed.
- Notes are listed newest first, 20 per page.
- Deleting asks for confirmation and can't be undone.
- A book that has notes can't be deleted, even in Django admin, until its notes are.

**Endpoints**, all requiring a login:

| Method and path | What |
|---|---|
| `GET /api/books/{id}/notes/` | The reader's notes on the book, newest first, paginated |
| `POST /api/books/{id}/notes/` | Add a note to the book |
| `GET`, `PATCH`, `DELETE /api/notes/{id}/` | Read, edit or delete one of the reader's notes |

**How notes stay private:**
- Every notes query starts from the logged-in reader's own notes. Another reader's note is never found, so asking for it gets 404, exactly as a note that doesn't exist does. The API never reveals that it exists.
- A note's owner comes from the session and its book from the URL. A `user` or `book` in the request body is ignored.
- Without a login, every notes request gets 401. A write without the CSRF token gets 403.
- In the browser, a reader's notes are cached under keys that include their id, and they're removed whenever the session ends or another reader logs in.

**Paging after a change.** Adding a note goes to page 1, where the new note is first. Deleting the only note on the last page goes back a page. Otherwise the reader stays on the current page.

**Unsaved drafts when the session ends:**
- If the session expires, or the reader logs out in another tab, an open form keeps its text. It says the session has expired and offers "Log in again", and Save stays disabled.
- Logging out in this tab, or any reader logging in, discards the draft, so the next reader never sees it.
- **Tradeoff:** logging in again discards the draft too, and the save isn't retried afterwards, so the message asks the reader to copy anything they want to keep. A production app would store drafts so a long note can't be lost. For this assignment, keeping the text in the form after a failed save is enough (spec §6).

## Search, filters and sorting

Above the book list are a search box, an author selector, a genre filter, the sort order and, for a logged-in reader, "Books with my notes". A book must match the search and every filter. The whole view lives in the URL, so refreshing, Back and Forward, and a shared link all restore it.

**Parameters** of the book list. The app's URL uses the same names as the API (`GET /api/books/`):

| Parameter | What it does |
|---|---|
| `search` | Every word must appear in the title or the author's name, ignoring case; part of a word is enough. Up to 100 characters. `%`, `_` and quotes match literally. |
| `author` | An author's id: only that author's books |
| `genre` | A genre's id, repeated for several (`genre=2&genre=5`): books in any of them |
| `has_notes` | `true`: only the books the reader has notes on. Needs a login. |
| `sort` | `title` (the default), `author` (by surname) or `year`, with a leading `-` for descending. Case is ignored, and ties are broken by title A–Z, then id. |
| `page`, `page_size` | 12 books per page; the API accepts a `page_size` from 1 to 100 |

**How the controls behave:**
- The search runs after a 300 ms pause in typing, and typing doesn't add history entries. Every other change adds one, so Back undoes one change at a time.
- The × in the search box clears it at once. Like typing, it doesn't add a history entry.
- Changing the search, a filter or the sort goes back to page 1.
- "Clear all" removes the search and every filter, and keeps the sort.

**Author suggestions.** Typing in the author selector suggests up to 10 authors whose name contains the text, by surname, after the same pause. The arrow keys, Enter and Escape work as in any combobox. Only the chosen author's id goes into the URL, and a link with `author=<id>` shows that author's name.

**Books with my notes** is a personal list, so it needs a login:
- Visitors don't see the control. A visitor who opens a link with `has_notes=true` gets the public catalog, and the parameter is removed from the URL.
- Without a login, the API answers `has_notes=true` with 401. The reader always comes from the session, so no parameter can ask for another reader's books.
- In the browser, these results are cached under the reader's id, like notes, and removed when the session ends or another reader logs in.

**Invalid values.** A malformed value, such as `sort=banana` or `genre=abc`, or an author or genre that doesn't exist, gets a 400 from the API with a message for each bad parameter, never a server error. The app shows "This link contains invalid filters", whose "Clear all" link goes back to the full catalog. It recognizes a malformed value itself, without a request. Unknown parameter names, such as `utm_source`, are ignored.

**Endpoints**, all public; only `has_notes=true` needs a login:

| Method and path | What |
|---|---|
| `GET /api/books/` | The book list, with the parameters above |
| `GET /api/authors/` | Author suggestions: `search`, and `limit` from 1 to 20 (default 10) |
| `GET /api/authors/{id}/` | One author, for showing the selected author's name |
| `GET /api/genres/` | The genres that have at least one book |

**Limitations** (spec §6):
- Search and author suggestions don't ignore accents: "Garcia" doesn't find "García".
- With SQLite, ignoring case works for ASCII letters only: "garcía" finds "García", but "GARCÍA" doesn't. A title or surname that starts with an accented letter sorts after Z.
- Sorting doesn't skip leading articles, so *The Hobbit* sorts under T.

## Visual design

**Palette:** an ink-blue header, a teal accent for links and primary buttons, an amber mark on the header and behind notices, and a warm paper background.

**Fonts and icons:**
- All text, headings included, uses the system's own interface font (`system-ui`). Each system shows its native font, so none falls back from a font it doesn't have.
- Icons are inline SVG.
- No font or icon package is added.

**Contrast** (WCAG 2 AA). Architecture §8.8 has the full table.
- Every text pair is at least 4.5:1.
- Control edges and focus rings are at least 3:1.
- The header's focus ring is amber, because the teal ring would be 2.1:1 on ink.
- Amber is too light for text or lines on paper (1.75:1). It appears only on the header, as a light tint behind dark text, or as a decorative bar.

**Shared styles**, in `frontend/src/styles/`:
- **`_variables.scss`:** the colours, type scale, spacing, radii, shadows, sizes and motion.
- **`_mixins.scss`:** the reusable pieces:
  - the control style
  - the button styles
  - card and notice panels
  - the focus ring
  - transitions that respect reduced motion
  - the one breakpoint
- **`global.scss`:** styles links, buttons and form controls at the element level. These rules have zero specificity, so any component's class overrides them.
- **Button styles:** a plain `<button>` gets the default style. A component chooses primary, danger, text or icon by including that mixin in its own class, for example `.submit { @include button-primary; }`.

**Genre panel.** Besides its own button and Escape, the panel closes on a click outside it, or when focus moves outside it. Clicking inside, including on its padding or heading, keeps it open.

**Browser notes:**
- In forced-colors mode (such as Windows High Contrast), the sort select goes back to its native look.

**Checked** in Chrome at 1280 px and 390 px wide, logged out and as a reader, with the keyboard and with reduced motion. There's no horizontal scroll at phone width.

## Tests and checks

Backend, in `backend/` with the virtual environment active:

```bash
python manage.py test                              # tests
coverage run manage.py test && coverage report     # tests with coverage
ruff check . && ruff format --check .              # lint and formatting
python manage.py makemigrations --check --dry-run  # no missing migrations
```

Frontend, in `frontend/`:

```bash
npm test              # tests (Vitest and React Testing Library)
npm run lint          # ESLint
npm run format:check  # Prettier
npm run build         # type check and production build
```

GitHub Actions runs all of these on every pull request and on every push to `main`.

## API contract

The API schema is committed as `backend/openapi.yaml`. The frontend's TypeScript types are generated from it into `frontend/src/api/schema.d.ts`, and they're committed too. After any API change, regenerate both and commit them with the change:

```bash
cd backend && python manage.py spectacular --file openapi.yaml --validate --fail-on-warn
cd ../frontend && npm run generate:types
```

CI regenerates both files and fails if either differs from the committed version.

**Swagger UI** at `/api/docs/` uses the browser's session, so log in through the app first to try endpoints that need a login. If you log in through Swagger UI itself instead, reload the page before sending another POST, PATCH or DELETE: logging in issues a new CSRF token, and the page keeps sending the one it loaded with.

## Repository layout

| Path | Contents |
|---|---|
| `backend/` | Django project (`config/`) and apps |
| `frontend/` | React app built with Vite |
| `docs/` | Product specification, architecture and implementation plan |
| `.claude/` | Claude Code agents and skills for the development workflow |

## Documentation

- [`docs/spec.md`](docs/spec.md): product decisions, user journeys and acceptance criteria
- [`docs/architecture.md`](docs/architecture.md): technical decisions and their rationale
- [`docs/implementation-plan.md`](docs/implementation-plan.md): phases and how each is verified

The docs cite the employer's brief, `Development_Take-Home_Assignment.md`, which isn't included in this repository.

## Development workflow

The app is built with Claude Code, one phase at a time, following the loop in [`docs/implementation-plan.md`](docs/implementation-plan.md) §1. The project instructions are in [`CLAUDE.md`](CLAUDE.md). Four project commands in `.claude/skills/` run each phase:

| Command | What it does |
|---|---|
| `/plan-phase N` | Writes the detailed plan for phase N and raises its open decisions. No code. |
| `/review-phase-plan N` | Has the `plan-reviewer` agent review the plan independently. |
| `/implement-phase N` | Builds the phase from its approved plan, one step at a time, running each step's checks. |
| `/review-phase-code N` | Has the `code-reviewer` agent review the phase's code independently. Adding `backend` reviews the backend checkpoint in Phases 4 and 5. |

- **Reviews are independent.** The two reviewer agents in `.claude/agents/` start without the conversation that produced the work, and judge it against the documents and the code. They can read files but not change them. They report numbered findings, keep correctness problems apart from preferences, and say whether the work is ready for approval. The developer decides which findings to apply.
- **Approval gates implementation.** `/implement-phase` runs only once the plan is marked approved, and each phase is approved before the next one starts.
- **Plans are working files.** Phase plans stay local in `.claude/plans/` and aren't committed. Each phase's decisions are recorded in `docs/` when the phase closes.
