# Book Explorer: Architecture

*Living document, last updated 2026-10-11 (Phase 2). Product requirements: `docs/spec.md`. Employer requirements: `Development_Take-Home_Assignment.md`.*

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
| Styling | SCSS modules (`Component.module.scss`) and semantic HTML | Styles scoped to each component; shared variables via Sass `@use`; native elements, plus two small custom filter controls (§8.8), give accessibility without a library | CSS Modules, Tailwind, a component library |
| Backend tests | Django's test runner with DRF's `APITestCase` | Named by the assignment; no extra dependencies | pytest + pytest-django |
| Frontend tests | Vitest, React Testing Library and MSW, used for targeted tests | Vite-native; MSW fakes the network, so tests exercise the real API client and cache | No frontend tests; broad component coverage; Playwright end-to-end tests |
| Lint and format | Ruff (Python); ESLint and Prettier (TypeScript) | One fast tool per language plus a formatter | flake8 + black + isort; mypy (not used) |
| Containers and CI | No Docker; GitHub Actions | The assignment describes a native setup, and SQLite has no service to containerize. CI proves the project builds and passes on a clean machine. | Docker Compose |

## 4. Backend structure and conventions

```
backend/
├── manage.py, requirements.txt, requirements-dev.txt, ruff.toml
├── config/     settings.py, urls.py, wsgi.py, asgi.py
├── accounts/   User model, auth endpoints, session authentication class,
│               demo-user command, admin registration
├── catalog/    Author/Genre/Book models, schema and seed migrations,
│               serializers, FilterSet, views, admin registration
└── notes/      Note model, serializers, views, admin registration
```

- **Settings.** There is a single `settings.py`. `SECRET_KEY` and `DEBUG` come from environment variables, with local-development defaults; the README warns that those defaults are for development only.
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
- **`edited_at` instead of `updated_at`.** Django's `auto_now_add` and `auto_now` produce timestamps that differ by microseconds when a note is created, so "updated after created" would mark every new note as edited. `edited_at` stays empty until an existing note's text or page actually changes. The model sets it, so edits made in Django admin count too.
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
| `POST /api/auth/login/` | CSRF-protected. 200 with `{"user": ...}`, or 400 with one generic error for any wrong credentials (AC-A2). Django's `login()` issues a new session id and CSRF token. Deactivated users can't log in. |
| `POST /api/auth/logout/` | CSRF-protected. Deletes the session on the server. Always 204, even when already logged out. |

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
| 500 | Never caused by anything the client sends (AC-S8) |

Errors use DRF's standard shapes:
- **General errors:** `{"detail": "Not found."}`
- **Validation errors:** one list of messages per field, e.g. `{"page": ["Ensure this value is less than or equal to 10000."]}`

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

- **Malformed values return 400**, with a message for each bad parameter. Examples:
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
- **Some views need annotations.** drf-spectacular can't fully work out a few hand-written pieces, so they are annotated: the auth endpoints, the custom session authentication class, the author `limit` parameter (validated in the view rather than a FilterSet), and the documented 401 and 404 responses.

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
│                 notes), LoadingState, ErrorState, EmptyState, NotFound
├── styles/       _variables.scss, _mixins.scss, global.scss
└── App.tsx, main.tsx
```

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
- **A query that failed with a 4xx isn't refetched when the tab regains focus.** A query without data shows its loading state again while it refetches, so a "not found" view would turn back into "Loading…" every time the reader returns to the tab. Every other query keeps TanStack's refetch on focus, which the session re-check relies on (§8.5).

Hand-written `useEffect` fetching was rejected because it would mean writing request cancellation, race protection, caching and refetching ourselves, all of which are easy to get wrong. React Router loaders were rejected because they have no cache, would make every search pause a navigation, and fit inline note editing poorly.

### 8.5 Authentication state, the 401 rule and private data

- **The login state is the cached result of `GET /api/auth/session/`**, stored as a TanStack Query query.
  - Logging in, logging out and receiving a 401 all update that one value, and a `useAuth()` hook reads it.
  - Until the first answer arrives, the app shows a brief loading state, so a logged-in reader never sees a flash of the logged-out header.
  - The session is re-checked whenever the tab regains focus (TanStack Query's refetch on focus, kept on for this query). That is how a tab notices a logout or a different reader's login in another tab before its next failing request; a different reader's login never produces a 401 at all.
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
- **Private queries run only while a reader is logged in** (their `enabled` option depends on the session), so nothing fetches private data between a 401 and the next login.
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
- **Discarding is one step.** The session function remounts the notes section (for example by changing its React `key`), which resets every open form, and the notes page, to its initial state.

Rejected alternatives:

- **Clearing the whole cache at every boundary.** Simple, but it would also drop the book being viewed. After a 401 the page would fall back to its loading state and could take the open note form with it.
- **A separate cache per reader.** More machinery, and it would keep the previous reader's data in memory, the opposite of the goal.

### 8.6 Returning to the right page after login

- **How it works.** "Log in" links pass the current location in React Router's navigation state (`state: { from }`). After a successful login, the app navigates there, or to the catalog if there's no stored location (AC-A1, AC-N10).
- **Why it's safe.** The return target is never read from the URL, and a link from another site can't carry router state. There is therefore no attacker-controlled redirect target, so an open redirect is impossible by design rather than prevented by validation.
- **Rejected alternative.** A `?next=` URL parameter would need careful validation: `//evil.com` looks like a path but leads to another site.
- **Trade-off.** Refreshing the login page itself loses the return target, and the reader lands on the catalog, which AC-A1 allows.

### 8.7 List state in the URL

- **The URL is the only copy** of search, filters, sort and page. Components read them with `useSearchParams`; a second copy in React state could drift out of sync.
  - The exceptions are text being typed. The search box text is written to the URL after a 300 ms pause (AC-S9). The author selector's text never is: only the id of the author picked goes into the URL (AC-S10).
- **Several genres are repeated parameters** (`?genre=2&genre=5`), read with `getAll`. They are written in ascending id order without duplicates, so a selection has exactly one URL and one cache key.
- **The selected author is restored from its id.** The selector shows the name from `GET /api/authors/{id}/`, so a bookmarked `?author=12` works without downloading the author list. Suggestions are fetched with the same 300 ms pause and cached by search text. If the id doesn't exist, the book list's own 400 already shows "This link contains invalid filters" (§7.5).
- **Typing replaces the current history entry.** Back doesn't step through "t", "to", "tol"…
- **Changing a filter, the sort or the page adds a history entry**, so Back undoes one deliberate change at a time.
- **Resets and clean-up:**
  - Changing search, filters or sort removes `page`, returning to page 1 (AC-S6).
  - Empty parameters are removed, and search text is trimmed before it's written to the URL.
  - For visitors, `has_notes` is removed by replacing the history entry (AC-S3).
- **The URL parameters are the list query's cache key**, under the reader's private root when the results are personalized (§8.5). Back navigation therefore restores both the controls and the results (AC-D3, AC-S5).
- **The notes page is component state, not part of the URL** (AC-N13). Notes are private, so a link to a page of them is never shared, and history entries for note pages would make Back from a book step through them before returning to the list (AC-D3). Opening or refreshing a book starts at page 1.
  - Creating a note goes to page 1, where the new note appears. Editing stays on the current page.
  - Deleting refreshes the current page. If that page no longer exists (the deleted note was the only one on the last page), the section moves to the previous page.
  - If the API answers "Invalid page." (notes deleted in another tab), the section returns to page 1. With no URL to keep truthful, that is more useful than the book list's "This page doesn't exist" view.

### 8.8 Styling and accessibility

- **Styling.** Each component has its own `Component.module.scss`. Shared variables and mixins are loaded with `@use` (Sass's older `@import` is deprecated).
- **Accessibility through semantic HTML**, with no component library:
  - real `<label>` and `<button>` elements
  - native `<select>` for the sort order
  - the genre filter as a button that opens a group of native checkboxes
  - the author filter as a small combobox following the WAI-ARIA combobox pattern: a text input with a list of suggestions, usable with the arrow keys, Enter and Escape, with loading, no-match and error states (AC-S10)
  - the native `<dialog>` element for confirming a delete (AC-N5)
- **Why two custom filter controls.** A native `<select>` can't search a list on the server, and `<select multiple>` needs Ctrl- or Cmd-click to pick several values, which few people discover. `<datalist>` was rejected for authors: it matches on text rather than ids and can't show loading, no-match or error states. Both controls are small and built for this one purpose; no autocomplete library is added.

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

There are no automated browser end-to-end tests: they would need both servers and a test database running in CI. Instead, Phase 6 walks through every user journey and acceptance criterion against the running app with a written checklist. That includes the cross-tab cases of AC-A8, which need two real tabs. Claude Code carries out the walkthrough through Playwright MCP wherever possible, and by hand otherwise (implementation plan §4); no browser test code is committed.

### 9.4 Code quality and CI

- **Backend:** Ruff for linting and formatting (configured in `ruff.toml`). Static type checking with mypy is deliberately left out. Checking Django and DRF code needs version-matched plugins and frequent `type: ignore`, and in a mostly declarative backend it would catch little. The bugs that matter here are about behaviour, which the tests cover (§9.1); type safety sits at the API boundary instead, through the generated TypeScript types (§7.7).
- **Frontend:** ESLint with the recommended rules of `@eslint/js` and typescript-eslint plus the React hooks and React Refresh plugins (create-vite's ESLint option; its default template now uses oxlint), and Prettier with its default settings.
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
