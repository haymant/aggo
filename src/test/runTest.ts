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

function main() {
  const tests: Array<[string, () => void]> = [
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
    ['applyLayoutToPnmlYamlAddsGraphicsPositions', testApplyLayoutToPnmlYamlAddsGraphicsPositions]
  ];

  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      fn();
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

main();
