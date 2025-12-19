
# GraphQL Router + Visual GraphQL Editor (Plan)

This document defines the **design**, **implementation plan**, and **testing plan** for adding a **Visual GraphQL Editor** to this VS Code extension.

It is based on the ideas in [aggo-graphql-router/doc/Architecture.md](../aggo-graphql-router/doc/Architecture.md) and [aggo-graphql-router/doc/ideation.md](../aggo-graphql-router/doc/ideation.md), with a critical constraint:

**Hard constraint:** do **not** depend on `aggo-graphql-router/` at runtime or build time. That directory will be removed. We will **replicate** the necessary GraphQL editor + worker code into this repo under `packages/*`.

## Status (this repo)

The Visual GraphQL Editor is implemented directly in this repo under:

- Webview UI: `webview/src/graphql/*`
- Worker: `webview/src/graphql/graphqlWorker.ts`
- VS Code host wiring: `src/editors/AggoGraphqlEditorProvider.ts` + the shared details pane provider

Key UX decisions implemented:

- Selection inside the GraphQL canvas posts `selectionChanged` and is routed into the existing **Properties** details pane (same pattern as the Page editor).
- The GraphQL editor does **not** have its own left-side property panel; GraphQL wiring controls live in the shared details pane.

Interaction + visuals implemented:

- Auto-layout: ELK layered layout computes node coordinates (RIGHT direction) and runs in the worker when available (main-thread fallback when workers are blocked by the dev-server/webview security model).
- Styling: nodes/edges use kind-aware styling (object/input/interface/etc.) and relation edges use a quadratic Bezier path with kind-aware edge color.
- Drag & drop: field rows inside a type are draggable; dropping reorders the field in SDL (AST splice) and persists the updated SDL back to disk.

---

## 0) Goals / Non-goals

### Goals (Editor)

- Provide a VS Code **webview-based visual GraphQL schema editor** that:
	- reads a `.graphql`/`.gql` schema file from the workspace,
	- renders a visual model + code view,
	- validates schema continuously using a web worker,
	- writes SDL updates back to disk via the extension host.
- Keep schema files in the workspace as the **single source of truth**.
- Add a minimal “wiring” authoring flow by writing directives into SDL (e.g. `@http(url: ...)`).

### Non-goals (for the first implementation)

- **Note:** the project will include **GraphQL runtime addons** in the initial delivery (directive transformers, resolver loader and simple resolver scaffolding for the existing Next.js runtime) — see sections below for details.
- No collaboration features (Yjs) or sandbox/demo apps.
- No BDD suite import from the upstream repo.

---

## 1) Target architecture (extension + webview + worker)

### Components

1) **VS Code extension host** (Node process)
	 - Registers a new custom editor (or command) to open GraphQL schema files.
	 - Reads/writes schema text to workspace files.
	 - Bridges messages between webview and disk.

2) **Webview UI** (React bundle, built by Vite)
	 - Renders the embedded GraphQL Editor UI.
	 - Emits updated SDL back to extension via `postMessage`.
	 - Receives document changes from extension (external edits).
	 - Hosts a minimal “Field Properties / Wiring” panel that edits directives.

3) **GraphQL editor worker** (Web Worker)
	 - Performs heavy work off-thread:
		 - parse SDL → tree/AST,
		 - validate schema,
		 - compute layout (ELK layered) for the graph view,
		 - token-at-position / language features as needed.

### Data flow (“split brain”)

Workspace files remain the source of truth.

1. Extension reads the active schema document → sends SDL to webview.
2. Webview displays editor; user edits.
3. Webview sends updated SDL → extension writes to the file.
4. If the file changes outside the webview (save, git checkout, etc), extension pushes the new text to webview.

---

## 2) Repo layout (how we avoid `aggo-graphql-router/`)

We will replicate only the **core product** packages from the upstream monorepo into this repo under `packages/*`.

### New packages in this repo

- `packages/graphql-editor/`
	- React UI library/components for the visual GraphQL editor.
	- Exposes a single entry component the webview can mount (e.g. `GraphQLEditorApp`).

- `packages/graphql-editor-worker/`
	- Worker code and the client wrapper used by the UI.
	- Must be compatible with Vite’s worker bundling.

### Explicitly not replicated

- Sandbox apps, socket live test server, svg generator, bdd/bddx artifacts.

### Workspace config

This repo already uses `pnpm-workspace.yaml` with `packages/*`. Putting the editor packages under `packages/` keeps them included without additional workspace config.

---

## 3) Webview bundling plan (Vite)

This repo already builds webview assets via [webview/vite.config.ts](../webview/vite.config.ts) to `media/`.

### Add a new webview entry

- Add `webview/graphql.html`
- Add `webview/src/graphql/index.tsx` (new entry)
- Update Vite `rollupOptions.input` to include `graphql: webview/graphql.html`
- Output bundle as `graphql.webview.js`

This matches the existing multi-entry pattern (`main` and `cpn`).

### Worker bundling

The worker must be emitted as a separate asset by Vite and loaded using URLs that are webview-safe.

Implementation approach:

- In the replicated worker client, keep the Vite-friendly pattern:
	- `new Worker(new URL('./validation.worker.ts', import.meta.url), { type: 'module' })`
- Vite will rewrite this into a hashed asset and ensure it is available next to the main bundle.

### CSP constraints (important)

VS Code webviews enforce CSP; avoid dependencies that rely on `eval` / `new Function`.

Known risk area:

- Some GraphQL tooling or other libraries may trigger CSP issues. Note: the editor will **not** embed a full code editor (Monaco will be removed) and instead will rely on opening the SDL in the native VS Code text editor to reduce CSP surface.

Mitigation plan:

- Prefer ESM builds and dynamic imports for heavy tooling.
- Avoid bundling in-process editors that require special worker wiring; rely on the native VS Code editor for code editing.
- Keep any dependency that may use `new Function` behind a **dynamic import** (similar to how this repo already delays loading `aggo-schema-editor`).

---

## 4) VS Code extension integration plan

This extension already uses custom editors for other file types (see `contributes.customEditors` in [package.json](../package.json) and provider wiring in [src/extension.ts](../src/extension.ts)).

### 4.1 Add a new custom editor

- Contribution:
	- `viewType`: `aggo.graphqlEditor`
	- `displayName`: `Aggo GraphQL Editor`
	- `selector`: `*.graphql`, `*.gql` (and optionally `schema.graphql` explicitly)
- Explorer UX / tight click menu:
	- Add a tight explorer context menu and command so users can right-click and choose **"Open with Aggo GraphQL Editor"** (`aggo.openAggoGraphqlEditor`). This ensures the webview editor is discoverable from the file explorer (otherwise single-click will open the default text editor).
	- Add the command to `contributes.commands` and add a `menus` entry under `explorer/context` for matching files. The command should call `vscode.commands.executeCommand('vscode.openWith', uri, 'aggo.graphqlEditor')` similar to other providers.

### 4.2 Add provider

- Create `src/editors/AggoGraphqlEditorProvider.ts` implementing `vscode.CustomTextEditorProvider`.
- Register it in `activate()` similarly to other providers.

### 4.3 Webview HTML + assets

Provider responsibilities:

- Set `webview.options = { enableScripts: true, localResourceRoots: [ ... ] }`.
- Load `graphql.webview.js` and shared CSS from `media/` using `webview.asWebviewUri`.
- Use the existing “dev server vs production bundle” strategy if desired (this repo has a dev-server pattern for CPN).

### 4.4 Message protocol

Reuse the existing pattern already used by [webview/src/index.tsx](../webview/src/index.tsx).

Messages:

- Webview → extension:
	- `ready` (webview mounted, safe to send init)
	- `update`: `{ text: string }` (write SDL back to the document)
	- `openFile`: `{ path: string }` (optional)

- Extension → webview:
	- `init`: `{ viewType, title, uri, text, theme }`
	- `documentChanged`: `{ text }` (external edits)
	- `theme`: `{ theme }`

### 4.5 File IO behavior

- On `resolveCustomTextEditor`, load the document text and send `init`.
- On `update` from webview:
	- Apply edits using `WorkspaceEdit` so VS Code undo/redo behaves correctly.
	- Avoid feedback loops by tracking “applyingRemoteUpdate” similarly to existing webview code.
- Listen to `workspace.onDidChangeTextDocument` to forward external changes to the webview.

---

## 5) Editor UI integration plan (inside the webview)

### 5.1 New webview route/entry

- Add a dedicated React entry at `webview/src/graphql/index.tsx`.
- The entry mounts a `GraphqlEditorWebviewApp` which:
	- receives `init` message containing SDL,
	- renders the visual `GraphQLEditor` (graph/relations/docs) UI,
	- does **not** embed a full code editor (Monaco is removed). When a user requests to edit the SDL, the app will present an **"Edit in Editor"** action which posts `openFile` to the extension host; the extension will open the file in the native VS Code text editor in a separate tab.
	- posts `update` messages for visual-driven changes (like directive wiring).

### 5.2 Minimal wiring UI (directives + resolvers)

First implementation: minimal “Field Properties / Wiring” panel.

Behavior:

- User selects a field in the editor.
- Panel edits a small directive set (initially just `@http(url: String!, method: String)`) or chooses a resolver function implemented in TypeScript.
- For resolver functions:
	- Allow the user to select or create a `resolvers.ts` module in the workspace (scaffolded by the extension) and define named async resolver functions (for example `export async function User_posts(parent, args, context) { ... }`).
	- The wiring panel can link a field to a specific resolver function (by name) and optionally add a directive reference or a special `@resolver(name: "User_posts")` directive.
- On save/apply:
	- Update SDL by inserting/updating the directive or resolver reference on that field.
	- If a new resolver module or function is created, scaffold the `resolvers.ts` file and open it in the VS Code editor (via `openFile`) so the user can edit the TypeScript implementation.
	- Push updated SDL back through the existing editor change pipeline.

Implementation note (current UX):

- The “Field Properties / Wiring” panel lives in the shared **Properties** webview (Activity/details pane) rather than a GraphQL-editor-specific left sidebar.
- The GraphQL editor posts selection payloads for type and field selections so the Properties pane can render GraphQL-specific controls.

Implementation detail (how to update SDL reliably):

- Prefer updating through the editor’s internal tree model so round-tripping is stable.
- For resolver wiring, persist a small wiring manifest or encode the reference as a directive (e.g. `@resolver(name: "User_posts")`) in the SDL so the runtime can discover linked functions.
- The Next.js runtime will include a resolver loader that loads `resolvers.ts` and wires named functions into the schema at runtime.

---

## 6) Phased implementation plan

### Phase A — Scaffold the editor surface (no upstream code yet)

1. Add `aggo.graphqlEditor` contribution and provider skeleton (including explorer context menu command `aggo.openAggoGraphqlEditor`).
2. Add `webview/graphql.html` + `webview/src/graphql/index.tsx` that can display the visual editor and send edits (initially a simple placeholder UI that shows SDL and supports `Edit in Editor`).
3. Wire `ready/init/update/documentChanged` for end-to-end file IO.
4. Add TypeScript resolver support for milestone 1:
	- Implement scaffold helper to create `resolvers.ts` and wire it into the workspace when the user requests a new resolver.
	- Add wiring UI controls that can link a field to a resolver function name and open the `resolvers.ts` in the VS Code editor for editing.

Acceptance:

- Open a `.graphql` file → webview shows its visual text/graph.
- Visual edits (directives/wiring) persist to disk and can be undone.
- User can scaffold a TypeScript `resolvers.ts`, link a field to a resolver function, and open/edit that file in the native VS Code editor.

### Phase B — Replicate the GraphQL editor + worker into `packages/*` and add runtime GraphQL addons

1. Copy only:
	 - upstream `packages/editor` → `packages/graphql-editor`
	 - upstream `packages/editor-worker` → `packages/graphql-editor-worker`
2. Rename packages and adjust their `package.json` names to avoid collisions.
3. Ensure TypeScript configs build under this repo’s toolchain.
4. Remove sandbox-only codepaths and webpack assumptions.
5. Add Next.js runtime GraphQL addons to the runtime package:
	- directive transformers (e.g. `@http`, `@resolver`),
	- a `resolvers.ts` loader that can import named resolver functions from workspace files,
	- hot-reload support for schema and resolver changes (dev-only), and
	- a small resolver scaffold template for new projects.

Acceptance:

- `pnpm -w build:core` and `pnpm -w build:webview` succeed.
- The runtime builds/starts and can load a simple schema + `resolvers.ts` and respond to a test query.

### Phase C — Integrate the editor UI in the webview

1. Replace placeholder UI with real `GraphQLEditor` component.
2. Ensure worker is constructed and reachable from the webview bundle.
3. Verify validation results flow from worker to UI.

Acceptance:

- Visual graph renders for non-trivial schemas.
- Validation errors appear for invalid SDL.

Additional acceptance (visual + interaction):

- Auto-layout produces a stable, readable graph layout for non-trivial schemas.
- Nodes/edges use kind-aware styling (color + subtle typography differences).
- Drag-and-drop reorders fields within a type and persists to SDL.

### Phase D — Minimal directive authoring

1. Implement directive upsert helper (field-level directive add/update/remove).
2. Create a small panel bound to current selection.
3. Apply changes by producing new SDL and sending `update`.

Acceptance:

- Selecting a field and applying `@http(url: ...)` updates SDL on disk.

---

## 7) Testing plan

This repo currently uses a lightweight Node/assert test harness in [src/test/runTest.ts](../src/test/runTest.ts). We will extend this style for deterministic logic.

### 7.1 Unit tests (Node/assert)

Add pure-function tests for:

- Directive upsert logic:
	- add directive when missing
	- update directive args when present
	- remove directive
	- idempotency (applying same operation twice yields same SDL)

- Resolver scaffolding & wiring:
	- scaffold generation of `resolvers.ts` with template content
	- linking a field to a resolver function persists a correct `@resolver` directive or wiring manifest
	- idempotency / no duplicate scaffolds

- Message payload guards (optional):
	- runtime type checks for incoming messages to avoid crashes.

Where:

- `src/utils/graphqlDirectives.ts` (new)
- `src/utils/resolverScaffold.ts` (new)
- `src/test/runTest.ts` (add tests)

### 7.2 Manual testing checklist (VS Code)

- Open `.graphql` / `.gql` file with “Aggo GraphQL Editor”.
- Edit SDL in code view → saves, undo/redo works.
- External edit in text editor → webview updates.
- Worker is loaded (no console errors), schema validation appears.
- Apply directive wiring on a field → SDL updates and remains valid.

### 7.3 Optional future: extension integration tests

If we decide to add real VS Code integration tests later:

- Use `@vscode/test-electron` to launch VS Code and open a workspace with fixture schema.
- Validate that `vscode.openWith` opens the GraphQL editor and updates the file when webview posts `update`.

---

## 8) Risks and mitigations

- **CSP / eval restrictions**: Monaco or dependencies may violate CSP.
	- Mitigation: prefer ESM builds; dynamic import; avoid `unsafe-eval`.

- **Worker URL resolution in webview**: worker URLs must resolve from `media/`.
	- Mitigation: rely on Vite `new URL(..., import.meta.url)` pattern; confirm emitted assets are reachable.

- **Bundle size/perf**: editor + monaco may be large.
	- Mitigation: code split where safe; defer heavy imports until the GraphQL editor view is active.

- **SDL formatting churn** when applying directives.
	- Mitigation: use the editor’s internal tree-to-SDL generator; enforce stable output.

---

## 9) Definition of done (initial milestone)

- A `.graphql` file can be opened in a webview-based visual editor.
- Editing produces valid SDL and persists to disk with undo/redo.
- Worker-based validation runs and reports errors.
- A minimal directive panel can add/update `@http` on a selected field.

