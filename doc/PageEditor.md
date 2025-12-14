# Aggo Page Editor Design

This document describes the page authoring experience for `*.page` files and the missing pieces needed to fully support **Run** and **Debug** of user TypeScript code (event handlers, lifecycle hooks, stores).

The key shift is: the VS Code **webview canvas is for editing**; the **user's app runtime is for running/debugging**.

---

## 1. Goals

1. Edit `*.page` safely inside a VS Code Custom Editor (selection, DnD, property editing).
2. Run the page inside the user's real React runtime (Vite/Next/etc) so it behaves like production.
3. Debug user TypeScript code (breakpoints in handlers, lifecycle hooks, stores) using VS Code's JS debugger.
4. Keep extension host free of arbitrary user-code execution.

Non-goals:
- Debugging user code inside the webview itself (webviews are sandboxed; breakpoints are unreliable).

---

## 2. Execution Contexts (Split-Brain)

There are three contexts and they must remain distinct:

1. Extension host (Node.js): file IO, command handling, static analysis.
2. Editor webview (browser sandbox): visual editor UI (canvas + property interactions).
3. User runtime (localhost dev/preview server): executes user React/TS and is the only place we expect debugging to work.

---

## 3. Modes: Edit vs Run vs Debug

### 3.1 Edit Mode (Webview Canvas)

Edit Mode is the current implementation and remains the default.

- Rendering: `ElementRenderer` maps page JSON to built-ins and plugins.
- Interaction: selection, hover boundaries, drag/drop, keyboard navigation.
- Persistence: webview posts `update` messages; extension applies a `WorkspaceEdit` to the `*.page` document.
- Property panel: selection is forwarded via `selectionChanged` to the property view.

Important constraint:
- Edit Mode must not be treated as the authoritative runtime. It is a controlled environment optimized for authoring, not for executing/debugging user code.

### 3.2 Run Mode (Runtime Preview)

Run Mode renders the page in the user's real app runtime.

Run Mode is NOT "webview preview". It is "runtime preview".

#### Dev Run (recommended)

- The extension starts (or reuses) a dev server (e.g. `npm run dev`).
- The page preview is displayed as an `iframe` pointing to the dev server URL (e.g. `http://localhost:5173/aggo/page/rfq/view`).
- HMR handles `.ts/.tsx` changes.

#### Prod-like Run (optional)

Prod-like run is for validating build/preview behavior. It is typically not suitable for debugging.

- The extension starts a "preview" server (commonly `npm run build` then `npm run preview`).
- Source maps may be missing; breakpoints may not bind.

If the project has an `npm run prod` script, it can be used, but the design should treat this as best-effort and not the primary debugging path.

### 3.3 Debug Mode (Run + Debugger)

Debug Mode is Run Mode plus a VS Code debugger session.

Preferred approach:
- Use a `pwa-chrome` (or `pwa-msedge`) debug config with `request: "launch"` to start a debuggable browser instance and open the runtime URL.

Debug Mode requirements:
- The runtime preview URL must load the page from the same sources VS Code has on disk (source maps enabled).
- Handlers/lifecycle/store code must be in user project files, imported by the runtime.

---

## 4. Toolbar and Editor UX

The page editor toolbar should evolve from a single Edit/Preview toggle to explicit actions:

- Edit: shows canvas (current behavior).
- Run (Dev): opens runtime preview (iframe).
- Debug (Dev): runs debugger config + opens runtime preview.
- Run (Prod-like): optional, for validating build.

If a lightweight "Preview" toggle is kept inside the canvas, it must be described as a rendering convenience only and explicitly not the supported debugging surface.

---

## 5. Runtime Integration Contract

Aggo pages live as JSON (`resources/page/**/name.page`) but must be consumable by the user's runtime.

### 5.1 Routing

Recommended convention:

- File path: `resources/page/rfq/view.page`
- Runtime URL: `/aggo/page/rfq/view`

The runtime app owns routing. Aggo provides a small runtime package/helper (or template) that:

1. Loads the relevant `*.page` JSON.
2. Resolves components (built-ins + plugins if applicable).
3. Applies lifecycle hooks and wires events.

#### Next.js (App Router) — extension-generated routes

If the user runtime is a Next.js app, the extension can optionally keep `/aggo/page/<id>` routes in sync with `resources/page/**/*.page` by generating route files into the runtime project.

Behavior (when enabled):

- On `resources/page/index.page` creation → generate a Next.js route file at `src/app/aggo/page/index/page.tsx` (or `app/aggo/page/index/page.tsx` if no `src/app`).
- On deletion → prompt and remove the generated route.
- Route implementation loads the page JSON from disk and renders via the **shared renderer package** `@aggo/core`.

Code generation safety:

- Generated files include an annotation marker `@aggo-generated`.
- The extension only overwrites files that include that marker; if a conflicting file exists without the marker, the extension prompts before overwriting.
- Regeneration is incremental: generated blocks/files are replaced; unrelated user code remains intact.

#### Shared renderer: `@aggo/core`

To avoid “two renderers” (one in the webview, one in the runtime), Aggo uses a **single-source** renderer library:

- Package: `packages/core` (published name `@aggo/core`)
- Reused by:
  - The extension webview editor (Edit Mode) via `AggoEditableElementRenderer`
  - The Next.js runtime routes via `AggoPage`

This shared renderer owns:

- DOM rendering of `*.page` element JSON
- Event emit + handler dispatch contract
- Page lifecycle hook dispatch contract
- Page store contract (per-page state)

The extension’s Next.js codegen generates a small wrapper module (tagged `@aggo-generated`) that re-exports `AggoPage`/`AggoElementRenderer` from `@aggo/core` so runtime code stays stable even if we later move imports.

### 5.2 Page Lifecycle

The `*.page` format should support optional lifecycle handler references. Minimal example:

```json
{
  "id": "root",
  "tagName": "div",
  "lifecycle": {
    "onInit": "rfq.view.onInit",
    "onMount": "rfq.view.onMount",
    "onUnmount": "rfq.view.onUnmount"
  },
  "children": []
}
```

Runtime responsibilities:

- `onInit`: called once when the page module is created (before first render).
- `onMount`: called from `useEffect(() => ..., [])`.
- `onUnmount`: returned cleanup of the mount effect.

Handler signature recommendation (runtime; implemented by `@aggo/core`):

```ts
export type AggoPageContext = {
  pageId: string;
  route: { path: string; params: Record<string, string>; query: Record<string, string> };
  store: unknown;
  navigate: (to: string) => void;
  log: (...args: unknown[]) => void;
};

Note: the current implementation uses a simpler `AggoHandlerContext` (elementId, eventName, store) and will be extended to include route/navigation helpers.
```

### 5.3 Page State Store

The page editor webview may keep local UI state for selection/dragging, but the runtime store is separate.

Design recommendation (runtime):

- Use a per-page store (e.g. Zustand) created on page mount.
- Optionally persist store state (localStorage) keyed by `pageId`.
- Provide store access to handlers and components via context.

Minimal contract:

```ts
export type AggoStoreFactory = (ctx: AggoPageContext) => unknown;
```

And in the page JSON:

```json
{
  "store": {
    "factory": "rfq.view.createStore"
  }
}
```

This keeps store logic in user code (debuggable) and page JSON only references it.

---

## 6. Event Wiring

Events are stored as string references in page JSON, selected via the property panel.

Supported MVP conventions:

- Preferred: `events: { "click": "my.handler.id" }`
- Also supported (back-compat): `events: { "onClick": { "handler": "my.handler.id" } }`
- Also supported (attribute-based): `attributes: { "data-on-click": "my.handler.id" }`

Example element:

```json
{
  "id": "btn-1",
  "tagName": "button",
  "attributes": { "type": "button" },
  "events": {
    "click": "rfq.view.onSubmit"
  },
  "content": "Submit"
}
```

The runtime resolves `rfq.view.onSubmit` to an actual function via a generated registry that wraps a user-editable file:

- Generated (overwritten on sync): `src/aggo/generated/handlers.ts`
- User-editable (only a marked region is regenerated): `src/aggo/user/handlers.ts`

Generated routes pass `handlers` into `AggoPage` via `host={{ pageId, handlers }}`.

---

## 7. Aggo Navigation Menu (Pages Tree)

Add a top-level VS Code navigation entry `Aggo` that includes a nested structure mapping to the user's page resources.

Recommended UX:

- Activity Bar container: `Aggo`
- Tree view: `Pages`
- Nodes mirror folder structure under `resources/page/**`.

Example:

- `resources/page/rfq/view.page` appears as `Aggo > Pages > rfq > view`

Actions:

- Click leaf node opens the file using `vscode.openWith` and `aggo.pageEditor`.
- Context menu: "Open", "Reveal in Explorer", "Refresh".

Implementation note:

- This requires a `TreeDataProvider` in the extension host and filesystem watching on `resources/page/**`.

---

## 8. Summary: What’s Missing Today

Compared to the requirements for Run/Debug, the current design is missing:

1. A runtime-backed Run/Debug mode (dev server management + iframe preview).
2. A stable debug workflow (launch/attach config guidance).
3. An explicit event contract in the page JSON and component schema.
4. A page lifecycle contract (`onInit/onMount/onUnmount`) and handler signatures.
5. A runtime store contract (how handlers/components access state).
6. An Aggo navigation tree for `resources/page/**`.

