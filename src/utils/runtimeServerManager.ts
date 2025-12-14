import * as vscode from 'vscode';
import * as cp from 'child_process';
import { buildRunScriptCommand, detectPackageManager, type PackageManager } from './packageManager';

export type RuntimeServerKind = 'dev' | 'prodLike';

export type RuntimeServerConfig = {
  kind: RuntimeServerKind;
  workspaceRoot: string;
  cwd: string;
  script: string;
  env?: Record<string, string | undefined>;
};

export class RuntimeServerManager {
  private readonly output = vscode.window.createOutputChannel('Aggo: Runtime');
  private process: cp.ChildProcessWithoutNullStreams | undefined;
  private current?: RuntimeServerConfig;

  public getStatus(): { running: boolean; pid?: number; kind?: RuntimeServerKind; script?: string } {
    return {
      running: !!this.process && !this.process.killed,
      pid: this.process?.pid,
      kind: this.current?.kind,
      script: this.current?.script
    };
  }

  public async ensureStarted(config: RuntimeServerConfig): Promise<void> {
    // Reuse if already running.
    if (this.process && !this.process.killed) {
      return;
    }

    const pm: PackageManager = detectPackageManager(config.workspaceRoot);
    const { command, args } = buildRunScriptCommand(pm, config.script);

    this.output.show(true);
    this.output.appendLine(`[aggo] Starting runtime (${config.kind}) using ${pm}: ${command} ${args.join(' ')}`);
    this.output.appendLine(`[aggo] cwd: ${config.cwd}`);

    const child = cp.spawn(command, args, {
      cwd: config.cwd,
      env: { ...process.env, ...(config.env || {}) },
      stdio: 'pipe'
    });

    this.process = child;
    this.current = config;

    child.stdout.on('data', (d) => this.output.append(d.toString()));
    child.stderr.on('data', (d) => this.output.append(d.toString()));

    child.on('exit', (code, signal) => {
      this.output.appendLine(`\n[aggo] Runtime process exited (code=${code}, signal=${signal})`);
      this.process = undefined;
      this.current = undefined;
    });

    // Give it a moment to start; we intentionally don't attempt port-detection in Phase 1.
    await new Promise<void>((resolve) => setTimeout(resolve, 750));
  }

  public async stop(): Promise<void> {
    if (!this.process || this.process.killed) return;

    this.output.appendLine('[aggo] Stopping runtime process...');

    try {
      this.process.kill('SIGTERM');
    } catch (err) {
      this.output.appendLine(`[aggo] Failed to SIGTERM runtime process: ${String(err)}`);
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    if (this.process && !this.process.killed) {
      try {
        this.process.kill('SIGKILL');
      } catch (err) {
        this.output.appendLine(`[aggo] Failed to SIGKILL runtime process: ${String(err)}`);
      }
    }

    this.process = undefined;
    this.current = undefined;
  }
}
