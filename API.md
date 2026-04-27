# API Reference

## Overview

This document describes the HTTP API exposed by Integrated Services Manager.

Base characteristics:

- Runtime: Next.js App Router route handlers
- Payload format: JSON unless noted otherwise
- Authentication: Session cookie (`session_token`) for protected routes
- Cache policy: Service control and log routes return `Cache-Control: no-store`

## Authentication Model

- Login endpoint is public: `POST /api/auth/login`
- Service endpoints are protected by server-side session checks:
  - `POST /api/services/:id/toggle`
  - `GET /api/services/:id/log`
- On unauthenticated access to protected handlers, `requireSession()` triggers redirect behavior via Next.js navigation utilities.

## Endpoint: Login

### POST /api/auth/login

Authenticate user and issue session cookie.

Request body:

```json
{
  "hashedPassword": "<sha512-hex>"
}
```

Request notes:

- `hashedPassword` is required.
- The frontend hashes plaintext password with SHA-512 before sending.

Success response:

- Status: `200 OK`
- Body:

```json
{
  "ok": true
}
```

- Side effect: sets cookie `session_token` with options:
  - `HttpOnly`
  - `SameSite=Lax`
  - `Path=/`
  - `Max-Age=43200` (12 hours)
  - `Secure` only when `NODE_ENV=production`

Error responses:

- `400 Bad Request`

```json
{
  "error": "Invalid request body"
}
```

or

```json
{
  "error": "Password is required"
}
```

- `401 Unauthorized`

```json
{
  "error": "Invalid password. N attempts remaining."
}
```

- `429 Too Many Requests`

```json
{
  "error": "Too many failed attempts. Please try again after the block period ends."
}
```

- `500 Internal Server Error`

```json
{
  "error": "Authentication is not configured on the server"
}
```

Rate limiting behavior:

- Source IP is derived in order from `x-forwarded-for`, `x-real-ip`, fallback `0.0.0.0`.
- After 5 failed attempts, IP is blocked for 12 hours.
- Successful login resets attempt record for that IP.

## Endpoint: Toggle Service

### POST /api/services/:id/toggle

Start or stop a configured service based on current runtime state.

Path parameters:

- `id` (string): normalized service ID from settings loader

Authentication:

- Required (valid `session_token`)

Behavior:

- If service is `RUNNING`, handler attempts graceful stop (SIGTERM, then SIGKILL fallback).
- If service is `STOPPED`, handler spawns process as `node <entryPoint> ...argv`.

Success response:

- Status: `200 OK`
- Headers: `Cache-Control: no-store`
- Body:

```json
{
  "status": "RUNNING | STOPPED",
  "message": "human readable status"
}
```

Error responses:

- `404 Not Found`

```json
{
  "error": "Service not found"
}
```

- `500 Internal Server Error`

```json
{
  "error": "Unable to toggle service"
}
```

or an internal message from thrown runtime errors (for example missing entry file).

## Endpoint: Service Logs

### GET /api/services/:id/log

Fetch in-memory log lines for one service.

Path parameters:

- `id` (string): normalized service ID

Query parameters:

- `format=plain` (optional): when present and equals `plain`, response is plain text instead of JSON

Authentication:

- Required (valid `session_token`)

Default JSON response:

- Status: `200 OK`
- Headers: `Cache-Control: no-store`
- Body:

```json
{
  "id": "service-id",
  "log": ["[timestamp] line", "..."]
}
```

Plain text response:

- Status: `200 OK`
- Headers:
  - `Content-Type: text/plain; charset=utf-8`
  - `Cache-Control: no-store`
- Body:
  - joined log lines separated by newline
  - returns `No logs captured yet.` when buffer is empty

Error responses:

- `404 Not Found`

```json
{
  "error": "Service not found"
}
```

## Data Contracts

Service action result:

```json
{
  "status": "RUNNING | STOPPED",
  "message": "string"
}
```

Log response:

```json
{
  "id": "string",
  "log": ["string"]
}
```

Login request:

```json
{
  "hashedPassword": "sha512-hex-string"
}
```

## Operational Notes for API Consumers

- There is no logout endpoint currently; session naturally expires after TTL or on server restart.
- Session and rate-limit state are in-memory; restarting server resets both.
- Service IDs are generated from configuration order and names, so changing service names/order can change IDs.
- API is intended for the bundled UI, but can be consumed programmatically if cookie-based auth is handled.
