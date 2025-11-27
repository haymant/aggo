To test quickly, a sample file is included in `samples/example.page` — open this in the Extension Development Host and right-click to open via the Aggo Page Editor.

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
- Node.js 18+
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
pnpm run dev:webview # starts the Vite dev server (port 5173)
pnpm run watch       # watch TypeScript extension code
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

To package a distributable `.vsix` file, ensure `out` and `media` are built, then run:

```bash
pnpm run package
```

Note: The `vsce` CLI has been renamed to `@vscode/vsce`. If you see deprecation warnings, ensure `@vscode/vsce` is installed (the package is included in this project as a `devDependency`). The `package` script still runs `vsce package` and the `@vscode/vsce` package provides the `vsce` binary.

If you see warnings about build scripts (pnpm will ask for confirmation), run the command below to approve them interactively (or during CI, add approval via pnpm configuration):

```bash
pnpm approve-builds
```

This requires the `vsce` package (bundled as a dev dependency). The resulting `aggo-custom-editors-0.1.0.vsix` file will be created in the workspace root.

---

## Notes & Next steps

- This repository includes placeholder editor UIs only. Implement editor features, serialization, validation, and saving to the underlying TextDocument as needed.
Use the `webview` folder to extend or replace the React UI; the project uses Vite to build the webview assets (preferred), so `pnpm run dev:webview` runs a local dev server and `pnpm run build:webview` produces the production bundle under `media/`.

### Why Vite (for webview bundling)?
Vite is fast, supports modern JS and JSX out-of-the-box, provides a development server with HMR for rapid iteration, and has an easy plugin ecosystem for React and Tailwind CSS. For webview development in VS Code, Vite is a strong choice — it keeps the UI iteration fast and integrates well when used with a `dev` mode that you can conditionally load in the extension (like this project does).

Alternative: Esbuild is also a great choice for simple and very fast bundling with fewer configs; it works perfectly for production builds but lacks a first-class dev server like Vite (though you can implement one). Ultimately both work; this project prefers Vite for development ergonomics.
