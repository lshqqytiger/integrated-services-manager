# Architecture Notes

## 1. Purpose and Scope

Integrated Services Manager is a single-user Next.js dashboard for controlling local Node.js services.

Core capabilities:

- Authenticate with a password gate
- Read service definitions from `data/settings.json`
- Start/stop service processes
- Stream and view in-memory process logs

The application is designed for private/internal use, not multi-tenant SaaS.

## 2. High-Level Architecture

Runtime is split between:

- Next.js App Router server components and API routes (`src/app/**`)
- Browser client components for interactivity (`src/app/ui/**`, `src/app/login/login-form.tsx`)
- In-memory runtime stores for sessions/processes/logs/IP attempts
- JSON file configuration (`data/settings.json`)

Main boundaries:

- UI never starts/stops processes directly; it calls authenticated API routes.
- API routes never trust client state; they resolve service IDs server-side from normalized settings.
- Process and log state are ephemeral and tied to the Node.js process hosting Next.js.

## 3. Directory Responsibilities

- `src/app/page.tsx`
  - Authenticated dashboard page (server component)
  - Loads settings + runtime status snapshot
- `src/app/login/page.tsx`, `src/app/login/login-form.tsx`
  - Login page and client-side submit flow
- `src/app/api/auth/login/route.ts`
  - Login endpoint, IP throttling, session cookie issuance
- `src/app/api/services/[id]/toggle/route.ts`
  - Start/stop toggle endpoint
- `src/app/api/services/[id]/log/route.ts`
  - Log retrieval endpoint (JSON/plain text)
- `src/app/lib/auth.ts`
  - Password hash source, session token signing/verification, cookie options
- `src/app/lib/session.ts`
  - Route guards (`requireSession`, `redirectIfAuthenticated`)
- `src/app/lib/settings.ts`
  - Loads/parses/caches settings, normalizes service runtime fields
- `src/app/lib/service-manager.ts`
  - Child process lifecycle and log buffering
- `src/app/lib/ip-blocklist.ts`
  - In-memory failed-attempt tracking and temporary blocking
- `src/app/types.ts`
  - Shared contracts for services/runtime actions

## 4. Request and Control Flows

### 4.1 Login Flow

1. User submits password on login form.
2. Browser hashes password with SHA-512 (`crypto.subtle.digest`) and sends `hashedPassword`.
3. `POST /api/auth/login` compares value to server-side `SYSTEM_PASSWORD` SHA-512 hash.
4. On success, server sets HTTP-only session cookie (`session_token`) and returns `{ ok: true }`.
5. On failure, server increments per-IP attempt count and may return 429 when blocked.

Notes:

- Session TTL is 12 hours.
- Session signature uses HMAC-SHA512 over payload.
- Signing secret combines password hash + per-runtime random secret; restart invalidates all active sessions.

### 4.2 Dashboard Load Flow

1. `src/app/page.tsx` calls `requireSession()`.
2. If session invalid/missing, user is redirected to `/login`.
3. On valid session, `getServiceSettings()` loads/caches definitions and overlays live process status (`RUNNING`/`STOPPED`).
4. Server component renders cards and aggregate stats.

### 4.3 Service Toggle Flow

1. Client component calls `POST /api/services/:id/toggle`.
2. Endpoint enforces `requireSession()`.
3. Endpoint resolves service by ID from current settings snapshot.
4. If running, stop via `stopServiceProcess`; otherwise start via `startServiceProcess`.
5. Response includes `ServiceActionResult` (`status`, `message`).

### 4.4 Log Flow

1. Client opens log dialog and polls `GET /api/services/:id/log` every 3 seconds.
2. Endpoint enforces session, resolves service ID, returns current log buffer.
3. Optional `?format=plain` returns text for opening logs in a new tab.

## 5. Configuration and Normalization

Source file: `data/settings.json`.

Expected shape:

```json
{
  "nvm": "<path>",
  "services": [
    {
      "name": "service-name",
      "main": "dist/index.js",
      "nodeVersion": "lts",
      "mode": "DEVELOPMENT",
      "version": "optional",
      "argv": ["optional", "args"]
    }
  ]
}
```

Normalization behavior (`settings.ts`):

- Service `id` is generated as `<slug>-<1-based-index>`.
- `rootDir` defaults to `services/<slug>/`.
- Relative `main` becomes `<rootDir>/<main>`.
- Absolute `main` keeps absolute path and sets `rootDir` to `dirname(main)`.
- `mode` defaults to `DEVELOPMENT` unless exactly `PRODUCTION`.
- `argv` coerced to string array.

Caching behavior:

- Settings are cached in memory and reloaded when file `mtime` changes (or `forceReload=true`).

## 6. Process Runtime Model

`service-manager.ts` holds global singleton maps:

- `processes: Map<serviceId, ChildProcess>`
- `logs: Map<serviceId, string[]>`

Start semantics:

- Verifies entry file exists.
- Spawns process as: `node <entryPoint> ...argv`
- `cwd` is service `rootDir`.
- Injects `SERVICE_NAME` and `SERVICE_MODE` into child environment.
- Captures `stdout`/`stderr` and appends timestamped lines.

Stop semantics:

- Sends `SIGTERM` first.
- Escalates to `SIGKILL` after 7 seconds if needed.
- Cleans up process map entry on exit/error.

Log semantics:

- Per-service ring buffer capped at 2000 lines.
- Log history is volatile and lost on restart.

## 7. Security Model

Implemented protections:

- HTTP-only signed session cookie
- Server-side session verification for dashboard and service APIs
- Password not transmitted in plaintext (client sends SHA-512 hash)
- In-memory IP throttling: 5 failures -> 12-hour block
- `SameSite=Lax` cookies; `Secure` only in production

Security caveats:

- Client-side hashing does not replace TLS; HTTPS is still required in deployment.
- In-memory stores mean auth/session/IP lock state resets on server restart.
- No CSRF token mechanism; design assumes constrained single-user/private network context.

## 8. Operational Constraints

This implementation intentionally prioritizes simplicity:

- Not horizontally scalable (state is process-local memory).
- Not durable (running process map and logs are ephemeral).
- Uses current Node executable (`process.execPath`), not per-service Node version switching.
- `nvm` path is displayed in UI stats but not applied by spawn logic.

## 9. Extension Points

Practical next evolutions:

- Persist process/log metadata to an external store.
- Replace in-memory auth/session/attempt tracking with Redis or database.
- Introduce per-service runtime adapters (pm2, docker, systemd, or SSH).
- Implement health checks and restart policies.
- Add RBAC/user accounts if moving beyond single-user mode.
- Add structured audit trail for start/stop and login events.

## 10. Quick Reference

Environment:

- `SYSTEM_PASSWORD` (required)

Public endpoints:

- `POST /api/auth/login`
- `POST /api/services/:id/toggle` (auth required)
- `GET /api/services/:id/log` (auth required)

Session constants:

- TTL: 12 hours
- Cookie name: `session_token`
- Token format: `<base64url(payload)>.<hmac_sha512_signature>`
