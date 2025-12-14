# Aggo App Dev — Implementation Plan, Tests & SIT Scripts

This file outlines an implementation plan, PR-sized tasks, and example test scripts for the features described in `doc/AggoAppDev.md`.

## Features (top-level)
 - Project init commands (VS Code) — `Aggo: Init Backend` (`aggo.init.backend`) and `Aggo: Init Frontend` (`aggo.init.frontend`). These commands assume the project has been created by an external scaffolding tool and will add Aggo-specific configuration and helper files.
- `resources` template scaffolding (cpn, graphql, schema, ds)
- `aggo.yaml` configuration and GraphQL exposure generator (`aggo.graphql.generate`).
- GraphQL resolvers that call into runtime: `case_start` and `query_resolver` patterns.
- `src/gen` generator for signatures and `src/inscript` starter files.
+ `aggo.sync.pages` command to generate `client/app` route files from `client/public/page` entries and scaffold route files in `client/app`.
- `Aggo: Open script` editor integration and `Aggo: Generate script stubs`, `Aggo: Regenerate CPN stubs` commands.
- Local runtime shim (`NewLocalRuntime`, `RegisterHandler`, `ExecuteTransition`) with Yaegi support for dev.
- Package & publish to remote runtime API commands (`aggo.publish`).

---

## PR-sized Implementation Plan

- PR 1a — Scaffolder and simple `aggo.yaml` parsing (COMPLETED)
 - Implement `Aggo: Init Backend` command in the extension as `src/commands/initBackend.ts` to augment an existing Go project with Aggo configuration, generators and helpers. (done)
 - Add templates for file tree (scaffold templates) under `scripts/templates/go` and `scripts/templates/resources`. (done)
 - Implement `aggo.yaml` basic parser and generator scaffolding (parser at `src/utils/aggoConfig.ts`). (done)
 - Tests: `pnpm test` script for TypeScript handlers.
 - Generate VS Code `.vscode/launch.json` entries `Launch Aggo Backend`, and a compound `Aggo: BE Dev` to help devs run backend with a single click.
 - Output: `aggo.init.backend` will create or augment Aggo configuration and helper files within an existing Go project. Use `cookiecutter-golang` (or similar) to generate the base Go project before running this command.
   - `aggo.yaml` (settings & GraphQL expose mappings)
   - `go.mod` at repo root
   - `cmd/aggo-main/main.go` and `cmd/aggo-main/schema.graphql` (if GraphQL files present)
   - `src/handlers/` with stubbed resolver files
   - `resources/` with `schema/`, `graphql/`, `ds/`, `cpn/` templates
   - `scripts/templates/go` scaffold for CI and dev run steps
   - `scripts/test/unit-test.sh` & `scripts/sit/sit-test.sh` hooks (ensuring `go test` runs)
 - Tests: Backend unit / lints & build: run `go test ./...`, verify `cmd/aggo-main` builds and returns a minimal endpoint (`/health`), optionally a GraphQL endpoint at `/query`.

PR 1b — Optional: Next.js client scaffolding & page renderer (NEW)
- Implement `aggo.init.frontend` command that initializes Aggo client integration (PageRenderer, `client/public/page` layout, and TypeScript/Tailwind wiring) within an external Next.js app; prefer generating the Next.js app first via `npx create-next-app`.
 - The scaffolded client uses Next.js + TypeScript, Tailwind CSS, and shadcn UI as the default UI stack and includes the following outputs:
   - `client/app/[...slug]/page.tsx` (App Router) and `client/app/demo/health/page.tsx` (test page that fetches backend API).
   - `client/components/PageRenderer.tsx` and `client/components/ui/*` (shadcn UI starter components)
   - `client/lib/aggo-pages.ts` helper to map page slugs to content and `client/public/page/` folder for static mirrors.
 - Generate VS Code `.vscode/launch.json` entries `Launch Next.js Client`, and a compound `Aggo: UI Dev` to help devs run the frontend with a single click.
 - Add `aggo.sync.pages` command to go through `client/public/page/` and scaffold corresponding `client/app` routes if the routes is not yet generated, and use PageRender to render the page..
 - Add `aggo.sync.pages` command to go through `client/public/page/` and scaffold corresponding `client/app` routes if the routes is not yet generated, and use PageRender to render the page. Support CLI/command options `--force` and `--index`.
 - Tests: verify the UI starts and can fetch sample data from the backend API (e.g. `GET /health`) and that `aggo.sync.pages` updates the UI page content.
 - Implementation notes: `Aggo: Init Frontend` will set up Tailwind config, include shadcn components under `client/components/ui` and add any additional client helpers.
 - Tests (detailed):
 - Output: `aggo.init.frontend` expects a Next.js app and will create or add the following pieces in `client/` if missing:
   - Next.js project with TypeScript (App Router): `client/app/*`
   - Tailwind and shadcn configuration (tailwind.config.js, shadcn starter)
   - `client/components/ui/*` shadcn starter components
   - `client/components/PageRenderer.tsx` and `client/lib/aggo-pages.ts`
   - `client/public/page/`
   - `client/app/demo/health/page.tsx` demonstration page for BE/FE verification
 - Tests: Frontend unit tests: confirm `pnpm dev` starts; integration test validates the demo health page communicates with the backend.
   - Unit: ensure generated `client/` files exist and package.json scripts run.
  - Integration: create the backend using your Go scaffold tooling (e.g., `cookiecutter-golang`), run `Aggo: Init Backend` (`aggo.init.backend`) to add Aggo wiring, create a Next.js client via `npx create-next-app`, run `Aggo: Init Frontend` to add PageRenderer, run `aggo.sync.pages` and start the Next.js client. Validate that `http://localhost:3000/demo/health` displays backend API output and UI uses `PageRenderer` entries created by the sync command.

PR 2 — GraphQL generator + resolvers (in progress / partial)
- Integrate `gqlgen` approach for GraphQL generation in scaffolded `cmd/aggo-main` project. (planned)
- Implement `aggo.graphql.generate` command (TypeScript extension): read `aggo.yaml`, produce `schema.graphql`, and create `src/handlers` resolvers. A basic command exists (concatenates `resources/graphql/*.graphql` into `cmd/aggo-main/schema.graphql`) and a resolver stub is created in `src/handlers/resolver.go`.
- Pending: wire generated resolvers to runtime (call `runtime.NewCase` / `ExecuteTransition`), add validation using `resources/schema/*.schema`, and optionally execute `gqlgen` to generate typed resolvers in Go automatically.
- Tests: run `go test ./...` on the generated files & a quick `httptest` resolver test; add an E2E test that starts the dev server and triggers `createCase` mutation.
 - Tests: run `go test ./...` on the generated files & a quick `httptest` resolver test; add an E2E test that starts the backend dev server and the Next.js client (if present) and triggers `createCase` mutation via a direct GraphQL request or via the UI to confirm the client-backend integration.

PR 3 — Script generator (`gen`) & starter `inscript` files
- Implement a generator module that reads `resources/cpn/*.cpn` and produces `src/gen/cpn_scripts/*` signatures and `src/gen/registration.go`.
- Optionally create `src/inscript/<workflow-id>/` starter files for developer code with `OnTransition_<Name>` function signatures.
- Implement `Aggo: Generate script stubs` & `Aggo: Regenerate CPN stubs` commands.
- Tests: unit tests for generator and exported `gen_meta.json` mapping.
 - Tests: unit tests for generator and exported `gen_meta.json` mapping, plus a SIT validation that runs backend and UI dev servers and verifies that generated `src/gen` and `src/inscript` do not break the UI page rendering or the runtime when executing a flow created by the UI.
PR 3 — Script generator (`gen`) & starter `inscript` files (planned / partial)
 - Implement a generator module that reads `resources/cpn/*.cpn` and produces `src/gen/cpn_scripts/*` signatures and `src/gen/registration.go`.
 - Optionally create `src/inscript/<workflow-id>/` starter files for developer code with `OnTransition_<Name>` function signatures.
 - Implement `Aggo: Generate script stubs` & `Aggo: Regenerate CPN stubs` commands.
 - Tests: unit tests for generator and exported `gen_meta.json` mapping.
 - Progress notes: initial scaffolding for generator exists in `src/commands/graphqlGenerate.ts` and scaffolder templates. The generator needs wiring to parse `resources/cpn/*.cpn` and produce `src/gen` output; this remains work for PR3.

PR 3b — Optional: (reserved for follow-ups if needed)
 - Keep this reserved for future optional client follow-up tasks such as: supporting App Router vs Pages Router variants, adding more sophisticated client-side GraphQL schema syncing, adding SSR/SSG or incremental page generation, and advanced preview features.
 - Tests: add a client scaffolding unit test verifying files exist and route mapping works for `client/public/page` examples.

PR 4 — CPN editor integration (Open script) & UX improvements
- Add an editor webview UI control that triggers `aggo.openScript` for a transition or inscription.
- Implement `aggo.openScript` command to create/ open `src/inscript/<workflowID>/<transitionID>_<scriptID>.go` file and jump to method location.
- Tests: extension integration test using VSCode test runner + sample cpn file to open script and verify file created.
 - Progress notes: `aggo.openScript` and `aggo.generateStubs` command skeletons are partially implemented, but the webview control and full integration remain to complete the editor workflow.

PR 5 — Runtime lib + local execution & Yaegi integration
- Implement `src/runtime` with `NewLocalRuntime`, `RegisterHandler`, `ExecuteTransition`, and `NewCase` wrappers.
- Add a minimal interpreter shim that uses Yaegi to interpret `src/inscript` code at runtime in dev mode (dev-only configurable).
- Tests: go unit tests: register a handler, call execute, verify outcome; local integration test that spins up `cmd/aggo-main` server and hits GraphQL mutation.
 - Update `cmd/aggo-main` to optionally serve `client/public/page` via a dynamic endpoint (e.g., `GET /__aggo/pages/<path>.json`) to be consumed by the Next.js client during dev.

PR 6 — Package & publish to remote runtime
- Implementation of `aggo.publish` command in the extension: packages `resources/cpn`, `src/gen`, `src/inscript` (if source) and a `meta.json` and uploads to runtime endpoint via POST.
- Add CLI fallback: `aggo publish --api-key --endpoint`.
- Tests: SIT style, mock runtime server to accept artifact and confirm response.

PR 7 — CI & tests integration
- Add `scripts/test/unit-test.sh`, `scripts/test/sit-test.sh` and ensure they run in CI.
- Add GitHub workflows that run the unit tests and the SIT script against a local dev server.
 - Progress notes: `scripts/test/unit-test.sh` and `scripts/sit/sit-test.sh` templates exist in the repo; add GitHub Actions workflows and hook them to the PR pipeline. Add checks for `pnpm`, `go` versions and add `jq` for SIT parsing.
 - Add a CI step to ensure `client/public/page` is present, then run Next.js `pnpm dev` or build+serve for SIT tests.
 - Update: Since the Next.js client scaffolding is now included in PR1b, ensure the CI step verifies `client/public/page` and runs `aggo.sync.pages` to generate any missing routes, then runs the Next.js live build in SIT jobs when `client/` is present.

---

## Unit Test Plan & Script

Purpose: run unit tests for the Go runtime, Go generator, GraphQL resolvers and extension TS code.

Location: `scripts/test/unit-test.sh`

Contents (this file is a sample bash script; place it in the repo under `scripts/test/`):

```bash
#!/bin/bash
set -euo pipefail

echo "Running TypeScript lint & tests..."
pnpm install --frozen-lockfile
pnpm run -s build
pnpm run -s test || { echo "TS tests failed"; exit 1; }

echo "Running go unit tests..."
GOMODCACHE=$(go env GOMODCACHE)
echo "Go module cache: $GOMODCACHE"
# Run all unit tests in repo
go test ./... || { echo "Go tests failed"; exit 1; }

echo "All unit tests passed"

exit 0
```

Notes:
- The script uses `pnpm` for extension TypeScript tests and `go test` for Go tests.
- Add `go.mod` at repo root where needed for tests to work. `go test ./...` will recursively run tests.

Unit test examples to create (Go):
- `src/runtime/runtime_test.go` — tests `RegisterHandler`, `ExecuteTransition` invoking a bound function.
- `src/gen/gen_test.go` — tests generator: given a simple cpn file it generates `src/gen` signature files and correct `gen_meta.json`.

Example test for `runtime/runtime_test.go` (sketch):

```go
package runtime_test

import (
    "context"
    "testing"
    rt "github.com/haymant/aggo/runtime"
)

func TestRegisterAndExecute(t *testing.T) {
    r := rt.NewLocalRuntime() // constructor under src/runtime
    called := false
    r.RegisterHandler("test", "action", func(ctx context.Context, payload map[string]any)(map[string]any, error){
        called = true
        return map[string]any{"ok": true}, nil
    })
    res, err := r.ExecuteTransition(context.Background(), "case-1", "action", map[string]any{})
    if err != nil { t.Fatalf("ExecuteTransition error: %v", err) }
    if res["ok"] != true { t.Fatalf("Expected true, got %#v", res) }
    if !called { t.Fatal("handler wasn't called") }
}
```

---

## SIT (System Integration Test) Plan & Script

Purpose: provide a simple, repeatable script to start a local dev server and then trigger graphQL operations via `curl` — e.g., create a case instance and validate system behavior.

Location: `scripts/sit/sit-test.sh`

Assumes: `go` runtime dependencies are available and `cmd/aggo-main` is runnable, or there's a `make dev`/`scripts/dev` command to run a dev server.

Contents (sample):

```bash
#!/bin/bash
set -euo pipefail

PORT=8080
SERVER_CMD="go run ./cmd/aggo-main"

echo "Starting server in background..."
# Start the server in background (or use ./scripts/dev.sh with proper env vars)
$SERVER_CMD &
SERVER_PID=$!

echo "PID: $SERVER_PID"
trap "echo 'Stopping server ($SERVER_PID)'; kill $SERVER_PID" EXIT

echo "Waiting for server to be ready..."
for i in {1..20}; do
  if curl -s "http://localhost:$PORT/" | jq -e . >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Server should be ready. Running SIT checks..."
GRAPHQL_ENDPT="http://localhost:$PORT/query"

MUTATION='mutation CreateOrder($input:CreateOrderInput!){ createOrder(input:$input){ caseId status }}'
VARIABLES='{"input":{"customerId":"c1","items": [{"id":"i1","qty":1}]}}'

echo "Performing createOrder mutation..."
RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "{\"query\":\"$MUTATION\",\"variables\":$VARIABLES}" $GRAPHQL_ENDPT)
echo "Mutation response: $RESPONSE"

CASE_ID=$(echo "$RESPONSE" | jq -r '.data.createOrder.caseId')
if [[ -z "$CASE_ID" || "$CASE_ID" == "null" ]]; then
  echo "Failure: caseId is empty; response $RESPONSE"; exit 1
fi

echo "Case created: $CASE_ID"

echo "Querying case state (if available)"
Q='query GetCase($caseId: String!){ case(caseId:$caseId){ id status }}'
VAR='{"caseId":"'$CASE_ID'"}'
RESPONSE2=$(curl -s -X POST -H "Content-Type: application/json" -d "{\"query\":\"$Q\",\"variables\":$VAR}" $GRAPHQL_ENDPT)
echo "Case query response: $RESPONSE2"

echo "SIT checks complete"

exit 0
```

Notes & Safety
- The `SIT` script runs a dev server as a background process — ensure the dev server supports running in a deterministic environment. Alternatively, CI can use a separate container for the server.
- These scripts use `jq` to parse `curl` JSON results — install `jq` in CI runner.

---

## Quick `aggo publish` test (SIT):

```bash
#!/bin/bash
set -euo pipefail
AGGO_API="https://aggo-runtime.example.com/api/v1/upload"
API_KEY="$AGGO_RUNTIME_TOKEN"
TARBALL=aggo-artifact.zip

echo "Building package for publish..."
zip -r $TARBALL resources/cpn resources/graphql resources/schema src/inscript src/gen meta.json

echo "Uploading to runtime..."
curl -s -X POST -H "Authorization: Bearer $API_KEY" -F "file=@$TARBALL" $AGGO_API | jq -r .

```

---

## CI Integration & Recommendations
- Add `scripts/test/unit-test.sh` and `scripts/sit/sit-test.sh` to GitHub Actions workflows.
- Matrix runs: Node & Go unit tests; SIT against local dev server; and a publish test that uploads to a test upload endpoint.
- Add a `run-dev` script that runs `go build` and starts the server in CI; SIT job should depend on server being ready.
 - In CI: when `client/` is present or a Next.js app is expected, ensure `client/public/page` is present (or generate the client using a standard scaffold tool during the job), run `Aggo: Init Frontend` (if needed) and `aggo.sync.pages` before starting the Next.js dev server or building the client for SIT tests.
 - Update SIT to ensure both backend (initialized via `Aggo: Init Backend` or existing Go scaffold) and frontend (initialized via `Aggo: Init Frontend` or existing Next.js scaffold) are started by the job and that FE/BE integration tests run: test the demo health page and GraphQL/REST endpoints via the UI.

---

## Next steps
- If you want, I can implement minimal `aggo.init.backend` and `aggo.init.frontend` commands and the `aggo.openScript` and `aggo.generateStubs` commands for review in a PR.
- I can also create the `scripts/test/unit-test.sh`, `scripts/sit/sit-test.sh` files in the repo and add a GitHub Actions job to execute them.

---

## Implemented so far (high level)
- `src/commands/scaffold.ts` — scaffolding command implementation (creates `aggo.yaml`, scaffold tree and templates).
- `src/utils/aggoConfig.ts` — `aggo.yaml` parsing & utility functions.
- `src/commands/graphqlGenerate.ts` — GraphQL generator: concat `resources/graphql` into `cmd/aggo-main/schema.graphql` and create resolver stub skeletons.
- `src/extension.ts` — register extension commands (scaffold, graphql.generate, etc.).
- `scripts/templates/` — scaffold templates for `go` and `resources`.
- `tmp/1.graphql` — sample GraphQL schema for the RFQ/Quote/Order example.
- `scripts/test/unit-test.sh` and `scripts/sit/sit-test.sh` — sample test scripts and SIT runner.

These files were added/updated during the PR1/PR2 work; the next tasks are wiring generator outputs to runtime, completing `src/gen` generation, and adding the optional Next.js client scaffolder detailed above.
