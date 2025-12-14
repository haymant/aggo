import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { pageIdFromFsPath, pageUrlFromId } from '../utils/pagePath';
import { detectPackageManager, buildRunScriptCommand } from '../utils/packageManager';
import { buildChromeLaunchConfig } from '../utils/debugConfig';
import { AGGO_GENERATED_TAG, isAggoGeneratedFile, routeDirForPageId } from '../utils/nextjsCodegen';

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

function main() {
  const tests: Array<[string, () => void]> = [
    ['pageIdFromFsPath', testPageIdFromFsPath],
    ['pageUrlFromId', testPageUrlFromId],
    ['detectPackageManager', testDetectPackageManager],
    ['buildRunScriptCommand', testBuildRunScriptCommand],
    ['buildChromeLaunchConfig', testBuildDebugConfig],
    ['nextjsCodegenHelpers', testNextjsCodegenHelpers]
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
