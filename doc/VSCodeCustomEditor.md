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

If you'd like, I can add a small precommit checklist (CI step) that warns about `console.log` usage and other dev-only artifacts to prevent these from being committed again.
