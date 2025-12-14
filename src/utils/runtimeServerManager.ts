import * as vscode from 'vscode';
import * as cp from 'child_process';
import { buildRunScriptCommand, detectPackageManager, type PackageManager } from './packageManager';
import { extractLocalhostBaseUrl } from './runtimeBaseUrl';

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
  private detectedBaseUrl: string | undefined;
  private detachedGroupPid: number | undefined;

  public getStatus(): { running: boolean; pid?: number; kind?: RuntimeServerKind; script?: string } {
    const running = !!this.process && this.process.exitCode === null && !this.process.killed;
    return {
      running,
      pid: this.process?.pid,
      kind: this.current?.kind,
      script: this.current?.script
    };
  }

  public getDetectedBaseUrl(): string | undefined {
    return this.detectedBaseUrl;
  }

  public async waitForDetectedBaseUrl(timeoutMs: number): Promise<string | undefined> {
    const start = Date.now();
    while (!this.detectedBaseUrl && Date.now() - start < timeoutMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    return this.detectedBaseUrl;
  }

  public async restart(config: RuntimeServerConfig): Promise<void> {
    await this.stop();
    await this.ensureStarted(config);
  }

  public async ensureStarted(config: RuntimeServerConfig): Promise<void> {
    const running = !!this.process && this.process.exitCode === null && !this.process.killed;
    if (running) {
      const same =
        this.current?.kind === config.kind &&
        this.current?.cwd === config.cwd &&
        this.current?.script === config.script &&
        this.current?.workspaceRoot === config.workspaceRoot;
      if (same) return;

      // Config changed; restart to match.
      await this.stop();
    }

    const pm: PackageManager = detectPackageManager(config.workspaceRoot);
    const { command, args } = buildRunScriptCommand(pm, config.script);

    this.output.show(true);
    this.output.appendLine(`[aggo] Starting runtime (${config.kind}) using ${pm}: ${command} ${args.join(' ')}`);
    this.output.appendLine(`[aggo] cwd: ${config.cwd}`);

    this.detectedBaseUrl = undefined;

    const canDetach = process.platform !== 'win32';
    const child = cp.spawn(command, args, {
      cwd: config.cwd,
      env: { ...process.env, ...(config.env || {}) },
      stdio: 'pipe',
      detached: canDetach
    });

    this.process = child;
    this.current = config;
    this.detachedGroupPid = canDetach ? child.pid : undefined;

    child.stdout.on('data', (d) => {
      const text = d.toString();
      this.output.append(text);
      this.tryDetectBaseUrl(text);
    });
    child.stderr.on('data', (d) => {
      const text = d.toString();
      this.output.append(text);
      this.tryDetectBaseUrl(text);
    });

    child.on('exit', (code, signal) => {
      this.output.appendLine(`\n[aggo] Runtime process exited (code=${code}, signal=${signal})`);
      this.process = undefined;
      this.current = undefined;
      this.detachedGroupPid = undefined;
    });

    // Give it a moment to start; we intentionally don't attempt port-detection in Phase 1.
    await new Promise<void>((resolve) => setTimeout(resolve, 750));
  }

  private tryDetectBaseUrl(outputChunk: string): void {
    if (this.detectedBaseUrl) return;
    const found = extractLocalhostBaseUrl(outputChunk);
    if (!found) return;
    this.detectedBaseUrl = found;
    this.output.appendLine(`\n[aggo] Detected runtime baseUrl: ${found}`);
  }

  public async stop(): Promise<void> {
    if (!this.process || this.process.killed) return;

    this.output.appendLine('[aggo] Stopping runtime process...');

    const pid = this.process.pid;
    const groupPid = this.detachedGroupPid;

    const killBestEffort = (signal: NodeJS.Signals) => {
      try {
        // If we started the process detached on unix, kill the whole process group.
        if (process.platform !== 'win32' && groupPid) {
          process.kill(-groupPid, signal);
          return;
        }
      } catch (err) {
        this.output.appendLine(`[aggo] Failed to kill process group (pid=${groupPid}) with ${signal}: ${String(err)}`);
      }

      try {
        if (pid) process.kill(pid, signal);
      } catch (err) {
        this.output.appendLine(`[aggo] Failed to kill pid=${pid} with ${signal}: ${String(err)}`);
      }
    };

    killBestEffort('SIGTERM');

    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    killBestEffort('SIGKILL');

    this.process = undefined;
    this.current = undefined;
    this.detectedBaseUrl = undefined;
    this.detachedGroupPid = undefined;
  }
}
