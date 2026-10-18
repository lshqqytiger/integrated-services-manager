# API Reference

## Overview

This document describes the HTTP API exposed by Integrated Services Manager.

Base characteristics:

- Runtime: Next.js App Router route handlers
- Payload format: JSON unless noted otherwise
- Authentication: Session cookie (`session_token`) for protected routes
- Cache policy: service control and log routes return `Cache-Control: no-store`

## Authentication Model

- Public endpoint:
  - `POST /api/auth/login/session`
  - `POST /api/auth/login`
- Protected endpoints:
  - `POST /api/services/:id/toggle`
  - `GET /api/services/:id/log`
  - `POST /api/services/:id/stdin`

Protected handlers use server-side session checks via `requireSession()`.

## Endpoint: Login

### POST /api/auth/login/session

Issue a short-lived login session cookie required for login attempts.

Response body:

```json
{
  "ok": true,
  "captchaPrompt": "CAPTCHA: What is 2 + 7?",
  "blockedMessage": null,
  "cooldownMessage": null
}
```

Side effect:

- Sets cookie `login_session` (`HttpOnly`, `SameSite=Lax`, `Path=/`, 15-minute max-age, `Secure` in production)

### POST /api/auth/login

Authenticate user and issue session cookie.

Request body:

```json
{
  "hashedPassword": "<sha512-hex>",
  "captchaAnswer": "<required when prompted>"
}
```

Request notes:

- `hashedPassword` is required.
- `hashedPassword` must be 128-char lowercase SHA-512 hex.
- Frontend hashes plaintext password with SHA-512 before sending.
- A valid `login_session` cookie is required.

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
  "error": "Invalid password. N attempts remaining.",
  "retryAfterMs": 5000,
  "captchaPrompt": "CAPTCHA: What is 2 + 7?"
}
```

- `429 Too Many Requests`

```json
{
  "error": "Too many failed attempts. Please try again in N seconds."
}
```

- `500 Internal Server Error`

```json
{
  "error": "Authentication is not configured on the server"
}
```

Rate limiting behavior:

- Source IP derives in order from `x-forwarded-for`, `x-real-ip`, fallback `0.0.0.0`.
- Failed attempts apply exponential cooldown backoff (starting at 5 seconds, capped at 10 minutes).
- CAPTCHA challenge is required after 3 failed attempts.
- 5 failed attempts block IP for 12 hours.
- Successful login resets attempt counter for that IP.

## Endpoint: Toggle Service

### POST /api/services/:id/toggle

Start or stop a configured service based on current runtime state.

Path parameters:

- `id` (string): normalized service ID from settings loader

Authentication:

- Required (valid `session_token`)

Behavior:

- If service is `RUNNING`, handler attempts graceful stop (SIGTERM then SIGKILL fallback).
- If service is `STOPPED`, handler starts configured command as:
  - executable: parsed from first token in `command`
  - args: parsed from remaining tokens in `command`
  - cwd: service `root`

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

or an internal message from thrown runtime errors (for example missing working directory or missing absolute executable path).

## Endpoint: Service Logs

### GET /api/services/:id/log

Fetch in-memory log lines for one service.

Path parameters:

- `id` (string): normalized service ID

Query parameters:

- `format=plain` (optional): when present and equal to `plain`, response is plain text instead of JSON

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

````json
{
  "error": "Service not found"
}

## Endpoint: Service Standard Input

### POST /api/services/:id/stdin

Send text input to a running child process via stdin.

Path parameters:

- `id` (string): normalized service ID

Authentication:

- Required (valid `session_token`)

Request body:

```json
{
  "input": "text to write to stdin"
}
````

Request notes:

- `input` is required and must be a string.
- Input is written as UTF-8.
- The server limit is 16000 characters per request.
- The UI sends newline-terminated payloads for Enter-based submissions.

Success response:

- Status: `200 OK`
- Headers: `Cache-Control: no-store`
- Body:

```json
{
  "message": "Input sent"
}
```

Error responses:

- `400 Bad Request`

```json
{
  "error": "Invalid JSON payload"
}
```

or

```json
{
  "error": "Input must be a string"
}
```

- `404 Not Found`

```json
{
  "error": "Service not found"
}
```

- `409 Conflict`

```json
{
  "error": "Process is not running."
}
```

or

```json
{
  "error": "Process stdin is not writable."
}
```

or

```json
{
  "error": "Input exceeds 16000 characters."
}
```

````

## Data Contracts

Service action result:

```json
{
  "status": "RUNNING | STOPPED",
  "message": "string"
}
````

Log response:

````json
{
  "id": "string",
  "log": ["string"]
}

Stdin request:

```json
{
  "input": "string"
}
````

Stdin response:

```json
{
  "message": "Input sent"
}
```

````

Login request:

```json
{
  "hashedPassword": "sha512-hex-string"
}
````

## Operational Notes for API Consumers

- No logout endpoint currently; session expires by TTL or on server restart.
- Session and rate-limit state are in-memory; restart resets both.
- Service IDs derive from normalized name and list order, so renaming or reordering services can change IDs.
- This API is designed for the bundled UI, but can be consumed programmatically with cookie-based authentication.
