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
python manage.py runserver
```

To create an administrator account for Django admin, run `python manage.py createsuperuser`.

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
3. Open **http://localhost:5173**.

The Vite dev server forwards `/api`, `/admin` and `/static` to Django, so the whole app is served from one origin:

| URL | What |
|---|---|
| http://localhost:5173/ | The app |
| http://localhost:5173/api/docs/ | API documentation (Swagger UI) |
| http://localhost:5173/api/schema/ | OpenAPI schema |
| http://localhost:5173/admin/ | Django admin |

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
