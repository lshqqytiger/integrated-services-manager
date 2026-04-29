> [!WARNING]
> This project is fully vibe-coded.

# Integrated Services Manager

A lightweight Next.js dashboard for controlling multiple local applications from one place. It ships with a single-user login gate and reads service definitions from `data/settings.json`, so you can manage Node.js, Rust, Java, shell-based workloads, and other command-driven services through one UI.

## Getting Started

1. Install dependencies

```bash
yarn install
```

2. Configure environment

```bash
cp .env.inc .env # or create manually
echo "SYSTEM_PASSWORD=change-me" >> .env
```

The password is hashed with SHA-512 on both client and server before comparison.

3. Describe services in `data/settings.json` (template: `data/settings.inc.json`)

4. Run development server

```bash
yarn dev
```

## Configuration

- `SYSTEM_PASSWORD`
  - required
  - stored in `.env`
  - should not be committed

- `data/settings.json`
  - schema:

```jsonc
{
  "services": [
    {
      "name": "hello-world",
      "root": "/home/sslab/integrated-services-manager/services/hello-world",
      "command": "/home/sslab/.nvm/versions/node/v24.15.0/bin/node index.js",
      "mode": "DEVELOPMENT",
    },
    {
      "name": "shell-app",
      "root": "/home/sslab/integrated-services-manager/services/shell-app",
      "command": "/bin/bash index.sh",
      "mode": "DEVELOPMENT",
    },
  ],
}
```

Field behavior:

- `name`: display name and ID seed
- `root`: working directory (`cwd`) for command execution
- `command`: full command line parsed into executable and args
- `mode`: `DEVELOPMENT` or `PRODUCTION`

Runtime behavior:

- Service IDs are generated from service name plus index order.
- Process controls are in-memory and not persisted.
- Session tokens expire after 12 hours and are invalidated on server restart.
- IP throttling blocks after 5 failed login attempts for 12 hours.
- Process logs are buffered in-memory (last 2000 lines) and exposed through `/api/services/:id/log`.
- Log decoding is UTF-8 safe across stream chunks, preserving Unicode output.
- Log dialog follow mode auto-scrolls only when new log lines arrive and the viewer is near the bottom.
- Standard input can be sent to running services through `/api/services/:id/stdin`.

## Scripts

- `yarn dev` - run Next.js development server
- `yarn build` - build production bundle
- `yarn start` - run production server

## Project Structure

- `src/app/lib/auth.ts` - password hashing, session signing, cookie helpers
- `src/app/lib/session.ts` - server-side route guards
- `src/app/lib/settings.ts` - settings parsing, normalization, cache
- `src/app/lib/service-manager.ts` - process spawn/stop and log collection
- `src/app/ui/service-card.tsx` and `src/app/ui/service-controls.tsx` - dashboard controls
- `src/app/api/services/[id]/toggle` - service lifecycle endpoint
- `src/app/api/services/[id]/log` - service log endpoint
- `src/app/api/services/[id]/stdin` - service standard input endpoint

## Docs

- `ARCHITECTURE.md`
- `API.md`
- `SECURITY.md`
