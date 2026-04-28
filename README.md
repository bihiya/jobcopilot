# jobcopilot

Monorepo scaffold for JobCopilot with:

- `apps/web`: Next.js App Router + NextAuth + Prisma
- `apps/server`: Node.js/Express job processing API with self-healing mappings

## 1) Environment variables

Copy `.env.example` to `.env` and set:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/jobcopilot?schema=public"
GOOGLE_ID="..."
GOOGLE_SECRET="..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"
OPENAI_API_KEY="..."
SERVER_URL="http://localhost:4000"
```

## 2) Install dependencies

Use **Node.js 24** (see `.nvmrc`; with nvm: `nvm install && nvm use`).

```bash
npm install
```

## 3) One command DB + migrate (out-of-the-box)

```bash
npm run setup:db
```

This command:
- starts local PostgreSQL via Docker Compose
- waits until PostgreSQL is healthy
- runs `prisma migrate dev`

## 4) Prisma client generation (apps/web)

```bash
npm run prisma:generate
```

## 5) Run both apps

```bash
npm run dev
```

- Web app: `http://localhost:3000`
- Server API: `http://localhost:4000`

You can also run separately:

```bash
npm run dev:web
npm run dev:server
```

### Docker shortcuts

```bash
npm run db:up    # start postgres
npm run db:down  # stop postgres
```

## Implemented endpoints

### Web (`apps/web`)

- `GET/POST /api/auth/[...nextauth]` - NextAuth (Google provider + Prisma adapter)
- `POST /api/auth/register` - Email/password registration + verification token
- `POST /api/auth/verify-email` - Verify email token
- `POST /api/auth/forgot-password` - Create password reset token
- `POST /api/auth/reset-password` - Reset password using token
- `GET /api/profile` - Get authenticated user profile
- `POST /api/profile` - Save authenticated user profile
- `POST /api/process` - Forwards processing request to backend with `userId` from session
- `POST /api/public/jobs/fetch` - Public (no-login) job fetch/match/save for supported sources

### Server (`apps/server`)

- `GET /health` - Health check
- `POST /process` - Process job fields with mapping reuse and AI fallback
- `POST /public/jobs/fetch` - Provider-based public fetch pipeline (`linkedin` now)

## Public no-login job fetch route

Use this to fetch jobs without authentication (LinkedIn first; extensible for Naukri/Instahyre):

```bash
curl -X POST http://localhost:3000/api/public/jobs/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "source": "linkedin",
    "query": "software engineer",
    "location": "remote",
    "expectedTitle": "Senior Software Engineer",
    "expectedDescription": "Node.js, Next.js, Prisma",
    "limit": 10
  }'
```

Response includes:
- fetched jobs
- title/description similarity match scores
- saved count
- `bestMatch` record

Notes:
- `source` is currently `linkedin` only.
- provider structure is modular so adding `naukri` and `instahyre` is straightforward.

### Production hardening for public fetch

The public fetch pipeline now includes:

- **Compliance gate**:
  - source allowlist (`PUBLIC_JOB_FETCH_ALLOWED_SOURCES`)
  - official API requirement switch (`REQUIRE_OFFICIAL_API_ONLY`) or request mode `official_api_only`
  - per-request compliance hints: `compliance.requireOfficialApi`, `compliance.allowScraping`
- **Anti-bot handling**:
  - blocker detection for captcha/challenge/verification responses
  - retry with exponential backoff and anti-bot circuit breaker
- **Rotating transport**:
  - rotating user agents (`PUBLIC_JOB_FETCH_USER_AGENTS`)
  - rotating proxies (`PUBLIC_JOB_FETCH_PROXIES`)
  - per-request timeout control (`PUBLIC_JOB_FETCH_TIMEOUT_MS`)

Example request enforcing official API mode:

```bash
curl -X POST http://localhost:4000/jobs/public-fetch \
  -H "Content-Type: application/json" \
  -d '{
    "source": "linkedin",
    "query": "frontend engineer",
    "mode": "official_api_only"
  }'
```

When blocked, responses are structured (non-crashing) with blocker details:

```json
{
  "blocker": {
    "type": "captcha",
    "message": "Possible anti-bot challenge detected from provider response.",
    "source": "linkedin"
  }
}
```

## Self-healing mapping flow

1. Extract `site` from job URL.
2. Load stored mappings for `(userId, site)`.
3. Reuse known mappings first.
4. For unknown fields, call AI mapper (or heuristic fallback when `OPENAI_API_KEY` is missing).
5. Fill fields from user profile data.
6. Save newly learned mappings.
7. Return `missingFields` for any unresolved/unfilled inputs without crashing.

## Example frontend calls

See `apps/web/app/api/profile/examples.js` for example `fetch` calls to profile and process routes.
## Chrome extension (prefill helper)

A basic Chrome extension is available at `apps/chrome-extension` to inject prefill scripts without using a bookmarklet. See `apps/chrome-extension/README.md` for setup and usage.
