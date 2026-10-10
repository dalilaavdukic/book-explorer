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

## Documentation

- [`docs/spec.md`](docs/spec.md): product decisions, user journeys and acceptance criteria
- [`docs/architecture.md`](docs/architecture.md): technical decisions and their rationale
- [`docs/implementation-plan.md`](docs/implementation-plan.md): phases and how each is verified

The docs cite the employer's brief, `Development_Take-Home_Assignment.md`, which isn't included in this repository.
