> [!WARNING]
> This project is fully vibe-coded.

# Integrated Services Manager

A lightweight Next.js dashboard that keeps multiple Node.js services in one place. It ships with a hardened, single-user login gate and reads service definitions from `data/settings.json`, so you can track production and development processes without exposing sensitive configuration. From the home page you can start/stop each process and inspect live logs in-place or in a dedicated browser tab.

## Getting Started

1. **Install dependencies**
   ```bash
   yarn install
   ```
2. **Configure the environment**
   ```bash
   cp .env.inc .env # or create manually
   echo "SYSTEM_PASSWORD=change-me" >> .env
   ```
   The password is hashed with SHA-512 on both the client and server before being compared.
3. **Describe your services** by editing `data/settings.json` (see `data/settings.inc.json` for a template).

- Each service defaults to `services/<slug>/` as its working directory. The `main` field is resolved relative to that folder unless you provide an absolute path.
- Arguments (`argv`) are appended after the entry file.

4. **Run the dev server**
   ```bash
   yarn dev
   ```

## Configuration

- **`SYSTEM_PASSWORD`**: Required. Stored in `.env` and never committed.
- **`data/settings.json`**: Declares the NVM root and each managed service:
  ```jsonc
  {
    "nvm": "path/to/nvm",
    "services": [
      {
        "name": "your-project",
        "main": "dist/main.js",
        "nodeVersion": "22.13.0",
        "mode": "DEVELOPMENT",
        "argv": ["--trace-warnings"],
        "version": "0.0.0"
      }
    ]
  }
  ```
- **Session tokens** expire after 12 hours and are invalidated whenever the server restarts.
- **IP throttling**: Five failed login attempts block the IP for 12 hours (in-memory, so resetting the server clears the blocklist).
- **Process controls**: The dashboard uses an in-memory process manager (`src/app/lib/service-manager.ts`) that spawns each service with `node <entry> ...argv`. Killing a process asks for confirmation client-side, sends `SIGTERM`, and escalates to `SIGKILL` after ~7 seconds. Logs are buffered in-memory (last 2000 lines) and exposed via `/api/services/:id/log`.

## Scripts

- `yarn dev` – run the Next.js dev server (Turbopack)
- `yarn build` – create a production build
- `yarn start` – run the production build

## Project Structure

- `src/app/lib/auth.ts` – password hashing, session signing, and cookie helpers
- `src/app/lib/session.ts` – server-only helpers for guarding routes
- `src/app/lib/settings.ts` – loads and normalizes service definitions, resolves entry points
- `src/app/lib/service-manager.ts` – spawns/kills processes and captures logs
- `src/app/ui/service-card.tsx` & `service-controls.tsx` – dashboard UI with start/stop + log dialog
- `src/app/api/services/[id]/toggle` – toggle endpoint used by the control button
- `src/app/api/services/[id]/log` – JSON/plain-text log feed (also powers the “open in new tab” action)

Extend the dashboard by wiring these APIs into a more advanced orchestrator, or by feeding the manager with additional metadata (health checks, metrics, etc.)—the auth, configuration, and UI scaffolding are already in place.
