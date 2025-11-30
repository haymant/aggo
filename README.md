To test quickly, example files are included in `examples/` — open these in the Extension Development Host and right-click to open via the respective Aggo editors. For example, try `examples/sample.cpn` to open with the CPN Editor.

# Aggo Custom Editors (VS Code Extension)

This repository provides a VS Code extension scaffolding that registers Visual Editors (webview-based) for the following JSON-based file types:

- `*.page` — Aggo Page Editor
- `*.ds` — Aggo Data Source Editor
- `*.schema` — Aggo Schema Editor (intent: edit JSON schema)
- `*.cpn` — Aggo CPN Editor (for CPN networks)
- `*.mcp` — Aggo MCP Editor
- `*.color` — Aggo Color Editor (for CPN color definitions)

Important features:
- Files with these extensions are recognized as `json` via `configurationDefaults`.
- Each file type has a webview-based custom editor entry (placeholder UI).
- Right-click (Explorer context) supports "Open with Aggo ... Editor" via commands.
- Placeholder editors are built with React + radix-ui (shadcn/radix-ui style) and show an editor/preview tab.
 - React 19 and Tailwind CSS are used for webview UI (Tailwind processed via Vite/PostCSS), providing a modern dev experience.

---


## Development

Note: This project uses pnpm as the default package manager.
If you don't have pnpm installed, you can install it globally or enable it via Corepack:

```bash
# Install globally (requires npm)
npm install -g pnpm

# Or enable via Corepack (Node 16+):
corepack enable
corepack prepare pnpm@latest --activate
```


Prerequisites:
- Node.js 20+ (recommended for packaging and running the dev tooling)
- pnpm (preferred). If not installed, having npm is ok to install pnpm (see above)
- VS Code with the "Extension Development Host" capability

Install dependencies:

```bash
pnpm install
```

Build the TypeScript extension and the webview bundle (production):

```bash
pnpm run build
pnpm run build:webview
```

For rapid UI iteration use the Vite dev server for the webview and a TypeScript watcher in separate terminals:

```bash
pnpm run dev:webview # starts the Vite dev server (default port 5173)
pnpm run watch       # watch TypeScript extension code
```

If port 5173 is already in use, you can start the dev server on a different port and tell the extension where to load the dev server from:

1) Start the Vite dev server on another port (e.g. 5174):

```bash
pnpm run dev:webview -- --port 5174
```

2) When launching the extension (`pnpm run watch` or F5 from VS Code), let the extension know the dev server URL using `VITE_DEV_SERVER_URL`:

```bash
VITE_DEV_SERVER_URL=http://localhost:5174 pnpm run watch
```

This will update webviews to load from `http://localhost:5174` and allow HMR to use `ws://localhost:5174`.

If you'd rather free port 5173, find what is listening on the port and kill the process (Linux):

```bash
# find pid using 5173 (or use `ss`/`lsof` as available)
ss -ltnp | grep 5173 || lsof -i :5173
# kill safely when confident
kill -9 <PID>
```

Or, to run the production webview build and watch the extension only:

```bash
pnpm run build:webview
pnpm run watch
```

Then press `F5` in VS Code to launch the Extension Development Host. The default Debug configuration (`Run Extension`) will start both the Vite webview dev server and TypeScript watch via the `Start Dev Servers` task.

### Debugging tips

- Debug the extension code (TypeScript server side): set breakpoints in `src/` and press `F5` — the Extension Development Host will stop at breakpoints in the extension.
- Debug the webview UI (client side):
	- Start the Vite dev server `pnpm run dev:webview` and run the extension in dev host (F5). The extension will load the webview UI from the Vite server in development mode.
	- In the Extension Development Host window, open the Command Palette and run `Developer: Toggle Developer Tools`, or right-click the webview content and choose `Inspect Element` to open the DevTools for that webview.
	- Use the DevTools debugger and console to set breakpoints and see logs. Vite will enable HMR and auto-refresh when saving files.

Note: If you don't want to use a dev server, build the webview using `pnpm run build:webview` and the extension will load the local `media/` bundles.

---

## How the extension works

- The extension registers custom editors for file extensions in `package.json`.
- Each editor is a placeholder built using a webview (bundled JS under `media/webview.js` when built for production); while developing the webview, the extension can load from the Vite dev server to enable HMR.
 - Each editor is a placeholder built using a webview (bundled JS under `media/webview.js` when built for production); while developing the webview, the extension can load from the Vite dev server to enable HMR.
- The webview listens for the `init` message and shows a simple editor and preview.
- A Save button demonstrates messaging back to the extension (placeholder only).

---

## Packaging for distribution

To package a distributable `.vsix` file, ensure `out` and `media` are built, then run one of these (recommended):

1) Using npm (recommended - more reproducible):
```bash
# ensure Node 20
nvm install 20 && nvm use 20
# remove leftover pnpm artifacts to avoid hoisting conflicts
rm -rf node_modules .pnpm pnpm-lock.yaml package-lock.json
npm ci
npm run build
npm run build:webview
npm run package
```

2) Using pnpm with hoisted node_modules (works around strict pnpm layout):
```bash
rm -rf node_modules .pnpm pnpm-lock.yaml package-lock.json
pnpm install --shamefully-hoist
pnpm run build
pnpm run build:webview
pnpm run package
```

3) Short helper scripts in this repository:
```bash
# Using pnpm but with hoisting
pnpm run package:hoist
# Or, run packaging with npm
pnpm run package:npm
```

Note: Packaging can fail with `pnpm` because of strict hoisting and some packages which expect a flat node_modules tree (and some packages depend on Node 20+ behavior). If you encounter errors during packaging (missing/invalid package errors, or undici/webidl 'File is not defined') try one of these approaches:

- Recommended (reproducible): use npm and Node 20 for packaging (CI friendly):

```bash
# Ensure Node 20 is active (nvm):
nvm install 20 && nvm use 20
# Clean any pnpm artifacts
rm -rf node_modules .pnpm pnpm-lock.yaml package-lock.json
npm ci
npm run build
npm run build:webview
npm run package
```

- If you prefer pnpm, try a hoisted install and Node 20 to reduce dependency layout issues:

```bash
nvm install 20 && nvm use 20
rm -rf node_modules .pnpm pnpm-lock.yaml
pnpm install --shamefully-hoist --network-concurrency 1
pnpm run build && pnpm run build:webview
pnpm run package
```

Add a CI job using Node 20 that runs the packaging step so you can detect packaging issues early.

## License

This project is licensed under the Apache License, Version 2.0. See the `LICENSE` file for details.
```

Note: The `vsce` CLI has been renamed to `@vscode/vsce`. If you see deprecation warnings, ensure `@vscode/vsce` is installed (the package is included in this project as a `devDependency`). The `package` script still runs `vsce package` and the `@vscode/vsce` package provides the `vsce` binary.

If you see warnings about build scripts (pnpm will ask for confirmation), run the command below to approve them interactively (or during CI, add approval via pnpm configuration):

```bash
pnpm approve-builds
```

This requires the `vsce` package (bundled as a dev dependency). The resulting `aggo-custom-editors-0.1.0.vsix` file will be created in the workspace root.

---

## Notes & Next steps

This repository includes several working webview-based editors and building-block editor features, not just placeholders. The work completed so far includes:

- Aggo Schema Editor (first schema editor) — a webview-based schema editor built with `jsonjoy-builder` that:
	- supports theme detection (Light/Dark/HighContrast) and injects theme classes at first render to avoid FOUC
	- implements a message handshake (webview -> `ready` and extension -> `init`) to prevent race conditions
	- implements two-way sync between the webview and the underlying TextDocument. It listens for `workspace.onDidChangeTextDocument` in the extension and forwards `documentChanged` to the webview, while preventing echo loops using a small guard on both sides
	- demonstrates a Save action using `requestSave`
- Other editors: Page Editor, Data Source Editor, Color Editor, CPN and MCP editor stubs and placeholders, each registered with VS Code customEditor APIs. They are useful templates to add richer features.

Planned / recommended next steps:
- Expand editor features (serialization, validation, undo/redo integration) for each editor type.
- Add tests and CI, including a packaging step using Node 20 and `npm` (recommended) so packaging will be validated on each merge or release.
- Add a prepublish step that validates that `engines.vscode` and `@types/vscode` are compatible and check for `console.log` in production code.
- Disable or ban `console.log` in production files via ESLint or a pre-commit/CI rule.

Use the `webview` folder to extend or replace the React UI; the project uses Vite to build the webview assets (preferred). For development, use `pnpm run dev:webview` and `pnpm run watch` for the extension, and press `F5` to open the Extension Development Host.

### Why Vite (for webview bundling)?
Vite is fast, supports modern JS and JSX out-of-the-box, provides a development server with HMR for rapid iteration, and has an easy plugin ecosystem for React and Tailwind CSS. For webview development in VS Code, Vite is a strong choice — it keeps the UI iteration fast and integrates well when used with a `dev` mode that you can conditionally load in the extension (like this project does).

Alternative: Esbuild is also a great choice for simple and very fast bundling with fewer configs; it works perfectly for production builds but lacks a first-class dev server like Vite (though you can implement one). Ultimately both work; this project prefers Vite for development ergonomics.
