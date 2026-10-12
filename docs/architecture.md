# Book Explorer: Architecture

*Living document, last updated 2026-10-12 (Phase 7, focus after a page change). Product requirements: `docs/spec.md`. Employer requirements: `Development_Take-Home_Assignment.md`.*

## 1. Purpose and status

This document records how Book Explorer is built: the technical decisions, why they were made, and what was considered and rejected. Requirements are referenced by their spec IDs (for example AC-N6, J9, §5.6) rather than restated.

Detailed feature design is planned per implementation phase, just before that phase starts. If implementation shows that a decision here needs to change, this document is updated in the same change.

Two decisions deliberately depart from the assignment's wording or from common defaults. They are flagged where they appear: TypeScript instead of JavaScript (§3), and 401 instead of DRF's default 403 for logged-out requests (§6.5).

## 2. Overview

```
            Development: the browser only ever talks to http://localhost:5173

┌─────────────┐      ┌───────────────────────────┐ /api/*  ┌──────────────────────────────┐
│  Browser    │─────▶│ Vite dev server     :5173 │────────▶│ Django + DRF           :8000 │
│  React SPA  │◀─────│ serves the SPA and        │◀────────│ accounts · catalog · notes   │──▶ SQLite
└─────────────┘      │ proxies /api to Django    │         │ Django admin at /admin/      │
                     └───────────────────────────┘         └──────────────────────────────┘
```

| Component | Responsibility | Access |
|---|---|---|
| `frontend/` | React SPA: routing, list state in the URL, server data through TanStack Query, private data cleared at authentication boundaries | — |
| `accounts` app | Custom user model; session, login and logout endpoints; the session authentication class that returns 401; demo-user command; user admin | Public endpoints, CSRF-protected writes |
| `catalog` app | Author, Genre and Book models; seed data migration; read-only book list and detail endpoints; author suggestions and genre options; search, filter and sort | Public (`has_notes` requires login) |
| `notes` app | Note model; note CRUD endpoints, with a paginated list | Login required; each reader sees only their own notes |
| Django admin | Managing books and notes (spec §3), and users, e.g. deactivating a reader | Staff only |

**Dependencies.** `notes` depends on `catalog` (a note belongs to a book). Both refer to users through `settings.AUTH_USER_MODEL`. The only link from `catalog` back to `notes` is the `has_notes` filter, which checks the current reader's notes.

**Production topology.** Deployment is out of scope (spec §3). The design assumes production also uses a single origin: a reverse proxy serves the built SPA and routes `/api/` and `/admin/` to Django over HTTPS. §10 lists the hardening this would need.

## 3. Technology decisions

| Area | Choice | Why | Alternatives considered |
|---|---|---|---|
| Backend | Python 3.12, Django 5.2 LTS, Django REST Framework | Required by the assignment. The LTS release is supported until April 2028 and officially supported by DRF. | Non-LTS Django (shorter support window) |
| Database | SQLite | No setup for reviewers; fast, isolated tests; supports everything we need (cascading deletes, check and unique constraints, `EXISTS` subqueries, filtered counts). We avoid database-specific features, so moving to PostgreSQL is a settings change. | PostgreSQL: production-like and handles non-ASCII case correctly, but needs Docker or a local install. Offering both was rejected because an untested path is a claim we can't back up. |
| Python dependencies | pip + venv; `requirements.txt` pinned to exact versions, including sub-dependencies; `requirements-dev.txt` adds dev tools | Reviewers need only Python. The dependency tree is small enough to pin completely without lock tooling. | Poetry: lockfile and dependency groups, but an extra tool for reviewers to install |
| Query parameters | django-filter | One declarative class lists every accepted parameter; invalid values automatically become a 400 | DRF's `SearchFilter`/`OrderingFilter` (their behaviour conflicts with spec §5.6, see §7.5); hand-written validation |
| API schema | drf-spectacular (OpenAPI) and Swagger UI, with its assets served locally by drf-spectacular-sidecar | The schema is the source of the frontend's TypeScript types; the docs page lets reviewers explore the API. Local assets keep the docs working offline and keep third-party scripts off a page that shares the reader's session. | Swagger UI assets from a CDN (drf-spectacular's default) |
| Authentication | Django sessions with DRF `SessionAuthentication` | See §6.1 | DRF tokens, JWT |
| Frontend language | **TypeScript (strict)**. *Deviation:* the assignment says "JavaScript ES6+" | TypeScript is a typed superset of JavaScript that compiles to ES6+. Combined with types generated from the API schema, mismatches between frontend and backend show up when the code is built, not when it runs. | JavaScript, which follows the assignment wording literally |
| Build tool | Vite | The standard React tooling now that Create React App is deprecated; it also hosts the dev proxy | — |
| Package manager | npm, with `package-lock.json` committed | Comes with Node; allowed by the assignment | yarn |
| Routing | react-router-dom v7, declarative `<Routes>` | Required by the assignment. Data loading lives in TanStack Query, so the router only routes. | React Router data loaders/actions |
| Server state | TanStack Query | See §8.4 | Hand-written `useEffect` fetching; React Router loaders |
| API types | Generated with openapi-typescript from the committed schema | Types can't drift from the API, and CI enforces it | Hand-written types |
| Styling | SCSS modules (`Component.module.scss`) and semantic HTML; the system font stack and inline SVG icons | Styles scoped to each component; shared variables and mixins via Sass `@use`; native elements, plus two small custom filter controls (§8.8), give accessibility without a library. System fonts and inline icons need no font or icon package. | CSS Modules, Tailwind, a component library, styled-components (CSS-in-JS: the same per-component scoping, but its CSS is generated in the browser while components render, which adds a runtime library and work on every styled render) |
| Backend tests | Django's test runner with DRF's `APITestCase` | Named by the assignment; no extra dependencies | pytest + pytest-django |
| Frontend tests | Vitest, React Testing Library and MSW, used for targeted tests | Vite-native; MSW fakes the network, so tests exercise the real API client and cache | No frontend tests; broad component coverage; Playwright end-to-end tests |
| Lint and format | Ruff (Python); ESLint and Prettier (TypeScript) | One fast tool per language plus a formatter | flake8 + black + isort; mypy (not used) |
| Containers and CI | No Docker; GitHub Actions | The assignment describes a native setup, and SQLite has no service to containerize. CI proves the project builds and passes on a clean machine. | Docker Compose |

## 4. Backend structure and conventions

```
backend/
├── manage.py, requirements.txt, requirements-dev.txt, ruff.toml
├── config/     settings.py, urls.py, logging.py, pagination.py, wsgi.py, asgi.py
├── accounts/   User model, auth endpoints, session authentication class,
│               demo-user command, admin registration
├── catalog/    Author/Genre/Book models, schema and seed migrations,
│               serializers, FilterSet, views, admin registration
└── notes/      Note model, serializers, views, admin registration
```

- **Settings.** There is a single `settings.py`. `SECRET_KEY` and `DEBUG` come from environment variables, with local-development defaults; the README warns that those defaults are for development only.
- **Logging.** `LOGGING` writes to the console (stderr) whether `DEBUG` is on or off. Django's default writes there only with `DEBUG` on, and otherwise emails `ADMINS`, which is empty, so an unexpected error would leave no trace.
  - Each record names its logger and level. One about a request also gets its method and user (`[GET, user 3]`, `[GET, anonymous]`) from a filter in `config/logging.py`. Django already adds the path and, for a 500, the traceback.
  - `django.request` logs at `ERROR`: crashes are logged, and the `WARNING` Django writes for every 4xx isn't. runserver's own request lines already show every status in development, and the test suite would otherwise print one line per expected 400, 401 and 404.
  - Request bodies, query strings in error records, and cookies are never logged, so passwords, note text, session ids and CSRF tokens stay out of the log.
  - **Requests Django refuses as suspicious** (a `Host` outside `ALLOWED_HOSTS`, a body over 2.5 MB, more than 1,000 fields) are logged by `django.security` at `ERROR` with a traceback, as Django intends, and answered with a JSON 400 (§7.3). They're rare locally; a deployment facing scanners would tune this logger (§10).
- **DRF defaults.**
  - Authentication uses the custom session class (§6.5).
  - The default permission is `IsAuthenticated`, and catalog views explicitly allow public access (§6.6).
  - Only JSON request bodies are accepted, and responses are JSON only. DRF's browsable API is off; Swagger UI (§7.7) is the interactive docs.
  - The django-filter backend and the drf-spectacular schema class are configured globally.
  - Pagination is not global. Each list view sets its own, because the list endpoints behave differently (§7.4).
- **Views** use DRF generic views and viewsets.

**Where each kind of rule lives**

| Rule | Where | Why there |
|---|---|---|
| Field rules (note body length, page range) | Model fields | Django admin forms and DRF model serializers both pick them up automatically |
| Last line of defence | Database `CheckConstraint`s | Catches anything that bypasses both, such as the shell, bulk updates or future code |
| API-only behaviour (trimming, read-only owner and book, PATCH only) | Serializers and views | Only meaningful for the API |
| Who can see what | View querysets (filtered by owner) and permission classes | One place per endpoint (§6.6) |
| Query parameter parsing and validation | The catalog FilterSets and the pagination class; the author suggestions' `limit` in its view | A declarative list of what each endpoint accepts (§7.5) |

## 5. Domain model

```
accounts.User 1 ──< Note >── 1 catalog.Book >── 1 Author
                                             >── 1 Genre
```

| Model | Fields | Integrity rules |
|---|---|---|
| `User` | Subclass of `AbstractUser`, with no extra fields | `AUTH_USER_MODEL` points to it before the first migration |
| `Author` | `name`, `sort_name` | `name` is unique; `sort_name` is set explicitly, e.g. "García Márquez, Gabriel" |
| `Genre` | `name` | `name` is unique |
| `Book` | `title`, `author` → Author, `genre` → Genre, `publication_year`, `description` | `(title, author)` is unique; deleting an author or genre that still has books is blocked (`PROTECT`) |
| `Note` | `user` → User, `book` → Book, `body`, `page` (optional), `created_at`, `edited_at` (optional) | Deleted with its user (`CASCADE`); deleting a book that still has notes is blocked (`PROTECT`). Check constraints: `page` is empty or 1–10,000, and `body` is not empty. Index on `(user, book, created_at)`. |

Why the model looks like this:

- **Custom user model.** Django recommends one for every new project, because switching away from the built-in `User` once migrations reference it requires migration surgery. It behaves exactly like the built-in model.
- **`name` and `sort_name` on Author.** The spec requires sorting by surname using a stored key (§2, §5.2). Deriving it from the name breaks for compound surnames ("García Márquez"), particles ("Le Guin") and single-name authors. A display name paired with a sort key handles all of them; library catalogues use the same pattern.
- **Genre as a table**, not a fixed list in code. Admins can add a genre without a code change, and the author and genre filters work the same way (by id).
- **Delete rules follow ownership.** Readers' notes are the only data that can't be recreated, and they belong to the reader, not to whoever maintains the catalog (spec §5.5).
  - Deleting a reader's account deletes their own notes (`CASCADE`).
  - Tidying the catalog never destroys readers' work. Deleting an author or genre that still has books, or a book that still has notes, is refused (`PROTECT`), and Django admin lists what blocks it. The admin then deals with those records deliberately.
  - Cascading from a book to its notes was rejected: an admin removing a book would delete other readers' notes as a side effect, and because a note can't move to another book (spec §7), they couldn't be kept.
- **`edited_at` instead of `updated_at`.** Django's `auto_now_add` and `auto_now` produce timestamps that differ by microseconds when a note is created, so "updated after created" would mark every new note as edited. `edited_at` stays empty until an existing note's text or page actually changes. The model sets it, so edits made in Django admin count too: saving an existing note reads its stored text and page, and sets `edited_at` to now if either differs. Comparing with the stored row costs one extra query per edit. A copy taken when the note is loaded was rejected, because it goes stale after `refresh_from_db()`.
- **One composite index.** It matches the main notes query (one reader's notes on one book, newest first, plus the count that pagination needs), and its first two columns also answer the `has_notes` check. At this data size the benefit isn't measurable; the index is there because it fits the feature's actual access pattern.
- **Validation in layers** (§4). Notes can be written both through the API and in admin, so the rules live on the model, with database constraints as a backstop.
- **Deleting is permanent (no soft delete).** Nothing in the spec asks for undo, a trash bin or an audit trail, and the confirmation step (AC-N5) protects against accidental deletion. Soft delete would add a "not deleted" condition to every owner-filtered query, which is exactly where authorization bugs hide. It would also go against what a reader expects when deleting a private note (J6). Django admin's change history already records admin deletions.

**Seed data migration** (spec §5.2)

- A `RunPython` migration using historical models (AC-M3), `catalog/0002_seed_books.py`, creates the 50 authors, 12 genres and 100 books.
- **The data is written inline in the migration**, grouped by author so each name and sort key appears once. The file is self-contained and frozen by construction. A migration that fetched its data at migrate time was rejected: it would load different data as the source changed, would need the internet for every `migrate` and test run, and couldn't reliably reverse. The network was used only while curating.
- **The data was checked against English Wikipedia** on 2026-10-11: each book's article title, plus the author and first-publication year in its infobox. Titles, years and author names follow spec §5.2; the README describes the dataset and the result of the check.
- Reversing it deletes the seeded books, identified by title and author name. It deletes seeded authors and genres only if no remaining book uses them, so books added through admin are untouched and never block the rollback. Because those authors and genres can survive a rollback, the forward step reuses one that already exists, so migrating forward again works.
- **Rolling back also removes all notes.** Django's generated notes migration depends on the latest catalog migration, which is the seed. Rolling back the seed therefore first undoes the notes migrations, which drops the notes table: every note is lost, not only those on seeded books (AC-M2, spec §6).
  - **This is not the same as deleting a book.** In the app and in Django admin, `PROTECT` still refuses to delete a book that has notes. A rollback changes the schema instead of deleting rows: the notes table is gone before any book is deleted, so the `PROTECT` rule never comes into play.
  - **Accepted for local development only.** The development database holds disposable data. Keeping notes on other books would need hand-ordered migrations (`run_before`). That was rejected as an unusual mechanism for a development-only scenario.
  - **Not acceptable for production data without safeguards.** With real readers' notes, a rollback must never destroy unrelated user data as a side effect. That needs migration dependencies designed so that reversing catalog data can't unapply the notes schema, data migrations that are only reversed deliberately, and backups with a tested restore procedure. Deployment is out of scope (spec §3), so none of this is built.
- Migrations never create users or notes (§5.4). The demo-user command in `accounts` creates `alice` and `bob`. It can be run repeatedly and never changes an existing user.

## 6. Authentication and authorization

### 6.1 Session authentication

Readers log in with Django's built-in authentication and stay logged in through a **session cookie**. The browser sends it with every request to the API, and DRF's `SessionAuthentication` reads it.

- **JavaScript can't read the session cookie** (it's HttpOnly), so even injected script couldn't steal a login for later use.
- **Logging out deletes the session on the server** (AC-A5). No token blacklist is needed.
- **Expiry is built in**, and no extra packages are needed.

Rejected alternatives:

- **DRF tokens.** The token would be stored where JavaScript can read it, it never expires by default, and there's one token per user, so logging out ends every session on every device.
- **JWT.** A JWT is valid until it expires, so logging out on the server would need a blacklist checked on every request: sessions again, with extra steps. It also needs a token-refresh flow in the frontend.

### 6.2 A single origin in development

Vite (:5173) and Django (:8000) are different origins. Rather than enabling CORS, the Vite dev server **proxies `/api/*` to Django**, so the browser only ever talks to :5173.

- Cookies and CSRF protection work exactly as Django intends.
- No CORS configuration or `django-cors-headers` is needed.
- Development behaves like the intended single-origin production setup.

CORS is the right tool when a frontend and an API really live on different domains; here they don't.

**Proxy setup.**

- The Vite dev server forwards `/api`, `/admin` and `/static` (Django's static files, used by the admin and Swagger UI) to Django at `127.0.0.1:8000`, so the browser really only talks to :5173.
- It keeps the browser's `Host` header (`changeOrigin: false`, Vite's default). Django's CSRF check compares the browser's `Origin` header with the request's `Host`, so the check passes without listing `http://localhost:5173` in `CSRF_TRUSTED_ORIGINS`. Absolute URLs Django builds, such as pagination links, also point at :5173.

### 6.3 CSRF and SameSite

**The attack.** Browsers attach a site's cookies to every request to that site, whichever page triggered it. A malicious page could therefore make a logged-in reader's browser send `DELETE /api/notes/42/`. The malicious page can make the browser *send* requests to us, but it cannot *read* our cookies or responses.

**The defence.** Django's standard approach for single-page apps:

1. Django sets a `csrftoken` cookie, which *our* JavaScript can read.
2. Our API client copies its value into an `X-CSRFToken` header on every POST, PATCH and DELETE. It reads the cookie each time, because Django issues a new token at login.
3. Django rejects unsafe requests whose header doesn't match the cookie.

Cookies are sent automatically; headers are not. Another site can't read the cookie, so it can't produce the header. A request with the cookie but without the matching header must have come from somewhere other than our own page.

**Why the CSRF cookie can be readable.** The session cookie is the credential, so it is hidden from all JavaScript. The CSRF token is useless without the session, and our code has to read it to copy it into the header.

**What else is in place:**

- **`GET /api/auth/session/` guarantees the CSRF cookie exists.** The app calls it on startup.
- **Login and logout enforce CSRF explicitly.** DRF only checks CSRF for logged-in requests. Without the explicit check, another site could silently log a reader into the attacker's account (login CSRF); notes the reader then wrote would be visible to the attacker.
- **`SameSite=Lax`** (Django's default) is a second, independent lock. The browser leaves our cookies off form posts and background requests coming from other sites.
  - It doesn't cover subdomains of the same site, or ordinary link clicks. That's why the token stays, and why GET requests never change data.
- **Only JSON request bodies are accepted**, so a plain HTML form on another site can't submit anything the API will accept.
- **CSRF protection is not XSS protection.** It defends against *other sites*. Script injected into *our* page (XSS) is prevented separately: React escapes text, and note text is never rendered as HTML (AC-N11).

### 6.4 Session lifetime

- **Lifetime.** Django's default: a session lasts **2 weeks from login**, with no sliding extension.
- **Ending a session.** Logging out deletes it on the server. Expiry and logout in another tab both surface as a 401 on the next request (J9, §6). A different reader logging in from another tab produces no 401; the tab notices when it re-checks the session (§8.5).
- **No separate renewal mechanism.** Refresh tokens exist to work around JWTs that can't be extended on the server; server-side sessions don't need them.
- **Why not sliding expiry or a short lifetime.** A sliding expiry keeps active readers logged in but costs a database write per request. A short lifetime suits high-risk data, not a reading journal. Either is a one-setting change.

### 6.5 Signalling "not logged in": 401, not 403

HTTP requires a 401 response to say how to authenticate, in a `WWW-Authenticate` header. Cookie-based sessions have no standard value for that header, so DRF's `SessionAuthentication` answers **403** instead. A failed CSRF check is also 403, so the frontend couldn't tell "your session expired" apart from "forbidden".

**Decision.** `accounts` provides a small subclass of `SessionAuthentication` that supplies a header value (e.g. `Session`). DRF then returns **401 for "not logged in"**, and 403 keeps meaning CSRF failure or "not allowed". Browsers only show their built-in login popup for `Basic`, so a custom value is safe.

This gives the frontend one rule: **any 401 means the reader is logged out** (§8.5). That rule drives J8, J9, AC-A7, AC-A8 and AC-N12.

### 6.6 Authorization

- **Deny by default.** DRF's global default permission is `IsAuthenticated`, and catalog endpoints explicitly opt in to public access. Forgetting a permission makes an endpoint too private, never too public.
- **Ownership is enforced by filtering, not by checking after fetching.** Every notes query starts from `Note.objects.filter(user=request.user)`.
  - Another reader's note is simply not found, so the response is a 404 that looks exactly like a missing note (AC-N6), and its existence isn't revealed.
  - Lists, detail, edit and delete all go through the same filtered query.
  - **Pagination happens after owner filtering.** The notes list pages the owner-filtered query, so `count`, page boundaries and "Invalid page." responses depend only on the reader's own notes and reveal nothing about anyone else's.
  - An "is owner" permission check was rejected: it returns 403 (revealing that the note exists), doesn't cover lists, and would be redundant.
- **The server decides placement.** A note's owner comes from the session and its book from the URL. Neither can be set or changed by the client (AC-N7, §5.5).
- **Personalized results require login.** `has_notes=true` from a visitor gets 401 (AC-S3). Book data and note data are returned by separate endpoints, so public responses never contain private data.
- **Staff can read notes in Django admin.** Admin access to notes is in scope (spec §3), so staff can read every reader's notes. "Readers never see each other's notes" (§1) applies to readers.

| Endpoint | Visitor | Reader |
|---|---|---|
| `GET /api/books/`, `/api/books/{id}/`, `/api/authors/`, `/api/authors/{id}/`, `/api/genres/` | 200 | 200 |
| `GET /api/books/?has_notes=true` | 401 | 200, only books with their own notes |
| `GET` / `POST /api/books/{id}/notes/` | 401 | 200 (paginated) / 201, own notes only |
| `GET` / `PATCH` / `DELETE /api/notes/{id}/` | 401 | Own note: 200 / 200 / 204. Another reader's note: 404 |

### 6.7 Auth endpoints

| Endpoint | Behaviour |
|---|---|
| `GET /api/auth/session/` | Always 200: `{"user": {"id", "username"}}`, or `{"user": null}` for visitors (being a visitor isn't an error). Ensures the CSRF cookie is set. |
| `POST /api/auth/login/` | CSRF-protected. 200 with `{"user": ...}`, or 400 with one generic error for any wrong credentials (AC-A2): `{"non_field_errors": ["Invalid username or password."]}`, DRF's standard shape (§7.3). Django's `login()` issues a new session id and CSRF token. Deactivated users can't log in. |
| `POST /api/auth/logout/` | CSRF-protected. Deletes the session on the server. Always 204, even when already logged out. |

**CSRF on login and logout** is enforced with DRF's own check (`SessionAuthentication.enforce_csrf`), called first in both views, so a failure is DRF's JSON 403, `{"detail": "CSRF Failed: …"}`. Checking it before the credentials means a cross-site login is refused before it's attempted. Django's `csrf_protect` decorator was rejected because its failure is an HTML page, and the API answers only in JSON (§4).

### 6.8 Threats and mitigations

| Threat | Mitigation |
|---|---|
| Cross-site request forgery on note writes | CSRF token header plus `SameSite=Lax` (§6.3) |
| Login CSRF (logging a reader into the attacker's account) | CSRF enforced explicitly on login and logout; JSON-only request bodies |
| Script injection (XSS) stealing the login | HttpOnly session cookie; React escapes text; notes never rendered as HTML (AC-N11) |
| Session fixation | `login()` issues a new session id |
| Discovering valid usernames | One generic login error (AC-A2); Django hashes a password even for unknown usernames, so timing doesn't reveal them |
| Guessing note ids to read or change others' notes | Owner-filtered queries; 404 indistinguishable from a missing note (AC-N6) |
| Faking ownership or moving notes | Owner from the session, book from the URL; request fields ignored (AC-N7) |
| Leaking personalized results | `has_notes` requires login; public and private data in separate responses |
| The next reader on a shared browser seeing the previous reader's cached data or unsaved draft | Private cache entries keyed by reader and removed at every authentication boundary; in-flight private requests cancelled; drafts discarded on logout and whenever a reader logs in (§8.5, AC-A8) |
| Open redirect after login | Return target passed in router state, never read from the URL (§8.6) |
| Reusing a session after logout | Server-side session deletion (AC-A5) |
| Oversized input or responses | Search and author search ≤ 100 characters, `page_size` ≤ 100, author `limit` ≤ 20, note body ≤ 5,000 characters. Book and note lists are paginated and author suggestions bounded; only the short genre list is returned in full. |
| Password brute force | **Not mitigated.** Rate limiting is out of scope (spec §3); see §10 |

## 7. API design

### 7.1 Endpoints

| Method and path | Purpose | Access |
|---|---|---|
| `GET /api/books/` | Book list: search, filter, sort, paginate | Public (`has_notes` requires login) |
| `GET /api/books/{id}/` | Book detail | Public |
| `GET /api/authors/` | Author suggestions for the filter: `search` and `limit`, ordered by `sort_name` (§7.5) | Public |
| `GET /api/authors/{id}/` | One author, to show the selected filter when a URL contains `author=<id>` | Public |
| `GET /api/genres/` | Genre filter options, the complete list, ordered by name | Public |
| `GET /api/books/{id}/notes/` | The reader's notes on this book, newest first, 20 per page | Reader |
| `POST /api/books/{id}/notes/` | Add a note to this book | Reader |
| `GET` / `PATCH` / `DELETE /api/notes/{id}/` | Read, edit or delete one of the reader's notes | Reader (own notes only) |
| `GET /api/auth/session/`, `POST /api/auth/login/`, `POST /api/auth/logout/` | Authentication (§6.7) | Public |
| `GET /api/schema/`, `GET /api/docs/` | OpenAPI schema and Swagger UI (§7.7) | Public |

- **Note collections live under their book; a single note has its own address.**
  - When creating a note, the book comes from the URL, so it can't be faked. An unknown book returns 404 for both GET and POST (AC-N8), not an empty list.
  - Once created, a note's id identifies it on its own. Repeating the book id in its URL would only add something else to check.
- **Book and notes are separate requests.** The book detail response is the same for everyone, so it never carries private data.
- **Representations:**
  - **Book list item:** `id`, `title`, `author` `{id, name}`, `genre` `{id, name}`, `publication_year`.
  - **Book detail:** the same plus `description`.
  - **Note:** `id`, `body`, `page`, `created_at`, `edited_at`.
  - **Author (suggestions and detail) and genre:** `id`, `name`. Author suggestions and genres are plain JSON arrays, not paginated envelopes (§7.4).
  
  Author and genre are small objects so the UI has the name to display and the id for filtering and links (AC-X2).

### 7.2 Conventions

- **JSON only, with `snake_case` field names end to end.** Every field has one name in the model, database, tests, network tab and error messages. A naming-conversion layer would be code that exists only for style.
- **Timestamps** are ISO 8601 in UTC. The UI shows them in the reader's local time.
- **Editing uses PATCH only** (PUT is disabled).
  - POST creates something new in a collection, so repeating it creates a duplicate (hence AC-N2).
  - PATCH sets the given fields, so repeating it gives the same result.
  - The edit form sends both `body` and `page`. `"page": null` clears the page (AC-N4).
- **No URL versioning.** There's one client, released together with the API.

### 7.3 Status codes and errors

| Code | Meaning |
|---|---|
| 200 | Successful read or edit |
| 201 | Note created (the body contains the new note) |
| 204 | Note deleted; logged out |
| 400 | Invalid note fields, invalid query parameter values, or wrong login credentials |
| 401 | Not logged in, including `has_notes` requested by a visitor |
| 403 | CSRF check failed |
| 404 | Doesn't exist or isn't yours; unknown book or author; page out of range |
| 405 | Method not supported (e.g. PUT on a note) |
| 415 | A request body that isn't JSON (a form, multipart or plain text) |
| 500 | Never caused by anything the client sends (AC-S8). The one exception is in debug mode: with `DEBUG` on, more than 1,000 query parameters make Django's debug page fail, and the development server answers a plain-text 500. |

Errors use DRF's standard shapes:
- **General errors:** `{"detail": "Not found."}`
- **Validation errors:** one list of messages per field, e.g. `{"page": ["Ensure this value is less than or equal to 10000."]}`

Every `/api/` error is JSON in these shapes, including those no DRF view answers:
- **A path no route matches**, including an id that isn't a number, gets `{"detail": "Not found."}` from a catch-all route. API URLs end in a slash, so one without it gets this 404 rather than a redirect, which would turn a POST into a GET.
- **A request Django refuses before any view** (a `Host` outside `ALLOWED_HOSTS`, a body over 2.5 MB, more than 1,000 fields) gets `{"detail": "Bad request."}`.
- **An unexpected error** gets `{"detail": "A server error occurred."}`, and is logged with its traceback (§4).

The last two come from `handler400` and `handler500`, which Django uses only with `DEBUG` off; with it on, it shows its debug page. Other paths, such as the admin, keep Django's own pages.

The frontend shows field errors next to the matching form fields (AC-N3). A custom error envelope was rejected: it would be extra code and tests with little benefit for a single client.

### 7.4 Pagination

Pagination is chosen per endpoint, not set globally:

| Endpoint | Behaviour |
|---|---|
| `GET /api/books/` | Page-number pagination; `page_size` defaults to 12 |
| `GET /api/books/{id}/notes/` | Page-number pagination; `page_size` defaults to 20 |
| `GET /api/authors/` | Not paginated: a bounded list of suggestions (`limit`, §7.5) |
| `GET /api/genres/` | Not paginated: the complete list |

`GET /api/authors/{id}/` returns a single author.

- **Why not a global default.** DRF applies a global pagination class to every list view. Genres and author suggestions would then come back in pages they don't need, and notes would inherit the book list's page size. Setting the pagination class on the two views that page keeps each contract explicit, and the generated schema shows the paginated envelope only where it applies (§7.7).
- **Style.** Both paginated endpoints use the same DRF page-number pagination class and its standard response:

  ```json
  { "count": 100, "next": "…?page=3&page_size=12", "previous": "…?page=1&page_size=12", "results": [ … ] }
  ```
- **Clients choose the page size** with `page_size`, up to 100 on both endpoints. Different screens can request different sizes, so the response doesn't include a page count based on a size fixed on the server.
- **The frontend always sends its own `page_size`** (12 for books, 20 for notes) and works out the page count as `ceil(count / page_size)`. It never relies on the server default, so the page size is defined in only one place per client.
- **`page_size` isn't part of the browser URL**, because this UI always shows 12 books per page (spec §5.6) and 20 notes per page (spec §5.5).
- **An empty `page` or `page_size`** means the default: page 1, or the endpoint's page size.
- **`page` takes only a number.** DRF also accepts `page=last` by default. That's turned off, because the schema documents `page` as an integer, so `page=last` is out of range like `page=abc`.
- **A page out of range** (`page=99`, `page=0`, `page=abc`) returns DRF's default 404, `{"detail": "Invalid page."}`, on both endpoints.
  - The book list then shows "This page doesn't exist" with a link to the first page (AC-L4). Silently showing the last page instead was rejected, because the URL would no longer describe what's on screen.
  - The notes section, whose page isn't in the URL, returns to page 1 (§8.7, AC-N13).

### 7.5 Query parameters

**Book list** (`GET /api/books/`)

| Parameter | Accepts | Behaviour |
|---|---|---|
| `search` | Free text, up to 100 characters after trimming | Split on any run of whitespace. Every word must appear in the title or the author name, case-insensitively, with partial matches allowed. `%`, `_` and quotes match literally. Empty means no search. |
| `author` | Author id | Exact match |
| `genre` | One or more genre ids, as repeated parameters (`genre=2&genre=5`) | A book matches if its genre is any of them (OR). Combined with the other parameters by AND, like every filter. |
| `has_notes` | `true` | Only books the reader has noted. Login required (401 otherwise); `false` is the same as leaving it out. |
| `sort` | `title`, `-title`, `author`, `-author`, `year`, `-year` | Default `title`; a leading `-` means descending |
| `page` | 1 up to the last page | Out of range gives 404 (§7.4) |
| `page_size` | 1–100 | Default 12 |

- **The browser URL and the API use the same parameter names, with no translation layer.** The frontend's list-state module parses typed values such as `page` once; a value it can't parse shows the same view the API's error would, without a request. Repeated `genre` parameters stay repeated, and the frontend adds `page_size`. Query strings are always built with `URLSearchParams`, which encodes spaces, `&`, `%` and non-ASCII letters correctly.
- **Filter options only list authors and genres that have at least one book.** Genres are a short, curated list, returned in full. Authors grow with the catalog, so the frontend searches them on the server rather than downloading them all (below).
- **Implementation.**
  - A django-filter `FilterSet` declares `search`, `author`, `genre`, `has_notes` and `sort`. The spec-specific rules are small methods on it.
  - `genre` is a multiple-choice filter, so every id is validated and the selected ids are combined with OR.
  - The pagination class handles `page` and `page_size`.
  - DRF's built-in `SearchFilter` was rejected because it also splits on commas and treats quoted text as a phrase, whereas spec §5.6 requires quotes to match literally.
  - DRF's `OrderingFilter` was rejected because by default it sorts case-sensitively and adds no tiebreakers, whereas spec §5.6 requires both. It also silently ignores invalid sort values, where this API returns 400 (below).

**Invalid values** (spec §8, AC-S8):

- **Malformed values return 400.** Every bad filter parameter gets its own message in the same response. `page_size` and `limit` are checked only once the filters are valid, so their errors appear after the filter errors are fixed. Examples:
  - `sort=banana`
  - `author=abc`, or `author=999` when no such author exists
  - `genre=abc`, or several `genre` values where any one doesn't exist
  - a search over 100 characters
  - `page_size=abc`, `page_size=0` or `page_size=500`
  - `limit=abc`, `limit=0` or `limit=50` on the author suggestions (below)
- **`page_size` needs a small pagination subclass.** DRF by default silently falls back to the default page size, or caps it at the maximum. Rejecting instead means a client never gets a different page size from the one it asked for. The book list and the notes list both use it.
- **What the UI shows:** "This link contains invalid filters", with "Clear all".
- **Unknown parameter names are ignored**, e.g. `utm_source`. Rejecting them would break links that pick up tracking parameters.
- **Why reject rather than ignore bad values:** if invalid values were silently ignored, a shared link could show results that don't match its URL, and frontend bugs would go unnoticed.

**Author suggestions** (`GET /api/authors/`), a small typeahead endpoint rather than a general author list:

| Parameter | Accepts | Behaviour |
|---|---|---|
| `search` | Free text, up to 100 characters after trimming | The author's name contains the text, case-insensitively. `%`, `_` and quotes match literally. Empty means no search. |
| `limit` | 1–20 | The maximum number of suggestions; default 10 |

- **Results** only include authors with at least one book, ordered by `sort_name`, then id. Without a search, the first authors in surname order are returned.
- **The response is a plain list** of `{id, name}`, not a paginated envelope. A typeahead only needs the best few matches, so page numbers and a total count would be unused.
- **Invalid values return 400**, like the book list's. `limit` is rejected rather than capped, for the same reason as `page_size`.
- **Implementation.** A small author FilterSet declares `search`. `limit` isn't a filter, so the view validates it and applies it after filtering and ordering.
- **`GET /api/authors/{id}/`** returns one author, or 404. The frontend uses it to show the selected author's name when a URL contains `author=<id>`, without downloading the list and whether or not that author would appear among the first suggestions (§8.7).

### 7.6 How the spec's query rules are built

- **Search.** Each word becomes "title contains the word, or author name contains it", and all words must match. Django escapes `%` and `_`, so they match literally. Each book has exactly one author, so matching on the author never returns duplicate rows.
- **Several genres.** "Genre is one of the selected ids" (`IN`). Each book has exactly one genre, so this never returns a book twice, and the data model is unchanged.
- **Author suggestions.** "Name contains the text", ordered by `sort_name` then id, and cut to `limit` only after ordering, so the suggestions are always the first matches in surname order.
- **`has_notes`.** Implemented as an `EXISTS` subquery ("does a note by this reader exist for this book?"). Joining the notes table instead would return a book once per note and require de-duplication.
- **Sorting** ignores case and always ends with tiebreakers, so the order is fully determined and no book is repeated or skipped across pages (AC-S4):
  - title → id
  - author `sort_name` → title → id
  - year → title → id
  - In a descending sort only the chosen field is reversed: ties are still broken by title A–Z, then id. "Year, newest first" lists 1985 as *Blood Meridian*, *Love in the Time of Cholera*, *The Handmaid's Tale*.
- **Notes** are ordered newest first by `created_at`, then by id (also descending), so notes saved in the same instant keep a fixed order and paging never repeats or skips one (AC-N13).
- **Note counts** (AC-X1, an enhancement) are calculated in the same list query, never one query per book.

### 7.7 OpenAPI schema and API docs

- **Generation.** drf-spectacular generates an OpenAPI schema from the serializers, views, FilterSet and pagination class.
- **Endpoints.** The schema is served at `/api/schema/`, and Swagger UI at `/api/docs/`. Reviewers can browse and try every endpoint there, including while logged in, because the docs page shares the session. The page describes endpoints only, never data.
- **The schema file is committed** as `backend/openapi.yaml`, so the API contract is readable without running anything.
  - It's exported with `manage.py spectacular --validate --fail-on-warn`, so a view drf-spectacular can't fully describe fails the export instead of producing a vague schema.
  - The frontend generates its TypeScript types from that file with openapi-typescript into `frontend/src/api/schema.d.ts`, and the generated types are committed too.
  - `COMPONENT_SPLIT_REQUEST` is on, so request and response bodies get separate types: read-only fields such as `id` and `created_at` never appear in a request type.
  - CI regenerates both and fails if either differs from what's committed (§9.4).
- **The schema carries the per-endpoint contracts.**
  - The repeated `genre` parameter is documented as an array of ids (`style: form`, `explode: true`). openapi-typescript turns it into a number array, and `URLSearchParams.append` sends it as repeated parameters.
  - Because pagination is set per view (§7.4), the book and notes lists are documented with the paginated envelope, and author suggestions and genres as plain arrays.
  - The author `search` parameter and the author detail endpoint are documented like the others.
  - **Every error response an operation can give is documented** (§7.3), with what causes it: 401 and 403 as `Detail` (`{"detail": …}`), 404 as `Detail`, and a 400 for query parameters as `ValidationError` (a list of messages per field). A 400 for a request body is `BadRequest`, either of the two, because a body that isn't JSON gets `{"detail": …}`. 415 and the JSON 404 for unknown paths aren't repeated on every operation.
  - The bounds are in the schema too: `page_size` from 1 to 100, and `search` up to 100 characters.
- **Some views need annotations.** drf-spectacular can't fully work out a few hand-written pieces, so they are annotated: the auth endpoints, the custom session authentication class, the author `limit` parameter (validated in the view rather than a FilterSet), the `search` length (django-filter's `max_length` doesn't reach the schema), the `page_size` bounds, and the error responses. The error components and helpers live in `config/schema.py`.

## 8. Frontend architecture

### 8.1 Stack

React 19, TypeScript (strict mode), Vite, react-router-dom v7, TanStack Query, and SCSS modules. The build script type-checks with `tsc` before `vite build`, because Vite on its own removes types without checking them.

### 8.2 Structure and routes

```
frontend/src/
├── api/          client.ts (fetch wrapper, ApiError, CSRF header),
│                 generated schema types, books.ts, notes.ts, auth.ts
├── auth/         useAuth, LoginPage
├── books/        BookListPage, BookDetailPage, AuthorFilter (combobox),
│                 GenreFilter (multiselect), sort control, query hooks
├── notes/        NotesSection, NoteForm, NoteItem, query and mutation hooks
├── components/   shared: Layout and Header, Pagination (book list and
│                 notes), LoadingState, ErrorState, EmptyState, NotFound,
│                 ErrorBoundary and ErrorFallback, icons.tsx (inline SVG icons)
├── styles/       _variables.scss, _mixins.scss, global.scss
└── App.tsx, main.tsx, errorReporting.ts
```

**Where code goes:**
- **Components:** one exported component per file, named after it, with its `.module.scss` beside it. Private sub-components used only by that component may live in its file. The one exception is `components/icons.tsx`, which exports the set of inline SVG icons.
- **Hooks, helpers and types:** they live in their only user's file. Once two or more modules use one, it moves to its own file, or to the module of its concern, in the feature folder.
- **Modules grouped by concern:** a feature's query keys and query hooks live together in `<feature>/queries.ts`. Each resource's API functions, and the types it takes from the generated schema, live in `api/<resource>.ts`. Session state lives in `auth/session.ts` (§8.5), and the list state in `books/listState.ts` (§8.7).
- **Folders:** by feature (`auth`, `books`, `notes`), with shared UI in `components`, the API layer in `api`, styles in `styles` and test utilities in `test`. Tests sit beside the module they test.

| Route | View |
|---|---|
| `/` | Book list |
| `/books/:id` | Book detail. A non-numeric id shows "Book not found" without calling the API (AC-D2). |
| `/login` | Login. Redirects to the catalog if already logged in (AC-A6). |
| `*` | "Page not found" (AC-D4) |

### 8.3 API client and types

A thin typed wrapper around `fetch`; no axios or generated client library. It:

- sends and receives JSON on the same origin
- reads the `csrftoken` cookie on every POST, PATCH and DELETE and sets `X-CSRFToken`
- builds query strings with `URLSearchParams`, appending one `genre` parameter per selected genre
- passes TanStack Query's abort signal to `fetch`, so cancelling a query also stops its request (§8.5)
- throws an `ApiError` carrying the status and DRF's error body for any non-2xx response, and a separate error type when the network itself fails

Each resource has a small module (`books.ts`, `notes.ts`, `auth.ts`) that uses the types generated from the OpenAPI schema (§7.7).

### 8.4 Server data with TanStack Query

Each spec need below is met by TanStack Query rather than custom code:

| Need | How TanStack Query covers it |
|---|---|
| Loading, error and retry states on every view (AC-L2, §7) | Built-in query states and `refetch` |
| Going back from a book restores the list without a reload (AC-D3) | Results are cached by their query parameters, so the list shows the cached result immediately and refreshes it quietly |
| A slow response for an earlier search must not overwrite a later one (AC-S9, AC-S10) | Each result is stored under its own parameters; this covers the author suggestions too |
| Note changes appear without a page reload; Save is disabled while saving (AC-N9, AC-N2) | Mutations with a pending state. Then every cached page of that book's notes is marked stale and the visible one refetched, because a create or delete shifts notes between pages (AC-N13). |
| One place that reacts to a 401 (J9) | Global error hooks on the query and mutation caches |
| A reader's private data never outlives their session (AC-A8) | Private query keys share one root, so one call cancels and removes them all (§8.5) |

**Retries and refetching.**

- **A 4xx response is never retried.** It won't change on a second try, and TanStack's default of three retries with backoff would hold "Book not found" and "This page doesn't exist" behind about 7 seconds of loading. A network error or a 5xx is retried once; the Retry button covers the rest.
- **A query that failed with a 4xx isn't refetched when the tab regains focus.** A query without data shows its loading state again while it refetches, so a "not found" view would turn back into "Loading…" every time the reader returns to the tab. Every other query keeps TanStack's refetch on focus. The session query sets its own focus policy (§8.5).
- **A view that has data keeps showing it when a background refetch fails.** The error state appears only when there's nothing to show, so a failed refetch on tab focus can't unmount the book page and an open note form with it. A 404 still shows "Book not found".

**Unexpected errors.** They all go to one function, `reportUnexpectedError` in `errorReporting.ts`. It writes to the console, and it's where an error service would be called; deployment is out of scope. Three sources reach it:
- **Render errors.** An error boundary around the routes, inside `Layout`'s `<main>`, replaces only the page with "Something went wrong on this page.", Reload and Back to the catalog, so the header stays usable. Any navigation clears it: the boundary resets when the location's key changes while it shows its fallback, which covers going back to the catalog from a list at the same path. A second boundary around `App`, in `main.tsx`, catches the rest, such as the header or startup; its link is a plain `<a>`, because the router may be what failed. React still needs a class component for a boundary, so no dependency is added.
- **Request code.** The cache hooks report an error that is neither an `ApiError` nor a network error: a bug in a query or mutation function, which the view's Retry would otherwise hide. API errors aren't reported here; the server logs its own 5xx (§4).
- **Everything else.** Listeners for `error` and `unhandledrejection` on `window`, added in `main.tsx` before the first render.

Hand-written `useEffect` fetching was rejected because it would mean writing request cancellation, race protection, caching and refetching ourselves, all of which are easy to get wrong. React Router loaders were rejected because they have no cache, would make every search pause a navigation, and fit inline note editing poorly.

### 8.5 Authentication state, the 401 rule and private data

- **The login state is the cached result of `GET /api/auth/session/`**, stored as a TanStack Query query under `['session']`. That key is outside the `private` root, so the clean-up below never removes it.
  - Logging in, logging out and receiving a 401 all update that one value, and a `useAuth()` hook reads it.
  - **Startup.** The routes render only after the first answer arrives. Until then the app shows a brief loading state, or an error with Retry if the request fails. No component ever sees an unknown session: a logged-in reader never sees a flash of the logged-out header, and the CSRF cookie is always set before the first write. `useAuth()` throws if it's ever called before then.
  - The session is re-checked whenever the tab regains focus. That is how a tab notices a logout or a different reader's login in another tab before its next failing request; a different reader's login never produces a 401 at all.
  - **Query settings.** `staleTime: Infinity`, so a component calling `useAuth()` never triggers a fetch, and `refetchOnWindowFocus: "always"`, which re-checks on every focus even though the data is never stale.
- **Any 401 marks the reader as logged out.** The header, the notes section and the "Books with my notes" control switch to their logged-out views (AC-A7, spec §6).
  - **Exception:** a note form with unsaved text stays on screen. It shows "Your session has expired" with a way to log in again, and keeps the text (AC-N12). A logout in this tab, or a login, discards the draft instead (below).
  - Nothing redirects automatically.
- **Logging out** drops `has_notes` from the URL (J8), clears private data and discards unsaved note drafts, as below.

**Private data at authentication boundaries** (AC-A8)

A response is *private* if it depends on who is logged in: a reader's notes, `has_notes` book lists and, if AC-X1 is built, every book list fetched by a logged-in reader, because it carries their note counts. Everything else is *public*: book lists for visitors, book detail, authors and genres.

- **Private query keys share one root and include the reader's id**, e.g. `['private', readerId, 'notes', bookId, page]`. The root lets one call find every private entry. The id means a result is only ever stored under the keys of the reader it was requested for, so the next reader's queries can't be answered from it.
- **One function updates the session and, whenever the reader changes (including to or from nobody), runs the clean-up.** That covers logging out, logging in, any 401 (expiry, or logout in another tab), and a re-check that finds a different reader or none. The clean-up:
  1. cancels in-flight private queries; TanStack Query discards their results, so a late response can't refill the cache
  2. removes every private entry from the cache
- **In the code** (`auth/session.ts`), that function is `applySession`, the only code that writes the session. Two callers:
  - the session query, with each answer at startup and on every re-check. An answer that arrives after its check was cancelled is dropped.
  - `changeSession`, the entry point for login, logout and any 401. It first cancels any session check still in flight. Otherwise a re-check sent just before a logout could answer with the old reader after the logout and put them back on screen.
- **Private queries run only while a reader is logged in** (their `enabled` option depends on the session), so nothing fetches private data between a 401 and the next login.
- **Every private query is built with `privateQueryOptions(user, key, queryFn)`**, which puts the key under the `private` root with the reader's id and sets `enabled`. Neither can be forgotten.
- **No view shows one reader's data while another's loads.** Where a view keeps previous results on screen while the next page loads, it does so only between keys of the same reader, never across readers or from private to public results.
- **Public data stays cached.** The catalog survives a logout without reloading. More importantly, the book page stays mounted after a 401, which is what keeps an open note form on screen (AC-N12).

**Unsaved note drafts at authentication boundaries** (AC-A8, AC-N12)

A draft is the text and page in an open note form, whether creating or editing. It lives in the form's component state, never in the query cache, so clearing the cache never erases it by accident. Whether it survives is a separate decision, made by the same session function:

| Boundary | Private cache | Unsaved drafts |
|---|---|---|
| The session ended on its own: a 401, or a re-check that finds nobody | Cleared | Kept in the open form, with the expiry message and a login action (AC-N12) |
| Logging out in this tab | Cleared | Discarded |
| A reader is now logged in: a login in this tab, or a re-check that finds a reader this tab wasn't showing (a different one, or anyone after the session ended) | Cleared | Discarded |

- **Keeping a draft is only for the reader whose session just ended**, so a note isn't lost to expiry. An open form with unsaved changes is rendered independently of the cached notes list, so it survives the cache clean-up.
- **Expiry and a logout in another tab look the same from this tab** (a 401, or a re-check that finds nobody), so both keep the draft. Only a logout made in this tab is known to be deliberate.
- **Once any reader is logged in, the previous draft is gone**, so a new reader never sees it. That includes the same reader logging in again, since AC-N12 already says a draft doesn't survive a login.
- **Discarding is one step.** `applySession` increments a drafts counter, stored in the query cache under `['drafts']`, outside the `private` root. The notes section includes the counter in its React `key`, so the change remounts it, which resets every open form, and the notes page, to its initial state. The counter changes in the same call that removes the private entries, so no render shows a new reader next to the old draft.
- **Only the header's logout counts as logging out in this tab.** It calls `changeSession` with `{ loggedOutHere: true }`. A 401 or a re-check passes no flag, so the session function decides from the old and new reader alone: a reader the tab wasn't showing discards the draft, and finding nobody keeps it.

Rejected alternatives:

- **Clearing the whole cache at every boundary.** Simple, but it would also drop the book being viewed. After a 401 the page would fall back to its loading state and could take the open note form with it.
- **A separate cache per reader.** More machinery, and it would keep the previous reader's data in memory, the opposite of the goal.

### 8.6 Returning to the right page after login

- **How it works.** "Log in" links pass the current location in React Router's navigation state (`state: { from }`). After a successful login, the app navigates there, or to the catalog if there's no stored location (AC-A1, AC-N10).
  - The login page fixes its target when it opens, and only a login made on that page uses it. Opened while a reader is already logged in, it goes to the catalog (AC-A6).
  - The redirect replaces the login page's history entry, so Back doesn't return to it.
  - The stored location's own state goes with it, so "Back to books" still works on the page the reader returns to.
- **Why it's safe.** The return target is never read from the URL, and a link from another site can't carry router state. There is therefore no attacker-controlled redirect target, so an open redirect is impossible by design rather than prevented by validation.
- **Rejected alternative.** A `?next=` URL parameter would need careful validation: `//evil.com` looks like a path but leads to another site.
- **Trade-off.** Router state lives in `history.state`, so refreshing the login page keeps the return target. A login page opened without it, by typing `/login` or opening the "Log in" link in a new tab, sends the reader to the catalog, which AC-A1 allows.

### 8.7 List state in the URL

- **The URL is the only copy** of search, filters, sort and page. Components read them with `useSearchParams`; a second copy in React state could drift out of sync.
  - The exceptions are text being typed. The search box text is written to the URL after a 300 ms pause (AC-S9). The author selector's text never is: only the id of the author picked goes into the URL (AC-S10).
- **Several genres are repeated parameters** (`?genre=2&genre=5`), read with `getAll`. They are written in ascending id order without duplicates, so a selection has exactly one URL and one cache key.
- **The selected author is restored from its id.** The selector shows the name from `GET /api/authors/{id}/`, so a bookmarked `?author=12` works without downloading the author list. Suggestions are fetched with the same 300 ms pause and cached by search text. If the id doesn't exist, the book list's own 400 already shows "This link contains invalid filters" (§7.5).
- **Typing replaces the current history entry.** Back doesn't step through "t", "to", "tol"… The search box's × replaces it too, writing the empty search at once.
- **Changing a filter, the sort or the page adds a history entry**, so Back undoes one deliberate change at a time.
- **URL changes render at once.** The router is set to `useTransitions={false}`, so a location change renders as an ordinary update instead of a React transition. As a transition, a control that reads the URL showed its old value for one frame after a click, before the new URL rendered. That affected the "Books with my notes" checkbox and the author field after its ×.
- **Resets and clean-up:**
  - Changing search, filters or sort removes `page`, returning to page 1 (AC-S6).
  - Empty parameters are removed, and search text is trimmed before it's written to the URL.
  - For visitors, `has_notes` is removed by replacing the history entry (AC-S3). `page` is removed with it, because the page number belonged to the personalized list.
- **The URL parameters are the list query's cache key**, under the reader's private root when the results are personalized (§8.5). Back navigation therefore restores both the controls and the results (AC-D3, AC-S5).
- **The notes page is component state, not part of the URL** (AC-N13). Notes are private, so a link to a page of them is never shared, and history entries for note pages would make Back from a book step through them before returning to the list (AC-D3). Opening or refreshing a book starts at page 1.
  - Creating a note goes to page 1, where the new note appears. Editing stays on the current page.
  - Deleting refreshes the current page. If that page no longer exists (the deleted note was the only one on the last page), the section moves to the previous page.
  - If the API answers "Invalid page." (notes deleted in another tab), the section returns to page 1. With no URL to keep truthful, that is more useful than the book list's "This page doesn't exist" view.

### 8.8 Styling and accessibility

- **Styling.** Each component has its own `Component.module.scss`. Shared variables and mixins are loaded with `@use` (Sass's older `@import` is deprecated).
- **Shared styles**, in `styles/`:
  - **`_variables.scss`** holds the design values: the palette, the type scale, spacing, radii, shadows, the control and header heights, layers and motion.
  - **`_mixins.scss`:**
    - `control`, for inputs, the select, textareas and the Genres button
    - the button styles: `button-primary`, `button-danger`, `button-text($color)` and `button-icon`, all built on `button-base`
    - `card`
    - `notice`, a tinted panel with a bar down its left edge, used by notices, the session-expiry message, the error states and the login error
    - `focus-ring($color)`
    - `motion(...)`, which adds a transition only under `prefers-reduced-motion: no-preference`, so reduced motion is handled in one place
    - `narrow`, the one breakpoint (40rem)
  - **`global.scss`** styles links, buttons and form controls at the element level. Each of those rules sits entirely inside `:where()`, states included, so it has zero specificity. Any module class therefore overrides it, whatever order the sheets load in. Order matters here because `main.tsx` imports `App` before `global.scss`, so the global sheet comes last and would win ties.
  - **Choosing a button style.** A plain `<button>` gets the default style from `global.scss`. A component picks another by including a variant in its own module class (`.submit { @include button-primary; }`), so the markup changes only by a class name. The variants also work on links drawn as buttons.
- **Contrast** (WCAG 2 AA: 4.5:1 for text, 3:1 for control edges and focus indicators), computed from the values in `_variables.scss`:

  | Pair | Ratio |
  |---|---|
  | text on paper / on white | 14.6 / 15.8 |
  | ink headings on paper / on white | 12.1 / 13.0 |
  | muted on paper / white / surface hover | 5.7 / 6.1 / 5.4 |
  | muted on accent tint / mark tint / danger tint | 5.3 / 5.4 / 5.4 |
  | accent links and text buttons on paper / white / their hover tint | 5.6 / 6.1 / 5.5 |
  | accent link on mark tint (the session-expiry message) / its hover | 5.4 / 8.0 |
  | white on accent / on accent hover | 6.1 / 9.0 |
  | accent text on accent tint (genre badge) | 6.6 |
  | mark text on mark tint ("p. N" chip) | 7.0 |
  | text on mark tint / danger tint (notices, errors) | 14.0 / 14.0 |
  | danger on white / paper / danger tint | 6.6 / 6.1 / 5.8 |
  | white on danger / on danger hover | 6.6 / 8.7 |
  | white on ink / on-ink muted on ink | 13.0 / 8.7 |
  | control edge on white / paper / surface hover (needs 3) | 3.5 / 3.2 / 3.05 |
  | accent focus ring on paper / white / danger tint (needs 3) | 5.6 / 6.1 / 5.4 |
  | mark focus ring on ink (needs 3) | 6.9 |
  | header button edge on ink (needs 3) | 8.7 |

  - Two pairs are never used:
    - **amber on paper** (1.75:1): amber appears only on the header, as a light tint behind dark text, or as a decorative bar beside text
    - **accent on ink** (2.1:1): hence the amber focus ring in the header
  - Disabled controls are exempt (WCAG 1.4.3). They're shown at half opacity with a `not-allowed` cursor.
- **Focus rings.** A 2px ring, offset 2px, on `:focus-visible`: teal everywhere, and amber inside the ink header. A ring is removed only where another replaces it. A book card's title link draws its ring on the `::after` that covers the card, so the ring goes round the whole card.
- **Page titles** (WCAG 2.4.2). Each page renders its own `<title>` through `components/PageTitle.tsx`, as "<page> — Book Explorer": "Books", the book's title ("Loading book…" while it loads), "Log in", and each not-found view after its heading. React 19 places it in the document's head, ahead of `index.html`'s title, which stays the default until the app loads.
- **Focus on navigation.** When a navigation changes the path (opening a book, Back to books, logging in, Back and Forward), `Layout` moves focus to the new page's `<h1>`, which has `tabIndex={-1}`, so a screen reader announces the page.
  - **Not on the first load,** and not when only the search changes (filters, sort, page), which would pull focus from the control in use.
  - **A page still loading** gets focus on its heading once the heading appears, unless the reader has moved focus meanwhile.
  - **Without scrolling** (`preventScroll`). `focus()` scrolls its element into view by default, which on Back and Forward would undo the browser's scroll restoration that J1 relies on. A new page is already at the top.
  - **A page change in a list** moves focus to that list's heading: "Books" for the book list, "Your notes" for a book's notes. While the next page loads, "Loading…" replaces the pager, so the focused Next or Previous button would disappear and focus would fall to the page. The notes heading is scrolled into view, since the pager sits at the bottom of a long list.
  - **No ring on the heading.** `global.scss` removes the `:focus-visible` ring from a focused `h1` or `h2` with `tabindex="-1"`: it isn't a control, and a ring would make it look like one. The next Tab continues from it.
- **Sticky header:**
  - The header is `position: sticky` and keeps one fixed height (3.5rem). It never wraps: the username shrinks with an ellipsis instead.
  - `scroll-padding-top` on `html` is the header's height plus 2rem. An element that takes focus or is scrolled to therefore stops below the header, with room for a card's padding and focus ring (WCAG 2.4.11, technique C43).
  - The logout error is positioned just under the bar, so the bar's height never changes.
    - While it shows, it covers the top of the content, so it has a × button named "Dismiss". Dismissing it moves focus to Log out, because the button goes away.
    - That button's focus ring is teal, because the header's amber ring is 1.7:1 on the error's tint.
- **Restyled native controls:**
  - **The `<select>`** has `appearance: none` and a chevron drawn as an SVG data URI.
  - **Forced-colors mode** doesn't draw background images, so there the select goes back to its native appearance.
  - **The search box's ×** is the app's own button, named "Clear search", like the author field's "Clear author". It shows while the box has text, and returns focus to the box. The browser's own × is hidden: Chrome and Safari draw one and Firefox doesn't, so the box now looks the same in every browser.
  - **Icons in the markup** are inline SVG in `components/icons.tsx`. They're drawn in `currentColor`, so they stay visible in forced colors, and they're `aria-hidden`, so no accessible name changes.
- **Accessibility through semantic HTML**, with no component library:
  - real `<label>` and `<button>` elements
  - the sort as a native `<select>` for the field and one button that flips the direction: it shows an up or down arrow and is named "Ascending" or "Descending", after the current order
  - the genre filter as a button that opens a group of native checkboxes (closing rule below)
  - the author filter as a small combobox following the WAI-ARIA combobox pattern: a text input with a list of suggestions, usable with the arrow keys, Enter and Escape, with loading, no-match and error states (AC-S10)
  - the native `<dialog>` element for confirming a delete (AC-N5)
- **Why two custom filter controls.** A native `<select>` can't search a list on the server, and `<select multiple>` needs Ctrl- or Cmd-click to pick several values, which few people discover. `<datalist>` was rejected for authors: it matches on text rather than ids and can't show loading, no-match or error states. Both controls are small and built for this one purpose; no autocomplete library is added.
- **The genre panel's closing rule.** Besides its button and Escape:
  - **A click outside the control** (button and panel) closes it, and focus stays where the click put it.
    - The `document` listener is held only while the panel is open.
    - It checks the event's `composedPath()`, because a click inside can re-render and detach its target, which `contains()` would then miss.
    - It listens for `click` rather than `pointerdown`. On a touch screen, `pointerdown` fires before the browser knows the gesture is a scroll, so a swipe through the genres would close the panel.
  - **Focus moving to an element outside the control** closes it.
  - **Focus moving to nothing keeps it open.** That's a `null` `relatedTarget`, from a click on the panel's legend or padding, or from switching windows. Otherwise "clicking inside keeps it open" would fail. A click outside is still caught by the click rule.

## 9. Testing strategy

Test effort goes where a bug would do the most damage: authorization first, then security behaviour, then the correctness of the query features.

### 9.1 Backend (Django's test runner, DRF `APITestCase` and `APIClient`)

In priority order:

1. **Authorization matrix.**
   - Every notes endpoint returns 401 to a visitor.
   - **A book's notes list** returns 200 to a reader with only their own notes, whether or not another reader has notes on the same book.
   - **Creating a note** on a book returns 201, and the note is owned by the reader in the session.
   - **Reading, editing or deleting one note** succeeds for its owner (200, 200, 204). Another reader gets 404, exactly as for a note that doesn't exist (AC-N6).
   - No unauthorized request exposes or changes another reader's data. The tests check that the database is unchanged after a visitor's or another reader's attempt.
   - `user` and `book` fields sent in the request body are ignored.
   - The notes list's `count` and pages include only the reader's own notes: another reader's notes on the same book change neither.
   - `has_notes` returns 401 for a visitor, and `alice` and `bob` each see only their own noted books (AC-S5).
   - Repeated cases use `subTest`.
2. **Security behaviour.**
   - CSRF is tested with `APIClient(enforce_csrf_checks=True)`, because the default test client skips CSRF checks. Login, logout and note writes must fail without the token.
   - Reusing a saved session cookie after logout returns 401 (AC-A5).
   - A wrong password and an unknown username produce identical errors.
   - Deactivated users can't log in.
3. **Note validation, paging and delete rules.**
   - **Body:** empty, whitespace-only and over-length bodies are rejected; whitespace is trimmed; line breaks are kept.
   - **Page:** `0`, `-1`, `1.5`, `abc` and `10001` are rejected; `null` clears the page.
   - **`edited_at`** stays empty on create and is set only when the note actually changes.
   - **Paging:** 21 notes make pages of 20 and 1, newest first; notes with identical `created_at` keep a fixed order, and paging never repeats or skips one; an out-of-range page returns 404 and invalid `page_size` values return 400.
   - **Deletes:** deleting a book that has notes is refused and leaves everything in place; deleting a user removes only that user's notes.
4. **Query parameters.**
   - **Matching:** each filter alone and combined; several genres match any of them while still combining with author, `has_notes` and search; multi-word search; literal `%` and `_`; case-insensitivity.
   - **Sorting:** every sort, in both directions.
   - **Paging:** a sorted list with ties never repeats or skips a book across pages; `page_size` limits apply.
   - **Author suggestions:** partial, case-insensitive matches in `sort_name` order; only authors with books; the `limit` default and maximum; `GET /api/authors/{id}/` returns 404 for an unknown id.
   - **Bad input:** invalid values return 400 (including one unknown id among several `genre` values, and `limit=0` or `limit=21`), unknown parameter names are ignored, and an out-of-range page returns 404.
5. **Query efficiency.** `assertNumQueries` shows the book list takes the same number of queries for 3 books as for 30, and does the same for note counts (AC-X1).
6. **Seed migration and demo users.**
   - The catalog exists after migrating, with the 100 seeded books.
   - One round-trip test adds a book outside the seed, by a seeded author, then rolls the seed back. It checks that only the seeded books were removed, that the added book and its author remain, and that the notes migrations were unapplied with it, so the notes table no longer exists (AC-M2). It then migrates forward again, which must reuse the kept author.
   - The demo-user command is tested against AC-U1 to AC-U3.

**Seeded data is present in every test.** Django builds the test database by running every migration, including the seed. Tests therefore create their own data and make assertions about that data, not about overall totals. Only the seed tests look at the seeded books.

**Coverage** is measured with coverage.py and reported in the README, but there is no minimum threshold. A threshold tends to reward low-value tests; the priority list above is the real bar.

### 9.2 Frontend (Vitest, React Testing Library, MSW)

There are about 10–20 targeted tests, aimed at behaviour that's easy to break and hard to notice by clicking around. MSW fakes the API at the network level, so the real API client, query cache and components all run in the tests.

- the API client: the CSRF header and how errors are mapped
- the 401 rule, including an unsaved note form surviving session expiry and the private-data clean-up (AC-N12)
- private data across authentication changes (AC-A8):
  - Alice views her notes and her `has_notes` list; a request returns 401; Bob logs in. While Bob's requests are still pending (held open in MSW), and after they finish, none of Alice's notes or results are on screen.
  - A response for Alice that arrives after the 401 doesn't reappear for Bob.
  - Alice has an unsaved note draft open; a session re-check returns Bob. The form is reset and Alice's text is nowhere on screen. Logging out with a draft open discards it too.
  - Logging out removes private entries but keeps the public catalog cached.
- `has_notes` being removed for visitors (AC-S3)
- returning to page 1 when filters change, and several genres surviving a reload and back/forward as repeated parameters (AC-S5, AC-S6)
- search debouncing (AC-S9), and the author selector: debounced suggestions, keyboard selection, and restoring a selected author from `?author=` through the author detail endpoint (AC-S10)
- notes paging: creating a note returns to page 1, and deleting the only note on the last page moves to the previous page (AC-N13)
- double-submit protection on note forms (AC-N2)

### 9.3 Manual acceptance checklist

There are no automated browser end-to-end tests: they would need both servers and a test database running in CI. Instead, Phase 7 walks through every user journey and acceptance criterion against the running app with a written checklist. That includes the cross-tab cases of AC-A8, which need two real tabs. Claude Code carries out the walkthrough through Playwright MCP wherever possible, and by hand otherwise (implementation plan §4); no browser test code is committed.

### 9.4 Code quality and CI

- **Backend:** Ruff for linting and formatting (configured in `ruff.toml`). Static type checking with mypy is deliberately left out. Checking Django and DRF code needs version-matched plugins and frequent `type: ignore`, and in a mostly declarative backend it would catch little. The bugs that matter here are about behaviour, which the tests cover (§9.1); type safety sits at the API boundary instead, through the generated TypeScript types (§7.7).
- **Frontend:** ESLint with the recommended rules of `@eslint/js`, typescript-eslint's type-checked recommended rules (`recommendedTypeChecked`, which catch unhandled promises and unchecked `any` values), and the React hooks and React Refresh plugins (create-vite's ESLint option; its default template now uses oxlint), and Prettier with its default settings.
- **No pre-commit hooks;** CI is where checks are enforced.

| CI job | Steps |
|---|---|
| Backend | Ruff lint and format check; tests with coverage; `makemigrations --check` (fails on a forgotten migration); OpenAPI schema drift check |
| Frontend | `npm ci`; ESLint; Prettier check; type check and build; Vitest; generated-types drift check |

## 10. Tradeoffs, limitations and risks

| Item | Consequence | Why accepted, or mitigation |
|---|---|---|
| SQLite only matches ASCII letters case-insensitively | "garcía" finds "García", but "GARCÍA" doesn't. A title or surname that *starts* with an accented letter sorts after Z. | Rare in practice and documented (spec §6). PostgreSQL would fix it with a settings change. |
| TypeScript instead of the assignment's "JavaScript ES6+" | A reviewer might read it as not following an instruction | Deliberate, and justified in the README: a typed superset compiled to ES6+ JavaScript, providing type safety at the API boundary |
| A book with notes can't be deleted | Removing a book that readers have noted takes a deliberate extra step: deleting its notes first | Notes are the only data that can't be recreated, and they aren't the admin's to remove as a side effect; deleting books is rare (§5) |
| Rolling back the seed removes all notes | Notes on books added through admin are lost too | Accepted only because the local database holds disposable development data; it uses standard Django migration behaviour. Not acceptable for production data without safeguards: deliberate migration dependencies, deliberate reversal of data migrations, and backups with a tested restore (§5). Unrelated to deleting a book, which `PROTECT` still blocks. |
| Staff can read every note in Django admin | Notes are private from other readers, not from administrators | Normal for an operated app; stated explicitly (§6.6) |
| Book management uses Django admin, not a custom screen | Staff get Django's plain, fixed list-and-form interface | Fine for a few internal staff making occasional edits, and costs a few lines of registration. A dedicated screen becomes worth building once managing books is a real workflow (bulk imports, ISBN lookup, approvals). |
| A session lasts 2 weeks from login | An active reader is logged out mid-use once every two weeks | J9/AC-N12 handle it gracefully; sliding expiry is a one-setting change |
| Login attempts aren't rate-limited | Passwords are open to brute-force guessing | Out of scope (spec §3); first item to add before any deployment |
| Unsaved note text doesn't survive navigation or logging in again | A long draft can be lost after the session expires | Accepted in spec §6; the README explains it |
| The same note edited in two places | The last save wins | Accepted in spec §3 and §6 |
| The genre list isn't paginated | It would grow without limit if genres multiplied | Genres are a short, curated list. Authors, the list that grows with the catalog, are searched on the server with a bounded `limit` (§7.5). |
| A tab isn't told immediately about a login or logout in another tab | Until it notices (a 401, or the session re-check when it regains focus), it keeps showing its last state, including any open draft, and its requests run with whichever session the browser now holds | The server always answers for the browser's current session, so a stale tab can't reach data that session can't. Once it notices, the clean-up runs (§8.5). Cross-tab messaging (`BroadcastChannel`) would make it immediate, but isn't needed at this scale. |
| The author combobox is built by hand | Its keyboard and screen-reader behaviour is ours to get right | One small component following the WAI-ARIA combobox pattern, with a keyboard test (§9.2); not worth an autocomplete dependency |
| Generated types are only as accurate as the schema | A wrong annotation produces wrong types | Custom pieces are annotated deliberately; CI catches a stale schema, but not a wrong annotation |
| No production hardening | Not deployable as is | Out of scope. Deployment would need HTTPS, `Secure` cookies, `DEBUG` off, a real `SECRET_KEY`, `ALLOWED_HOSTS`, a reverse proxy serving the SPA build, and rate limiting. |

**Settled during scaffolding (Phase 1):**
- **Versions.**
  - Python 3.12 and Node 24 LTS (`frontend/.nvmrc`).
  - Backend pins are in `backend/requirements*.txt`: Django 5.2.18, DRF 3.18.3, drf-spectacular 0.30.0.
  - Frontend pins are in `frontend/package-lock.json`: React 19.3, react-router-dom 7.18, Vite 8.3, Vitest 5.0, ESLint 10, Prettier 3.9.
- **TypeScript 5.9, not 6 or 7.** openapi-typescript 7.13 supports TypeScript 5 only, and typescript-eslint supports versions below 6.1. TypeScript 6 changed defaults that the current Vite template relies on, so `strict` and `DOM.Iterable` are set explicitly.
- **Schema file:** `backend/openapi.yaml`; the generated types are in `frontend/src/api/schema.d.ts` (§7.7).
- **Swagger UI assets:** served locally by drf-spectacular-sidecar (§3).
- **Sass package:** `sass`, the pure JavaScript build, so there's no native binary. Its optional file watcher's native install script is denied in `package.json` (`allowScripts`); Vite doesn't use the watcher.
- **Vite proxy `Host` handling:** the browser's `Host` is kept (§6.2).

**Settled during book discovery (Phase 2):**
- **Versions.** TanStack Query 5.104 and MSW 3.0, pinned in `frontend/package-lock.json`.
- **Pagination class:** `StrictPageNumberPagination` in `backend/config/pagination.py`, shared by the book list and later the notes list, so it lives in neither app. The book list sets its default of 12 in a small subclass, `BookPagination`.
  - A `page_size` that isn't a whole number from 1 to 100 gives a 400 (§7.5).
  - It checks the number of digits before converting, because Python refuses to convert a digit string longer than 4,300 digits, and that error would be a 500 (§7.3).
  - It turns off `page=last` (§7.4).
- **Seed data:** inline in the migration, checked against English Wikipedia (§5).
- **Query retries and refetch on focus:** §8.4.

**Settled during authentication (Phase 3):**
- **No new dependencies.**
- **401 class:** `accounts.authentication.SessionAuthentication` names the `Session` scheme in `WWW-Authenticate` (§6.5). A small drf-spectacular extension describes it, because drf-spectacular's own scheme matches only DRF's exact class. The schema keeps the name `cookieAuth` (§7.7).
- **Auth endpoints:** three `APIView`s in `accounts`, under `/api/auth/` (§6.7). CSRF is checked with DRF's own check, before the credentials.
- **Passwords aren't trimmed.** The login serializer turns off DRF's default whitespace trimming, which would change a password that starts or ends with a space.
- **Demo users:** `manage.py create_demo_users`; the README lists the credentials (spec §5.4). It has no `DEBUG` guard, because the spec asks only for the README warning.
- **Session state and private data:** `auth/session.ts` holds `applySession`, `changeSession`, `useAuth` and `privateQueryOptions`. The 401 hooks are in `api/queryClient.ts` (§8.5).
- **Return after login:** the target is fixed when the login page opens (§8.6).
- **Type-aware lint:** typescript-eslint's type-checked recommended rules (§9.4).

**Settled during notes (Phase 4):**
- **No new dependencies.** `@testing-library/user-event` wasn't added, because `fireEvent` covers every notes test.
- **Notes URLs:** a `notes` app with its own `urls.py`, so `catalog` doesn't depend on it (§2). The list view resolves the book in DRF's `initial()`, after the authentication and permission checks: a visitor gets 401 first, and an unknown book gets 404 before the request body is validated (AC-N8).
- **`Detail` schema component:** a small `DetailSerializer` (`{"detail": …}`) describes the 401 and 404 responses of the note operations (§7.7).
- **The page field is a text input**, checked in the form before sending. A number input turns "abc" into an empty value, which would save the note without its page.
- **`<dialog>` stub:** jsdom implements only the `open` attribute of `<dialog>`, so `test/setup.ts` stubs `showModal()` and `close()`.
- **Note mutations use `gcTime: 0`**, so a reader's note text in a finished mutation doesn't outlive the notes section, as with the login mutation's password.
- **The `notes` tag** is on all five note operations, so Swagger UI groups them together.
- **`page` is optional in the generated `Note` type.** drf-spectacular marks a response field required only if it's required on input or read-only, so the type is `page?: number | null`, although the API always sends it. The frontend reads it as `note.page ?? null`.

**Settled during search, filtering and sorting (Phase 5):**
- **Versions.** django-filter 26.2, the only new dependency, pinned in `backend/requirements.txt`. `@testing-library/user-event` still isn't added: `fireEvent.keyDown` drives the author selector's own key handler, and real keyboard use was checked in the browser.
- **The notes list opts out of filtering.** django-filter is the global filter backend (§4), but `BookNoteListView` sets `filter_backends = []`. It takes no filters, and drf-spectacular's django-filter extension can't read its model without a request, which would fail the schema export (§7.7).
- **`has_notes` is a choice filter** of `true` and `false`. django-filter's `BooleanFilter` turns any other value into "no filter", so `has_notes=banana` would be ignored instead of rejected (§7.5).
- **Genre ids are checked before the lookup.** Each must be 1 to 18 digits. Django's `in` lookup isn't guarded against SQLite's integer overflow, so a 20-digit id would otherwise be a 500. An empty `genre` means no filter, as an empty `search` or `author` does.
- **`genre` needed no schema annotation.** drf-spectacular's django-filter extension documents it as an integer array with `style: form` and `explode: true` by itself; the roadmap (§5.5) expected an annotation.
- **Sorting uses `Lower`** on titles and on authors' sort keys, so "du Maurier, Daphne" sorts among the D's (§7.6). The default order and `sort=title` share one definition, `BOOK_ORDERINGS` in `catalog/filters.py`.
- **Parameter descriptions** in the schema come from each filter's `help_text`.
- **One function decides public or private.** `bookListQuery` in `books/queries.ts` puts a `has_notes` list under the reader's private root and every other list under the public key (§8.5). The list keeps no placeholder data while the next one loads, so results never carry over to another reader, or from a private list to a public one.
- **Genres are fetched when their panel first opens**, so the list page makes no extra request until they're needed.
- **The search box writes through the latest URL setter.** React Router's setter reads the URL of the render that created it, so a write held over from an earlier render would undo a filter changed during the pause.
- **A selected author's name is never refetched** (`staleTime: Infinity`). Choosing an author puts it in the cache, so the name shows without a second request.
- **Focus and announcements.** The author selector's status message stays on the page, so a message shown again is announced. A Clear button that disappears moves focus to its field: the author input, or the search box for Clear all.
- **Test harness.** `renderApp` returns the current location, the navigation type and `navigate`, from a probe inside the router. The probe reports in a layout effect, because React Router commits location changes in a transition, and a test must never see a page before its URL. `test/setup.ts` stubs `window.scrollTo`, which jsdom lacks.

**Settled during visual design (Phase 6):**
- **No new dependencies.** The font is the system stack, and icons are inline SVG (§3).
- **One font throughout.** Headings first used a system serif stack (Charter, Cambria, Georgia). Most Linux systems have none of those, so headings looked different there. They now use the body's `system-ui` stack at 700, so every system shows its own interface font everywhere.
- **Design values** live in `styles/_variables.scss`, with their contrast ratios in §8.8.
  - The old input border (`#d1d9e0`) was about 1.4:1 against white, below the 3:1 that WCAG 1.4.11 requires for control edges.
  - Controls now have their own edge colour, `#868a8f` (3.5:1 on white). Cards, dividers and chips keep a light decorative edge, because they aren't controls.
- **The header's focus ring is amber** (6.9:1 on ink), because the teal ring is 2.1:1 there.
- **Book cards are clickable as a whole** through a stretched link. The title link's `::after` covers the card, so each card still has one link, named by its title.
  - Trade-off: text in a card can't be selected by dragging, because the press lands on the link.
- **Icons:** `components/icons.tsx` holds six inline SVG icons. The `<select>` chevron is a CSS data URI of the same chevron, because a select can't hold markup.
- **The search box has its own ×** instead of the browser's, which Firefox doesn't draw (§8.8).
- **Router transitions are off** (§8.7). The flash they caused can't be seen in jsdom, because Testing Library's `act()` flushes transitions. It was checked in the browser instead, by reading the controls on every animation frame before and after the change. The test harness's probe still reports in a layout effect, which stays correct without transitions.
- **The genre panel's `relatedTarget` rule** (§8.8) has a test. jsdom's `blur()` moves focus to the document, so its `focusout` has a `null` `relatedTarget`, as a click on the panel's padding does in a browser.
- **Sort.** The user judged the restyled six-option `<select>` in the browser and didn't keep it. The sort is now a field `<select>` plus one direction button (§8.8).
  - The URL's six `sort` values, their parsing and the default are unchanged.
  - `BOOK_SORT_FIELDS` is a `Record` over the generated values, so a sort added to the API fails the type check.
  - `joinSort` builds `-${field}`, which compiles only while the API has a descending sort for every field.
  - Trade-off: the button's name changes with each click, between "Ascending" and "Descending". Some screen readers don't announce a focused button's new name, so a screen-reader user may hear the new order only when the button is read again.
- **Favicon:** `public/book-explorer.svg`, under a new name rather than Vite's `favicon.svg`. Browsers keep a favicon per site and don't reliably refetch one whose URL hasn't changed, so anyone who had run another Vite app on `localhost:5173` would keep seeing Vite's icon.

**Settled during final integration (Phase 7):**
- **Logging** (§4). The request filter sits on the console handler, not on a logger, because a logger's filters only see records created on that logger, not those that propagate to it from `django.request`. `django.server` is declared again as Django's default declares it, so runserver's request lines keep their own format. The filter never raises: a filter's exception isn't caught by the logging module, and loading the user fails when the database does.
- **JSON errors** (§7.3). The catch-all is a plain Django view, so it stays out of the schema, and it's exempt from Django's CSRF middleware. DRF exempts its own views and checks CSRF itself, in JSON; without the exemption, a write to an unknown path would get the middleware's HTML 403. It reads and changes nothing.
- **Error boundaries** (§8.4). The fallback is one component, `ErrorFallback`, given the link that suits each boundary. The reporting function is named `reportUnexpectedError`, not `reportError`, so a module that forgets to import it fails to compile instead of calling the browser's global `reportError`.
- **JSON parser.** `config.parsers.JSONParser` extends DRF's to turn the `RecursionError` that Python's decoder raises for deeply nested JSON into a 400 parse error. DRF catches only `ValueError`, so a body of about 100 KB of `[` was a 500 on every write, login included.
- **A stale edit can't bring a note back.** `Model.save()` falls back to an INSERT when its UPDATE matches no row, so a PATCH that loaded a note just before a DELETE committed re-created it (seen in about one race in six). `Note.save` now raises `Note.DoesNotExist` when the stored row is gone, which the detail view answers with the same 404 as a missing note, and saves existing notes with `force_update`. A deletion in the instant between that check and the UPDATE then fails the request with a logged 500 instead of re-inserting the note.
- **Note fields take only their JSON type.** DRF's `CharField` stores a number as text, and its `IntegerField` accepts `"5"`, `" 5 "` and `1.0`. `NoteSerializer` maps the model's text and integer fields to subclasses that accept only a JSON string and a JSON integer, so those get a 400 like any other invalid value (AC-N3). The schema is unchanged.
- **Documented errors** (§7.7). `ValidationError`'s shape (`additionalProperties`) can't be expressed by a serializer, so a small drf-spectacular extension describes it. `Detail` moved from `notes` to `config/schema.py`, since every app uses it. The search filters declare their schema through `SearchFilter`, which sets the limit and the schema together.
