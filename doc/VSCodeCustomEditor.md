# VS Code Custom Editor Best Practices

This document captures best practices and patterns for building custom editors with the VS Code Webview API based on lessons from the Aggo project's implementation.

## 🧭 Overview

- Use a webview to provide a rich UI (e.g. React + Vite + Tailwind) for custom text editors.
- Keep message passing between the extension host and the webview simple, well-documented, and resilient.
- Respect consumer UX: minimize distracting UI notifications coming from internal handshakes or unrecognized messages.

---

## 🔁 Handshake & Initialization

Use a small handshake so the extension only sends large payloads (e.g. file content) once the webview is ready:

1. Webview: post `ready` once the UI is initialized.
2. Extension: on `ready`, post `init` with text, metadata and initial theme.

Example (webview side):
```ts
// client (webview)
const vscode = acquireVsCodeApi();
vscode.postMessage({ type: 'ready' });
window.addEventListener('message', (ev) => { /* ... */ });
```

Example (extension side):
```ts
webview.onDidReceiveMessage((msg) => {
  if (msg.type === 'ready') {
    webview.postMessage({ type: 'init', text: document.getText(), theme });
  }
});
```

---

## 🛡️ Content Security Policy

- Always include a nonce for scripts (e.g. `script-src 'nonce-<nonce>'`) and use `webview.asWebviewUri()` for bundle assets.
- If using a Vite dev server, include the dev server host in the CSP while in development only.

Example:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-...'<dev-or-csp-source>; style-src <dev-or-csp-source> 'unsafe-inline'; connect-src <dev-or-csp-source>; img-src <csp-source> https: data:;"/>
```

---

## 🎨 Theming

- Detect the active theme with the `onDidChangeActiveColorTheme` listener in the extension and forward theme toggles to the webview.
- Apply theme classes on the `<html>`, `<body>`, and webview root container elements to avoid FOUC (flash of unstyled content).
- For third-party libraries that rely on CSS variables (like `jsonjoy-builder`), prefer overriding theme variables in your own global stylesheet so the library picks up the correct values.

Key points:
- Use the extension host to determine `isDev` and the initial theme, then inject that into the HTML when creating the webview to prevent a flash of the wrong theme.
- Example theme toggle message: `{ type: 'theme', theme: 'dark' | 'light' }`

---

## 🔲 Views: Activity Bar / Side Bar / Panel / Editor Tabs

VS Code provides several view containers where extension UIs can live. Use the right view for the purpose of the UI:
- Activity bar + Side Bar: for tools and navigation (TreeViews, WebviewViews)
- Panel (bottom): for inspectors, logs, or tools that don't need an editor slot (WebviewViews)
- Editor area: tabs for full editors and document-like experiences (WebviewPanels)

High level:
- Use `contributes.viewsContainers`/`contributes.views` in `package.json` to add new containers and view items.
- Implement `WebviewViewProvider` to render a complex view inside Side Bar or Panel as a webview.
- Use `vscode.window.createWebviewPanel` for an editor-like webview in the editor area (tabs).
- Use `TreeView` (native VS Code UI) for simple hierarchical lists and actions.

1) Add a new view container and views (in `package.json`)
```json
"contributes": {
  "viewsContainers": {
    "activitybar": [
      { "id": "aggo.activity", "title": "Aggo", "icon": "./media/aggo-activity.svg" }
    ],
    "panel": [
      { "id": "aggo.panel", "title": "Aggo Panel", "icon": "./media/aggo-panel.svg" }
    ]
  },
  "views": {
    "aggo.activity": [
      { "id": "aggo.activity.schema", "name": "Schema" }
    ],
    "aggo.panel": [
      { "id": "aggo.panel.inspector", "name": "Inspector" },
      { "id": "aggo.panel.logs", "name": "Logs" }
    ]
  }
}
```

2) Webview view provider for Side Bar or Panel
```ts
// src/views/AggoWebviewViewProvider.ts
import * as vscode from 'vscode';

export class AggoWebviewViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = `<!doctype html>...`; // build your HTML with CSP/nonce and asWebviewUri

    // Handle incoming messages
    webviewView.webview.onDidReceiveMessage(msg => {
      // handle messages
    });
  }
}

// extension activation
ctx.subscriptions.push(
  vscode.window.registerWebviewViewProvider('aggo.panel.inspector', new AggoWebviewViewProvider(ctx.extensionUri), { webviewOptions: { retainContextWhenHidden: true } })
);
```

3) WebviewPanel for an editor tab (editor area)
```ts
const panel = vscode.window.createWebviewPanel(
  'aggo.editor',
  'Aggo Editor',
  { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
  { enableScripts: true, retainContextWhenHidden: true }
);
panel.webview.html = yourHtml;
```

4) Native TreeView (lightweight items instead of a webview)
```ts
const treeProvider = new MyTreeDataProvider();
vscode.window.createTreeView('aggo.activity.schema', { treeDataProvider: treeProvider });
```

Programmatically reveal views and panels
- Show a Side Bar view: `await vscode.commands.executeCommand('workbench.view.extension.aggo.activity')`
- Show a Panel view: `await vscode.commands.executeCommand('workbench.action.openPanel')` or navigate to a specific panel container with `workbench.view.extension.<panel-container-id>`
- Open an editor: create `WebviewPanel` and call `panel.reveal(viewColumn)`

When to use each
- Use `TreeView` for lists, file trees, and quick selection actions.
- Use `WebviewView` (Side Bar or Panel) for complex interactive UIs that should persist state and share space with other tools; prefer `retainContextWhenHidden: true` to keep UI state.
- Use `WebviewPanel` for full-blown editors with file semantics (tabs, undo/redo, and editors that map to a `TextDocument`) and when you want an editor tab experience.

Implementation tips
- Use `webview.asWebviewUri` and a nonce in the CSP policy for scripts and assets.
- Avoid blocking users with unnecessary modals: prefer `console.warn` for unexpected messages.
- `WebviewView` supports a `resolveWebviewView` method where you create the HTML and attach listeners; set `retainContextWhenHidden` if you want to keep state.
- Keep message contracts minimal and typed (init, ready, update, requestSave, theme).
- For complex webview UIs share code with the `WebviewPanel` or reuse the same bundle — Vite and the `webview` folder can be used for both.

---

## 🔁 PostMessage Patterns

- Keep the message contract well-defined and typed: `init`, `ready`, `update`, `theme`, `requestSave`.
- Avoid sending UI notifications (e.g. `vscode.window.showInformationMessage`) from unknown message handlers. Prefer `console.warn()` or `console.error()` for unexpected messages — these are recorded in extension logs and don't disturb the user.
- Implement `requestSave` to call `document.save()` rather than notifying the user; this is semantically what the user expects.

Example message handler (extension):
```ts
webview.onDidReceiveMessage(async (msg) => {
  switch (msg.type) {
    case 'ready': /* send init */ break;
    case 'update': /* apply edit */ break;
    case 'requestSave': await document.save(); break;
    default: console.warn('Unknown message', msg); break;
  }
});
```

Debouncing frequent updates (dragging, continuous changes)
- When the webview produces frequent `update` messages (e.g. during a node drag), instead of writing to the document for each event, debounce reception and apply a consolidated change. This reduces CPU usage and avoids unnecessarily large undo stacks.
- Example: store a `pendingUpdateText` and setTimeout for ~200ms. Each new update resets the timer; when the timer fires, apply the final `pendingUpdateText` to the document and set `lastWrittenText` to avoid echo loops.
 - Additionally, coalesce outgoing messages from the webview. Debounce `postMessage({type: 'update'})` calls (e.g., 150ms) so the extension receives fewer messages while the user interacts.

### Two-way change synchronization (avoid loops)

When the webview updates the document, the extension writes those changes to the TextDocument. The TextDocument's change events will then trigger notifications to all open editors (including the webview). This can create a loop if not handled carefully.

Best practices to avoid feedback loops:
- When applying changes from the webview, check the document text first and skip writing if the content is identical.
- Track the last text the extension wrote and ignore the next text-change event when it equals that value. Reset the tracking value after ignoring it.
- Only notify the webview for changes that originate outside of the webview (e.g., edits in a plain text editor or file updates from an external source).

Example extension-side pattern (pseudo):
```ts
let lastWrittenText: string | undefined;
// On update request from webview
if (document.getText() !== newText) {
  lastWrittenText = newText;
  applyEdit(newText);
}
// onDidChangeTextDocument
if (ev.document.uri === document.uri) {
  if (lastWrittenText === ev.document.getText()) { lastWrittenText = undefined; return; }
  webview.postMessage({ type: 'documentChanged', text: ev.document.getText() });
}
```

### CPN editor example
- The CPN webview uses a simple JSON format with top-level `nodes` and `edges` arrays. Example:

```json
{
  "nodes": [
    { "id": "1", "position": { "x": 100, "y": 100 }, "data": { "label": "Node 1" } }
  ],
  "edges": [
    { "id": "e1-2", "source": "1", "target": "2" }
  ]
}
```

- On the webview side, use `onNodesChange`, `onEdgesChange`, `onNodeDragStop` to update internal state and `vscode.postMessage({ type: 'update', text: JSON.stringify({ nodes, edges }) })` to persist to the extension.
- On the extension side, listen for `update` messages, apply a `WorkspaceEdit` to replace the document content, and set `lastWrittenText` to the text you just wrote so `onDidChangeTextDocument` ignores that next event.

---

## 🚦 Development vs Production

- Detect dev mode via `context.extensionMode === vscode.ExtensionMode.Development` and load webview assets from the Vite dev server only in development.
- For production, serve a built bundle under `media/` using `webview.asWebviewUri(...)`.

Implementation tip: in the extension's HTML template, conditionally include the dev server host in the CSP and the `script` link.

---

## ✅ Logging & Debugging

- Avoid `console.log` calls in production bundles — these create noise in production logs. Keep error logs and warnings (e.g., `console.error` and `console.warn`) for production.
- When debugging during development, keep console messages minimal and clearly scoped.
- If you need to record structured logs while debugging, use a dedicated debug/telemetry mechanism (avoid spamming the UI with messages).

Checklist for cleaning up during commits:
- Remove `console.log` debug prints in webview and extension code.
- Replace informational UI notifications for internal messages with `console.warn` or `console.error`.
- Remove commented out or `TODO`-leftover code used only for troubleshooting (unless they serve as documented examples).

---

## 🧰 Saving & Collaboration

- Use `WorkspaceEdit` and `vscode.workspace.applyEdit` for in-place edits.
- When editing the entire file contents, replace the whole range; for incremental edits, prefer minimal edits so the user's undo/redo and history behave sensibly.

Example `update` handling:
```ts
const edit = new vscode.WorkspaceEdit();
edit.replace(document.uri, new Range(0, 0, document.lineCount, 0), newText);
await vscode.workspace.applyEdit(edit);
```

---

## ⚙️ CSS & UI Best Practices

- Include theme CSS variables at the top-level so third-party libraries using CSS variables can pick them up.
- If you need to override a library's variable in dark mode, prefer adding a more-specific rule like `.jsonjoy.dark { --jsonjoy-color-foreground: #f8fafc }`.
- Avoid unnecessary deep CSS overrides; instead, add a targeted overwrite for only the variables that need change.

---

## 🧪 Testing & Useful Commands

- Dev server: `pnpm run dev:webview` (Vite HMR)
- Build webview (production): `pnpm run build:webview` and then reload your extension host so it uses `media/webview.js` and `media/index.css`.
- Useful: `Developer: Toggle Developer Tools` inside the Extension Development Host to inspect the webview's console.

---

## 📌 Example Cleanup Actions Implemented in Aggo

1. Removed a `console.log('Theme applied:', ...)` call in the webview — this prevented noisy `console` messages from production.
2. Replaced UI notifications for `requestSave` and unknown messages with `document.save()` and `console.warn()` respectively, so the editor remains unobtrusive to users.
3. Respect the `isDev` extension flag to decide whether to load the Vite dev server or the built assets.

---

## 📚 References

- VSCode API: CustomTextEditorProvider — https://code.visualstudio.com/api/extension-guides/custom-editors
- Webview CSP, nonces, and asset loading: https://code.visualstudio.com/api/extension-guides/webview

---

## ⚠️ Common Issues

Below are a few common errors you may see during development with the Vite dev server and their fixes.

- "Refused to connect to 'ws://localhost:5173/' because it violates the following Content Security Policy directive: 'connect-src http://localhost:5173'"
  - Cause: The Vite dev server's HMR uses WebSocket (ws://) and the webview CSP only allowed http. The browser refuses to open the socket and Vite's HMR client cannot connect.
  - Fix: In dev mode, add both the dev server's http host and ws scheme to the connect-src directive. Example:
    ```html
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'nonce-<nonce>' http://localhost:5173 'unsafe-inline'; style-src http://localhost:5173 'unsafe-inline'; connect-src http://localhost:5173 ws://localhost:5173; img-src vscode-resource: https: data:;" />
    ```
  - Note: Replace `http://localhost:5173` with your dev server host/port if different.

- "Uncaught Error: @vitejs/plugin-react can't detect preamble. Something is wrong."
  - Cause: This usually happens when a Vite dev bundle is expected but the HTML includes inline scripts that conflict with the module system, or the Vite dev client didn't inject the expected preamble. It's often caused by either blocking HMR (CSP) or mixing inline React code with module loads.
  - Fix:
    1. Ensure you only use the module script that Vite serves (e.g. `<script type="module" src="http://localhost:5173/src/index.tsx"></script>`) and avoid embedding inline React code in your webview HTML. Let the module script manage rendering and message handling.
    2. Confirm CSP allows both `http://localhost:5173` and `ws://localhost:5173` for script- and connect-src (HMR uses websockets).
    3. If you still see this error, verify the dev server is running and request to `http://localhost:5173` from a browser tab to ensure the server responds correctly.
    4. Ensure the extension is running in Dev mode (press `F5` to launch the Extension Development Host) while loading the dev webview assets. If the extension is running in production mode (e.g., installed from a VSIX), the provider will generate a production CSP using a `nonce` and inline dev preamble will be blocked. Only use the Vite dev server when running the extension inside the Extension Development Host.

- "React style (Tailwind/CSS) not applied in the webview"
  - Cause: The webview's dev HTML points to a missing or incorrect CSS file (404), or the component doesn't import the correct app-level styles. Another cause is using the wrong CSS path for the CPN bundle (e.g. `src/cpn/index.css` that doesn't exist) instead of the shared `src/styles/index.css`.
  - Fix:
    1. Ensure your `index.tsx` imports the application stylesheet (e.g., `import './styles/index.css'`).
    2. If you're using React Fast Refresh (Vite dev), the Vite dev server injects a small inline module (e.g. with `injectIntoGlobalHook`) that sets up the refresh runtime. This inline script requires either a `nonce`-ed script tag or `script-src 'unsafe-inline'` in your dev CSP. Since the dev server doesn't add nonces, we recommend allowing `'unsafe-inline'` in `script-src` while in dev mode.
    ## 🔧 Dev server port / '5173 in use' troubleshooting

    If the Vite dev server fails to start with `Error: Port 5173 is already in use`, either stop the process currently using the port or start Vite on a different port and point the extension at it:

    - Find the process using the port (Linux):
    ```bash
    ss -ltnp | grep 5173 || lsof -i :5173
    # then kill the PID if safe
    kill -9 <PID>
    ```
    - Start Vite on a different port (example uses 5174):
    ```bash
    pnpm run dev:webview -- --port 5174
    ```
    - When you start the extension, tell it where to find the dev server by setting `VITE_DEV_SERVER_URL`:
    ```bash
    VITE_DEV_SERVER_URL=http://localhost:5174 pnpm run watch
    ```

    The extension uses the `VITE_DEV_SERVER_URL` environment variable to find the dev server URL and inject CSP `http` and `ws` sources dynamically, so custom ports are automatically handled if you set this environment variable.

    2. Use the correct dev server CSS path when building the webview HTML. Example: `http://localhost:5173/src/styles/index.css`.
    3. Library CSS (e.g. React Flow): If your webview uses React Flow or other third-party libraries that have their own CSS files, be sure to import them in the entry module (e.g., `import '@xyflow/react/dist/style.css'`) so Vite extracts and bundles them into a separate CSS (e.g., `media/cpn.css`). Update the editor provider's production HTML to load the correct `media/cpn.css` for the CPN editor.
    3. For production, include the built CSS using `webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'index.css'))`.

- "Nodes in React Flow are not draggable or do not persist position"
  - Cause: When using ReactFlow, if you pass `nodes` and `edges` as controlled props you must also provide `onNodesChange` and `onEdgesChange` (or use the `useNodesState` and `useEdgesState` hooks) so the library can update the node/edge positions. If you don't provide handlers and nodes are provided as a controlled prop, the library can't update them.
  - Fix:
    1. Use `onNodesChange={(changes) => setNodes(nds => applyNodeChanges(changes, nds))}` (or `useNodesState`) so node drags are applied.
    2. Use `onNodeDragStop` to persist node position changes back to the host using `vscode.postMessage({ type: 'update', text: JSON.stringify({ nodes, edges }) })`.

Debugging tips:
- Open `Developer: Toggle Developer Tools` in the Extension Development Host and look for CSP error messages and 404s for CSS or JS.
- Check for blocked `ws://` messages in the Network console (HMR requires ws to be allowed in CSP).
- If you changed your HTML injection code, reload the extension host and verify the generated webview HTML contains the expected `meta` CSP tag.

- `ExperimentalWarning: CommonJS module ... is loading ES Module ...` — this warning appears when Vite (or one of its dependencies) loads ESM from a CommonJS context. It's usually harmless on Node 20 but you can run `node --trace-warnings` to find the exact source if needed.

If you'd like, I can add a small precommit checklist (CI step) that warns about `console.log` usage and other dev-only artifacts to prevent these from being committed again.

---

## 📦 Packaging & Dependencies

When packaging your extension with `vsce package`, you must ensure that runtime dependencies are included in the VSIX, while development dependencies are excluded to keep the package size small.

### The Problem
- `vsce` by default ignores `node_modules` if you don't specify `dependencies` correctly or if you rely on `devDependencies` for runtime code.
- Including the entire `node_modules` folder (e.g., via `files: ["node_modules/**"]`) results in a massive VSIX (100MB+) because it includes dev tools like Vite, TypeScript, etc.
- Missing dependencies cause runtime errors like `Cannot find module 'ajv'` or `Activating extension failed`.

### The Solution: `bundledDependencies`
Use the `bundledDependencies` field in `package.json` to explicitly list the packages that must be included in the VSIX.

1. **Identify Runtime Dependencies**: List packages used in your extension code (e.g., `ajv`, `jsonc-parser`).
2. **Update `package.json`**:
   ```json
   {
     "dependencies": {
       "ajv": "^8.17.1",
       "jsonc-parser": "^3.0.0"
     },
     "bundledDependencies": [
       "ajv",
       "jsonc-parser"
     ],
     "files": [
       "out/**",
       "media/**",
       "package.json",
       "node_modules/ajv/**",
       "node_modules/jsonc-parser/**"
     ]
   }
   ```
   *Note: Adding `node_modules/pkg/**` to `files` ensures `vsce` picks them up even if it tries to ignore `node_modules` by default.*

3. **Dynamic Loading (Optional but Recommended)**:
   For heavy dependencies or those that might fail to load, use dynamic `require()` inside a `try/catch` block. This prevents the entire extension from failing to activate if a module is missing.

   ```typescript
   // src/extension.ts
   try {
     const ajv = require('ajv');
     // use ajv
   } catch (e) {
     vscode.window.showErrorMessage('Failed to load validator');
   }
   ```

### Verification
- Run `npm run package` (or `vsce package`).
- Check the generated `.vsix` size. It should be small (e.g., 1-5MB), not 100MB+.
- Unzip the `.vsix` (it's a zip file) and check `extension/node_modules` to ensure only the bundled dependencies are present.

