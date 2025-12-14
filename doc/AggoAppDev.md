
# Aggo App Dev — Project Design & Scaffolding

📌 Purpose
This document explains an end-to-end design for adding a project scaffolding and runtime integration to the Aggo VS Code extension. It covers how to scaffold a Golang project, provide a `resources` folder with workflow and schema assets, how the CPN editor helps developers open and edit transition scripts (and generate stubs), create GraphQL interfaces, and support both local and remote CPN runtimes.

---

## Summary of Requirements (mapped)
1. Quick aggo project scaffolding to create a Go project if current directory is empty or the workspace root.
2. Scaffolding includes `/resources` with file types: `*.schema`, `*.graphql`, `*.ds`, `*.cpn` and `*.page`.
3. Scaffolding includes `/src` for Golang code that can start the app.
4. Customizable GraphQL interfaces exposed by the app for other apps to call.
5. Expose GraphQL handlers to create CPN case instances (and pass execution context) — proposed as good practice with safeguards.
6. `src` contains a subdirectory for auto-generated code (e.g., `src/inscript`).
7. CPN editor allows users to write Go scripts for transitions/arcs; scripts are stored in `src/inscript`.
8. Two modes to run CPN workflows in the Go app: local runtime lib or remote cpn runtime service.
9. Local runtime interprets CPN and calls inscript scripts via Yaegi or compiled together with the Go app.
10. Auto generated codes are publishable to remote runtime service; service can interpret (Yaegi) or JIT compiled code.

---

## High-level Design

The goal is to create a developer-friendly scaffolding tool and runtime integration that lets the user build and run CPN-driven business workflows in Go. Key components:
- VS Code extension commands: Scaffolding, GraphQL generation, Open script / Generate stubs, Publish runtime package.
- Project layout and templates: Create a Go module with `src` and `resources`.
- A small configuration file `aggo.yaml` to list GraphQL exposures and map GraphQL operations to workflow handlers.
- CPN Editor/extension integration for opening and creating `src/inscript` implementation files, and generating signatures and registration code in `src/gen`.
- Two runtime modes: local runtime (a Go library available during dev) and remote runtime service (callable via REST API or gRPC).

---

## Scaffolding Command & UX

Command: `Aggo: Init Backend` and `Aggo: Init Frontend` (VS Code extension commands) — these commands initialize Aggo support in an existing backend or frontend project after the developer has used standard project scaffolding tools (see examples below).

Separate init commands
- `aggo.init.backend` / `Aggo: Init Backend` — Initialize Aggo configuration and helper files (e.g. `aggo.yaml`, GraphQL exposure wiring, `resources/` integration points) inside an existing Go project created by external scaffolding tools (e.g., `cookiecutter-golang`).
- `aggo.init.frontend` / `Aggo: Init Frontend` — Initialize Aggo client integration helpers (e.g. `client/lib/aggo-pages.ts`, `client/components/PageRenderer.tsx`, and `client/public/page/` layout) inside an existing Next.js app created via `create-next-app`.

Options and flags (backend - `aggo.init.backend`):
- Project language: `go` (initial support — future multi-language)
- Project name: defaults to current folder name.
- GraphQL library preference: `gqlgen` (recommended) or `graphql-go` (optional).
- Runtime defaults: `local` or `remote`.
- Overwrite existing files: yes/no.

Options and flags (frontend - `aggo.init.frontend`):
- Client type: `nextjs` (currently supported)
- Typescript: default enabled (Next.js TS template)
- Tailwind CSS: default enabled
- shadcn UI components: default included (add shadcn starter)
- Port: defaults to `3000`.

Command behaviour:
- Validate the workspace root.
- Create base project layout (see scaffold tree below).
 - Create base project layout (see scaffold tree below) using your preferred tooling. Use `cookiecutter-golang` or other Go scaffolding to create the Go backend and `npx create-next-app` (or similar) to create the Next.js client. After creating the project with those tools, run `Aggo: Init Backend` (`aggo.init.backend`) to add Aggo wiring to the Go backend and `Aggo: Init Frontend` (`aggo.init.frontend`) to enhance the Next.js app with Aggo preview helpers and `PageRenderer`.
- Initialize `go.mod` and a main `cmd` `main.go` file stub.
 - Create example `resources` entries with `*.schema`, `*.graphql`, `*.ds`, `*.cpn` (NOTE: `.page` files are placed under the optional `client/public/page` when a UI is scaffolded.)
 - If you create a Next.js client (e.g., via `npx create-next-app`) and initialize it for Aggo using `Aggo: Init Frontend` (`aggo.init.frontend`), the client will use `client/public/page` to host `.page` files for previewing; no copy helper is required because pages live in `client/public/page`.
- Generate example GraphQL server including a sample query and mutation that map to CPN operations (mutations usually create cases).
- Add stubbed `src/gen` folder with example script stubs and generator registration code.
 - Generate `.vscode/launch.json` entries: `Launch Aggo Backend` and `Launch Next.js Client`, plus a compound `Aggo: Dev (Backend + Client)`. Use backend launch for Go. Use `Aggo: Init Frontend` to add the `Launch Next.js Client` entry.

Scaffold tree example:

```
<project-root>/
	aggo.yaml
	go.mod
	cmd/
		aggo-main/main.go  # small entrypoint, web server
	src/
		handlers/          # handwritten resolvers and helpers
		gen/               # auto-generated CPN script bindings and templates
		inscript/          # developer implemented scripts (per-workflow)
		runtime/           # local runtime client (small shim)
	resources/
		schema/            # *.schema JSON schema files
		ds/                # *.ds data source definitions
		graphql/           # *.graphql files
		cpn/               # *.cpn files (workflow definitions)
	client/              # OPTIONAL: Next.js client scaffold (created via `npx create-next-app` or similar; run `Aggo: Init Frontend` to integrate Aggo support)
	  app/               # app routes
		public/page/               # *.page files (web page definitions)
	README.md
```

---

## `resources` Directory — File Types
- `*.schema` — JSON schema used to validate payloads. These inform auto-generated GraphQL input types and case payload validation.
- `*.graphql` — GraphQL schema or specific interface definition files (e.g., mutation to start a case or query for instance state).
- `*.ds` — Data source definitions (e.g., DB connection config, datasource DSL) used by resolvers.
- `*.cpn` — CPN workflow files (a canonical CPN file format for aggo). The Editor will manage and sync them.

## `client/public/page` Directory — File Types
- `*.page` — Aggo page files (a canonical web page file format for aggo). The Editor support WYSIWYG visual page editing.

Page to Route Mapping (Next.js client)
- Each `.page` file under `client/public/page` maps to a Next.js app route when the optional Next.js client is scaffolded. For example:
	- `client/public/page/home.page` -> `/`
	- `client/public/page/orders/new.page` -> `/orders/new`
	- `client/public/page/product/view.page` -> `/product/view`
- The scaffolder generates a simple `client/app/[...slug]/page.tsx` (App Router-based route) that loads the page JSON and renders it with the `PageRenderer` component.
- The extension leverages static dev-server serving for browsers to access the *.page files, since they are in public folder.

Tip: The `PageRenderer` can also mount GraphQL bindings (declared on controls in the `.page` JSON) so UI buttons and inputs call GraphQL mutations and queries created by `aggo.graphql.generate`.

Best practice: keep schemas in `schema/`, graphql files in `graphql/`, ds in `ds/`, cpn in `cpn/`, and page in `page/` subfolders.

---

### Page Renderer & Routing (Next.js client)

To support page editing and previewing within a Next.js client app, the scaffolder can create a `PageRenderer` component (`client/components/PageRenderer.tsx`) and a catch-all App Router route (`client/app/[...slug]/page.tsx`) that resolves `.page` files and feeds them to the renderer. The component is intentionally small, pluggable, and provides a default mapping for common control types (text, form, button, list) and an API to register custom renderers for additional component types.

Generator responsibilities:
- Create an initial `client/components/PageRenderer.tsx` implementation and a simple App Router `client/app/[...slug]/page.tsx` route.
- Add a `client/lib/aggo-pages.ts` helper to map a slug to `client/public/page` locations and handle fetching the page JSON.
- Wire the rendering to GraphQL operations with props like `action: { type: 'mutation', op: 'createOrder' }` that the `PageRenderer` will route through a GraphQL fetch client to the backend endpoint.
 - Set up Next.js with TypeScript, Tailwind CSS, and shadcn UI in the generated project. The scaffolder will create a `client/components/ui` folder with a minimal set of components and Tailwind config to enable consistent UI building out of the box.

Developer workflow with a Next.js client:
- Developers edit `.page` files in `client/public/page` or `client/app` (App Router) using the `Page Editor` and then preview the page at the mapped URL (e.g. `http://localhost:3000/orders/new`). The extension can open the preview automatically or show a live webview when pages change.


## GraphQL—Customization & Exposure

Design Goals:
- Allow developers to choose which GraphQL interfaces to expose by editing `aggo.yaml`.
- Generate GraphQL scaffolding and resolvers that either map to Go functions or start CPN cases (a mutation can start a case).
- Leverage `gqlgen` or similar auto-generation to enforce typed resolvers.

`aggo.yaml` example (graphQL section):

```yaml
graphql:
	engine: gqlgen
	expose:
		- name: CreateOrder
			type: mutation
			source: graphql/createOrder.graphql
			handler:
				type: case_start
				cpn: cpn/order_create.cpn
				default_context:
					priority: low
			validate: schema/order.schema
		- name: QueryOrder
			type: query
			handler:
				type: query_resolver
				resolver: handlers/query_order.go:GetOrder
```

Explanation:
- The `expose` list defines which GraphQL operations to generate and how to map them to runtime behavior.
- `case_start` handler triggers a CPN case creation with a context built using GraphQL input values.
- `query_resolver` maps a GraphQL query to a Go handler.

Implementation detail:
- After scaffolding or `aggo graphql generate` the extension generates GraphQL resolvers in `src/handlers` and register them in `cmd/aggo-main/main.go`.
- `CreateOrder` or similar mutations can call an SDK method `aggo.NewCaseFromGraphQL(ctx, cpnPath, payload)` to instantiate a case with the extracted context.

---

## GraphQL → CPN Case: Is it Good Practice?

Short answer: Yes — triggering a case via GraphQL is a valid and common practice when GraphQL is used as the API for starting business processes. Considerations:
- Make mutations the primary method to start processes (mutations are state changing).
- Validate input payloads using `*.schema` files to reduce harmful payloads.
- Use authorization checks on the mutation resolvers.
- Do not expose all transitions via GraphQL; allow only case start and read queries by default. (Allow transitions only via administrative or internal APIs.)

Rationale:
- GraphQL provides a strong type-first API where clients can pass structured payloads; mapping a mutation to instantiate a CPN case works naturally.
- Use well-defined GraphQL input types for the case context.

---

## Auto-Generated Code & `src/gen`

Structure:
- `src/gen/cpn_scripts/<workflow-id>/*.go` — auto-generated code and stubs for transition scripts.
- `src/gen/registration.go` — a function that registers all generated handlers with the runtime.
- `src/gen/gen_meta.json` — generator metadata that maps script ids to generated signatures and file paths.

How it works:
- When you `Generate script stubs` or `Regenerate CPN stubs`, the generator creates signature files in `src/gen/cpn_scripts/<workflow-id>/`.
- Optionally, a starter implementation file may be created in `src/inscript/<workflow-id>/` to give developers a starting point for writing scripts. These files are meant to be modified by the developer.
- The generator creates function signatures matching a runtime interface, e.g.:

```go
func OnTransition_ValidateOrder(ctx context.Context, payload map[string]any) (map[string]any, error) { ... }
```

- `src/gen/registration.go` will register these functions with a runtime dispatcher, so they are callable by ID from the interpreter or runtime.

Developer editing flow:
- Developers implement script logic in `src/inscript` files. `src/gen` contains generated signatures and registration scaffolding and should not be edited by hand in normal development flows.
- If a signature change is required, run `Aggo: Regenerate CPN stubs` to update generated signatures. The generator will warn about mismatches and will not overwrite `src/inscript` files without explicit confirmation.
- Use `// user:override` regions or wrapper `src/handlers` for safe customization that persists across regen runs.

---

## CPN Editor — Script Editing UX (simplified)

Design change summary: to keep the UX simple and predictable, the CPN editor provides a UI control that opens an implementation Go file for a given transition/inscription rather than attempting to auto-sync code on every save. This avoids complex, error-prone bidirectional synchronization and makes the developer workflow explicit.

How it works:
- The CPN editor shows a script link or “Edit script” action on each transition or inscription that has an associated script.
- When a user clicks the action, the extension opens the corresponding Go file at the script function in the workspace editor. The canonical location is `src/inscript/<workflowID>/<transitionID>_<scriptID>.go`.
- If the file does not exist, the extension creates a stub file and opens it for the developer to edit.
- The CPN editor and the `src/gen` registration code reference a common function identifier, and the generated registration code will call the function in the `src/inscript` implementation.

Commands (editor-focused):
- `Aggo: Open script` — open the Go file for a transition/inscription from the CPN editor UI.
- `Aggo: Generate script stubs` — generate signature stubs under `src/gen` and optional starter `src/inscript/<workflowID>/` files for missing implementations.
- `Aggo: Regenerate CPN stubs` — re-create signatures when the CPN structure changes (new transitions), without overwriting existing `src/inscript` files.

Conflict handling & developer responsibilities:
- There is no automatic import/sync from file edits into `.cpn` files. Developers edit the Go files directly.
- If the developer changes the script function signature in `src/inscript`, a `Generate script stubs` or `Regenerate CPN stubs` command will produce updated signatures in `src/gen`. If signatures diverge, `aggo` tools will raise a warning and recommend running the `Regenerate CPN stubs` command or opening a diff in the editor.

Advantages of this approach:
- Removes the complexity of detecting file changes and reconciling edits with the editor state.
- Keeps the developer workflow explicit and predictable: edit code in an editor, not via automated bidirectional sync.
- Reduces accidental overwrites and merge conflicts during active development by keeping code edits manual and tracked by git.

---

## Runtime Modes

Two modes are supported:

Local runtime (development):
- Importable Go lib (e.g., `github.com/aggo/runtime`) or a local package `src/runtime`.
- Interprets `.cpn` definitions and follows transitions and call inscribe scripts.
- Two execution strategies for calling scripts:
	- Yaegi interpreter: For dynamically running Go scripts at runtime without rebuilds (fast iteration). Scripts are stored as `.go` raw code and executed via Yaegi interpreter.
	- Compile-time registration / plugin: Build generated script code into the main application (for production and better performance). The compile mode requires either using Go plugins (darwin/linux support caveats) or static linking.

Remote runtime (production):
- The app posts case creation events to a runtime service which manages case state and runs workflows.
- The runtime service must accept code packages and either interpret them (Yaegi) or JIT them.

Local vs Remote considerations:
- Local runtime is best for dev: quick iteration with dynamic scripts.
- Remote runtime is best for production: centralized management, higher availability.
- Provide a compatible runtime contract: aggo runtime expects a `Handler` interface and a registration mechanism so code written for local runtime can be packaged and uploaded for remote runtime.

---

## Calling auto-generated scripts at runtime

Invocation patterns:
- `runtime.ExecuteTransition(ctx, workflowID, transitionID, payload)` — runtime finds the registered handler and calls the generated function.

Handler interface example:

```go
type TransitionHandler interface {
	Call(ctx context.Context, payload map[string]any) (map[string]any, error)
}
```

When using Yaegi, the runtime will load the source `.go` from `src/inscript` and call the function dynamically. When using compiled mode, the `registration.go` registers static Go functions.

Error handling:
- Standardized errors should be returned from script functions.
- The runtime handles retries, pause/resume, and failure policies defined in the CPN.

---

## Publishing generated code to a remote runtime

Package format:
- A zip package with:
	- `cpn/` — workflow files
	- `scripts/` — script source (if using interpreter) or compiled binaries (if remote supports plugin format)
	- `meta.json` — registration data: function ids, signature details, and registration entries.

Publish UI/commands:
- `Aggo: Publish to Remote Runtime` — Package and upload; extension reads runtime URL and API token from `aggo.yaml` or extension settings.

Remote runtime supports two options:
- Source upload + Interpretation: Accepts `scripts/` source files and uses Yaegi-like interpreter.
- Binary/Plugin upload: Accepts compiled plugin format: runtime loads plugin code as needed.

Security:
- Authenticate requests with API keys or OAuth.
- Validate signatures of uploaded packages.

---

## Development workflow examples

Scenario 1 — Develop locally and iterate quickly:
1. `Aggo: Init Backend` initializes Aggo configuration and wiring within an existing Go project generated via `cookiecutter-golang` or similar scaffolding.
1b. Optionally, create a Next.js client using `npx create-next-app` and run `Aggo: Init Frontend` (`aggo.init.frontend`) to add Aggo client preview support (PageRenderer, route mapping, etc.).
2. Edit `resources/cpn/order_create.cpn` in the CPN editor; link transitions to script IDs (e.g., `validateOrder`, `checkPayment`).
2b. Use `Aggo: Open script` from the editor UI to create/edit `src/inscript/order_create/validateOrder.go` in-place.
2c. If a Next.js client was scaffolded, run `pnpm --filter client dev` (or the `Launch Next.js Client` debug profile) and preview the page at the mapped route (e.g. `http://localhost:3000/orders/new`) to see live updates from the `client/public/page` entry.
2d. Use `Aggo: Sync Pages` (`aggo.sync.pages`) to create missing app routes and see updates reflected in the UI.
3. `Aggo: Generate script stubs` -> generates `src/gen` signature stubs and optional `src/inscript` starter files.
4. Run server in local mode; the runtime uses Yaegi to interpret scripts so you can patch functions without recompiling.
5. Use GraphQL mutation to start a case, providing inputs; the runtime creates a case and executes steps.

Scenario 2 — Production with remote runtime:
1. Finalize scripts in `src/gen` and test them locally.
2. `Aggo: Publish to Remote Runtime` packages and uploads code.
3. App in production uses `runtime.mode: remote` to route case creation to the runtime service.

---

## Developer Lifecycle (SDLC) — Explicit Steps

This section provides a step-by-step developer lifecycle for building an Aggo application, putting special emphasis on schema-first development, GraphQL APIs, resolvers as pipelines, CPN workflow integration, and UI binding.

1) Define data schema standard (single source-of-truth) ✅
- Purpose: Define canonical data shapes used by the database, DTOs, GraphQL types, and UI forms.
- Files & Patterns: Place JSON Schema files under `resources/schema/*.schema`.
- Process:
	- Create/validate JSON schema for each domain object (e.g., `order.schema`, `rfq.schema`).
	- Use `aggo.inferSchemaFromJson` to bootstrap schema from example fixtures.
	- Add JSON schema to `aggo.yaml` `validation` entries or reference them in GraphQL exposures so resolver inputs are validated automatically.
	- Developers can generate language-specific DTOs (Go structs) from the same schema (scripted step in the CI pipeline) or use type mappings in `gqlgen`.
- Tools & Commands:
	- `aggo.inferSchemaFromJson` — infer a schema from example payloads.
	- `pnpm run build` / `go run` generation tools that convert JSON schema to Go types (optional).

2) Define GraphQL API (schema first / expose intentional operations) ✅
- Purpose: Design the operations and data relationships that the application exposes to internal/external users.
- Files & Patterns: `resources/graphql/*.graphql` files maintained by the team.
- Process:
	- Draft `*.graphql` files describing types, queries, and mutations.
	- Add exposures to `aggo.yaml` to control which operations are public/internal and how they map to CPN or resolvers.
	- Use `aggo.graphql.generate` to combine GraphQL files and scaffold resolvers.
- Tools & Commands:
	- `aggo.graphql.generate` — concat `resources/graphql/*.graphql` into `cmd/aggo-main/schema.graphql`, generate `gqlgen.yml` and stubs, and optionally run `gqlgen`.
	- `go run github.com/99designs/gqlgen generate` to produce typed Go resolvers.

3) Implement GraphQL resolvers as data pipelines (functional contracts) ✅
- Purpose: Resolver code should implement transformations, validations, enrichment, and CPN context preparation (the process layer).
- Process:
	- Implement resolver functions under `src/handlers/` which perform:
		- Payload validation (via JSON schema), normalization, DTO conversion
		- Fetch/transform needed data (DB reads, enrichments)
		- Prepare runtime context (map fields → CPN variables)
		- Optionally, call `runtime.NewCase`, `runtime.ExecuteTransition`, or emit tokens/events
- Best practices & future-proofing:
	- Keep resolvers thin and call a service layer for business logic. This allows a visual data pipeline editor to model the same steps later.
	- For pipeline steps, store pipeline definitions left-of-code (e.g., `resources/pipelines/*.json`) that the UI or generator can edit.
	- Make resolvers idempotent where sensible (e.g., repeated create requests should be validated and deduped).

4) Trigger CPN workflows (mutations ↔ cases) ✅
- Purpose: GraphQL mutations are the integration point for starting workflows and routing tokens.
- Process:
	- Configure `aggo.yaml` mapping: include `handler.type: case_start` with `cpn:` path.
	- The generated resolver stub calls the runtime wrapper `runtime.NewCase(ctx, workflowID, payload)` using the prepared context.
	- For token-based triggers, resolvers can call `runtime.ExecuteTransition(ctx, caseID, transitionID, tokenPayload)`.
- Patterns:
	- `NewCaseFromGraphQL(ctx, cpnPath, payload)` returns `caseId` & metadata; resolver returns minimal payload (e.g., caseId) immediately.
	- Use `runtime.mode=local` to test using `Yaegi` and `runtime.mode=remote` when in production.

5) Bind UI in Page Editor to GraphQL APIs (no-code mapping) ✅
- Purpose: The page editor wires UI controls to GraphQL queries/mutations quickly so designers can prototype UIs.
- Files & Patterns: `client/public/page/*.page` and UI bindings metadata that reference GraphQL operations.
- Process:
	- Store component data bindings to a GraphQL operation in `page` files (e.g., button.action → `createRFQ` mutation).
	- The extension will open `client/public/page/*` using the page editor and allow users to bind an operation via a visual UI.
	 - When the Next.js client is scaffolded, the extension can also open the Next.js preview route (e.g., `/orders/new`) to display the live preview of the `.page` file in the client.
	- The Editors can autosuggest GraphQL ops from `cmd/aggo-main/schema.graphql` created by `aggo.graphql.generate`.

6) Validation, Testing & CI (all stages) ✅
- Validate schemas and GraphQL in CI:
	- JSON schema validators with `ajv` (for Node) or `gojsonschema` (for Go) to validate sample payloads.
	- GraphQL schema generation check using `gqlgen` (ensure `schema.graphql` matches expectations and resolvers compile).
	- Unit tests for resolvers and runtime logic: `go test ./...` and TypeScript tests for extension logic.
	- SIT / E2E: `scripts/sit/sit-test.sh` spins up dev server and executes GraphQL mutations.
- CI flow example:
	- PR opens → run `pnpm run build` & `go test ./...` → run static analysis → run SIT against `cmd/aggo-main` in dev mode.

7) Publish & Release (runtime package) ✅
- After scripts and CPN are tested:
	- Run `aggo.publish` to upload `cpn` workflows and `src/gen`/`src/inscript` to remote runtime.
	- Remote runtime validates `meta.json` and returns a versioned artifact ID.
	- Deployers can set `aggo.yaml.runtime.artifact: <id>` to use that artifact.

---

Developer Checklist (quick)
- [ ] Add JSON schema under `resources/schema/` for any domain object.
- [ ] Add GraphQL type/mutation in `resources/graphql/`.
- [ ] Run `aggo.graphql.generate` to produce `cmd/aggo-main/schema.graphql` and stubs.
- [ ] Implement resolver(s) under `src/handlers` and convert payloads to runtime contexts.
- [ ] Use `Aggo: Open script` to open generated inscript stubs and implement details.
- [ ] Run unit tests (`go test ./...`) and `scripts/test/unit-test.sh`.
- [ ] Run SIT tests (`scripts/sit/sit-test.sh`) with the dev runtime.
- [ ] Publish to remote runtime using `aggo.publish` and update `aggo.yaml` artifact reference.

- [ ] If a Next.js client is scaffolded, run `pnpm --filter client dev` (or press F5 with the `Aggo: Dev (Backend + Client)` launch compound) and preview `client/public/page` routes.
 - [ ] If a Next.js client is scaffolded, run `pnpm --filter client dev` (or press F5 with the `Aggo: Dev (Backend + Client)` launch compound) and preview `client/public/page` routes.
- [ ] (Optional) Create Next.js client using `npx create-next-app` and run `Aggo: Init Frontend` (`aggo.init.frontend`) to initialize Aggo UI helpers.
 - [ ] Run `Aggo: Sync Pages` (`aggo.sync.pages`) to generate missing `client/app` routes from `client/public/page/*.page` as needed.

Additional tips
- Keep `resources/schema` updated and used as the sole source-of-truth for DTOs.
- Use `// user:override` or wrapper handlers for customizations to avoid overwrite on regeneration.
- Prefer `gqlgen` for typed resolvers; `graphql-go` is a fallback option.

---

## Implementation Plan & Next Steps (for Engineering)
1. Add extension commands `Aggo: Init Backend` and `Aggo: Init Frontend` and add template files or optional integration steps for Go project and client app support.
1b. Add optional scaffolding for a Next.js client app that maps `client/public/page` to routes and includes a `PageRenderer` component and a `.vscode/launch.json` compound for dev.
2. Implement scaffolding templates for ` resources/schema`, `resources/graphql`, `resources/ds`, and `resources/cpn`.
3. Add `aggo.yaml` config support and a GraphQL code generator to emit resolvers in `src/handlers`.
4. Add the CPN script generator and generator metadata (stubs and registration file) into `src/gen`, and optionally create starter `src/inscript` implementation files.
5. Implement the `Aggo: Open script`, `Aggo: Generate script stubs` and `Aggo: Publish` extension commands.
6. Implement the runtime library (or stub) with the `ExecuteTransition`, `NewCase`, and `RegisterHandler` contract.
7. Create a remote runtime service API spec and the server side for publishing packages.
8. Tests: GraphQL E2E test that hits the create-case mutation and validates case lifecycle.

Timeline estimate:
- Scaffolding & templates: 2–4 days
- Codegen + GraphQL/gqlgen flows: 3–6 days
- CPN Editor sync + tests: 3–7 days
- Runtime lib + local/Yaegi support: 4–7 days
- Remote runtime & publish: 5–10 days depending on scope and auth.

---

## Best Practices & Notes
- Store generated code in `src/gen`. Keep user code separate in `src/handlers` or `src/scripts`.
- Use `aggo.yaml` as the single source of truth to define GraphQL exposures, runtime mode, and remote runtime endpoints.
- For production, prefer compiled registration rather than interpreter for performance and security; keep Yaegi as dev mode.
- Log and audit GraphQL mutations that trigger case creations (sensitive operations).
- Validate inputs with `*.schema` files before dispatching them to the runtime.

---

## Appendix: Example `aggo.yaml`

```yaml
name: demo-aggo
version: 0.1.0
runtime:
	mode: local # local|remote
	remote_endpoint: https://aggo-runtime.example.com
	api_key: "${AGGO_RUNTIME_TOKEN}"

graphql:
	engine: gqlgen
	expose:
		- name: StartPayment
			type: mutation
			source: graphql/startPayment.graphql
			handler:
				type: case_start
				cpn: cpn/payment.cpn
				default_context:
					amount_currency: USD
```

---

If you’d like, I can now produce a minimal scaffold template and the exact `aggo.yaml` parsing code to wire this up in the extension, or I can break the design into a set of PR-sized tasks. Which do you prefer? ✅

---

## Templates & Example Files (developer reference)

Below are short examples for scaffolding templates used by the extension; these are minimal examples that a scaffold command creates.

If the client has been initialized with `Aggo: Init Frontend`, the initializer will add `client/app/[...slug]/page.tsx` (App Router style), `client/components/PageRenderer.tsx`, and a `client/public/page/` folder to host `.page` files for development and preview. A demo page that requests `http://localhost:8080/health` (or a GraphQL query) is added for quick BE/FE validation.

`cmd/aggo-main/main.go` (stub):

```go
package main

import (
	"context"
	"log"
	"net/http"
	"github.com/haymant/aggo/runtime"
	"github.com/99designs/gqlgen/graphql/handler"
	// gen/graphql types/ resolvers are generated by aggo graphql generate command
)

func main() {
	// create runtime
	r := runtime.NewLocalRuntime()
	// register generated handlers
	r.RegisterGeneratedHandlersFunc()

	// start GraphQL server
	srv := handler.NewDefaultServer(NewExecutableSchema(Config{Resolvers: &Resolver{Runtime: r}}))
	http.Handle("/query", srv)
	log.Fatal(http.ListenAndServe(":8080", nil))
}
```

`resources/graphql/createOrder.graphql` (example mutation):

```graphql
type Mutation {
	createOrder(input: CreateOrderInput!): CreateOrderPayload!
}

input CreateOrderInput {
	customerId: String!
	items: [OrderItemInput!]!
}

type CreateOrderPayload {
	caseId: String!
	status: String!
}
```

`resources/schema/order.schema` (simplified example):

```json
{
	"$schema": "http://json-schema.org/draft-07/schema#",
	"title": "Order",
	"type": "object",
	"properties": {
		"customerId": {"type": "string"},
		"items": {
			"type": "array",
			"items": {"type": "object"}
		}
	},
	"required": ["customerId", "items"]
}
```

`resources/cpn/order_create.cpn` (simplified representation):

```json
{
	"id": "order_create",
	"nodes": [
		{"id": "start", "type":"start"},
		{"id": "validate_order", "type":"task", "script_id": "validateOrder"},
		{"id": "check_payment", "type":"task", "script_id": "checkPayment"},
		{"id": "complete", "type":"end"}
	],
	"edges": [
		{"from":"start","to":"validate_order"},
		{"from":"validate_order","to":"check_payment"},
		{"from":"check_payment","to":"complete"}
	],
	"scripts": {
		"validateOrder": {
			"lang": "go",
			"code": "package script\n\nimport \"context\"\nfunc OnValidateOrder(ctx context.Context, payload map[string]any) (map[string]any, error) { return payload, nil }"
		},
		"checkPayment": {
			"lang": "go",
			"code": "package script\n\nimport \"context\"\nfunc OnCheckPayment(ctx context.Context, payload map[string]any) (map[string]any, error) { return payload, nil }"
		}
	}
}
```

`src/inscript/order_create/validate_order.go` (developer-implemented example):

```go
package inscript

import "context"

func OnValidateOrder(ctx context.Context, payload map[string]any) (map[string]any, error) {
	// developer implementation
	return payload, nil
}
```

`src/gen/registration.go` (generated):

```go
package gen

import (
	"github.com/haymant/aggo/runtime"
	"github.com/haymant/aggo/src/inscript"
)

func RegisterGeneratedHandlers(r runtime.Runtime) {
	// registration bridges generated handler names to implementation in `src/inscript`
	r.RegisterHandler("order_create", "validateOrder", inscript.OnValidateOrder)
	r.RegisterHandler("order_create", "checkPayment", inscript.OnCheckPayment)
}
```

	`client/app/[...slug]/page.tsx` (basic generated implementation - Next.js App Router + TypeScript):

	```tsx
	import React from 'react'
	import PageRenderer from '@/components/PageRenderer'
	import { useParams } from 'next/navigation'

	export default function PageFromResources() {
		const params = useParams()
		const slug = (params.slug || []) as string[]
		const path = slug.length > 0 ? slug.join('/') : 'home'
		const [pageJson, setPageJson] = React.useState(null)

		React.useEffect(() => {
			if (!router.isReady) return
			fetch(`/page/${path}.json`) // either from `public/page` or `/__aggo/pages/${path}.json` proxy
				.then(r => r.json())
				.then(setPageJson)
		}, [path, router.isReady])

		if (!pageJson) return <div>Loading…</div>
		return <PageRenderer page={pageJson} />
	}
	```

	`client/package.json` (example scripts created by `Aggo: Init Frontend`):

	```json
	{
		"name": "aggo-client",
		"private": true,
		"scripts": {
			"dev": "next dev",
			"build": "next build",
			"start": "next start -p 3000"
		}
	}
	```

	`client/components/PageRenderer.tsx` (TypeScript example with shadcn UI):

	```tsx
	import React from 'react'
	import { Button } from '@/components/ui/button' // shadcn UI button
	export default function PageRenderer({ page }: { page: any }) {
		if (!page) return null
		return (
			<div className="aggo-page">
				{(page.layout || []).map((c, i) => {
					switch (c.type) {
						case 'text':
							return <p key={i}>{c.props?.text}</p>
						case 'button':
							return <Button key={i} onClick={() => console.log('Action', c.props?.action)}>{c.props?.label}</Button>
								`client/app/demo/health/page.tsx` (demo test page - shows BE & FE integration):

								```tsx
								'use client'
								import React from 'react'
								import { Button } from '@/components/ui/button'

								export default function HealthDemo() {
									const [status, setStatus] = React.useState<string | null>(null)

									async function checkHealth() {
										try {
											const res = await fetch('http://localhost:8080/health') // demo backend endpoint
											const text = await res.text()
											setStatus(text)
										} catch (err) {
											setStatus('Error')
										}
									}

									React.useEffect(() => { checkHealth() }, [])

									return (
										<div>
											<h1>Backend Health</h1>
											<p>Status: {status ?? 'Loading...'}</p>
											<Button onClick={checkHealth}>Refresh</Button>
										</div>
									)
								}
								```
						default:
							return <div key={i}>Unknown Component: {c.type}</div>
					}
				})}
			</div>
		)
	}
	```

---

## SDK & Runtime API (interfaces and proposer)

These interfaces are internal contracts between generated code and runtime. They should be minimal and backward compatible.

`runtime/runtime.go` (interface):

```go
package runtime

import "context"

type HandlerFunc func(ctx context.Context, payload map[string]any) (map[string]any, error)

type Runtime interface {
	NewCase(ctx context.Context, workflowID string, payload map[string]any) (caseID string, err error)
	ExecuteTransition(ctx context.Context, caseID string, transitionID string, input map[string]any) (map[string]any, error)
	RegisterHandler(workflowID, transition string, handler HandlerFunc)
}
```

`client/app/<slug>/page.tsx` (generated by `aggo.sync.pages`) - minimal generated route example:

```tsx
import React from 'react'
import PageRenderer from '@/components/PageRenderer'

export default function GeneratedPage() {
	// The code generator will create a minimal route that fetches a static JSON file under `public/page/<slug>.json`
	const pageJson = require('/public/page/<slug>.json')
	return <PageRenderer page={pageJson} />
}
```

### VS Code `.vscode/launch.json` (Dev compound)

When scaffolding a client and backend together, create a compound launch configuration to run both the Go dev server and Next.js dev server. Example generated `launch.json`:

```json
{
	"version": "0.2.0",
	"compounds": [
		{
			"name": "Aggo: Dev (Backend + Client)",
			"configurations": ["Launch Aggo Backend","Launch Next.js Client"]
		}
	],
	"configurations": [
		{
			"name": "Launch Aggo Backend",
			"type": "go",
			"request": "launch",
			"mode": "auto",
			"program": "${workspaceFolder}/cmd/aggo-main",
			"env": {"AGGO_RUNTIME_MODE": "local"},
			"cwd": "${workspaceFolder}"
		},
		{
			"name": "Launch Next.js Client",
			"type": "pwa-node",
			"request": "launch",
			"cwd": "${workspaceFolder}/client",
			"runtimeExecutable": "pnpm",
			"runtimeArgs": ["dev"],
			"port": 3000
		}
	]
}
```

Design notes:
- Generated code will use the `RegisterHandler` contract for both compiled and interpreted runtime modes (when using Yaegi, the handler will be a wrapper that dynamically invokes the interpreted function).
- `NewCase` returns a stable caseId allowing the GraphQL mutation to return the case id.

---

## Test & CI Recommendations
- Add a CLI `aggo test` that runs unit tests for generated handlers and runtime integration (mocked), and a `aggo e2e` for hitting GraphQL endpoints and validating case lifecycle (can use `httptest` server).
- Validate GraphQL schema generation using `gqlgen` or equivalent by asserting GraphQL schema files match `aggo.yaml` configurations.

---

## Security & Operational Considerations
- Validate JSON payloads using `*.schema` files before calling `NewCase`.
- Use rate limiting and authentication on GraphQL endpoints.
- Keep a clear separation between user-provided code and generated code; generated files should have a header warning.
- Use audit trails for case creation and state transitions (who created/updated). For remote runtime publishing, require signed zip packages or trusted tokens.

---

If you'd like, I can break the design into implementation tasks and a PR plan (extension CLI commands, scaffolding templates, graphQL generator, runtime library, tests). Which would you prefer next?

---

## Detailed Sync & Packaging

Naming and IDs:
- `workflowID` is path-based relative to `resources/cpn` (e.g., `cpn/order_create.cpn` -> `order_create`).
- `scriptID` maps to filenames under `src/gen/cpn_scripts/<workflowID>/<scriptID>.go` where `scriptID` maps to transition or inscription names.

Sync rules:
- When you `Generate script stubs` or `Regenerate CPN stubs`, for each `scriptID` the generator will create or update `src/gen/cpn_scripts/<workflowID>/<scriptID>.go` with a standard signature.
- Each generated script has a top-of-file header that warns developers that it is generated and shows sync metadata (e.g., hash of the file at the time of generation).
- The extension maintains a `gen_meta.json` that maps scriptIDs to file paths and generator timestamps. `gen_meta.json` is used by generators to avoid overwriting user implementations in `src/inscript` and to track registration updates. On mismatch, the extension presents a diff with explicit overwrite options.

Publishing to remote runtime:
- Packaging uses an explicit manifest `meta.json` with:
	- `workflowIDs` and entries for each script, transitions, function signatures
	- `version` tag
	- `compatibility` with runtime features
- The publisher packages `resources/cpn`, `resources/schema`, `src/gen/cpn_scripts` and `src/inscript` (if uploading source + interpreter) — or compiled plugin binaries — into a zip and POSTs it to the runtime's `upload` endpoint. The runtime validates signatures and `meta.json` and provides back a versioned artifact ID. The app configuration can point at that artifact ID.

Versioning & upgrades:
- Each published artifact should include a semver-like `version` field and `compatibility` metadata. The runtime server will track releases and support `activate` and `rollback` operations.

Runtime's contract with generated code:
- `RegisterHandler(workflowID, scriptID, handler)` — registration to call the handler when a transition triggers.
- The runtime will provide default runtime APIs available to scripts: logging, access to runtime services, stubs for db access (if allowed), and a `Runtime` interface to call other service methods.

Observability:
- Instrumentation for case progress, per-script start/stop/duration, errors, and user-defined metrics should be included in the runtime.
- GraphQL resolvers should log case creation events for audit.

Compatibility & caveats:
- Go plugin model only works well on Linux and macOS. For cross-platform deployments, prefer using the Yaegi-based interpreter on remote runtime or building artifacts per OS/arch.
- The extension should provide a `--mode` flag to `aggo publish` to indicate source vs binary publishing.

---

## VS Code Extension Commands & Activation (sketch)

 - `aggo.init.backend` / `Aggo: Init Backend` — Initialize Aggo in an existing Go project and optionally create wiring and examples; does not replace your project scaffold.
 - `aggo.init.frontend` / `Aggo: Init Frontend` — Initialize Aggo in an existing Next.js client project and add PageRenderer helpers and preview wiring.
- `aggo.graphql.generate` — Generate GraphQL resolver stubs based on `aggo.yaml` and `resources/graphql` files.
- `aggo.openScript` — Open the implementation Go file for a transition/script from the CPN editor.
- `aggo.generateStubs` — Generate signature stubs under `src/gen` and optional starter `src/inscript` files.
- `aggo.regenerateStubs` — Re-create signatures when the CPN structure changes (new transitions), without overwriting existing `src/inscript` files.
- `aggo.publish` — Create a package and publish to remote runtime.
 - `aggo.runtime.start` — Start the local runtime and GraphQL server in development mode (or a `make dev` alternative).
 - `aggo.sync.pages` — Generate `client/app/.../page.tsx` routes from `client/public/page/*.page` files (App Router) that import `PageRenderer`, enabling a live preview and fast front-end iteration.
 - `aggo.sync.pages` — Generate `client/app/.../page.tsx` routes from `client/public/page/*.page` files (App Router) that import `PageRenderer`, enabling a live preview and fast front-end iteration. Options: `--force` to overwrite existing route files, `--index` to generate `index.tsx` under each route folder instead of `page.tsx`.

`package.json` should register these commands and map them to the TypeScript command handlers in `src/extension.ts`.

---

## Implementation considerations for the extension (notes for devs)

- `init` commands should not overwrite non-empty folders unless user explicitly opts in.
- For `graphql generate`, prefer `gqlgen` as the default: generate `schema.graphql` from `resources/graphql/*.graphql` and `go run github.com/99designs/gqlgen` to scaffold resolvers.
- `sync` commands should run in the workspace root and support multi-root patterns (workspaces with subfolders).
- For CPN script edits, use a `// user:override` block and/or a codegen-preserved region to allow users to extend stubs safely.

---

## UX Considerations & Safety

- For `mutation -> create case` GraphQL operations, return a minimal payload immediately (e.g., `caseID`) and optionally a subscription-based or query-based mechanism to follow lifecycle progress.
- Provide a toggle for developer users that allows `aggo.graphql.generate` to scaffold GraphQL resolvers directly, but don't auto-publish resolvers without user confirmation.
- When `aggo.publish` is triggered, prompt for confirmation and for the runtime `apiKey` and `endpoint` stored in `aggo.yaml` or dev secret store.

---

## Final Notes & Next Steps
If you'd like, I can split the design into PR-sized tasks and create a minimal draft of the actual template files and TypeScript command skeletons for review, or we can iterate on this document further.

---

## Requirements Checklist
Below is a mapping from the original user's 10 requirements to the parts of this design that implement them:

1. Quick aggo project scaffolding — see **Scaffolding Command & UX** and **Scaffold tree** example.
2. `resources` directory with schema/graphql/ds/cpn — see **resources Directory — File Types** and scaffold tree.
3. `src` folder for app code — see **Scaffolding Command** and `cmd/aggo-main/main.go` example.
4. Custom GraphQL exposures — see **GraphQL—Customization & Exposure** and `aggo.yaml` example.
5. GraphQL triggers case creation — see **GraphQL → CPN Case: Is it Good Practice?** and **Invocation patterns**.
6. `src/gen` subdirectory for auto-generated code — see **Auto-Generated Code & `src/gen`**.
7. Editor allows Go scripts per transition and provides an `Edit script` action that opens the matching `src/inscript` file — see **CPN Editor → Script Editing UX**.
8. Two runtime modes (local/remote) — see **Runtime Modes**.
9. Local runtime uses Yaegi or compiled plugin to call scripts — see **Runtime Modes** and **Calling auto-generated scripts at runtime**.
10. Auto-generated code can be published to a remote runtime — see **Publishing generated code to a remote runtime**.



