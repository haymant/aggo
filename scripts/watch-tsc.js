#!/usr/bin/env node

/*
  Cross-platform TypeScript watch runner.
  - Watches the extension TypeScript project (./tsconfig.json)
  - Watches @aggo/core (packages/core/tsconfig.json)

  This keeps packages/core/dist up to date during development so the webview
  (which imports @aggo/core) sees changes without requiring manual rebuilds.
*/

const path = require('path');
const { spawn } = require('child_process');

function tscBin() {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  return path.join(__dirname, '..', 'node_modules', '.bin', `tsc${ext}`);
}

function spawnTsc(args) {
  const child = spawn(tscBin(), args, {
    stdio: 'inherit',
    env: process.env,
    cwd: path.join(__dirname, '..')
  });
  child.on('exit', (code) => {
    if (typeof code === 'number' && code !== 0) {
      // eslint-disable-next-line no-console
      console.error(`[aggo] tsc exited with code ${code}`);
    }
  });
  return child;
}

const children = [
  spawnTsc(['-w', '-p', './']),
  spawnTsc(['-w', '-p', 'packages/core/tsconfig.json'])
];

function shutdown(signal) {
  for (const c of children) {
    try {
      c.kill(signal);
    } catch {
      // ignore
    }
  }
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
  process.exit(130);
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
  process.exit(143);
});
