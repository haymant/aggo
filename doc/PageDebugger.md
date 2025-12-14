# Debugging Aggo Pages (Run/Debug Architecture)

Debugging Aggo pages is an architectural challenge because it spans three execution contexts:

1. Extension host (Node.js): static analysis, file IO, process management.
2. Editor webview (sandboxed browser): visual editing UI.
3. User runtime (localhost server + browser): where user React/TypeScript actually runs and where debugging must happen.

This document describes the recommended “Split-Brain” approach and the missing contracts needed to support:

- Run (Dev)
- Run (Prod-like)
- Debug (breakpoints in user TS handlers, lifecycle, and stores)

---

## 1. Key Principle

Do not run user TypeScript code inside the extension host or inside the editing webview.

To support real debugging:

- The page editor webview is for editing.
- The user runtime (dev server + real browser) is for executing and debugging.

---

## 2. What’s Missing in the Current Design

Compared to a complete debug-capable design, the current docs and implementation are missing:

1. A runtime-backed preview surface (Run Mode) separate from the webview canvas.
2. A dev-server lifecycle manager (start/stop/reuse, detect ports, surface errors).
3. A debugger workflow that reliably binds breakpoints (recommended: `pwa-chrome` launch).
4. A formal event model:
      - components declare supported events
      - page JSON stores event wiring
      - runtime resolves handler strings to real functions
5. A page lifecycle contract (onInit/onMount/onUnmount) tied to user code.
6. A page store contract (how stores are created, accessed, and debugged).

---

## 3. Recommended Architecture

| Component | Responsibility | Debuggable? |
| --- | --- | --- |
| Extension host | Start runtime server; static analysis of handlers; write/read files; generate debug config | No |
| Page editor webview | Canvas editing, selection, DnD, event selection UI | No (by design) |
| User runtime (localhost) | Executes user components, handlers, lifecycle hooks, stores | Yes |

---

## 4. Run Mode

### 4.1 Run (Dev) — recommended default

Run Dev is the best practice for preview + debugging.

1. Extension starts the user dev server (example: `npm run dev`).
2. Page is rendered in the runtime at a stable URL, e.g. `http://localhost:5173/aggo/page/rfq/view`.
3. VS Code shows the runtime UI either:
       - embedded in an `iframe` inside a webview panel, or
       - opened in the system browser.

Why this works:

- HMR gives live updates.
- Dev builds usually ship source maps that allow breakpoints.

### 4.2 Run (Prod-like) — optional

Prod-like run is for “does it still work when built?”.

Typical scripts:

- `npm run build` + `npm run preview`

Notes:

- This may not be reliably debuggable (minification, missing source maps).
- Treat it as validation, not the primary debugging path.

If a project has `npm run prod`, Aggo can run it, but it should still be treated as best-effort.

---

## 5. Debug Mode

### 5.1 Prefer “Launch” over “Attach”

The “attach” pattern requires a browser already launched with remote debugging enabled.

For best UX, prefer a `launch` config that starts the browser for the user.

Example `.vscode/launch.json`:

```json
{
      "version": "0.2.0",
      "configurations": [
            {
                  "name": "Aggo: Debug Page (Dev)",
                  "type": "pwa-chrome",
                  "request": "launch",
                  "url": "http://localhost:5173/aggo/page/rfq/view",
                  "webRoot": "${workspaceFolder}",
                  "sourceMaps": true,
                  "trace": false
            }
      ]
}
```

### 5.2 If you must use “Attach”

Attach requires Chrome to be started with a debugging port, for example:

- `google-chrome --remote-debugging-port=9222 http://localhost:5173/aggo/page/rfq/view`

Then:

```json
{
      "name": "Aggo: Attach to Chrome",
      "type": "pwa-chrome",
      "request": "attach",
      "port": 9222,
      "url": "http://localhost:5173/aggo/page/rfq/view",
      "webRoot": "${workspaceFolder}",
      "sourceMaps": true
}
```

---

## 6. Event Handler Wiring (Debuggable)

To debug a handler, the handler must be:

1. Real user source code (in the workspace).
2. Imported by the runtime bundle.
3. Invoked from the runtime, not from the webview editor.

### 6.1 Static Analysis (Extension)

Use `ts-morph` to scan for exported handler functions in a configurable folder (example: `src/aggo/handlers/**`).

The extension sends the list of handler IDs to the page editor webview so the property panel can offer a dropdown.

### 6.2 Runtime Registry

The runtime resolves handler strings to functions via a registry module.

Example:

```ts
export const AggoHandlerRegistry: Record<string, Function> = {
      'rfq.view.onSubmit': onSubmit,
      'rfq.view.onMount': onMount
};
```

At runtime:

```ts
const onClick = AggoHandlerRegistry[element.events?.onClick?.handler];
```

This ensures breakpoints bind to the real source.

---

## 7. Page Lifecycle (Debuggable)

Pages should support optional lifecycle handler references (strings) in the page JSON:

```json
"lifecycle": {
      "onInit": "rfq.view.onInit",
      "onMount": "rfq.view.onMount",
      "onUnmount": "rfq.view.onUnmount"
}
```

Runtime behavior:

- `onInit` runs before first render.
- `onMount` runs in a mount effect.
- `onUnmount` runs in cleanup.

All of these are user functions, so they’re debugged like any other TS function.

---

## 8. Page Store (Debuggable)

The store must be created in runtime, not in the editor webview.

Recommended:

- A per-page store factory referenced from JSON (string), resolved via the same registry mechanism.
- Store implementation lives in user code (Zustand/Redux/etc).

Example page JSON:

```json
"store": { "factory": "rfq.view.createStore" }
```

This makes store actions and selectors breakpoint-friendly.

---

## 9. Workflow Summary

1. User edits `resources/page/rfq/view.page` in the editor webview.
2. User selects a component and wires `onClick -> rfq.view.onSubmit`.
3. User runs “Run (Dev)” or “Debug (Dev)”.
4. Runtime loads the JSON, resolves handler strings via registry, renders components.
5. Clicking triggers the real handler; VS Code breaks on user breakpoints.