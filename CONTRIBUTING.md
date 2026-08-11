# Contributing to TVU Virtual Campus Tour

Thank you for helping improve the project. Small, focused pull requests are easier to review and safer to deploy.

## Before you start

1. Search existing issues and pull requests for related work.
2. Open an issue before a large architectural, data-model, or user-experience change.
3. Never include production secrets, personal data, private university documents, database exports, or media without redistribution permission.
4. Keep the visitor flow usable without an account; authentication belongs to the administration area.

## Local setup

Follow the [root README](README.md#quick-start) for the complete setup. The short version is:

```bash
cd backend
python -m venv .venv
python -m pip install -r requirements-dev.txt
cp .env.example .env

cd ../frontend
npm ci
cp .env.example .env.local
```

Use placeholder or development credentials. Do not reuse production `.env` files.

## Architecture boundaries

- HTTP parsing and responses belong in `backend/app/routers`.
- Business logic belongs in `backend/app/services`.
- Database access belongs in `backend/app/repositories`.
- Gemini prompts and tool declarations belong in `backend/app/ai`.
- Frontend domain features belong in `frontend/src/features`; reusable browser/API utilities belong in `frontend/src/shared`.
- AI UI actions must be validated before the frontend executes them.

## Quality gates

Run the relevant checks before opening a pull request.

```bash
cd backend
python -m pytest -q
python -m ruff check app tests
```

```bash
cd frontend
npm run lint
npm run build
```

Add or update tests for behavior changes. A pull request that changes chat routing, tool calls, pathfinding, authentication, ingestion, or storage should include a regression test.

## Pull requests

- Use a descriptive title and explain the problem before the implementation.
- Keep unrelated formatting and refactors out of the same pull request.
- Document new environment variables in the relevant `.env.example` and README section.
- Include screenshots or a short recording for visible interface changes.
- State which checks you ran and which manual checks remain.

## License status

The maintainer is finalizing a source-code license and a separate policy for institutional media and data. Do not assume that TVU branding, campus media, documents, voices, or character assets are licensed for reuse merely because they are visible in this repository.
