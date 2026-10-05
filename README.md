# Noot-v2

Noot rewritten in TypeScript: a Yarn workspaces monorepo.

## Structure

```
apps/backend     NestJS API (GET /health, Socket.IO gateway stub)
apps/frontend    React + Vite UI (reads /health from the backend)
packages/shared  Types and constants shared by both apps (@noot/shared)
```

`@noot/shared` is the single home of cross-app contracts (`HealthResponse`,
`WsMessage`, `HEALTH_PATH`, `DEFAULT_BACKEND_PORT`); both apps import it, never
redefine it.

## Requirements

- Node 24 LTS (`nvm use` reads `.nvmrc`)
- Yarn 4 via Corepack: `corepack enable`

## Commands

```sh
yarn install
yarn build   # shared -> backend -> frontend
yarn lint    # ESLint + Prettier check
yarn test    # typecheck + Vitest per app, typecheck for shared
yarn dev     # shared watch + backend on :3000 + Vite dev server (proxies /health)
```

Backend port: `PORT` (default 3000). The Vite dev proxy targets `BACKEND_URL`
(default `http://localhost:3000`).
