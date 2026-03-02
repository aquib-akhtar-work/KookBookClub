# Kookbook Club

A responsive full-stack app for running cookbook clubs with invite codes, meeting planning, host assignment, recipes, media uploads, polls, and post-meeting feedback.

## Stack

- Backend: Go + SQLite (`modernc.org/sqlite`)
- Frontend: React + TypeScript + Vite

## Features

- Account auth with email + password
- Email verification required before creating or joining clubs
- Forgot-password and reset-password flow via email links
- Authenticated account page for email changes and email-code password changes
- Unique usernames (`@username`) with optional non-unique display names
- Club owner moderation: kick, ban, view banned members, and unban
- Club creation and joining via invite codes
- Membership lists with host selection from club members
- Meeting management (address, date/time, cookbook, notes)
- Meeting lifecycle controls: creator can edit details and end a meeting early
- OpenLibrary cookbook lookup with cover/metadata picker
- Server-side cookbook search caching to reduce upstream API requests
- Recipe submissions per meeting
- Image/video uploads (multipart file upload)
- Poll creation and voting
- Post-meeting feedback (rating + comments)

## Routing

- `/auth` for login/register
- `/account` for authenticated email/password account settings
- `/clubs/manage` for create/join actions
- `/clubs` for the list of clubs you are in
- `/club/:clubId` for a specific club's meetings and activity

## API auth model

- `POST /api/auth/register` creates account and returns bearer token
- `POST /api/auth/login` logs in and returns bearer token
- `POST /api/auth/logout` revokes current token
- `POST /api/auth/verify-email` confirms email using token from email
- `POST /api/auth/verify-email/resend` sends a new verification email for logged-in users
- `POST /api/auth/password/forgot` sends a reset link if account exists
- `POST /api/auth/password/reset` updates password using reset token
- `POST /api/account/email` updates email (requires current password)
- `POST /api/account/password/send-code` sends authenticated password-change code
- `POST /api/account/password/update` updates password with authenticated email code
- `POST /api/clubs/:id/members/:memberId/kick` removes a member (owner only)
- `POST /api/clubs/:id/members/:memberId/ban` bans and removes a member (owner only)
- `GET /api/clubs/:id/banned` lists banned members (owner only)
- `POST /api/clubs/:id/banned/:userId/unban` removes ban (owner only)
- Authenticated endpoints use `Authorization: Bearer <token>`

## Meeting lifecycle

- Meeting creators can edit meeting details after creation.
- Meeting creators can end a meeting early.
- Ended meetings remain available in the club page for recipes, media, polls, and feedback history.

## Run backend

```bash
cd server
# optional: cp .env.example .env
go mod tidy
go run .
```

The server auto-loads `server/.env` on startup (without overriding env vars already set in your shell).

Server defaults:

- API: `http://localhost:8080`
- DB file: `./cookbookclub.db`
- Uploads: `./uploads`

Optional env vars:

- `PORT` (default `8080`)
- `DB_PATH` (default `./cookbookclub.db`)
- `UPLOAD_DIR` (default `./uploads`)
- `FRONTEND_ORIGIN` (default `*`)
- `WEB_DIST` (default `../web/dist`)
- `OPENLIBRARY_BASE_URL` (default `https://openlibrary.org`)
- `OPENLIBRARY_CONTACT_EMAIL` (default `cookbookclub@example.com`)
- `COOKBOOK_CACHE_TTL_HOURS` (default `72`)
- `APP_BASE_URL` (recommended; base URL used in email links, e.g. `https://kookbook.club`)
- `RESEND_API_KEY` (required for verification/reset emails)
- `RESEND_FROM_EMAIL` (default `KookBook Club <no-reply@kookbook.club>`)

## Run frontend

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Frontend dev server: `http://localhost:5173`

## Build frontend and serve from Go (optional)

```bash
cd web
npm run build
cd ../server
go run .
```

When `../web/dist` exists, the Go server serves the built frontend at `http://localhost:8080`.

## Docker

This repo now includes Docker images for both services:

- `server/Dockerfile`
- `web/Dockerfile`
- `docker-compose.yml`

### Run with Docker Compose

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:5173`
- API: `http://localhost:8080`

The frontend container proxies `/api/*` and `/uploads/*` to the `server` service, so Docker deployments can use same-origin API calls by default.

### Build images manually

```bash
docker build -t cookbookclub-server ./server
docker build -t cookbookclub-web ./web
```

Frontend Docker builds accept `VITE_API_BASE_URL` as a build arg. If omitted, production builds use same-origin (recommended when `web` proxies to `server`).

```bash
docker build -t cookbookclub-web --build-arg VITE_API_BASE_URL=https://api.example.com ./web
```

## GitHub Actions

`main` now triggers `.github/workflows/docker-images.yml`, which builds both Docker images:

- `cookbookclub-server:main`
- `cookbookclub-web:main`
