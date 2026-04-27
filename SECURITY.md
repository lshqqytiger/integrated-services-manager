# Security Notes

## 1. Security Objectives

Integrated Services Manager is designed for private, single-user operations where the primary goals are:

- Prevent unauthorized access to process controls
- Reduce brute-force login risk
- Protect session integrity
- Limit accidental exposure of sensitive runtime interfaces

It is not currently designed as a multi-tenant, internet-hardened control plane.

## 2. Trust Boundaries

Primary boundaries in this project:

- Browser client (untrusted input)
- Next.js server route handlers (enforcement point)
- Local process manager and filesystem access
- Environment secrets (`SYSTEM_PASSWORD`)

All privileged actions (start/stop/log access) are enforced on server handlers via session validation.

## 3. Authentication and Session Design

### Password handling

- Server reads `SYSTEM_PASSWORD` from environment.
- Server computes SHA-512 hash and compares with `hashedPassword` provided by client.
- Client sends SHA-512 hash of password instead of plaintext.

Important caveat:

- Client-side hashing is not a replacement for HTTPS. The hash is effectively a bearer secret for authentication if intercepted.

### Session token format

- Cookie name: `session_token`
- Token shape: `<base64url(payload)>.<hmac_sha512_signature>`
- Payload includes:
  - token version
  - issued timestamp
  - random nonce

### Signature and validation

- HMAC-SHA512 over payload
- Constant-time signature comparison (`timingSafeEqual`) when lengths match
- Validation checks:
  - token format and decode validity
  - signature validity
  - payload field integrity
  - version match
  - expiration (12-hour TTL)

### Cookie settings

- `HttpOnly`: true
- `SameSite`: `Lax`
- `Path`: `/`
- `Max-Age`: 12 hours
- `Secure`: true only in production mode

### Session invalidation behavior

- Signing key includes runtime random secret.
- Server restart rotates runtime secret and invalidates all active sessions.

## 4. Brute Force and Abuse Controls

Login endpoint enforces in-memory IP attempt tracking:

- Maximum failed attempts: 5
- Block duration: 12 hours
- Success resets the IP record

IP extraction priority:

1. `x-forwarded-for` first value
2. `x-real-ip`
3. fallback `0.0.0.0`

Operational caveats:

- State is in-memory and resets on restart.
- Correctness of forwarded headers depends on trusted reverse proxy setup.

## 5. Authorization Controls

Protected endpoints:

- `POST /api/services/:id/toggle`
- `GET /api/services/:id/log`

Control logic:

- Session is required before service lookup/action.
- Service ID is resolved server-side against normalized settings snapshot.
- Unknown IDs return 404.

## 6. Process Control Risk Surface

Service actions can spawn and terminate local Node.js processes.

Current guardrails:

- Entry file existence check before spawn
- Controlled spawn form: `node <entry> ...argv`
- Environment injection limited to inherited env plus `SERVICE_NAME` and `SERVICE_MODE`
- Graceful stop via SIGTERM with SIGKILL escalation after timeout

Residual risks:

- If settings file is compromised, attacker can point to arbitrary executable JS entry paths.
- Child processes inherit server environment variables by default.

## 7. Data Exposure Considerations

### Logs

- Logs are collected from child stdout/stderr and retained in memory (max 2000 lines/service).
- Logs may contain secrets emitted by managed services.
- Logs are retrievable to any authenticated session holder.

### Error messages

- Some 500 responses include internal error messages (for example missing entry path).
- Useful for diagnostics, but can expose internal paths/context.

## 8. Current Limitations

- No logout endpoint
- No CSRF token mechanism
- No MFA, no account model, no RBAC
- No persistent audit trail for control actions
- In-memory security state (sessions, attempt store) is not durable or shared

## 9. Deployment Guidance (Minimum)

Recommended baseline for production-like environments:

1. Serve only over HTTPS.
2. Place behind a trusted reverse proxy and sanitize forwarding headers.
3. Restrict network access (VPN, private subnet, IP allowlist).
4. Use strong `SYSTEM_PASSWORD` and secure secret management.
5. Avoid logging secrets in managed services.
6. Run with least-privilege OS user and constrained filesystem permissions.
7. Monitor failed login patterns and process-control events externally.

## 10. Hardening Roadmap

Suggested next controls:

1. Add explicit logout endpoint and server-side session revocation list.
2. Move session and IP-attempt state to Redis (or equivalent shared store).
3. Add CSRF protection for state-changing endpoints.
4. Introduce structured audit logging for authentication and service actions.
5. Restrict allowed entry paths to a vetted directory allowlist.
6. Avoid full env inheritance when spawning child processes; pass minimal env.
7. Consider second authentication factor for operational actions.
