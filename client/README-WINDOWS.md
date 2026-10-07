# Windows setup

Open PowerShell or Command Prompt in this `client/` directory.

```powershell
pnpm install --frozen-lockfile
pnpm run build
pnpm run desktop:start
```

Electron 44 downloads its runtime when `desktop:start` runs. If that download
fails, run this recovery sequence from `client/` to see the full download error:

```powershell
Remove-Item -Recurse -Force node_modules\electron
pnpm install --force --frozen-lockfile
pnpm run electron:install
pnpm run build
pnpm run desktop:start
```

Use Node.js 22.12 or newer for Electron 44. Do not run `pnpm ci`; use
`pnpm install --frozen-lockfile` for this project. Electron download errors are
usually network/proxy/cache errors; the full error printed by
`pnpm run electron:install` identifies the cause.
