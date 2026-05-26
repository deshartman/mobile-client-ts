# MobileClient — architecture notes

Mobile-web client for per-user Twilio Voice + SMS. Each authenticated user
has their own Twilio number and communicates with contacts from it. This
file is for future you (or Claude) opening the repo cold — focus on
invariants, choices that aren't obvious from the code, and things that
took real debugging to find. See [README.md](README.md) for install and
deploy.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**, strict
- **Tailwind v4** (CSS-first `@theme` config, no `tailwind.config.ts`)
- **shadcn/ui** primitives (button, input, card, form, dialog, sonner,
  input-otp, dropdown-menu)
- **Zod** — single source of truth for every shape that crosses a trust
  boundary. Types are inferred, never hand-written in parallel.
- **better-sqlite3** — synchronous SQLite, native build. One DB file,
  on a Fly.io volume in prod, under `apps/web/data/` in dev.
- **Twilio REST + Voice SDK** — SDK is browser-only (`window`, audio APIs)
  and always loaded via `dynamic({ ssr: false })`.
- **Vitest + RTL** — 310 tests, 97% lines on app code.

## Shape: pnpm workspaces

```
apps/web/                     Next.js 15 app
  src/app/                    pages + Route Handlers (App Router)
    (auth)/                   signup, login — no session required
    (app)/                    protected routes; layout checks session
    api/                      22 Route Handlers under /api/*
  src/components/             UI components
  src/hooks/                  useSession, useSse, useVoiceDevice,
                              useCallOverlay
  src/lib/
    services/                 10 typed service classes
    client/                   browser-only modules (device-service,
                              api-client, image, session, phone)
    container.ts              Services registry; getServices() singleton
    env.ts                    lazy Zod-validated process.env
    http.ts                   errorResponse / parseJson helpers
    twilio-validate.ts        raw-body HMAC check for webhooks
    errors.ts                 AppError hierarchy with Symbol.for brand
packages/shared-types/        Zod schemas + inferred TS types
packages/db/                  better-sqlite3 singleton + schema/migrate/seed
```

Services never reach into `getDb()` — the container injects the DB into
their constructors. That's what makes `:memory:` test DBs possible.

## Data model (camelCase throughout)

All entities scoped by `userGuid` (UUIDv4). FK cascade on user delete.
Option B was chosen in Phase 2: **camelCase in TS, snake_case confined
to raw SQL inside `packages/db`.** `rowToCamel()` translates at the DAO
boundary. Nullable columns coerce to `undefined` via `z.nullish()` — no
`null` on the wire.

- **User** — `userGuid`, `name`, `phone` (E.164 unique), `email`,
  `twilioNumber`, `twilioNumberSid`, `active`, `created`
- **Contact** — `contactGuid`, `userGuid`, `firstName`, `lastName`,
  `company`, `photoData` (base64 dataURL) + `contact_identities`
  (`type ∈ {Phone, Message, WhatsApp, SIP, Client}`, `value`)
- **Activity** — one row per interaction. `type ∈ {Phone, Message,
  WhatsApp, Contact}`, `datetime`, `duration` (min), `identityValue`,
  `contactGuid` (nullable — inbound from unknown numbers), `callSid`
- **Thread** — `threadId` (local `thr_<uuid>`), `userGuid`, `contactGuid`,
  `remoteAddress`, `proxyAddress`, `activityId`
- **Message** — `messageSid` (Twilio SMxxx, PK), `threadId`, `direction`,
  `author`, `body`, `datetime`, `status`, `readAt`
- **Transcription** — composite PK `(callSid, sequenceId)`, `track`,
  `transcript`, `confidence`, `datetime`

Schema is intentionally monolithic — one `CREATE TABLE IF NOT EXISTS`
script at [packages/db/src/schema.ts](packages/db/src/schema.ts). No
`ALTER TABLE` migrations; fresh DB on every deploy. If that changes,
add a migrations runner.

## Auth — phone-OTP only

No passwords, no email/password. Flow at
[src/app/api/auth/](apps/web/src/app/api/auth/):

1. `POST /api/auth/send-otp` — generate 6-digit code, sha256 hashed into
   `otp_verifications`, sent via `OTP_FROM_NUMBER` (dedicated sender;
   per-user numbers can't send OTPs because they don't exist yet)
2. `POST /api/auth/verify-otp` — constant-time check, 5-attempt lockout
3. `POST /api/auth/complete` — existing phone signs in; new phone creates
   user + provisions a Twilio number via
   `TwilioNumberService.provisionForUser` (country picked from E.164)

Client stores `userGUID` / `userPhone` / `userName` in `sessionStorage`.
Every API call path-encodes `userGuid`. **No bearer token** — the server
trusts the path param and scopes all queries. `(app)/layout.tsx` redirects
to `/signup` when `session` is null.

## Voice — full-screen overlay, not a route

`<CallControls>` is mounted inside `<CallOverlay>` at the `(app)` layout.
Outbound calls are triggered by `useCallOverlay().openOutgoing(...)`,
incoming by the banner tapping `openIncoming()`. No `/call/[guid]`
navigation — hitting "End call" just closes the overlay, leaving the
user on whatever page they were on.

- Outbound: `Device.connect({ params: { userGuid, To, destinationType }})`
  → Twilio hits `/api/voice/outgoing` → TwiML dials destination
- Inbound PSTN → browser: Twilio hits `/api/voice/incoming` → we look up
  owner by `To` → TwiML returns `<Dial><Client>{userGuid}</Client></Dial>`
- Status callbacks at `/api/webhooks/voice/status` — only `completed`
  (or child-leg `DialCallStatus=completed`) creates a Phone activity

**`CallControls` is discriminated by `direction`** — `outgoing` dials on
mount; `incoming` starts in `"ringing"` with Answer/Reject, then
transitions to the same in-call UI on accept.

### Voice SDK idempotency (the scariest bug)

The Device singleton at `apps/web/src/lib/client/device-service.ts` had a
brutal Strict-Mode race. Two React consumers (banner + overlay) both
called `service.setup(...)` in the same tick; the guard `if (this.device)
return` failed because both had passed the check before either `await`ed.
Fix: **latch synchronously before any await**:

```ts
async setup(fetchToken) {
  if (this.device) return;
  if (this.setupPromise) return this.setupPromise;    // << synchronous latch
  this.setupPromise = this.doSetup(fetchToken);
  try { await this.setupPromise; } finally { this.setupPromise = null; }
}
```

Same pattern for `makeCall()` with `dialPromise`. **Any time you add a
method that mutates singleton state with an `await`, use this pattern.**

## Real-time updates (SSE)

Per-user `GET /api/events/:userGuid`. `SseService` holds
`Map<userGuid, Set<ReadableStreamDefaultController>>` and broadcasts
scoped to one user. Event types defined as a discriminated union in
[packages/shared-types/src/sse-events.ts](packages/shared-types/src/sse-events.ts):

- `activity.added` — emitted by `ContactService.addActivity()`
- `message.added` — emitted by outbound send + inbound webhook
- `message.status` — emitted by outbound delivery callback
- `thread.read` — emitted by the mark-read endpoint
- `incoming-call` — emitted by `registerIncomingCall()`

**Composition, not EventBus**: services that broadcast call
`sseService.broadcast(event)` directly. No central bus, no magic
subscribers. Verified no cycles in the dep graph.

**iOS Safari suspends SSE in background**. The message view rehydrates
on `visibilitychange → visible`; `appendMessage` dedups on `messageSid`.

## Twilio webhook signature validation

`lib/twilio-validate.ts` reads `req.text()` **exactly once**, then both
HMAC-validates and form-decodes from the same raw string. Reading twice
fails — the body stream is consumed.

Dev-bypass when `TWILIO_AUTH_TOKEN` is unset — the helper short-circuits
to parsing the form-data without validating. **Must be set in prod.**
`instrumentation.ts` is a good place to refuse prod boot without it
(not wired yet).

## Routes that exist (23 total)

| Route | Method | Notes |
|---|---|---|
| `/api/auth/send-otp` \| `verify-otp` \| `complete` | POST | OTP flow |
| `/api/auth/qr` | GET | PNG of signup QR code (cache-busted) |
| `/api/users/[userGuid]` | GET / PUT / DELETE | DELETE releases Twilio number first |
| `/api/main-list/[userGuid]` | GET | home-screen roster |
| `/api/contacts/[userGuid]` | GET / POST | |
| `/api/contacts/[userGuid]/[contactGuid]` | GET / PUT / DELETE | |
| `/api/activities/[userGuid]` | GET / POST | |
| `/api/activities/[userGuid]/by-contact/[contactGuid]` | GET | |
| `/api/activities/[userGuid]/by-identity/[identityValue]` | GET | |
| `/api/activities/[userGuid]/[activityId]/transcript` | GET | call-detail join |
| `/api/messaging/send` | POST | |
| `/api/messaging/thread/[userGuid]?to=` | GET | thread hydration |
| `/api/messaging/thread/[userGuid]/[threadId]/read` | POST | `navigator.sendBeacon` target |
| `/api/voice/token` | POST | AccessToken for Voice SDK |
| `/api/voice/outgoing` | POST | TwiML App Voice URL |
| `/api/voice/incoming` | POST | PSTN → `<Client>` |
| `/api/webhooks/voice/status` | POST | Twilio Dial status callback |
| `/api/webhooks/voice/transcription` | POST | utterance webhook |
| `/api/webhooks/messaging/inbound` | POST | per-number SMS receive |
| `/api/webhooks/messaging/status` | POST | outbound delivery |
| `/api/events/[userGuid]` | GET | SSE stream |

## Things that will bite you (landmines)

1. **`instanceof AppError` breaks under HMR**. Next's dev server reloads
   modules on edit; the error class identity diverges between throw site
   and catch site. `lib/errors.ts` brands `AppError` with
   `Symbol.for("mobileclient.AppError")`; `lib/http.ts` uses
   `isAppError(err)` that checks the symbol. Don't replace with raw
   `instanceof` — it'll work until your first file save.

2. **`env.ts` must be lazy**. Next's build-time page-data collection
   imports every Route Handler; an eager `EnvSchema.parse(process.env)`
   at module load fails with placeholder env values. The `env` export
   is a `Proxy` that parses on first property access.

3. **`.js` specifiers break webpack**. Intra-package imports like
   `export * from "./common.js"` work under TS NodeNext but not under
   webpack's bundler resolution. Strip the extensions.

4. **Twilio SDK `Call.parameters` is `Record<string,string>`**, not a
   `Map`. Use `call.parameters["From"]`, not `.get("From")`.

5. **`@twilio/voice-sdk`'s `speakerDevices.set(id)` is a no-op on iOS**
   (WebRTC audio lock). `cycleSpeaker` returns a device id or null;
   null means the UI can still toggle, there's just no routing change.
   This is documented iOS behavior, not a bug.

6. **Next.js App Router `params` is `Promise<...>` in 15+**. Unwrap with
   `use(params)` in client components, `await params` in Route Handlers.

7. **React Strict Mode double-mounts everything in dev**. Guard singleton
   mutations with the synchronous-latch pattern (see Voice SDK section).
   Test with Strict Mode on; the bugs don't show up in prod but they'll
   burn an hour when they do.

## Testing

- **Vitest workspace**: `node` project covers services + routes + packages,
  `jsdom` project covers components + hooks.
- **Per-test `:memory:` SQLite** via `createTestDb()` — fast enough that
  we don't bother mocking the DB. Services under test get a real schema
  and real queries.
- **Mock `@/lib/twilio-client`, not `twilio`** — our module is the
  boundary, the SDK isn't. Keeps tests stable across SDK upgrades.
- **`vi.hoisted` for shared mock fns** — `vi.mock()` factories are
  hoisted above `const x = vi.fn()` declarations, which causes
  ReferenceError. Wrap shared mock state in `vi.hoisted(() => ({ ... }))`.

Coverage thresholds in [vitest.config.ts](apps/web/vitest.config.ts):
80% lines, 80% functions, 70% branches on `lib/services/**` +
`app/api/**`. Currently at 98%+ on services.

## Phase history (first 15 commits)

Branch: `feature/ts-nextjs-rewrite` off `main`.

Phases 1–15 built the rewrite from scratch — pnpm bootstrap → DB + Zod
schemas → 10 services → 22 routes → client shell → full UX → 310 tests
→ Fly deploy prep → UX refinements → voice overlay. See `git log
--oneline` for the timeline; each phase commit message has its own
scope breakdown.
