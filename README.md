# Book Explorer

A Django REST Framework backend and a React (TypeScript) frontend for browsing a book catalog, with private notes for each reader. It's a take-home assignment, built in phases. The design is documented in [`docs/`](docs/).

## Contents

- [Overview](#overview)
- [Requirements](#requirements)
- [Backend setup](#backend-setup)
- [Frontend setup](#frontend-setup)
- [Running the app](#running-the-app)
- [Users](#users)
- [Seed data](#seed-data)
- [Notes](#notes)
- [Search, filters and sorting](#search-filters-and-sorting)
- [Visual design](#visual-design)
- [Design choices and challenges](#design-choices-and-challenges)
- [Assumptions and decisions](#assumptions-and-decisions)
- [Known limitations](#known-limitations)
- [Future improvements](#future-improvements)
- [Tests and checks](#tests-and-checks)
- [How acceptance was verified](#how-acceptance-was-verified)
- [API contract](#api-contract)
- [Repository layout](#repository-layout)
- [Documentation](#documentation)
- [Development workflow](#development-workflow)
- [License](#license)

## Overview

- **Visitors** browse a catalog of 100 books. They can search by title or author, filter by author and by one or more genres, sort by title, author or year, and page through the results. A book's page shows its details, and the author's name links to the list of that author's books.
- **Readers**, once logged in, can also keep private notes on each book, each with an optional page number, and narrow the catalog to the books they've written notes on. Readers never see each other's notes.
- **The stack:** Django 5.2 and Django REST Framework with SQLite for the backend; React 19 with TypeScript, Vite, React Router and TanStack Query for the frontend.

## Requirements

- **Python 3.12:**
  - **Linux:** on Ubuntu or Debian, also install `python3.12-venv` (`sudo apt install python3.12-venv`). Without it, `python3.12 -m venv` fails.
  - **macOS:** install it from python.org or with Homebrew (`brew install python@3.12`). Both provide the `python3.12` command used below. The `python3` that comes with Apple's command-line tools is an older version.
  - **Windows:** install it from python.org. The installer includes the `py` launcher used below.
- **Node.js 24 LTS.** The version is in `frontend/.nvmrc`.
  - With nvm on Linux or macOS, run `nvm use` in `frontend/`.
  - On Windows, install Node 24 LTS from nodejs.org, or use nvm-windows. nvm-windows doesn't read `.nvmrc`, so run `nvm install 24`, then `nvm use` with the full version that `nvm list` shows.

## Backend setup

On Linux and macOS:

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py create_demo_users
python manage.py runserver
```

On Windows, in PowerShell:

```powershell
cd backend
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py create_demo_users
python manage.py runserver
```

- If PowerShell refuses to run `Activate.ps1` because running scripts is disabled, allow it for your user once: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`.
- In Command Prompt, activate with `.venv\Scripts\activate.bat` instead.

Every later `python` and `pip` command in this README needs the virtual environment active. Activate it again in each new terminal.

`create_demo_users` creates the two demo readers described in [Users](#users).

**Dependencies** are managed with pip:
- `requirements.txt` pins every runtime package to an exact version, including sub-dependencies.
- `requirements-dev.txt` installs those plus the development tools (Ruff, coverage.py).

**Environment variables:**

| Variable | Default | Purpose |
|---|---|---|
| `DJANGO_SECRET_KEY` | An insecure development key | Django's secret key |
| `DJANGO_DEBUG` | `true` | Set to `false` to turn debug mode off |

To run with debug mode off, in `backend/`:
- **Linux and macOS:** `DJANGO_DEBUG=false python manage.py runserver --insecure`
- **Windows PowerShell:** `$env:DJANGO_DEBUG = "false"`, then `python manage.py runserver --insecure`. The variable stays set until that window is closed.

With debug mode off, `runserver` doesn't serve static files, so Django admin and Swagger UI would load without their styles and scripts. `--insecure` makes it serve them, for local use only.

> **Development only.** These defaults are for running locally. Never deploy with them.

## Frontend setup

The same on every system:

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
python manage.py migrate               # load them again
```

Rolling back removes the seeded books, and the seeded authors and genres that no remaining book uses. Books added through Django admin are kept, with their authors and genres.

**Rolling back also deletes every note.** The notes table depends on the seed, so Django drops it first, with all readers' notes, including notes on books added through admin. Re-applying needs the plain `migrate` above, which recreates the notes table as well; `migrate catalog` alone would leave it missing.

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
- Each notes request names the reader the tab shows, in an `X-Reader-Id` header. If the session now belongs to someone else, because another reader has logged in in another tab, the request gets 412 and changes nothing, and the tab re-checks the session.
- In the browser, a reader's notes are cached under keys that include their id, and they're removed as soon as the tab learns that the session ended or another reader logged in.

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

**Author suggestions.** Typing in the author selector suggests up to 10 authors whose name contains the text, by surname, after the same pause. The arrow keys, Enter and Escape work as in any combobox. Only the chosen author's id goes into the URL, and a link with `author=<id>` shows that author's name. The author's name on a book's page is such a link.

**Books with my notes** is a personal list, so it needs a login:
- Visitors don't see the control. A visitor who opens a link with `has_notes=true` gets the public catalog, and the parameter is removed from the URL.
- Without a login, the API answers `has_notes=true` with 401. The reader always comes from the session, so no parameter can ask for another reader's books.
- The request names the reader the tab shows, as notes requests do, so a tab that hasn't noticed another reader's login gets 412 rather than their books.
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

## Design choices and challenges

Notes are the main feature, and search, filters and sorting the second. Each choice below is explained in full in [`docs/architecture.md`](docs/architecture.md), in the section given.

**Notes are owned through filtering, so another reader's note is a 404** (§6.6). Every notes query starts from `Note.objects.filter(user=request.user)`. Another reader's note is never found, so reading, editing or deleting it gets the same 404 as a note that doesn't exist. A permission check after fetching was rejected: its 403 would confirm that the note exists, and it wouldn't cover lists.

**Pagination comes after owner filtering** (§6.6). The notes list pages the reader's own notes, so its count, its page boundaries and its "Invalid page." answer depend only on them. They reveal nothing about anyone else's notes.

**401 for "not logged in", not 403** (§6.5). DRF's session authentication answers 403 when nobody is logged in, because cookie sessions have no standard `WWW-Authenticate` value. A failed CSRF check is also 403, so the frontend couldn't tell an expired session from a refused request. A small subclass, `accounts.authentication.SessionAuthentication`, names a `Session` scheme, so DRF answers 401. The frontend then has one rule: any 401 means the reader is logged out.

**Session authentication and CSRF, through one origin** (§6.1–§6.3).
- Readers log in with Django's sessions. The session cookie is HttpOnly, so no script can read it, and logging out deletes the session on the server. Tokens and JWTs were rejected: a token is stored where script can read it, and a JWT stays valid after logout unless the server keeps a blocklist.
- In development, Vite forwards `/api` and `/admin` to Django, so the browser talks to one origin. Cookies and Django's CSRF check work as Django intends, with no CORS setup.
- The API client copies the CSRF cookie into an `X-CSRFToken` header on every write. Login and logout check it too, so another site can't log a reader into an account the site controls.

**Private data at authentication boundaries** (§8.5). On a shared browser, the next reader must never see the previous reader's notes, "Books with my notes" results or unsaved draft, even for a moment.
- Every private cache entry sits under a `private` root and the reader's id. One call finds them all, and another reader's query can never be answered from them.
- One function changes the session: on a login, a logout, any 401, and a re-check after a 412 or when the tab becomes visible again. Whenever the reader changes, it cancels private requests in flight and removes every private entry. Public catalog data stays cached.
- A tab may not know yet that another reader has logged in elsewhere. Its private requests name the reader it shows, and the server refuses them when the session belongs to someone else, so the tab never shows that reader's data, or saves a note to their account, under the old name.
- A draft's fate depends on how the session ended. After an expiry or a logout in another tab, the open form keeps its text, so a note isn't lost. A logout in this tab, or any login, discards it.

**Strict validation: a 400, never a silent fallback** (§7.5). An invalid value is refused with a message, never ignored or replaced with a default: `sort=banana`, a genre that doesn't exist, a page of `1.5`, a note body sent as a number. A fallback would quietly show something other than what the link asked for. Unknown parameter names are ignored, so tracking parameters don't break a link.

**Data that can't be recreated is protected** (§5).
- A book with notes can't be deleted, even in Django admin, because notes are the one thing that can't be recreated. Deleting a reader deletes their notes.
- A note is marked edited only when its text or page really changes.
- Database constraints also enforce a note's page range and non-empty text, behind the API's own checks.

**A curated, checked and reversible seed** (§5). 100 real books, with sort keys set by hand and every title, author and year checked against Wikipedia ([Seed data](#seed-data)). A test rolls the migration back and applies it again.

**The URL is the only copy of the list state** (§8.7). Search, filters, sort and page live only in the URL, which is also the list's cache key. Refresh, Back and Forward, and a shared link all restore both the controls and the results, and no second copy can drift out of step.

**Generated types** (§7.7). The OpenAPI schema is generated from the backend's code, and the frontend's TypeScript types from the schema. CI fails if either is out of date, so an API change that breaks the frontend fails the build instead of the app.

**Challenges met along the way:**
- **SQLite and huge numbers.** A 20-digit id overflows SQLite's integers. Django guards most lookups, but not `in`, so `genre=99999999999999999999` was a 500. Genre ids are now checked to be 1 to 18 digits first. In the same way, Python refuses to convert a string of more than 4,300 digits, so `page_size` counts the digits before converting.
- **An edit that brought a deleted note back.** Django's `save()` falls back to an INSERT when its UPDATE matches no row. A PATCH that loaded a note just before a DELETE committed therefore re-created it. A note now refuses to be saved once its row is gone, and the API answers with the missing-note 404.
- **Deeply nested JSON.** Python's JSON decoder raises `RecursionError` on about 100 KB of `[`, which DRF doesn't catch, so it was a 500 on every write. A small parser subclass turns it into a 400.
- **A one-frame flash.** React Router renders a location change as a React transition, so a control that reads the URL showed its old value for one frame after a click. jsdom can't show this, so it was measured in the browser frame by frame, and transitions are now off.
- **Sessions across tabs.** Another reader logging in elsewhere causes no 401 in this tab. The tab re-checks the session when it becomes visible again, but two windows side by side never stop being visible, so one could show the new reader's notes under the old name and save a note into their account. Private requests now name the reader the tab shows, and the server answers a mismatch with 412, so the tab re-checks before showing or saving anything. An expiry and a logout elsewhere look the same from here, so both keep the draft; only a logout in this tab is known to be deliberate.

## Assumptions and decisions

The full lists are in [`docs/spec.md`](docs/spec.md): §2 for the product decisions and §7 for the assumptions. The technical decisions are in [`docs/architecture.md`](docs/architecture.md) §3.

**Product decisions:**
- All three suggested features are built. Notes are the main feature; search, filters and sorting the second.
- The catalog is public. Logging in is needed only for notes and "Books with my notes".
- Search is free text over title and author, and filters are exact: author, genres and "Books with my notes". So there's no separate title filter.
- A reader can keep many notes per book, each with an optional page, shown 20 per page.
- There's no registration. Demo readers come from a command, and administrators from `createsuperuser`.
- Several genres can be chosen at once, and a book in any of them matches. The author is chosen with a type-to-search selector.
- Sorting by author uses a surname-first key stored with each author.
- The seed has 100 books, listed 12 per page.

**Assumptions:**
- After logging in, the reader returns to the page they came from.
- Each book has one author and one genre, and books are edited only in Django admin.
- Another reader's note looks "not found" rather than "forbidden", so its existence isn't revealed.
- A note can't be moved to another book.
- Limits: a note's text up to 5,000 characters, a page from 1 to 10,000, and a pause of about 300 ms before searching.
- Every view that loads data has loading, empty and error states.
- Backend tests are required, although the assignment marks them optional.

**Technical decisions:**
- **TypeScript instead of JavaScript.** The assignment asks for "JavaScript ES6+". TypeScript is JavaScript with types, and it compiles to modern JavaScript (ES2023 here). With types generated from the API schema, a mismatch between the frontend and the backend fails the build instead of failing in the browser. Strict mode is on.
- **401 for logged-out requests,** as explained above.
- **SQLite,** so a reviewer installs no database server. The code uses no database-specific features, so moving to PostgreSQL is a settings change.
- **pip with fully pinned requirements, and npm with its lockfile,** so every install gets the same versions.
- **No Docker.** The assignment describes a native setup, and SQLite has no service to run.
- **One of the two optional enhancements was built:** the author's name on a book's page opens the list of their books. Note counts for each book on the list weren't built.

## Known limitations

- **The last save wins.** If one note is edited in two places at once, the later save overwrites the earlier one.
- **Drafts don't survive logging in again.** After a session expires, the text stays in the form, but logging in discards it ([Notes](#notes)).
- **Rolling back the seed deletes every note** ([Seed data](#seed-data)).
- **Search doesn't ignore accents, and ignores case only for ASCII letters** with SQLite ([Search, filters and sorting](#search-filters-and-sorting)).
- **Sorting doesn't skip leading articles,** so *The Hobbit* sorts under T.
- **Login attempts aren't rate-limited.**
- **A tab notices a login or logout in another tab only later:** on its next request for private data, or when it becomes visible again. Until then it can keep showing the previous reader's name and public data, but the server refuses its private requests, so it never shows or saves another reader's notes.
- **Staff can read every note in Django admin.** Notes are private from other readers, not from administrators.
- **A session lasts two weeks from login,** without renewal.
- **Note counts on the list weren't built** (the optional enhancement AC-X1).
- **Not ready for production.** Deployment is out of scope. It would need HTTPS with `Secure` cookies and HSTS, debug mode off with a real `SECRET_KEY` and `ALLOWED_HOSTS`, and a reverse proxy serving the frontend build and the collected static files. It would also need rate limiting, a Content-Security-Policy, periodic `clearsessions`, and `django.security` logging tuned for scanner traffic. Architecture §10 lists these.

## Future improvements

[Known limitations](#known-limitations) says what the app doesn't do today. This section says what would come next with more time, and what a real project would do differently. Each group is in rough order of priority.

**Before a real deployment:**
- **The production setup** listed under "Not ready for production" above, with the frontend's build served from the same origin as the API, as the dev proxy does now, so sessions and CSRF work unchanged.
- **Rate limiting,** on login first and then on writes, with DRF's throttling backed by a shared cache such as Redis, so every server process counts the same attempts.
- **PostgreSQL instead of SQLite,** for concurrent writes. Its Unicode-aware case folding and collations would fix the search and sort issues with accented letters, and its `unaccent` extension would make search ignore accents. The code uses nothing specific to SQLite, so the move itself is a settings change.
- **Error monitoring.** Unexpected errors are logged to the console today, and `reportUnexpectedError` is the one place the frontend reports them. Both would send to an error-tracking service such as Sentry, with a request id that links a browser report to its server log line.
- **Safe data changes:** backups with a tested restore, and migrations reviewed for what they do to existing data. With real data, a rollback that deletes every note ([Seed data](#seed-data)) wouldn't be acceptable.
- **Containers and continuous deployment:** an image built and deployed by CI once its checks pass. Docker was left out here because the assignment describes a native setup.
- **Automated dependency updates** (Dependabot or Renovate), and `pip-audit` and `npm audit` in CI.

**Product:**
- **Note counts on the list** (AC-X1), designed but not built. A reader's list would carry each book's count from the same query, never one query per book, so the list would be cached under the reader's private key.
- **Drafts that survive logging in again.** A draft would be saved in `sessionStorage` under the reader's id and removed by the same clean-up as their cached notes, so a long note isn't lost when the session expires.
- **Conflict detection for notes.** An edit would send the version it started from, and a note changed since would get a 409 that offers to reload or overwrite, instead of the last save winning.
- **Accounts:** registration, password reset by email, and sessions that extend while the reader is active.
- **A "My notes" page** across all books, with search within notes.
- **Better search and sort:** relevance ranking with PostgreSQL's full-text search, and a sort key for each title that skips leading articles, like the authors' surname-first key.
- **Richer book data:** several authors or genres per book, ISBNs and covers, imported from a source such as Open Library, with a staff screen for managing books once that's a real workflow.
- **Instant updates across tabs** with `BroadcastChannel`, so a login or logout in one tab reaches the others at once.

**Engineering:**
- **An automated end-to-end suite** (Playwright) covering the main journeys in CI, in Chromium, Firefox and WebKit. The browser checks for this submission were one-off observations in Chrome.
- **Frontend coverage,** measured and reported in CI like the backend's.
- **Automated accessibility checks** (axe) in the component tests, and testing with screen readers.
- **HTTP caching** for the public catalog, and trigram indexes for search once the catalog is large.

## Tests and checks

Backend, in `backend/` with the virtual environment active:

```bash
python manage.py test                              # tests
coverage run manage.py test                        # tests, measuring coverage
coverage report                                    # the coverage report
ruff check .                                       # lint
ruff format --check .                              # formatting
python manage.py makemigrations --check --dry-run  # no missing migrations
```

Frontend, in `frontend/`:

```bash
npm test              # tests (Vitest and React Testing Library)
npm run lint          # ESLint
npm run format:check  # Prettier
npm run build         # type check and production build
```

The commands are the same on every system. GitHub Actions runs all of these on every pull request and on every push to `main`.

**Coverage.**
- **Backend:** 99% of the application code, lines and branches, measured with coverage.py. The one line not covered is in the notes admin. `backend/.coveragerc` leaves out the tests, the migrations and the server entry points, so the figure measures the application code only.
- **Frontend:** not measured for coverage. Its tests target the behaviour that matters most: the API client, the 401 rule, private data and drafts when the session changes, failed note changes, and the list's URL state.

## How acceptance was verified

Every acceptance criterion in [`docs/spec.md`](docs/spec.md), every user journey and every handled edge case was verified before submission, each by the method that suits it:
- **Backend tests:** authorization, validation, database integrity, migrations and API behaviour.
- **Frontend tests:** the API client, the 401 rule, private data and drafts when the session changes, failed note changes, and URL state.
- **Contract checks:** regenerating the schema and the types leaves no diff.
- **Browser checks:** Claude Code drove Chrome through Playwright MCP against the running app, including two tabs, delayed and failing requests, and an expired session.
- **Manual checks:** what automation can't do reliably, such as a tab noticing another tab's login or logout when it becomes visible again, and the look and feel.

The result for each criterion, with its method and evidence, is in [`docs/acceptance-checklist.md`](docs/acceptance-checklist.md). No browser test code is committed: the browser checks were one-off observations, and the automated tests are the regression safety net.

## API contract

The API schema is committed as `backend/openapi.yaml`. The frontend's TypeScript types are generated from it into `frontend/src/api/schema.d.ts`, and they're committed too. After any API change, regenerate both and commit them with the change. From the repository root, with the virtual environment active:

```bash
cd backend
python manage.py spectacular --file openapi.yaml --validate --fail-on-warn
cd ../frontend
npm run generate:types
```

CI regenerates both files and fails if either differs from the committed version.

**URLs and errors.** Every API URL ends in a slash, `/api/docs/` and `/api/schema/` included. Without the slash, the API answers a JSON 404 rather than redirecting. Every error under `/api/` is JSON in DRF's shape, including unknown paths and, with debug mode off, requests refused as suspicious and server errors.

**Swagger UI** at `/api/docs/` uses the browser's session, so log in through the app first to try endpoints that need a login. If you log in through Swagger UI itself instead, reload the page before sending another POST, PATCH or DELETE: logging in issues a new CSRF token, and the page keeps sending the one it loaded with.

## Repository layout

| Path | Contents |
|---|---|
| `backend/` | Django project (`config/`) and apps |
| `frontend/` | React app built with Vite |
| `docs/` | Product specification, architecture, implementation plan and acceptance checklist |
| `.claude/` | Claude Code agents and skills for the development workflow |

## Documentation

- [`docs/spec.md`](docs/spec.md): product decisions, user journeys and acceptance criteria
- [`docs/architecture.md`](docs/architecture.md): technical decisions and their rationale
- [`docs/implementation-plan.md`](docs/implementation-plan.md): phases and how each is verified
- [`docs/acceptance-checklist.md`](docs/acceptance-checklist.md): the result of each acceptance criterion, with how it was verified

The docs cite the employer's brief, `Development_Take-Home_Assignment.md`, which isn't included in this repository.

## Development workflow

The app is built with Claude Code, one phase at a time, following the loop in [`docs/implementation-plan.md`](docs/implementation-plan.md) §1. The project instructions are in [`CLAUDE.md`](CLAUDE.md). Five project commands in `.claude/skills/` run the work:

| Command | What it does |
|---|---|
| `/plan-phase N` | Writes the detailed plan for phase N and raises its open decisions. No code. |
| `/review-phase-plan N` | Has the `plan-reviewer` agent review the plan independently. |
| `/implement-phase N` | Builds the phase from its approved plan, one step at a time, running each step's checks. |
| `/review-phase-code N` | Has the `code-reviewer` agent review the phase's code independently. Adding `backend` reviews the backend checkpoint in Phases 4 and 5. |
| `/assess-solution` | Has the `solution-assessor` agent assess the whole solution independently before submission: the assignment's requirements, the backend's robustness, the frontend and the docs. |

- **Reviews are independent.** The three agents in `.claude/agents/` (two reviewers and the solution assessor) start without the conversation that produced the work. They judge it against the documents, the code, and professional practice beyond them, such as error handling, logging and accessibility basics that no document asks for. They can read files but not change them. They report numbered findings, keep correctness problems apart from preferences, and say whether the work is ready. The developer decides which findings to apply.
- **Approval gates implementation.** `/implement-phase` runs only once the plan is marked approved, and each phase is approved before the next one starts.
- **Plans are working files.** Phase plans stay local in `.claude/plans/` and aren't committed. Each phase's decisions are recorded in `docs/` when the phase closes.

## License

This is a take-home assignment, shared for review. All rights reserved: there's no license file, and no permission to reuse the code is granted.
