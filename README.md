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
- `GET /api/profile` - Get authenticated user profile
- `POST /api/profile` - Save authenticated user profile
- `POST /api/process` - Forwards processing request to backend with `userId` from session

### Server (`apps/server`)

- `GET /health` - Health check
- `POST /process` - Process job fields with mapping reuse and AI fallback

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