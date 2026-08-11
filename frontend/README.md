# TVU Virtual Campus Tour frontend

This directory contains the Next.js visitor, kiosk, and administration interfaces for [TVU Virtual Campus Tour](../README.md).

## Run locally

```bash
npm ci
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

Set `NEXT_PUBLIC_API_URL=http://localhost:8000` for a locally running backend. Open <http://localhost:3000> for the visitor experience or <http://localhost:3000/admin/login> for administration.

## Main directories

```text
src/
├── app/       # Next.js routes and layouts
├── features/  # Tour, chat, navigation, mascot, and admin features
└── shared/    # Shared API, browser, and recovery utilities
```

## Quality checks

```bash
npm run lint
npm run build
```

## Production routing

The frontend is deployed at <https://www.tvu-tour.site>. In production, leave `NEXT_PUBLIC_API_URL` unset to use the same-origin `/api` rewrite. `API_PROXY_ORIGIN` selects the public FastAPI origin and defaults to `https://api.tvu-tour.site`; `MEDIA_PROXY_ORIGIN` selects the R2 media origin and defaults to `https://tvu-tour.site`.

See the [root README](../README.md#configuration) for backend setup, architecture, deployment, and contribution guidance.
