# Security Notes

## 1. Security Objectives

Integrated Services Manager is designed for private, single-user operations where the primary goals are:

- prevent unauthorized access to process controls
- reduce brute-force login risk
- protect session integrity
- limit accidental exposure of sensitive runtime interfaces

It is not currently designed as a multi-tenant internet-facing control plane.

## 2. Trust Boundaries

Primary boundaries:

- browser client (untrusted input)
- Next.js route handlers (enforcement point)
- local process execution boundary
- environment secret boundary (`SYSTEM_PASSWORD`)

All privileged actions (start, stop, log access) are enforced server-side via session checks.

## 3. Authentication and Session Design

### Password handling

- Server reads `SYSTEM_PASSWORD` from environment.
- Server computes SHA-512 hash and compares to client `hashedPassword`.
- Client sends SHA-512 hash of password instead of plaintext.

Important caveat:

- Client-side hashing does not replace TLS. Intercepted hash is effectively a reusable credential.

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
  - token shape and decode validity
  - signature validity
  - payload integrity
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

Login endpoint applies in-memory IP attempt tracking:

- maximum failed attempts: 5
- block duration: 12 hours
- successful login resets IP attempt record

IP extraction priority:

1. `x-forwarded-for` first value
2. `x-real-ip`
3. fallback `0.0.0.0`

Operational caveats:

- state is in-memory and resets on restart
- forwarded header trust depends on reverse proxy configuration

## 5. Authorization Controls

Protected endpoints:

- `POST /api/services/:id/toggle`
- `GET /api/services/:id/log`

Control logic:

- session required before service lookup or action
- service ID resolved server-side against normalized settings snapshot
- unknown IDs return 404

## 6. Process Control Risk Surface

Service actions can execute arbitrary commands defined in configuration.

Current guardrails:

- working directory existence check before spawn
- absolute executable existence check before spawn
- execution uses parsed command tokens (`executable` + `args`)
- injected environment additions limited to `SERVICE_NAME` and `SERVICE_MODE`
- graceful stop via SIGTERM, then SIGKILL escalation after timeout

Residual risks:

- if `data/settings.json` is compromised, attacker can execute arbitrary commands
- child processes inherit server environment variables by default
- relative executable names resolve through PATH, which may differ by host

## 7. Data Exposure Considerations

### Logs

- logs are captured from child stdout and stderr
- logs are retained in memory only (max 2000 lines per service)
- logs may contain secrets emitted by managed applications
- logs are available to authenticated sessions

### Error messages

- some 500 responses include internal error details (paths, command failures)
- useful for diagnostics but can expose host context

## 8. Current Limitations

- no logout endpoint
- no CSRF token mechanism
- no MFA, account model, or RBAC
- no persistent audit trail for actions
- in-memory security state is not durable or shared across instances

## 9. Deployment Guidance (Minimum)

Recommended baseline:

1. Serve over HTTPS only.
2. Place behind trusted reverse proxy and sanitize forwarding headers.
3. Restrict network access (VPN, private subnet, allowlist).
4. Use strong `SYSTEM_PASSWORD` and secret management.
5. Protect `data/settings.json` with strict file permissions.
6. Avoid logging secrets in managed applications.
7. Run with least-privilege OS user and constrained filesystem permissions.

## 10. Hardening Roadmap

Suggested next controls:

1. Add logout endpoint and server-side session revocation.
2. Move session and IP-attempt state to Redis (or equivalent).
3. Add CSRF protection for state-changing endpoints.
4. Add structured audit logging for auth and service actions.
5. Add command allowlist and root-directory allowlist policy.
6. Reduce environment inheritance for child processes.
7. Add optional second factor for operational actions.
