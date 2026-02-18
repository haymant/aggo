### Focused Design for Point 5: OpenAI-Compatible Wrapper for Invisible Aider to Use VS Code LM APIs and Tools

#### Design Overview
The wrapper is a lightweight, local HTTP server running inside the VS Code extension, exposing an OpenAI-compatible API endpoint (e.g., `http://localhost:<configurable-port>/v1`). This allows the invisible Aider process (spawned via `cp.spawn`) to be configured with `--openai-api-base <proxy-url>` and `--openai-api-key <proxy-key>`, treating the proxy as an OpenAI backend. The proxy forwards Aider's requests to VS Code's Language Model (LM) API (`vscode.lm`), using Copilot-provided models (e.g., GPT-4o). It supports function/tool calling by mapping OpenAI's `tools` schema to VS Code's tool system, including MCP tools (VS Code's built-in or registered tools like `@workspace` for file access).

**Key Design Principles**:
- **Compatibility**: Mimic OpenAI's `/v1/chat/completions` and `/v1/models` endpoints (focus on chat completions for Aider's needs). Support streaming (`stream: true`) for real-time responses.
- **Security**: Local-only (bind to `127.0.0.1`). Use configurable API keys for authorization (Aider provides the key in headers).
- **Tool/MCP/Skills Support**: Dynamically pass Aider's `tools` array to `vscode.lm.sendRequest(options.tools)`. Merge with VS Code's registered tools (via `vscode.lm.tools`) for MCP integration. Handle tool calls in responses, letting Aider execute them.
- **State Management**: Stateless per request (Aider handles conversation history via its messages array).
- **Configurability**: Port (default 11200) and keys via VS Code settings. Auto-start/stop with extension lifecycle.
- **Error Handling**: Map VS Code LM errors to OpenAI-style responses (e.g., 429 for rate limits).
- **Performance**: Asynchronous; limit concurrent requests if needed (e.g., queue for LM API).
- **Assumptions**: Aider is configured to use the proxy (e.g., via env vars or flags when spawning). Focus on chat and tools; no vision or embeddings needed for Aider.

**High-Level Architecture**:
- **Server**: Node.js `http` module (or Express for simplicity).
- **Endpoints**:
  - `GET /v1/models`: List Copilot models (e.g., default [{id: "oswe-vscode-prime"}]).
  - `GET /v1/tools`: Discover registered/available tools (returns OpenAI-style `tools`/`function` schemas). Useful for agents (Aider) that dynamically discover which functions the proxy/extension exposes — the response merges proxy-provided tools with `vscode.lm.tools` when applicable (see "Tool discovery" section below).
  - `POST /v1/chat/completions`: Forward messages/tools to `vscode.lm.sendRequest`, return responses/tool calls.
- **Integration with Aider Spawn**: When spawning Aider, pass proxy flags (e.g., `--openai-api-base http://localhost:11200/v1 --openai-api-key proxy-key`).
- **MCP/Tools Flow**: If Aider sends tools (e.g., for file read), proxy maps and uses VS Code tools; model may call them, proxy returns calls for Aider to execute.

| Component | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| HTTP Server | Listens on port, authenticates keys. | Requests from Aider. | Responses to Aider. |
| Model Selector | Uses `vscode.lm.selectChatModels({vendor: 'copilot'})`. | Requested model ID. | Selected LM model. |
| Request Mapper | Converts OpenAI messages/tools to VS Code format. | OpenAI JSON. | LM messages/options. |
| Response Mapper | Converts LM response/toolCalls to OpenAI format. | LM stream/parts. | OpenAI JSON/stream. |

#### Implementation Plan: Epics and Stories Breakdown
Breakdown uses Agile-style epics (high-level features) and user stories (specific, testable tasks). Each story includes tasks, acceptance criteria, and estimated effort (in story points, assuming 1 SP = 2-4 hours).

##### Epic 1: Server Infrastructure (Setup the Proxy Foundation)
- **Goal**: Build and configure the local HTTP server with auth and basic routing.
- **Stories**:
  1. **As an extension developer, I want to start/stop the server via commands/settings so it runs reliably.**
     - Tasks: Add start/stop commands; auto-start on activation if configured; handle port conflicts.
     - Acceptance: Server starts on configured port; logs status; stops cleanly on deactivate.
     - Effort: 3 SP.
  2. **As an extension user, I want to configure port and API keys so Aider can authenticate.**
     - Tasks: Define settings in `package.json`; read via `getConfiguration`; use Set for key lookup.
     - Acceptance: Requests without valid key return 401; changes trigger server restart.
     - Effort: 2 SP.

##### Epic 2: Model Listing and Selection (Enable Aider to Discover Models)
- **Goal**: Implement `/v1/models` for Aider to list/select Copilot models.
- **Stories**:
  1. **As Aider, I want to GET /v1/models to list available Copilot models.**
     - Tasks: Call `vscode.lm.selectChatModels({vendor: 'copilot'})`; map to OpenAI format (id, object).
     - Acceptance: Returns JSON list (e.g., [{id: "gpt-4o"}]); filters if configured.
     - Effort: 2 SP.

##### Epic 3: Chat Completions Proxy (Core Forwarding Logic)
- **Goal**: Handle `/v1/chat/completions` for basic messages and streaming.
- **Stories**:
  1. **As Aider, I want to POST completions for non-tool requests.**
     - Tasks: Parse body; select model; map messages; call `sendRequest`; map response/stream.
     - Acceptance: Returns OpenAI JSON; streaming sends SSE deltas.
     - Effort: 4 SP.
  2. **As the proxy, I want to handle errors gracefully.**
     - Tasks: Catch LM errors; return OpenAI-style codes (e.g., 429 for limits).
     - Acceptance: Invalid model → 404; auth fail → 401.
     - Effort: 1 SP.

##### Epic 4: Tool/Function Calling Support (Enable MCP/Skills)
- **Goal**: Proxy tools from Aider to VS Code LM, including MCP tools.
- **Stories**:
  1. **As Aider, I want to include tools in requests for function calling.**
     - Tasks: Parse `tools` array; map to VS Code `LanguageModelTool[]`; merge with `vscode.lm.tools` (MCP).
     - Acceptance: Aider sends schema → proxy passes to LM; model calls tool → returns in `tool_calls`.
     - Effort: 3 SP.
  2. **As the extension, I want to register default MCP tools for skills.**
     - Tasks: On activation, `vscode.lm.registerTool` for common ones (e.g., readFile, runCommand).
     - Acceptance: Aider can use VS Code tools implicitly.
     - Effort: 2 SP.

##### Epic 5: Testing and Polish
- **Goal**: Ensure reliability with tests.
- **Stories**:
  1. **As a developer, I want unit tests for mapping and error handling.**
     - Tasks: Use Jest/Mocha; mock `vscode.lm`; test request/response transforms.
     - Acceptance: 80% coverage for core functions.
     - Effort: 3 SP.
  2. **As a developer, I want integration tests for end-to-end with Aider.**
     - Tasks: Spawn mock Aider; send requests; verify responses/tools.
     - Acceptance: Full flow passes.
     - Effort: 4 SP.

#### Unit Test Cases (Using Jest; Add to `src/proxy.test.ts`)
- **Mapper Functions**:
  - Test: Map OpenAI messages to LM → Expect correct roles/content.
  - Test: Map LM toolCalls to OpenAI → Expect `tool_calls` array with id/type/function.
- **Auth**:
  - Test: Invalid key → 401 response.
- **Model List**:
  - Test: Mock `selectChatModels` → Returns expected JSON.
- **Error Handling**:
  - Test: No model available → 404 with error message.

#### Integration Test Cases (End-to-End; Use Mocha or Spawn Mock Clients)
- **Basic Chat**: Send POST with messages → Verify response content matches LM output.
- **Streaming**: Send with `stream: true` → Verify SSE deltas arrive incrementally.
- **Tool Flow**: Send with tools → Model calls tool → Response has `tool_calls`; Aider (mock) executes and resends.
- **Aider Spawn Integration**: Spawn Aider with proxy flags → Send prompt via Aider → Verify proxy handles and LM responds.
- **MCP Tool**: Register file-read tool → Aider requests it → LM calls → Proxy returns call for Aider execution.

This plan ensures a robust, focused wrapper. Implement epics sequentially; start with infrastructure. Test early to catch mapping issues.

---

## ✅ Implementation status & quick usage
- Status: core proxy implemented and wired into the extension (model listing, chat completions, streaming SSE, basic tool/function-calling passthrough). Unit + integration tests added and passing.
- Config (settings): `aggo.llmProxy.enabled` (bool), `aggo.llmProxy.port` (number, default 11200), `aggo.llmProxy.apiKeys` (string[] — default empty = no auth).
- Commands: `aggo.startLlmProxy`, `aggo.stopLlmProxy` (available from Command Palette).

### Example — spawn Aider to use proxy
1. Start the proxy (or enable via settings):
   - Command Palette → `Aggo: Start LLM Proxy` or set `aggo.llmProxy.enabled: true`.
2. Spawn Aider configured to use the proxy:
   --openai-api-base http://127.0.0.1:11200/v1 --openai-api-key <proxy-key>

### Example — curl requests
- List available models:

```bash
curl -H "Authorization: Bearer <proxy-key>" http://127.0.0.1:11200/v1/models
```

- Simple (non-streaming) chat completion:

```bash
curl -X POST -H "Authorization: Bearer <proxy-key>" -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Say hi"}]}' \
  http://127.0.0.1:11200/v1/chat/completions
```

- Streaming (SSE) — keep connection open to receive incremental deltas:

```bash
curl -N -H "Authorization: Bearer <proxy-key>" -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","stream":true,"messages":[{"role":"user","content":"stream me"}]}' \
  http://127.0.0.1:11200/v1/chat/completions
```

- Tool/function calling example (proxy will forward the `tools` schema to `vscode.lm`):

```bash
curl -X POST -H "Authorization: Bearer <proxy-key>" -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"read README"}],"tools":[{"type":"function","function":{"name":"readFile","parameters":{"type":"object","properties":{"path":{"type":"string"}}}}}]}' \
  http://127.0.0.1:11200/v1/chat/completions
```

Additional example — fetch a web page via a `fetchWebPage` tool (useful for assistants that need current web content):

Tool schema (sent in `tools` array):

```json
{
  "type": "function",
  "function": {
    "name": "fetchWebPage",
    "description": "Fetch the HTML/text of a public web page and return the body.",
    "parameters": {
      "type": "object",
      "properties": {
        "url": { "type": "string", "description": "URL to fetch" },
        "timeoutMs": { "type": "integer", "description": "Optional timeout in milliseconds" }
      },
      "required": ["url"]
    }
  }
}
```

Example request (proxy forwards schema to `vscode.lm` and the LM may call the tool):

```bash
curl -X POST -H "Authorization: Bearer ollama" -H "Content-Type: application/json" \
  -d '{
    "model":"gpt-5-mini",
    "messages":[{"role":"system","content":"When live web content is required, call the `web` tool, with exactly one function call and nothing else."},{"role":"user","content":"Please fetch the latest online news of SLV ETF."}],
    "tools":[{
  "type": "function",
  "function": {
    "name": "web",
    "description": "Fetch the HTML/text of a public web page online and return the body.",
    "parameters": {
      "type": "object",
      "properties": {
        "url": { "type": "string", "description": "URL to fetch" },
        "timeoutMs": { "type": "integer", "description": "Optional timeout in milliseconds" }
      },
      "required": ["url"]
    }
  }
}]
  }' \
  http://127.0.0.1:11200/v1/chat/completions
```

If the model calls the tool, the proxy will surface a `tool_calls` entry in the choice. Example (simplified) response fragment:

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "tool_calls": [
          {
            "id": "call_1",
            "type": "function",
            "function": {
              "name": "fetchWebPage",
              "arguments": "{\"url\":\"https://github.com/haymant/aggo#readme\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}
```

Security note: treat web-fetching tools as privileged — add an allowlist and per-key permissions before exposing to untrusted agents.

### Tool discovery — `GET /v1/tools` 🔎

- Purpose: return the list of tools/functions the proxy (and any registered MCP tools) exposes, in an OpenAI-style `tools` / `function` schema so agents (like Aider) can discover capabilities before composing prompts.
- When Aider will call it: typically at agent startup or just before sending a tool-enabled request; agents may also call it on-demand after extension activation, or whenever they want a fresh view of available functions (e.g., when user enables/disables features).
- Response shape: an object with a `tools` array (OpenAI `type:function` + `function` JSON Schema). The proxy merges its own allowed tools with `vscode.lm.tools` where appropriate.
- Caching & freshness: clients should cache results (TTL e.g. 30–60s). Support a client header (e.g. `x-proxy-refresh: true`) to force refresh when needed.
- Security: the endpoint requires the same API key/auth as other endpoints and obeys per-key tool allowlists when implemented.

Example request:

```bash
curl -H "Authorization: Bearer <proxy-key>" http://127.0.0.1:11200/v1/tools
```

Example response (simplified):

```json
{
  "tools": [
    { "type":"function","function":{"name":"readFile","description":"Read a file from the workspace","parameters":{...}}},
    { "type":"function","function":{"name":"fetchWebPage","description":"Fetch a public web page","parameters":{...}}}
  ]
}
```

Tests / acceptance criteria:
- Unit: `GET /v1/tools` returns registered `vscode.lm.tools` plus proxy-provided tools when allowed.
- Integration: Aider (or a mock agent) calls `/v1/tools` at startup and includes selected functions in a subsequent `chat.completions` request.

### Why implement `fetchWebPage` in the extension? 🧭

**Short answer:** VS Code does not provide a generic "fetch web page" LM tool out of the box. Implementing `fetchWebPage` inside the extension gives us a secure, auditable, and centrally-controlled capability for agents to request live web content.

Key reasons to implement it in the extension:
- **Security & control** — the extension can enforce domain allowlists, per-key permissions, timeouts, max-response-size, content-type checks and HTML-to-text extraction before returning results to the model.
- **Predictability** — a single implementation ensures the proxy always returns the same schema/results (no agent-side variability).
- **Observability & auditing** — the extension can log, cache and redact sensitive content and apply rate-limits.

Alternatives and trade-offs:
- Let Aider (agent process) implement `fetchWebPage` itself — this is possible, but it pushes network permissions and auditing outside of VS Code and reduces central control.
- Use an external web-fetch microservice — adds infra and trust boundaries.

Recommended implementation constraints (acceptance criteria):
- Enforce domain allowlist and/or per-key permission for `fetchWebPage` execution.
- Enforce timeout (e.g. 5s) and response-size limit (e.g. 1MB); return a clear error if exceeded.
- Strip scripts and return a sanitized text/html snippet or plain text summary for model consumption.
- Add unit/e2e tests that verify allowlist, timeout and size-limit behavior.

When to let the agent perform the fetch instead:
- If you trust the agent runtime and want the network call performed outside the editor (and you accept the auditing/permission trade-offs), let Aider register and execute its own `fetchWebPage` tool — the proxy should still support `GET /v1/tools` so the model can discover which tool implementations exist.

---

## 🔐 Security & secrets (important)
- Binding: proxy binds to `127.0.0.1` only — it is local-only by design.
- Authentication: the extension currently supports an `aggo.llmProxy.apiKeys` setting (array of allowed keys). If the array is non-empty the proxy requires `Authorization: Bearer <key>` or `X-API-Key: <key>`.
- Recommendation: do **not** add long-lived secrets to workspace settings in plain text; prefer storing/manage keys via VS Code `SecretStorage` (future improvement).
- Acceptance criteria (implemented): requests without a valid key → HTTP 401 (OpenAI-style error body).

---

## 🔁 Streaming & cancellation
- Streaming: supports SSE-style streaming when client sends `stream: true`; the server emits OpenAI-compatible `chat.completion.chunk` events followed by `data: [DONE]`.
- Cancellation: client disconnects are propagated as Abort/Cancellation to `vscode.lm` so in-flight LM requests are cancelled promptly.
- Acceptance criteria (implemented): `stream: true` returns incremental SSE deltas; client close aborts LM request.

---

## ⚠️ Tool/function calling & permissions
- Current behaviour: `tools` array included in the incoming request is forwarded to `vscode.lm` (merged with any registered MCP tools). When the LM issues a tool call the proxy returns it in `choices[0].message.tool_calls` (OpenAI-style).
- Security note: the implementation currently passes tool schemas through and **does not** enforce an allowlist. Treat this as high-risk if exposing to untrusted agents.
- TODO (recommended): implement explicit tool validation / allowlist and per-key permissions. If a disallowed tool is requested the proxy should return 403.

---

## 📛 Error mapping (OpenAI-style)
- Implemented mappings (examples):
  - Invalid/missing API key → 401 (authentication_error)
  - Model not found → 404 (invalid_request_error, code: model_not_found)
  - Rate-limited LM errors → 429 (rate_limit_error)
  - Malformed request → 400 (invalid_request_error)
  - Internal failures → 500 (server_error)

---

## 🧪 Tests & acceptance criteria
- New tests added to the extension test runner (`src/test/runTest.ts`):
  - Mapper tests: OpenAI→LM message mapping, tool-calls mapping.
  - Auth tests: invalid key → 401.
  - Models endpoint: GET `/v1/models` returns list.
  - Chat flow: POST `/v1/chat/completions` (sync + streaming).
  - Tool flow: tool schema forwarded and LM tool call returned.
- How to run: `pnpm run build` then `node ./out/test/runTest.js` (existing project test runner).
- Acceptance: all added tests must pass (they currently do in CI/local dev).

---

## 🔭 Future work / non-blocking improvements
- Move API key storage to `vscode.SecretStorage` and provide runtime key rotation UI.
- Add explicit tool allowlist and per-key permissions for file/CLI operations.
- Add observability: `/health` endpoint, metrics, and optional telemetry (with opt-in and redaction).
- Add admin UI to view active sessions and rotate keys.

---

If you want, I can (pick one):
1. Move `apiKeys` into `SecretStorage` and migrate settings → SecretStorage (recommended). 
2. Add an allowlist/permission model for tools and tests for it. 
3. Add a short 