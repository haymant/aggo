import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { pageIdFromFsPath, pageUrlFromId } from '../utils/pagePath';
import { detectPackageManager, buildRunScriptCommand } from '../utils/packageManager';
import { buildChromeLaunchConfig } from '../utils/debugConfig';
import { AGGO_GENERATED_TAG, isAggoGeneratedFile, routeDirForPageId } from '../utils/nextjsCodegen';
import { extractLocalhostBaseUrl } from '../utils/runtimeBaseUrl';
import { computeSchemaPathLiteral, upsertResolverRegion } from '../utils/graphqlResolverScaffold';
import { pnmlYamlToCpnGraph, applyLayoutToPnmlYaml } from '../utils/pnmlGraph';
import { OpenAiCompatProxyServer } from '../llm/openaiCompatProxyServer';
import { buildChatCompletionResponse, toLmMessages, toOpenAiToolCalls } from '../llm/openaiProxyMapper';
import { LmProxyHost, ModelInfo, OpenAiChatCompletionRequest, ProxyChatResult, ProxyStreamEvent } from '../llm/openaiProxyTypes';

function testPageIdFromFsPath() {
  const root = '/ws';
  const p = '/ws/resources/page/rfq/view.page';
  assert.equal(pageIdFromFsPath(root, p), 'rfq/view');
}

function testPageUrlFromId() {
  assert.equal(pageUrlFromId('http://localhost:5173', 'rfq/view'), 'http://localhost:5173/aggo/page/rfq/view');
  assert.equal(pageUrlFromId('http://localhost:5173/', '/rfq/view'), 'http://localhost:5173/aggo/page/rfq/view');
}

function testDetectPackageManager() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aggo-test-'));
  try {
    assert.equal(detectPackageManager(tmp), 'npm');
    fs.writeFileSync(path.join(tmp, 'pnpm-lock.yaml'), '');
    assert.equal(detectPackageManager(tmp), 'pnpm');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testBuildRunScriptCommand() {
  assert.deepEqual(buildRunScriptCommand('pnpm', 'dev'), { command: 'pnpm', args: ['run', 'dev'] });
  assert.deepEqual(buildRunScriptCommand('yarn', 'dev'), { command: 'yarn', args: ['run', 'dev'] });
  assert.deepEqual(buildRunScriptCommand('npm', 'dev'), { command: 'npm', args: ['run', 'dev'] });
}

function testBuildDebugConfig() {
  const cfg = buildChromeLaunchConfig({ url: 'http://localhost:5173/aggo/page/rfq/view' });
  assert.equal(cfg.type, 'pwa-chrome');
  assert.equal(cfg.request, 'launch');
  assert.equal(cfg.url, 'http://localhost:5173/aggo/page/rfq/view');
}

function testNextjsCodegenHelpers() {
  assert.equal(isAggoGeneratedFile(`// ${AGGO_GENERATED_TAG}\nexport const x = 1;`), true);
  assert.equal(isAggoGeneratedFile('export const x = 1;'), false);
  assert.equal(routeDirForPageId('/rt/src/app', 'rfq/view').split(path.sep).join('/'), '/rt/src/app/aggo/page/rfq/view');
}

function testRuntimeBaseUrlExtraction() {
  assert.equal(extractLocalhostBaseUrl('Local:   http://localhost:5173/'), 'http://localhost:5173');
  assert.equal(extractLocalhostBaseUrl('ready - started server on 0.0.0.0:3000, url: http://localhost:3000'), 'http://localhost:3000');
  assert.equal(extractLocalhostBaseUrl('http://127.0.0.1:4001'), 'http://127.0.0.1:4001');
  assert.equal(extractLocalhostBaseUrl('no url here'), undefined);
}

function testGraphqlResolverScaffoldCreate() {
  const { updated, changed } = upsertResolverRegion('', ['User.me', 'Query.ping']);
  assert.equal(changed, true);
  assert.ok(updated.includes('export const resolverRegistry'));
  assert.ok(updated.includes('User.me'));
  assert.ok(updated.includes('Query.ping'));
}

function testGraphqlResolverScaffoldUpsertRegionOnly() {
  const existing = [
    '// some header',
    'const keep = true;',
    `// ${AGGO_GENERATED_TAG}-graphql-resolvers-start`,
    '  "Old.one": async () => null,',
    `// ${AGGO_GENERATED_TAG}-graphql-resolvers-end`,
    'export const tail = 123;',
  ].join('\n');

  const { updated, changed } = upsertResolverRegion(existing, ['New.two']);
  assert.equal(changed, true);
  assert.ok(updated.includes('const keep = true;'));
  assert.ok(updated.includes('export const tail = 123;'));
  assert.ok(updated.includes('New.two'));
  assert.ok(!updated.includes('Old.one'));
}

function testGraphqlSchemaPathLiteral() {
  const lit = computeSchemaPathLiteral({
    runtimeRootAbs: '/repo/runtime',
    schemaFsPath: '/repo/runtime/src/schema.graphql',
  });
  assert.equal(lit, './src/schema.graphql');
}

function testPnmlYamlToCpnGraphBasic() {
  const yaml = [
    'pnml:',
    '  net:',
    '    - id: demo',
    '      type: https://evolve.dev/pnml/hlpn/evolve-2009',
    '      page:',
    '        - id: page1',
    '          place:',
    '            - id: p1',
    '              name: { text: Start }',
    '          transition:',
    '            - id: t1',
    '              name: { text: DoThing }',
    '              evolve: { kind: manual }',
    '          arc:',
    '            - id: a1',
    '              source: p1',
    '              target: t1',
  ].join('\n');

  const graph = pnmlYamlToCpnGraph(yaml);
  assert.ok(Array.isArray(graph.nodes));
  assert.ok(Array.isArray(graph.edges));
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 1);
  const p1 = graph.nodes.find(n => n.id === 'p1');
  const t1 = graph.nodes.find(n => n.id === 't1');
  assert.ok(p1);
  assert.ok(t1);
  assert.equal((t1 as any).data?.tType, 'manual');
}

function testApplyLayoutToPnmlYamlAddsGraphicsPositions() {
  // No graphics in input.
  const yaml = [
    'pnml:',
    '  net:',
    '    - id: demo',
    '      type: https://evolve.dev/pnml/hlpn/evolve-2009',
    '      page:',
    '        - id: page1',
    '          place:',
    '            - id: p1',
    '              name: { text: Start }',
    '          transition:',
    '            - id: t1',
    '              name: { text: DoThing }',
  ].join('\n');

  const next = applyLayoutToPnmlYaml(yaml, [
    { id: 'p1', type: 'place', position: { x: 10, y: 20 } },
    { id: 't1', type: 'transition', position: { x: 30, y: 40 } },
  ]);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jsyaml = require('js-yaml');
  const parsed = jsyaml.load(next);
  const page = parsed?.pnml?.net?.[0]?.page?.[0];
  const p1 = page?.place?.find((p: any) => p?.id === 'p1');
  const t1 = page?.transition?.find((t: any) => t?.id === 't1');
  assert.equal(p1.graphics.position.x, 10);
  assert.equal(p1.graphics.position.y, 20);
  assert.equal(t1.graphics.position.x, 30);
  assert.equal(t1.graphics.position.y, 40);
}

function testProxyMapperMessageMapping() {
  const mapped = toLmMessages([
    { role: 'system', content: 'rules' },
    { role: 'user', content: 'hello' },
    { role: 'tool', content: '{"ok":true}', tool_call_id: 'abc' }
  ]);
  assert.equal(mapped.length, 3);
  assert.equal(mapped[0].role, 'system');
  assert.equal(mapped[1].content, 'hello');
  assert.ok(mapped[2].content.includes('tool_call_id=abc'));
}

function testProxyMapperToolCalls() {
  const mapped = toOpenAiToolCalls([
    { id: 't1', name: 'readFile', arguments: '{"path":"a.ts"}' }
  ]);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].id, 't1');
  assert.equal(mapped[0].function.name, 'readFile');

  const response = buildChatCompletionResponse({
    id: 'chatcmpl-1',
    model: 'gpt-4o',
    content: '',
    toolCalls: [{ id: 't1', name: 'readFile', arguments: '{}' }]
  });
  assert.equal(response.choices[0].finish_reason, 'tool_calls');
  assert.ok(Array.isArray((response.choices[0].message as any).tool_calls));
}

class FakeLmHost implements LmProxyHost {
  public models: ModelInfo[];
  public throwOnComplete: Error | undefined;

  constructor(models: ModelInfo[] = [{ id: 'gpt-4o', object: 'model', owned_by: 'copilot' }]) {
    this.models = models;
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.models;
  }

  async complete(request: OpenAiChatCompletionRequest): Promise<ProxyChatResult> {
    if (this.throwOnComplete) throw this.throwOnComplete;
    const model = request.model ?? this.models[0]?.id ?? 'gpt-4o';

    if (request.function_call && (request as any).function_call.name) {
      const name = (request as any).function_call.name;
      return {
        model,
        content: '',
        toolCalls: [
          { id: 'call_1', name, arguments: JSON.stringify({ path: 'README.md', url: 'https://example.com' }) }
        ],
        finishReason: 'tool_calls'
      };
    }

    if (request.tools?.length) {
      return {
        model,
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            name: request.tools[0].function.name,
            arguments: JSON.stringify({ path: 'README.md' })
          }
        ],
        finishReason: 'tool_calls'
      };
    }

    const userText = request.messages?.filter((m) => m.role === 'user').map((m) => m.content ?? '').join(' ') ?? '';
    return {
      model,
      content: `echo:${userText}`,
      finishReason: 'stop'
    };
  }

  async *streamComplete(request: OpenAiChatCompletionRequest): AsyncIterable<ProxyStreamEvent> {
    const model = request.model ?? this.models[0]?.id ?? 'gpt-4o';
    yield { delta: `model:${model}|` };
    yield { delta: 'chunk-1|' };
    yield { delta: 'chunk-2', finishReason: 'stop' };
  }

  // Test-only: simulate host-registered LM tools (e.g. `web` / `search`)
  async listTools(): Promise<any[]> {
    return [
      {
        type: 'function',
        function: {
          name: 'web',
          description: 'Fetch or search a public web page',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              query: { type: 'string' }
            },
            required: ['url']
          }
        }
      }
    ];
  }

  // Test-only: execute a named tool. Support `readFile` for tests.
  async executeTool(name: string, args: any): Promise<any> {
    if (name === 'readFile') {
      const p = String((args && args.path) || 'README.md');
      const fs = require('fs');
      const text = fs.readFileSync(p, 'utf8');
      return { status: 200, body: text };
    }
    throw new Error(`tool not implemented: ${name}`);
  }
}

async function startTestProxy(apiKeys: string[] = ['secret']) {
  const host = new FakeLmHost();
  const server = new OpenAiCompatProxyServer({
    port: 0,
    apiKeys,
    lmHost: host,
    logger: console
  });
  const port = await server.start();
  return { server, host, port };
}

async function testProxyAuthInvalidKey() {
  const { server, port } = await startTestProxy(['secret']);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
      headers: { Authorization: 'Bearer wrong' }
    });
    assert.equal(res.status, 401);
  } finally {
    await server.stop();
  }
}

async function testProxyModelList() {
  const { server, port } = await startTestProxy(['secret']);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
      headers: { Authorization: 'Bearer secret' }
    });
    assert.equal(res.status, 200);
    const json = await res.json() as any;
    assert.equal(json.object, 'list');
    assert.equal(json.data[0].id, 'gpt-4o');
  } finally {
    await server.stop();
  }
}

async function testProxyToolsEndpoint() {
  const { server, port } = await startTestProxy(['secret']);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/tools`, {
      headers: { Authorization: 'Bearer secret' }
    });
    assert.equal(res.status, 200);
    const json = await res.json() as any;
    assert.ok(Array.isArray(json.tools));
    const names = json.tools.map((t: any) => t?.function?.name).filter(Boolean);
    // host-provided tool (FakeLmHost.listTools). proxy no longer advertises `fetchWebPage`.
    assert.ok(names.includes('web'));
    assert.ok(!names.includes('fetchWebPage'));
  } finally {
    await server.stop();
  }
}

async function testProxyExecuteToolEndpoint() {
  const { server, port, host } = await startTestProxy(['secret']);
  try {
    // 1) Simulate a chat completion that returns a tool call (readFile)
    const callRes = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'use a tool' }],
        tools: [
          { type: 'function', function: { name: 'readFile', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }
        ]
      })
    });
    assert.equal(callRes.status, 200);
    const callJson = await callRes.json() as any;
    const toolCall = (callJson.choices[0].message as any).tool_calls[0];
    const args = JSON.parse(toolCall.function.arguments);

    // 2) Ask proxy to execute the tool call on behalf of the client
    const execRes = await fetch(`http://127.0.0.1:${port}/v1/tool_calls`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: toolCall.id, name: toolCall.function.name, arguments: args })
    });
    assert.equal(execRes.status, 200);
    const execJson = await execRes.json() as any;
    assert.ok(execJson.result);
    assert.ok(typeof execJson.result.body === 'string');
    assert.ok(execJson.result.body.includes('#'));
  } finally {
    await server.stop();
  }
}

async function testProxyErrorModelUnavailable() {
  const host = new FakeLmHost([{ id: 'gpt-4o' }]);
  host.throwOnComplete = new Error('Model not found: nope');
  const server = new OpenAiCompatProxyServer({
    port: 0,
    apiKeys: ['secret'],
    lmHost: host,
    logger: console
  });
  const port = await server.start();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'nope',
        messages: [{ role: 'user', content: 'hello' }]
      })
    });
    assert.equal(res.status, 404);
  } finally {
    await server.stop();
  }
}

async function testProxyBasicChat() {
  const { server, port } = await startTestProxy(['secret']);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi there' }]
      })
    });
    assert.equal(res.status, 200);
    const json = await res.json() as any;
    assert.equal(json.choices[0].message.content, 'echo:hi there');
  } finally {
    await server.stop();
  }
}

async function testProxyStreaming() {
  const { server, port } = await startTestProxy(['secret']);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        stream: true,
        messages: [{ role: 'user', content: 'stream' }]
      })
    });
    assert.equal(res.status, 200);

    const text = await res.text();
    assert.ok(text.includes('chat.completion.chunk'));
    assert.ok(text.includes('[DONE]'));
    assert.ok(text.includes('chunk-1|'));
  } finally {
    await server.stop();
  }
}

async function testProxyToolFlow() {
  const { server, port } = await startTestProxy(['secret']);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'use a tool' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'readFile',
              parameters: {
                type: 'object',
                properties: { path: { type: 'string' } }
              }
            }
          }
        ]
      })
    });
    assert.equal(res.status, 200);
    const json = await res.json() as any;
    assert.equal(json.choices[0].finish_reason, 'tool_calls');
    assert.equal(json.choices[0].message.tool_calls[0].function.name, 'readFile');

    // Now test explicit function_call hint causes LM (FakeLmHost) to return a tool call too
    const res2 = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        function_call: { name: 'readFile' },
        messages: [{ role: 'user', content: 'please read README' }]
      })
    });
    assert.equal(res2.status, 200);
    const json2 = await res2.json() as any;
    assert.equal(json2.choices[0].finish_reason, 'tool_calls');
    assert.equal(json2.choices[0].message.tool_calls[0].function.name, 'readFile');
  } finally {
    await server.stop();
  }
}

async function testProxyInvalidToolSchema() {
  const { server, port } = await startTestProxy(['secret']);
  try {
    // invalid: function.name must be a string
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'try invalid tool' }],
        tools: [ { type: 'function', function: { name: 123 } } ]
      })
    });
    assert.equal(res.status, 400);
    const json = await res.json() as any;
    assert.ok(json.error.message.includes('function.name'));
  } finally {
    await server.stop();
  }
}

function testOpenAiToolsToLmTools() {
  const openAiTool = {
    type: 'function',
    function: {
      name: 'fetchWebPage',
      description: 'Fetch HTML',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }
    }
  };
  const mapper = require('../llm/openaiProxyMapper').openAiToolsToLmTools;
  const mapped = mapper([openAiTool]);
  assert.ok(mapped && mapped.length === 1);
  assert.equal(mapped[0].name, 'fetchWebPage');
  assert.equal(mapped[0].description, 'Fetch HTML');
  assert.ok(mapped[0].inputSchema && mapped[0].inputSchema.properties);
}

async function main() {
  const tests: Array<[string, () => void | Promise<void>]> = [
    ['pageIdFromFsPath', testPageIdFromFsPath],
    ['pageUrlFromId', testPageUrlFromId],
    ['detectPackageManager', testDetectPackageManager],
    ['buildRunScriptCommand', testBuildRunScriptCommand],
    ['buildChromeLaunchConfig', testBuildDebugConfig],
    ['nextjsCodegenHelpers', testNextjsCodegenHelpers],
    ['runtimeBaseUrlExtraction', testRuntimeBaseUrlExtraction],
    ['graphqlResolverScaffoldCreate', testGraphqlResolverScaffoldCreate],
    ['graphqlResolverScaffoldUpsertRegionOnly', testGraphqlResolverScaffoldUpsertRegionOnly],
    ['graphqlSchemaPathLiteral', testGraphqlSchemaPathLiteral],
    ['pnmlYamlToCpnGraphBasic', testPnmlYamlToCpnGraphBasic],
    ['applyLayoutToPnmlYamlAddsGraphicsPositions', testApplyLayoutToPnmlYamlAddsGraphicsPositions],
    ['proxyMapperMessageMapping', testProxyMapperMessageMapping],
    ['proxyMapperToolCalls', testProxyMapperToolCalls],
    ['proxyAuthInvalidKey', testProxyAuthInvalidKey],
    ['proxyModelList', testProxyModelList],
    ['proxyToolsEndpoint', testProxyToolsEndpoint],
    ['proxyErrorModelUnavailable', testProxyErrorModelUnavailable],
    ['proxyBasicChat', testProxyBasicChat],
    ['proxyStreaming', testProxyStreaming],
    ['proxyToolFlow', testProxyToolFlow],
    ['proxyExecuteTool', testProxyExecuteToolEndpoint]
  ];

  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      // eslint-disable-next-line no-console
      console.log(`[PASS] ${name}`);
    } catch (err) {
      failed++;
      // eslint-disable-next-line no-console
      console.error(`[FAIL] ${name}:`, err);
    }
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main();
