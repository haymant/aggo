import * as vscode from 'vscode';

export type DebugConfigArgs = {
  url: string;
  workspaceFolder?: vscode.WorkspaceFolder;
};

export function buildChromeLaunchConfig(args: DebugConfigArgs): vscode.DebugConfiguration {
  return {
    name: 'Aggo: Debug Page (Dev)',
    type: 'pwa-chrome',
    request: 'launch',
    url: args.url,
    webRoot: args.workspaceFolder?.uri.fsPath ?? '${workspaceFolder}',
    sourceMaps: true,
    trace: false
  };
}
