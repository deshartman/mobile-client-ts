# MobileClient

Mobile-web client for per-user Twilio Voice + SMS. Each authenticated user
gets their own Twilio number and communicates with contacts from it. Rewrite
of the earlier Express + MPA app as a typed Next.js 15 monorepo.

- **Stack**: Next.js 15 (App Router) + TypeScript, React 19, Tailwind v4,
  shadcn/ui, Zod, better-sqlite3, Twilio REST + Voice SDK
- **Shape**: pnpm workspaces — `apps/web` + `packages/db` + `packages/shared-types`
- **Deploy**: Fly.io (Docker), SQLite on a mounted volume
- **PWA**: installable via Add to Home Screen (iOS) / Install App (Chromium)
- **Tests**: Vitest + RTL, 310 tests covering services, routes, and UI

For architecture details, design choices, and landmines, read
[CLAUDE.md](CLAUDE.md). The original pre-rewrite notes are in
[CLAUDE.md.legacy](CLAUDE.md.legacy).

## Repo layout

```
apps/web/                     Next.js 15 app
  src/app/                    Route Handlers + pages (App Router)
  src/components/             UI components (shadcn + app)
  src/hooks/                  useSession, useSse, useVoiceDevice, useCallOverlay
  src/lib/
    services/                 10 typed service classes
    client/                   browser-only (device, api-client, session)
    container.ts              service registry
    env.ts                    lazy Zod-validated process.env
packages/shared-types/        Zod schemas + inferred TS types
packages/db/                  better-sqlite3 singleton + schema/migrate/seed
Dockerfile                    multi-stage → Next standalone output
fly.toml                      Fly.io app config (app=mobileclient)
```

## Prerequisites

- **Node 22+**
- **pnpm 9+** — `corepack enable && corepack prepare pnpm@9.15.0 --activate`
- **Twilio account** with:
  - account SID + auth token + API key/secret
  - a TwiML App whose **Voice URL** points at
    `{SERVER_BASE_URL}/api/voice/outgoing`
  - at least one SMS-capable number for sending OTPs
- **ngrok** — for webhook reachability in dev
- **Docker** — for local build verification before Fly deploy (optional)

## Local development

```bash
pnpm install
cp apps/web/.env.development.example apps/web/.env.development.local
# edit values — SERVER_BASE_URL (your ngrok URL), Twilio SIDs,
# OTP_FROM_NUMBER, TWILIO_COUNTRY_CONFIG_<ISO>_* for every country you
# want to provision numbers in
ngrok http --url=<your-reserved-domain> 3002
pnpm --filter web dev
```

Next.js auto-loads `.env.development.local` when running `next dev`.
Visit `https://<your-ngrok>/signup` on a mobile browser to start the
OTP flow — it will provision a Twilio number for you.

### Twilio Console setup

One-time:
- **TwiML App** → Voice URL: `{SERVER_BASE_URL}/api/voice/outgoing`
- Your phone's sender (OTP) and `TWIML_APP_SID` both need to match what's
  in `.env.development.local`

Per-user webhook URLs (inbound SMS + voice) are set automatically when
`TwilioNumberService.provisionForUser` purchases a number.

## Tests

```bash
pnpm --filter web test           # full Vitest suite (node + jsdom)
pnpm --filter web test:coverage  # v8 coverage, services ≥ 80%
pnpm typecheck                   # tsc --noEmit across all workspaces
```

## Production build verification (optional)

Before Fly deploy, prove the Dockerfile works locally:

```bash
docker build -t mobileclient:local .
```

Takes ~3–5 min first time. Env vars are lazy-parsed, so you don't need
real Twilio creds to build.

## Fly.io deployment

App name `mobileclient`, Sydney region, persistent SQLite volume at
`/data`. Commands to run (they're yours; nothing in the repo invokes
them):

```bash
# one-time
fly apps create mobileclient
fly volumes create mobileclient_data --size 1 --region syd

cp apps/web/.env.production.example apps/web/.env.production
# edit .env.production with real values
fly secrets import --stage < apps/web/.env.production

# every deploy
fly deploy
```

Post-deploy, update the TwiML App Voice URL to
`https://mobileclient.fly.dev/api/voice/outgoing`. Per-number webhook
URLs are set automatically by new-user provisioning.

## Runtime notes

- **`OTP_FROM_NUMBER`** must be SMS-capable on the same account. Per-user
  numbers can't send OTPs because they don't exist until after verification.
- **`TWILIO_AUTH_TOKEN`** enables webhook HMAC validation. Dev can leave
  it unset; prod **must** set it.
- **`TRANSCRIPTION_ENGINE`** — set to `deepgram` or `google` to enable
  real-time call transcription. Unset to disable entirely (no webhooks,
  no rows, no charge).
- **SSE suspension** — iOS Safari drops EventSource connections when the
  tab backgrounds. The message view rehydrates on `visibilitychange →
  visible`; messages dedup on `messageSid`.

## Troubleshooting

Common issues I've actually hit, in order of likelihood:

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot open database because the directory does not exist` | First boot of a fresh checkout; `apps/web/data/` not created yet | `getDb()` now `mkdirSync`s the parent — run again |
| `POST /voice/outgoing 404` after outbound call attempt | Twilio TwiML App Voice URL missing `/api/` prefix | Update in Console |
| `Call declined by gateway (31603)` | Same — TwiML endpoint returning bad TwiML or 404 | See above |
| "Call is already active" toast, call screen flashes then disappears | React Strict Mode double-mount racing the device singleton | Fixed in `device-service.ts` setup/dial latches — don't replace with raw `if (this.device) return` |
| 500 on `/api/auth/verify-otp` with correct code | `instanceof AppError` fails across HMR reloads | Fixed — use `isAppError(err)` from `lib/errors.ts`, not raw `instanceof` |
| `next build` fails with "Invalid environment variables" | `env.ts` eagerly parsed at build time | Already fixed — `env` is a lazy Proxy now |
| Workspace package imports fail at build | `.js` extension specifiers in intra-package imports | Strip the `.js` — webpack's bundler resolution doesn't follow NodeNext |

## Project history

Built across 15 phases on `feature/ts-nextjs-rewrite` (plus follow-up fix
commits for overlay and race conditions). `git log --oneline` for the
timeline. Each phase commit has a full scope breakdown in its message.
