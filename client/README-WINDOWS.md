# Windows setup

Open PowerShell or Command Prompt in this `client/` directory.

```powershell
pnpm install --frozen-lockfile
pnpm run build
pnpm run desktop:start
```

The `postinstall` script downloads the Electron runtime automatically. If the
installation was interrupted and `node_modules/electron/install.js` is missing,
run this recovery sequence from `client/`:

```powershell
Remove-Item -Recurse -Force node_modules
pnpm install --force --frozen-lockfile
pnpm run electron:install
pnpm run build
pnpm run desktop:start
```

Use Node.js 22.12 or newer for Electron 44. Do not run `pnpm ci`; use
`pnpm install --frozen-lockfile` for this project.
