# Architecture Notes

## 1. Purpose and Scope

Integrated Services Manager is a single-user Next.js dashboard for controlling local processes across multiple runtimes (Node.js, Rust binaries, Java apps, shell scripts, and others).

Core capabilities:

- Authenticate with a password gate
- Read service definitions from `data/settings.json`
- Start and stop configured processes
- Stream and view in-memory process logs
- Send terminal stdin to running processes from the dashboard

The application is designed for private and internal operation, not multi-tenant SaaS.

## 2. High-Level Architecture

Runtime is split between:

- Next.js App Router server components and API routes (`src/app/**`)
- Browser client components for interactivity (`src/app/ui/**`, `src/app/login/login-form.tsx`)
- In-memory runtime stores for sessions, process handles, logs, and IP attempt tracking
- JSON file configuration (`data/settings.json`)

Main boundaries:

- UI never starts or stops processes directly; it calls authenticated API routes.
- API routes do not trust client state; they resolve service IDs server-side from normalized settings.
- Process and log state is ephemeral and tied to the running Next.js server process.

## 3. Directory Responsibilities

- `src/app/page.tsx`
  - Authenticated dashboard page (server component)
  - Loads settings and runtime status snapshot
- `src/app/login/page.tsx`, `src/app/login/login-form.tsx`
  - Login page and client submit flow
- `src/app/api/auth/login/route.ts`
  - Login endpoint, IP throttling, session cookie issuance
- `src/app/api/services/[id]/toggle/route.ts`
  - Start and stop toggle endpoint
- `src/app/api/services/[id]/log/route.ts`
  - Log retrieval endpoint (JSON or plain text)
- `src/app/api/services/[id]/stdin/route.ts`
  - Stdin write endpoint for running services
- `src/app/lib/auth.ts`
  - Password hash source, session token signing and verification, cookie options
- `src/app/lib/session.ts`
  - Route guards (`requireSession`, `redirectIfAuthenticated`)
- `src/app/lib/settings.ts`
  - Loads, validates, and normalizes service definitions from JSON
- `src/app/lib/service-manager.ts`
  - Child process lifecycle and log buffering
- `src/app/lib/ip-blocklist.ts`
  - In-memory failed-attempt tracking and temporary IP blocking
- `src/app/types.ts`
  - Shared contracts for settings, runtime, and API results

## 4. Request and Control Flows

### 4.1 Login Flow

1. User submits password on the login form.
2. Browser hashes the password with SHA-512 (`crypto.subtle.digest`) and sends `hashedPassword`.
3. `POST /api/auth/login` compares it to the server-side `SYSTEM_PASSWORD` hash.
4. On success, server sets HTTP-only session cookie (`session_token`) and returns `{ ok: true }`.
5. On failure, server increments per-IP attempt count and may return 429 when blocked.

Notes:

- Session TTL is 12 hours.
- Session signature uses HMAC-SHA512 over a compact payload.
- Signing secret combines password hash and a per-runtime random secret; restart invalidates active sessions.

### 4.2 Dashboard Load Flow

1. `src/app/page.tsx` calls `requireSession()`.
2. If session is invalid or missing, user is redirected to `/login`.
3. On valid session, `getServiceSettings()` loads and caches service definitions, then overlays live runtime status (`RUNNING` or `STOPPED`).
4. Server component renders cards and aggregate mode stats.

### 4.3 Service Toggle Flow

1. Client component calls `POST /api/services/:id/toggle`.
2. Endpoint enforces `requireSession()`.
3. Endpoint resolves service by ID from current normalized settings snapshot.
4. If running, it stops via `stopServiceProcess`; otherwise it starts via `startServiceProcess`.
5. Response includes `ServiceActionResult` (`status`, `message`).

### 4.4 Log Flow

1. Client opens log dialog and polls `GET /api/services/:id/log` every 3 seconds.
2. Endpoint enforces session, resolves service ID, and returns current log buffer.
3. Optional `?format=plain` returns plain text for opening logs in a separate tab.

UI behavior notes:

- Log output supports Unicode safely across stream chunk boundaries.
- The log viewer follows output only when new lines are added and the user remains near the bottom.

### 4.5 Terminal Input Flow

1. User enters text in the terminal composer in the log dialog.
2. Enter submits input, while Shift+Enter inserts newline.
3. Client sends `POST /api/services/:id/stdin` with `{ input: string }`.
4. Endpoint enforces session and service lookup, then delegates to process manager stdin writer.
5. Process manager writes UTF-8 bytes to child stdin when writable.

## 5. Configuration and Normalization

Source file: `data/settings.json`.

Expected shape:

```json
{
  "services": [
    {
      "name": "hello-world",
      "root": "/absolute/path/to/service",
      "command": "/usr/bin/node index.js",
      "mode": "DEVELOPMENT"
    }
  ]
}
```

Normalization behavior (`settings.ts`):

- Service `id` is generated as `<slug>-<1-based-index>`.
- `root` defaults to `services/<slug>` when omitted.
- `command` is tokenized into:
  - `executable` (first token)
  - `args` (remaining tokens)
- Quoted segments in `command` are preserved as single tokens.
- `mode` defaults to `DEVELOPMENT` unless exactly `PRODUCTION`.

Caching behavior:

- Settings are cached in memory and reloaded when file `mtime` changes (or `forceReload=true`).

## 6. Process Runtime Model

`service-manager.ts` holds global singleton maps:

- `processes: Map<serviceId, ManagedProcess>`
- `logs: Map<serviceId, string[]>`

Managed process shape includes:

- child process handle
- per-stream UTF-8 decoders (`stdout`, `stderr`)
- per-stream partial-line remainders for chunk-safe line assembly

Start semantics:

- Verifies working directory exists.
- If `executable` is an absolute path, verifies it exists.
- Spawns process as: `<executable> <args...>`
- Sets `cwd` to service `root`.
- Injects `SERVICE_NAME` and `SERVICE_MODE` into child environment.
- Captures `stdout` and `stderr` and appends timestamped lines.
- Uses UTF-8 stream decoders and flushes remainder buffers on process exit/error.
- Enables stdin piping (`stdio: ["pipe", "pipe", "pipe"]`) for terminal input.

Stop semantics:

- Sends `SIGTERM` first.
- Escalates to `SIGKILL` after 7 seconds if needed.
- Cleans process map entry on exit and error.

Log semantics:

- Per-service ring buffer capped at 2000 lines.
- Log history is volatile and lost on server restart.

Stdin semantics:

- Input writes are accepted only for running services with writable stdin.
- Input payload limit is 16000 characters per request.

## 7. Security Model

Implemented protections:

- HTTP-only signed session cookie
- Server-side session verification for dashboard and service APIs
- Strict session token validation: exact two-part structure, HMAC-SHA512 signature, version match, 64-character hex nonce, future-timestamp guard, and 12-hour TTL expiry
- Password not transmitted in plaintext (client sends SHA-512 hash)
- In-memory IP throttling: 5 failures then 12-hour block
- `SameSite=Lax` cookies and `Secure` in production

Security caveats:

- Client-side hashing does not replace TLS; HTTPS is still required.
- In-memory stores mean auth, session, and lock state reset on restart.
- No CSRF token mechanism; design assumes constrained private access.

## 8. Operational Constraints

This implementation intentionally prioritizes simplicity:

- Not horizontally scalable (state is process-local memory).
- Not durable (running process map and logs are ephemeral).
- Command execution is configuration-driven; correctness and safety depend on controlling `data/settings.json`.
- Child processes inherit server environment variables.

## 9. Extension Points

Practical next evolutions:

- Persist process and log metadata to external storage.
- Replace in-memory auth and attempt tracking with Redis or a database.
- Introduce runtime adapters (docker, systemd, ssh, Kubernetes jobs).
- Add health checks and restart policies.
- Add RBAC and user accounts for multi-operator scenarios.
- Add structured audit trail for login and process actions.

## 10. Quick Reference

Environment:

- `SYSTEM_PASSWORD` (required)

Public endpoints:

- `POST /api/auth/login`
- `POST /api/services/:id/toggle` (authenticated)
- `GET /api/services/:id/log` (authenticated)

Session constants:

- TTL: 12 hours
- Cookie name: `session_token`
- Token format: `<base64url(payload)>.<hmac_sha512_signature>`
