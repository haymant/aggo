import * as fs from 'fs';
import * as path from 'path';

export type PackageManager = 'pnpm' | 'yarn' | 'npm';

export function detectPackageManager(workspaceRoot: string): PackageManager {
  const pnpmLock = path.join(workspaceRoot, 'pnpm-lock.yaml');
  if (fs.existsSync(pnpmLock)) return 'pnpm';

  const yarnLock = path.join(workspaceRoot, 'yarn.lock');
  if (fs.existsSync(yarnLock)) return 'yarn';

  return 'npm';
}

export function buildRunScriptCommand(pm: PackageManager, scriptName: string): { command: string; args: string[] } {
  // Keep as spawn(command, args) friendly.
  switch (pm) {
    case 'pnpm':
      return { command: 'pnpm', args: ['run', scriptName] };
    case 'yarn':
      return { command: 'yarn', args: ['run', scriptName] };
    default:
      return { command: 'npm', args: ['run', scriptName] };
  }
}
