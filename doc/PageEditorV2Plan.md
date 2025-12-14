
# Page Editor V2 Plan (Run / Debug / Pages Tree)

This plan turns the V2 design in doc/PageEditor.md, doc/Component.md, and doc/PageDebugger.md into working code, starting with the smallest end-to-end slice that enables:

- A VS Code `Aggo > Pages` navigation tree for `resources/page/**.page`
- Run (Dev): start/reuse the user dev server and open the runtime URL for a selected page
- Debug (Dev): start/reuse the dev server and launch the VS Code JS debugger against the runtime URL

This repo is the **Aggo extension** repo, not the user's React runtime app. Therefore, V2 implementation is split into two tracks:

1. Extension-host features (implemented here)
2. User-runtime integration package/template (planned here; implemented later or in a separate repo/package)

---

## A. Gap Analysis (What’s Missing Today)

From the current implementation:

1. No Pages tree view. Existing `Aggo` activity container only includes webview views (`Components`, `Details`).
2. No dev-server lifecycle manager in the extension (start/stop/reuse, output capture).
3. No Run/Debug commands that operate on a `*.page` file.
4. No runtime URL conventions encoded in code (path -> pageId -> URL).
5. No test harness in `src/test` even though `package.json` expects `out/test/runTest.js`.

From the design docs:

- Event wiring, lifecycle, and store contracts are defined at the JSON/schema level, but runtime plumbing (registry, router, loader) is not implemented in this extension repo.

---

## B. Implementation Plan

### Phase 1 — Navigation + Run/Debug (Dev) (MVP, end-to-end)

Goal: select a page under `resources/page/**` and:

- Open it in the custom editor
- Run it in the user runtime (`npm run dev`)
- Debug it via `pwa-chrome` launch

#### 1) Add Pages Tree View

1. Add a new tree view under the existing `Aggo` activity container:
	- View id: `aggo.pages`
	- Type: `tree`
2. Implement `AggoPagesTreeDataProvider`:
	- Scan `resources/page/**/*.page` via `vscode.workspace.findFiles`
	- Build folder nodes + leaf page nodes
	- Watch for changes using `vscode.workspace.createFileSystemWatcher` and refresh
3. Add actions:
	- Single click opens page using `vscode.openWith` and `aggo.pageEditor`
	- Context menu actions on page leaf:
	  - `Aggo: Run Page (Dev)`
	  - `Aggo: Debug Page (Dev)`

#### 2) Implement Runtime URL Mapping

Add pure utilities:

- `pageIdFromPath(workspaceRoot, pageFsPath)` -> `rfq/view`
- `pageUrlFromId(baseUrl, pageId)` -> `http://localhost:5173/aggo/page/rfq/view`

Conventions:

- `resources/page/<segments>.page` maps to `/aggo/page/<segments>`

#### 3) Implement Dev Server Manager (Extension Host)

Add `RuntimeServerManager`:

- Detect package manager:
  - `pnpm-lock.yaml` -> `pnpm`
  - `yarn.lock` -> `yarn`
  - fallback -> `npm`
- Start dev server by running `<pm> run <script>` in the configured cwd
- Reuse the process if already running
- Stream output to a dedicated `OutputChannel` (`Aggo: Runtime`)
- Provide `stop()` (optional command in phase 2)

#### 4) Run (Dev) Command

Command: `aggo.runPageDev`

Behavior:

1. Resolve the page URI (from tree view selection or command argument).
2. Ensure dev server is running.
3. Open the runtime URL using `vscode.env.openExternal(...)`.

#### 5) Debug (Dev) Command

Command: `aggo.debugPageDev`

Behavior:

1. Resolve the page URI.
2. Ensure dev server is running.
3. Start debugging with a generated config:
	- `type: pwa-chrome`
	- `request: launch`
	- `url: <pageUrl>`
	- `webRoot: ${workspaceFolder}`
4. Let the debugger open the browser.

#### 6) Add Configuration Settings

Contribute settings under `aggo.runtime.*`:

- `aggo.runtime.baseUrl` (default `http://localhost:5173`)
- `aggo.runtime.devScript` (default `dev`)
- `aggo.runtime.cwd` (default workspace folder)

Notes:

- Supporting `npm run prod` is possible, but “Prod-like” is not the primary debugging path.

#### 7) (Optional) Scaffold a Next.js Runtime App (for predictable Run/Debug)

Rationale: A lot of “Run/Debug” pain comes from not knowing what runtime the user has, what scripts exist, and which routes are available. For an MVP path where the extension can be fully prescriptive, add a scaffolding command that creates a standard Next.js runtime app.

Command: `Aggo: Scaffold Next.js Runtime`

Behavior:

1. Prompts for a target folder (workspace-relative, default `aggo-runtime`).
2. Runs `create-next-app` with TypeScript + Tailwind + App Router.
3. Updates workspace settings:
	- `aggo.runtime.cwd` -> scaffolded folder
	- `aggo.runtime.baseUrl` -> `http://localhost:3000`
	- `aggo.runtime.devScript` -> `dev`
4. Generates/merges `.vscode/launch.json` with a reusable `pwa-chrome` launch config whose `url` is parameterized via an input prompt (page id).

Notes:

- Shadcn/ui can be added later, but its installer is interactive and should be a follow-on step once we decide how prescriptive we want to be.

#### 8) (Optional) Next.js Route Codegen + File Watcher (fixes 404)

Problem this solves:

- If the runtime is Next.js, `/aggo/page/<id>` will return 404 unless routes exist.

Add code generation owned by the extension host:

1. Command: `Aggo: Sync Next.js Routes from Pages`
	- Scans `resources/page/**/*.page` and generates `src/app/aggo/page/<id>/page.tsx` routes.
	- Generates shared runtime helpers:
	  - `src/aggo/generated/loadPage.ts` (loads `resources/page/<id>.page`)
	  - `src/aggo/generated/renderer.tsx` (renders element JSON)
	- Uses marker `@aggo-generated` to safely overwrite only generated files.
	- If a route file exists without the marker, prompt to overwrite.

2. File watcher (when `aggo.runtime.codegen.enabled = true`):
	- On create of `*.page` → generate route for that page.
	- On delete of `*.page` → prompt and delete route.

3. Integration with scaffold command:
	- `Aggo: Scaffold Next.js Runtime` enables codegen and calls the sync command automatically.

---

### Phase 2 — Better UX + Robustness

1. Add a “Runtime Preview” webview panel that embeds an iframe.
2. Add stop/restart server commands.
3. Detect runtime port by parsing server output or reading Vite config.
4. Add a “Generate launch.json” helper.

---

### Phase 3 — Event/Lifecycle/Store (Runtime Track)

These are required for real-world debugging of handlers, but belong to the user runtime integration.

To avoid duplicating renderer logic between the webview and the runtime, implement these contracts in a single-source package:

- `packages/core` (`@aggo/core`)
	- `AggoPage` (client component): wraps default page styling, store provider, lifecycle hooks
	- `AggoElementRenderer`: renders element JSON and wires DOM events to handler ids
	- `AggoEditableElementRenderer`: webview-authoring renderer (selection/drag + plugin component hooks)
	- Store contract (MVP): `createAggoStore`, `useAggoState`

Then update the Next.js route codegen to import/re-export from `@aggo/core` instead of generating a bespoke renderer.

1. A runtime route `/aggo/page/*` that loads the corresponding `*.page` JSON.
2. A generated or user-maintained `AggoHandlerRegistry` module.
3. Runtime page renderer that:
	- invokes lifecycle hooks
	- creates store via `store.factory`
	- resolves and wires event handlers

#### Phase 3.1 — Wire shared renderer into runtime

1. Ensure the runtime project has `@aggo/core` installed (MVP: install as `file:../packages/core` from the runtime folder).
2. Generate `src/aggo/generated/renderer.tsx` as a wrapper re-exporting `AggoPage` from `@aggo/core`.

#### Phase 3.2 — Handler registry generation (follow-on)

1. Generate a runtime module `src/aggo/generated/handlers.ts` (tagged `@aggo-generated`) that re-exports `handlers` from a user-editable file.
2. Maintain a user-editable handler registry at `src/aggo/user/handlers.ts`:
	- only the region between `// @aggo-generated-handlers-start` and `// @aggo-generated-handlers-end` is regenerated
	- stubs are generated from handler ids referenced by `*.page` JSON (events/attributes/lifecycle)
3. Update generated routes to pass `handlers` into `<AggoPage root={...} host={{ pageId, handlers }} />`.

This extension repo can later generate/maintain the handler registry file, but it still executes in the user runtime.

---

## C. Testing Plan

This repo currently lacks a usable test harness (the `test` script expects `out/test/runTest.js`, but there is no `src/test` implementation).

### C1) Unit Tests (Node-only, no VS Code integration)

Create `src/test/runTest.ts` that:

- Imports pure utilities and validates:
  - `pageIdFromPath` behavior
  - runtime URL formatting
  - package manager detection (based on file presence)
  - debug configuration generation

Run via existing scripts:

- `pnpm run build`
- `pnpm test`

### C2) Manual Smoke Tests (VS Code Extension)

1. Open a workspace that contains `resources/page/**`.
2. Verify `Aggo` activity container has `Pages` view.
3. Verify the tree mirrors folder structure.
4. Click a leaf page node opens in Aggo Page Editor.
5. Run context command “Aggo: Run Page (Dev)” opens browser to expected URL.
6. Run “Aggo: Debug Page (Dev)” launches Chrome debug session.

---

## D. Doc Corrections to Apply During Implementation

1. Where docs say `ts-morph`, implementation may initially use a lightweight parser/regex for MVP; `ts-morph` remains the recommended upgrade.
2. “Prod-like run” should be described as validation; not guaranteed debuggable.

