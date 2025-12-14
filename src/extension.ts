import * as vscode from 'vscode';
// Ajv is loaded lazily in validate command to avoid module load issues during activation
// import { parseTree, findNodeAtLocation } from 'jsonc-parser';
import { AggoSchemaEditorProvider } from './editors/AggoSchemaEditorProvider';
import { AggoPageEditorProvider } from './editors/AggoPageEditorProvider';
import { AggoDataSourceEditorProvider } from './editors/AggoDataSourceEditorProvider';
import { AggoMcpEditorProvider } from './editors/AggoMcpEditorProvider';
import { AggoColorEditorProvider } from './editors/AggoColorEditorProvider';
import { AggoCPNEditorProvider } from './editors/AggoCPNEditorProvider';
import { AggoComponentLibraryProvider } from './views/AggoComponentLibraryProvider';
import { AggoPropertyViewProvider } from './views/AggoPropertyViewProvider';
import { AggoPagesTreeProvider } from './views/AggoPagesTreeProvider';
import { parseJsonText, createSchemaFromJson } from './utils/schemaInference';
import { getActivePanel } from './utils/activePanel';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { getPanelByViewType } from './utils/activePanel';
import { RuntimeServerManager } from './utils/runtimeServerManager';
import { pageIdFromFsPath, pageUrlFromId } from './utils/pagePath';
import { buildChromeLaunchConfig } from './utils/debugConfig';
import { detectPackageManager } from './utils/packageManager';
import { deleteRouteForPageId, ensureRouteForPageId, syncNextjsRoutes } from './utils/nextjsCodegen';

// Broadcast component registry to all registered panels (library, page editor, properties)
async function broadcastComponentRegistryToPanels() {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return;
    const registryPath = path.join(workspaceFolder, '.aggo', 'components', 'component_registry.json');
    if (!fs.existsSync(registryPath)) return;
    const raw = fs.readFileSync(registryPath, 'utf8');
    const registry = JSON.parse(raw || '{}');
    // Post to Activity view 'library' using the provider's own webview instance
    try {
      const mappedLib: any = {};
      for (const key of Object.keys(registry)) {
        try {
          const entry = registry[key];
          const filePath = entry.file && entry.file.startsWith('.') ? path.join(workspaceFolder, entry.file) : entry.file;
          const fileUri = vscode.Uri.file(filePath);
          // For library we don't have a panel reference but the AggoComponentLibraryProvider has a static instance that can post back
            mappedLib[key] = { ...entry, file: entry.file };
        } catch (err) { console.warn('[aggo] failed mapping registry entry for broadcast to library', err); }
      }
      AggoComponentLibraryProvider.postMessageToWebview({ type: 'componentCatalogUpdated', registry: mappedLib });
    } catch (err) { /* ignore */ }

    // Post to page editor and property view panels (webview panels)
    try {
      const mappedPanels: any = {};
      for (const key of Object.keys(registry)) {
        try {
          const entry = registry[key];
          const filePath = entry.file && entry.file.startsWith('.') ? path.join(workspaceFolder, entry.file) : entry.file;
          mappedPanels[key] = { ...entry, file: filePath };
        } catch (err) { console.warn('[aggo] failed mapping registry entry for broadcast to panels', err); }
      }
      const pagePanel = getPanelByViewType('aggo.pageEditor');
      if (pagePanel) {
        const mappedForPage: any = {};
        for (const key of Object.keys(registry)) {
          try {
            const entry = registry[key];
            const filePath = entry.file && entry.file.startsWith('.') ? path.join(workspaceFolder, entry.file) : entry.file;
            const fileUri = vscode.Uri.file(filePath);
            let webUri = pagePanel.webview.asWebviewUri(fileUri).toString();
            try {
              const mtimeMs = fs.statSync(filePath).mtimeMs;
              if (Number.isFinite(mtimeMs)) {
                webUri = `${webUri}${webUri.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(mtimeMs))}`;
              }
            } catch (_) { /* ignore */ }
            mappedForPage[key] = { ...entry, file: webUri };
          } catch (err) { console.warn('[aggo] failed mapping registry entry for page panel broadcast', err); }
        }
        pagePanel.webview.postMessage({ type: 'componentCatalogUpdated', registry: mappedForPage });
      }
      // properties view doesn't need webview as a resource; provide raw mapped file paths
      AggoPropertyViewProvider.postMessageToWebview({ type: 'componentCatalogUpdated', registry: mappedPanels });
    } catch (err) { console.warn('[aggo] failed broadcasting registry to page/editor/property panels', err); }
  } catch (err) { console.warn('[aggo] failed to broadcast component registry', err); }
}

export function activate(context: vscode.ExtensionContext) {
  try {
    console.log('Aggo Builder extension activating.');
  const viewTypes = [
    { viewType: 'aggo.pageEditor', ext: '.page', title: 'Aggo Page Editor' },
    { viewType: 'aggo.dataSourceEditor', ext: '.ds', title: 'Aggo DataSource Editor' },
    { viewType: 'aggo.schemaEditor', ext: '.schema', title: 'Aggo Schema Editor' },
    { viewType: 'aggo.cpnEditor', ext: '.cpn', title: 'Aggo CPN Editor' },
    { viewType: 'aggo.mcpEditor', ext: '.mcp', title: 'Aggo MCP Editor' },
    { viewType: 'aggo.colorEditor', ext: '.color', title: 'Aggo Color Editor' }
  ];

  const commandMap: {[key: string]: string} = {
    'aggo.pageEditor': 'aggo.openAggoPageEditor',
    'aggo.dataSourceEditor': 'aggo.openAggoDataSourceEditor',
    'aggo.schemaEditor': 'aggo.openAggoSchemaEditor',
    'aggo.cpnEditor': 'aggo.openAggoCPNEditor',
    'aggo.mcpEditor': 'aggo.openAggoMCPEditor',
    'aggo.colorEditor': 'aggo.openAggoColorEditor'
  };

  for (const vt of viewTypes) {
    // const isDev = context.extensionMode === vscode.ExtensionMode.Development;
    const isDev = false; // Force production mode
    let provider: vscode.CustomTextEditorProvider;
    switch (vt.viewType) {
      case 'aggo.cpnEditor':
        provider = new AggoCPNEditorProvider(context.extensionUri, vt.title, isDev);
        break;
      case 'aggo.schemaEditor':
        provider = new AggoSchemaEditorProvider(context.extensionUri, vt.viewType, vt.title, isDev);
        break;
      case 'aggo.pageEditor':
        provider = new AggoPageEditorProvider(context.extensionUri, vt.viewType, vt.title, isDev);
        break;
      case 'aggo.dataSourceEditor':
        provider = new AggoDataSourceEditorProvider(context.extensionUri, vt.viewType, vt.title, isDev);
        break;
      case 'aggo.mcpEditor':
        provider = new AggoMcpEditorProvider(context.extensionUri, vt.viewType, vt.title, isDev);
        break;
      case 'aggo.colorEditor':
        provider = new AggoColorEditorProvider(context.extensionUri, vt.viewType, vt.title, isDev);
        break;
      default:
        // fallback - use AggoSchemaEditorProvider for other view types
        provider = new AggoSchemaEditorProvider(context.extensionUri, vt.viewType, vt.title, isDev);
    }
    try {
      context.subscriptions.push(vscode.window.registerCustomEditorProvider(vt.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false
    }));
    } catch (err: any) {
      console.error('Failed to register custom editor provider for', vt.viewType, err);
      try { vscode.window.showErrorMessage(`Aggo: failed to register custom editor ${vt.viewType}: ${err?.message || String(err)}`); } catch (_) { }
    }

    // Register command to open files explicitly from explorer/context
    const commandId = commandMap[vt.viewType];
    const disposable = vscode.commands.registerCommand(commandId, async (uri: vscode.Uri) => {
      if (!uri) {
        const active = vscode.window.activeTextEditor;
        if (!active) return;
        uri = active.document.uri;
      }
      await vscode.commands.executeCommand('vscode.openWith', uri, vt.viewType);
    });
    try {
      context.subscriptions.push(disposable);
    } catch (err: any) {
      console.error(`Failed registering command ${commandId}`, err);
      try { vscode.window.showErrorMessage(`Aggo: failed to register command ${commandId}: ${err?.message || String(err)}`); } catch (_) { }
    }
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceRoot = workspaceFolder?.uri.fsPath;

  const runtimeManager = new RuntimeServerManager();
  context.subscriptions.push({ dispose: () => { void runtimeManager.stop(); } });

  let pagesProvider: AggoPagesTreeProvider | undefined;
  if (workspaceRoot) {
    pagesProvider = new AggoPagesTreeProvider(workspaceRoot);
    context.subscriptions.push(pagesProvider);
    const view = vscode.window.createTreeView(AggoPagesTreeProvider.viewId, {
      treeDataProvider: pagesProvider,
      showCollapseAll: true
    });
    context.subscriptions.push(view);
  }

  const resolveRuntimeSettings = () => {
    const cfg = vscode.workspace.getConfiguration('aggo.runtime');
    const baseUrl = cfg.get<string>('baseUrl') ?? 'http://localhost:5173';
    const devScript = cfg.get<string>('devScript') ?? 'dev';

    let cwd = workspaceRoot ?? process.cwd();
    const cwdSetting = (cfg.get<string>('cwd') ?? '').trim();
    if (cwdSetting) {
      cwd = path.isAbsolute(cwdSetting) ? cwdSetting : (workspaceRoot ? path.join(workspaceRoot, cwdSetting) : path.resolve(cwdSetting));
    }

    return { baseUrl, devScript, cwd };
  };

  const isCodegenEnabled = (): boolean => {
    const cfg = vscode.workspace.getConfiguration('aggo.runtime.codegen');
    return cfg.get<boolean>('enabled') ?? false;
  };

  const resolveRuntimeCwdAbs = (): string | undefined => {
    if (!workspaceRoot) return undefined;
    const { cwd } = resolveRuntimeSettings();
    return cwd;
  };

  const confirmInVscode = async (message: string, kind: 'overwrite' | 'delete'): Promise<boolean> => {
    const action = kind === 'overwrite' ? 'Overwrite' : 'Delete';
    const pick = await vscode.window.showWarningMessage(message, { modal: true }, action);
    return pick === action;
  };

  const ensureRuntimeHasAggoCore = async (runtimeRootAbs: string, output?: vscode.OutputChannel): Promise<void> => {
    if (!workspaceRoot) return;
    const runtimePkgPath = path.join(runtimeRootAbs, 'package.json');
    if (!fs.existsSync(runtimePkgPath)) return;

    let runtimePkg: any;
    try {
      runtimePkg = JSON.parse(await fs.promises.readFile(runtimePkgPath, 'utf8'));
    } catch {
      return;
    }

    const deps = runtimePkg?.dependencies ?? {};
    const devDeps = runtimePkg?.devDependencies ?? {};
    if (deps['@aggo/core'] || devDeps['@aggo/core']) return;

    const ok = await vscode.window.showInformationMessage(
      'Aggo: Next.js runtime needs @aggo/core (page renderer) to render *.page routes. Install it now into the runtime project?',
      { modal: true },
      'Install'
    );
    if (ok !== 'Install') return;

    const coreAbs = path.join(workspaceRoot, 'packages', 'core');
    const rel = path.relative(runtimeRootAbs, coreAbs).split(path.sep).join('/');
    const pm = detectPackageManager(runtimeRootAbs);

    const cmd = pm === 'pnpm' ? 'pnpm' : pm === 'yarn' ? 'yarn' : 'npm';
    const args = pm === 'pnpm'
      ? ['add', `file:${rel}`]
      : pm === 'yarn'
        ? ['add', `file:${rel}`]
        : ['install', '--save', rel];

    output?.appendLine(`[aggo] Installing @aggo/core into runtime via: ${cmd} ${args.join(' ')}`);

    await new Promise<void>((resolve, reject) => {
      const child = cp.spawn(cmd, args, { cwd: runtimeRootAbs, env: process.env, stdio: 'pipe' });
      child.on('error', reject);
      child.stdout.on('data', (d) => output?.append(d.toString()));
      child.stderr.on('data', (d) => output?.append(d.toString()));
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${cmd} exited with code ${code}`));
      });
    });
  };

  const asUri = (value: unknown): vscode.Uri | undefined => {
    const v = value as any;
    if (!v || typeof v !== 'object') return undefined;
    if (typeof v.fsPath === 'string' && typeof v.scheme === 'string') return v as vscode.Uri;
    return undefined;
  };

  const pickPageUri = (arg?: unknown): vscode.Uri | undefined => {
    const direct = asUri(arg);
    if (direct) return direct;

    const v = arg as any;
    const fromNode = asUri(v?.uri);
    if (fromNode) return fromNode;

    const fromTreeItem = asUri(v?.resourceUri);
    if (fromTreeItem) return fromTreeItem;

    const active = vscode.window.activeTextEditor;
    return active?.document?.uri;
  };

  let runtimePreviewPanel: vscode.WebviewPanel | undefined;
  const runtimePreviewViewType = 'aggo.runtimePreview';

  const getEffectiveRuntimeBaseUrl = async (): Promise<string> => {
    const { baseUrl } = resolveRuntimeSettings();
    const detected = runtimeManager.getDetectedBaseUrl();
    return detected ?? baseUrl;
  };

  const renderRuntimePreviewHtml = (url: string): string => {
    const escaped = url.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http: https:; style-src 'unsafe-inline';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Aggo Runtime Preview</title>
    <style>
      html, body { height: 100%; padding: 0; margin: 0; }
      iframe { width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <iframe src="${escaped}"></iframe>
  </body>
</html>`;
  };

  const openRuntimePreview = async (url: string): Promise<void> => {
    if (!runtimePreviewPanel) {
      runtimePreviewPanel = vscode.window.createWebviewPanel(
        runtimePreviewViewType,
        'Aggo: Runtime Preview',
        vscode.ViewColumn.Beside,
        { enableScripts: false, retainContextWhenHidden: true }
      );
      runtimePreviewPanel.onDidDispose(() => {
        runtimePreviewPanel = undefined;
      });
    }

    runtimePreviewPanel.title = `Aggo: Runtime Preview`;
    runtimePreviewPanel.webview.html = renderRuntimePreviewHtml(url);
    runtimePreviewPanel.reveal(vscode.ViewColumn.Beside, true);
  };

  context.subscriptions.push(vscode.commands.registerCommand('aggo.refreshPages', () => {
    pagesProvider?.refresh();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aggo.syncNextjsRoutes', async () => {
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Aggo: no workspace folder is open.');
      return;
    }
    const runtimeCwdAbs = resolveRuntimeCwdAbs();
    if (!runtimeCwdAbs) {
      vscode.window.showErrorMessage('Aggo: runtime cwd is not configured.');
      return;
    }

    const pages = await vscode.workspace.findFiles(new vscode.RelativePattern(workspaceRoot, 'resources/page/**/*.page'));
    const pageIds = pages.map((u) => pageIdFromFsPath(workspaceRoot, u.fsPath));

    // Routes import @aggo/core via generated renderer wrapper. Ensure runtime has it.
    try {
      await ensureRuntimeHasAggoCore(runtimeCwdAbs);
    } catch (err: any) {
      vscode.window.showWarningMessage(`Aggo: failed to install @aggo/core into runtime: ${err?.message || String(err)}`);
    }

    await syncNextjsRoutes(
      {
        workspaceRoot,
        runtimeCwdAbs,
        confirm: confirmInVscode
      },
      pageIds
    );

    vscode.window.showInformationMessage('Aggo: Next.js routes synced.');
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aggo.openPageFromTree', async (arg?: unknown) => {
    const pageUri = pickPageUri(arg);
    if (!pageUri) return;
    await vscode.commands.executeCommand('vscode.openWith', pageUri, 'aggo.pageEditor');
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aggo.openRuntimePreview', async (arg?: unknown) => {
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Aggo: no workspace folder is open.');
      return;
    }

    const pageUri = pickPageUri(arg);
    const { devScript, cwd } = resolveRuntimeSettings();
    await runtimeManager.ensureStarted({ kind: 'dev', workspaceRoot, cwd, script: devScript });

    const baseUrl = await getEffectiveRuntimeBaseUrl();
    let url = baseUrl;
    if (pageUri && typeof pageUri.fsPath === 'string' && pageUri.fsPath.endsWith('.page')) {
      const pageId = pageIdFromFsPath(workspaceRoot, pageUri.fsPath);
      url = pageUrlFromId(baseUrl, pageId);
    }

    await openRuntimePreview(url);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aggo.stopRuntimeDevServer', async () => {
    await runtimeManager.stop();
    vscode.window.showInformationMessage('Aggo: runtime dev server stopped.');
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aggo.restartRuntimeDevServer', async () => {
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Aggo: no workspace folder is open.');
      return;
    }
    const { devScript, cwd } = resolveRuntimeSettings();
    await runtimeManager.restart({ kind: 'dev', workspaceRoot, cwd, script: devScript });
    vscode.window.showInformationMessage('Aggo: runtime dev server restarted.');
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aggo.generateLaunchJson', async () => {
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Aggo: no workspace folder is open.');
      return;
    }

    const { cwd } = resolveRuntimeSettings();
    const relCwd = workspaceRoot ? path.relative(workspaceRoot, cwd).split(path.sep).join('/') : '';
    const webRoot = relCwd && !relCwd.startsWith('..') ? '${workspaceFolder}/' + relCwd : '${workspaceFolder}';

    try {
      const vscodeDir = path.join(workspaceRoot, '.vscode');
      await fs.promises.mkdir(vscodeDir, { recursive: true });
      const launchPath = path.join(vscodeDir, 'launch.json');

      let launch: any = { version: '0.2.0', configurations: [], inputs: [] };
      if (fs.existsSync(launchPath)) {
        try {
          launch = JSON.parse(await fs.promises.readFile(launchPath, 'utf8'));
        } catch {
          launch = { version: '0.2.0', configurations: [], inputs: [] };
        }
      }

      if (!Array.isArray(launch.configurations)) launch.configurations = [];
      if (!Array.isArray(launch.inputs)) launch.inputs = [];

      if (!launch.inputs.some((i: any) => i?.id === 'aggoPageId')) {
        launch.inputs.push({
          id: 'aggoPageId',
          type: 'promptString',
          description: 'Aggo page id (e.g. rfq/view)',
          default: 'rfq/view'
        });
      }

      const name = 'Aggo: Debug Page (Dev)';
      if (!launch.configurations.some((c: any) => c?.name === name)) {
        launch.configurations.push({
          name,
          type: 'pwa-chrome',
          request: 'launch',
          url: '${config:aggo.runtime.baseUrl}/aggo/page/${input:aggoPageId}',
          webRoot,
          sourceMaps: true
        });
      }

      await fs.promises.writeFile(launchPath, JSON.stringify(launch, null, 2), 'utf8');
      vscode.window.showInformationMessage('Aggo: .vscode/launch.json updated.');
    } catch (err: any) {
      vscode.window.showErrorMessage(`Aggo: failed updating launch.json: ${err?.message || String(err)}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aggo.runPageDev', async (arg?: unknown) => {
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Aggo: no workspace folder is open.');
      return;
    }

    const pageUri = pickPageUri(arg);
    if (!pageUri || typeof pageUri.fsPath !== 'string' || !pageUri.fsPath.endsWith('.page')) {
      vscode.window.showErrorMessage('Aggo: select a .page file to run.');
      return;
    }

    const { devScript, cwd } = resolveRuntimeSettings();
    await runtimeManager.ensureStarted({ kind: 'dev', workspaceRoot, cwd, script: devScript });
    await runtimeManager.waitForDetectedBaseUrl(10_000);

    const baseUrl = await getEffectiveRuntimeBaseUrl();

    const pageId = pageIdFromFsPath(workspaceRoot, pageUri.fsPath);
    const url = pageUrlFromId(baseUrl, pageId);
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aggo.debugPageDev', async (arg?: unknown) => {
    if (!workspaceRoot || !workspaceFolder) {
      vscode.window.showErrorMessage('Aggo: no workspace folder is open.');
      return;
    }

    const pageUri = pickPageUri(arg);
    if (!pageUri || typeof pageUri.fsPath !== 'string' || !pageUri.fsPath.endsWith('.page')) {
      vscode.window.showErrorMessage('Aggo: select a .page file to debug.');
      return;
    }

    const { devScript, cwd } = resolveRuntimeSettings();
    await runtimeManager.ensureStarted({ kind: 'dev', workspaceRoot, cwd, script: devScript });
    await runtimeManager.waitForDetectedBaseUrl(10_000);

    const baseUrl = await getEffectiveRuntimeBaseUrl();

    const pageId = pageIdFromFsPath(workspaceRoot, pageUri.fsPath);
    const url = pageUrlFromId(baseUrl, pageId);
    await vscode.debug.startDebugging(workspaceFolder, buildChromeLaunchConfig({ url, workspaceFolder }));
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aggo.scaffoldNextjsRuntime', async () => {
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Aggo: no workspace folder is open.');
      return;
    }

    const targetRel = await vscode.window.showInputBox({
      prompt: 'Next.js runtime folder (workspace-relative) to create',
      value: 'aggo-runtime'
    });
    if (!targetRel) return;

    const targetRelNormalized = targetRel.split(path.sep).join('/').replace(/^\/+/, '');
    const targetAbs = path.isAbsolute(targetRel) ? targetRel : path.join(workspaceRoot, targetRel);

    if (fs.existsSync(targetAbs)) {
      const entries = fs.readdirSync(targetAbs);
      if (entries.length > 0) {
        const ok = await vscode.window.showWarningMessage(
          `Folder already exists and is not empty: ${targetRelNormalized}. Continue and let create-next-app manage it?`,
          { modal: true },
          'Continue'
        );
        if (ok !== 'Continue') return;
      }
    }

    const output = vscode.window.createOutputChannel('Aggo: Scaffold');
    output.show(true);

    const pm = detectPackageManager(workspaceRoot);
    const useFlag = pm === 'pnpm' ? '--use-pnpm' : pm === 'yarn' ? '--use-yarn' : '--use-npm';
    const command = pm === 'pnpm' ? 'pnpm' : pm === 'yarn' ? 'npx' : 'npx';
    const args = pm === 'pnpm'
      ? ['dlx', 'create-next-app@latest', targetAbs]
      : ['create-next-app@latest', targetAbs];

    const nextArgs = [
      ...args,
      '--ts',
      '--tailwind',
      '--eslint',
      '--app',
      '--src-dir',
      '--import-alias',
      '@/*',
      '--yes',
      useFlag
    ];

    output.appendLine(`[aggo] Scaffolding Next.js runtime in: ${targetAbs}`);
    output.appendLine(`[aggo] Running: ${command} ${nextArgs.join(' ')}`);

    const run = () => new Promise<void>((resolve, reject) => {
      const child = cp.spawn(command, nextArgs, {
        cwd: workspaceRoot,
        env: process.env,
        stdio: 'pipe'
      });
      child.on('error', reject);
      child.stdout.on('data', (d) => output.append(d.toString()));
      child.stderr.on('data', (d) => output.append(d.toString()));
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`create-next-app exited with code ${code}`));
      });
    });

    try {
      await run();
    } catch (err: any) {
      vscode.window.showErrorMessage(`Aggo: failed to scaffold Next.js runtime: ${err?.message || String(err)}`);
      return;
    }

    // Ensure runtime has the shared renderer package.
    try {
      await ensureRuntimeHasAggoCore(targetAbs, output);
    } catch (err: any) {
      vscode.window.showWarningMessage(`Aggo: failed to install @aggo/core into runtime: ${err?.message || String(err)}`);
    }

    // Update workspace settings so Run/Debug knows where and what to run.
    const runtimeCfg = vscode.workspace.getConfiguration('aggo.runtime');
    await runtimeCfg.update('cwd', targetRelNormalized, vscode.ConfigurationTarget.Workspace);
    await runtimeCfg.update('baseUrl', 'http://localhost:3000', vscode.ConfigurationTarget.Workspace);
    await runtimeCfg.update('devScript', 'dev', vscode.ConfigurationTarget.Workspace);

    const codegenCfg = vscode.workspace.getConfiguration('aggo.runtime.codegen');
    await codegenCfg.update('enabled', true, vscode.ConfigurationTarget.Workspace);

    // Create/merge a launch.json for manual debugging flows.
    try {
      const vscodeDir = path.join(workspaceRoot, '.vscode');
      await fs.promises.mkdir(vscodeDir, { recursive: true });
      const launchPath = path.join(vscodeDir, 'launch.json');

      let launch: any = { version: '0.2.0', configurations: [], inputs: [] };
      if (fs.existsSync(launchPath)) {
        try {
          launch = JSON.parse(await fs.promises.readFile(launchPath, 'utf8'));
        } catch {
          // keep default structure; don't overwrite invalid JSON
          launch = { version: '0.2.0', configurations: [], inputs: [] };
        }
      }

      if (!Array.isArray(launch.configurations)) launch.configurations = [];
      if (!Array.isArray(launch.inputs)) launch.inputs = [];

      if (!launch.inputs.some((i: any) => i?.id === 'aggoPageId')) {
        launch.inputs.push({
          id: 'aggoPageId',
          type: 'promptString',
          description: 'Aggo page id (e.g. rfq/view)',
          default: 'rfq/view'
        });
      }

      if (!launch.configurations.some((c: any) => c?.name === 'Aggo: Debug Page (Dev)')) {
        launch.configurations.push({
          name: 'Aggo: Debug Page (Dev)',
          type: 'pwa-chrome',
          request: 'launch',
          url: 'http://localhost:3000/aggo/page/${input:aggoPageId}',
          webRoot: '${workspaceFolder}/' + targetRelNormalized,
          sourceMaps: true
        });
      }

      await fs.promises.writeFile(launchPath, JSON.stringify(launch, null, 2), 'utf8');
    } catch (err) {
      output.appendLine(`\n[aggo] Failed to create/merge .vscode/launch.json: ${String(err)}`);
    }

    vscode.window.showInformationMessage('Aggo: Next.js runtime scaffolded. Settings + launch.json updated.');

    // Generate initial routes for any existing *.page files.
    try {
      await vscode.commands.executeCommand('aggo.syncNextjsRoutes');
    } catch (err) {
      output.appendLine(`\n[aggo] Failed to sync Next.js routes after scaffolding: ${String(err)}`);
    }
  }));

  // Optional: keep Next.js routes in sync with resources/page changes.
  if (workspaceRoot) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceRoot, 'resources/page/**/*.page')
    );

    const handleCreate = async (uri: vscode.Uri) => {
      if (!isCodegenEnabled()) return;
      const runtimeCwdAbs = resolveRuntimeCwdAbs();
      if (!runtimeCwdAbs) return;
      const id = pageIdFromFsPath(workspaceRoot, uri.fsPath);
      await ensureRouteForPageId(
        {
          workspaceRoot,
          runtimeCwdAbs,
          confirm: confirmInVscode
        },
        id
      );

      // Also refresh the handler registry (derived from all current pages).
      const pages = await vscode.workspace.findFiles(new vscode.RelativePattern(workspaceRoot, 'resources/page/**/*.page'));
      const pageIds = pages.map((u) => pageIdFromFsPath(workspaceRoot, u.fsPath));
      await syncNextjsRoutes({ workspaceRoot, runtimeCwdAbs, confirm: confirmInVscode }, pageIds);
    };

    const handleDelete = async (uri: vscode.Uri) => {
      if (!isCodegenEnabled()) return;
      const runtimeCwdAbs = resolveRuntimeCwdAbs();
      if (!runtimeCwdAbs) return;
      const id = pageIdFromFsPath(workspaceRoot, uri.fsPath);
      await deleteRouteForPageId(
        {
          workspaceRoot,
          runtimeCwdAbs,
          confirm: confirmInVscode
        },
        id
      );

      // Also refresh the handler registry (derived from all current pages).
      const pages = await vscode.workspace.findFiles(new vscode.RelativePattern(workspaceRoot, 'resources/page/**/*.page'));
      const pageIds = pages.map((u) => pageIdFromFsPath(workspaceRoot, u.fsPath));
      await syncNextjsRoutes({ workspaceRoot, runtimeCwdAbs, confirm: confirmInVscode }, pageIds);
    };

    watcher.onDidCreate((u) => {
      void handleCreate(u);
    });
    watcher.onDidDelete((u) => {
      void handleDelete(u);
    });
    context.subscriptions.push(watcher);
  }

  // Register an 'Infer Schema from JSON' command usable from editor context menus
  const inferSchemaCmd = vscode.commands.registerCommand('aggo.inferSchemaFromJson', async (uri?: vscode.Uri) => {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      let docUri = uri;
      if (!docUri && activeEditor) docUri = activeEditor.document.uri;
      if (!docUri) {
        vscode.window.showErrorMessage('No active JSON document found to infer schema from.');
        return;
      }
      const doc = await vscode.workspace.openTextDocument(docUri);
      const editor = vscode.window.activeTextEditor; // read the active editor after the document is open
      let text = doc.getText();
      // If there is a selection in the active editor, use the selection text to infer
      if (editor && editor.document.uri.toString() === docUri.toString() && !editor.selection.isEmpty) {
        text = editor.document.getText(editor.selection);
      }
      if (!text || text.trim().length === 0) {
        vscode.window.showErrorMessage('Document is empty. Cannot infer schema.');
        return;
      }
      let jsonObject;
      try {
        jsonObject = parseJsonText(text);
      } catch (err) {
        vscode.window.showErrorMessage('Failed to parse JSON/JSONC from document');
        return;
      }
      const inferredSchema = createSchemaFromJson(jsonObject);
      const schemaText = JSON.stringify(inferredSchema, null, 2);

      // Create a new file in the same folder: foo.schema or foo.inferred.schema if exists
      const folder = path.dirname(docUri.fsPath);
      const basename = path.basename(docUri.fsPath, path.extname(docUri.fsPath));
      let schemaPath = path.join(folder, `${basename}.schema`);
      if (fs.existsSync(schemaPath)) {
        // try different name with increment
        let i = 1;
        let candidate = path.join(folder, `${basename}.inferred.schema`);
        while (fs.existsSync(candidate)) {
          candidate = path.join(folder, `${basename}.inferred.${i}.schema`);
          i += 1;
        }
        schemaPath = candidate;
      }
      const schemaUri = vscode.Uri.file(schemaPath);
      await vscode.workspace.fs.writeFile(schemaUri, Buffer.from(schemaText, 'utf8'));
      // Open with Aggo Schema Editor
      await vscode.commands.executeCommand('vscode.openWith', schemaUri, 'aggo.schemaEditor');
      vscode.window.showInformationMessage(`Generated schema and opened: ${path.basename(schemaPath)}`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to infer schema: ${err?.message || String(err)}`);
    }
  });
  try {
    context.subscriptions.push(inferSchemaCmd);
  } catch (err: any) {
    console.error('Failed to register command aggo.inferSchemaFromJson', err);
    try { vscode.window.showErrorMessage(`Aggo: failed to register infer schema command: ${err?.message || String(err)}`); } catch (_) { }
  }

  // Register command to insert component from library
  context.subscriptions.push(vscode.commands.registerCommand('aggo.insertComponent', (data) => {
      const active = getActivePanel();
      if (active) {
        active.webview.postMessage({ type: 'insertComponent', data });
        return;
      }
      // Fallback: send to any open page editor panel (even if not focused)
      try {
        const panel = getPanelByViewType('aggo.pageEditor');
        if (panel) panel.webview.postMessage({ type: 'insertComponent', data });
      } catch (e) {
        console.warn('[aggo] insertComponent: no active page editor to receive insert', e);
      }
  }));

  // Register command to install component JS bundles into workspace component library
  context.subscriptions.push(vscode.commands.registerCommand('aggo.installComponent', async () => {
    try {
      const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'JavaScript': ['js'] } });
      if (!picked || picked.length === 0) return;
      const fileUri = picked[0];
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace found to install component in.');
        return;
      }
      const componentsDir = path.join(workspaceFolder, '.aggo', 'components');
      await fs.promises.mkdir(componentsDir, { recursive: true });
      const destPath = path.join(componentsDir, path.basename(fileUri.fsPath));
      await fs.promises.copyFile(fileUri.fsPath, destPath);
      // Prompt for component id and name
      const defaultId = path.basename(fileUri.fsPath, '.js');
      const componentId = await vscode.window.showInputBox({ prompt: 'Component ID', value: defaultId });
      if (!componentId) return;
      const componentName = await vscode.window.showInputBox({ prompt: 'Display name for component', value: defaultId });
      // Update registry
      const registryPath = path.join(workspaceFolder, '.aggo', 'components', 'component_registry.json');
      let registry: any = {};
      if (fs.existsSync(registryPath)) {
        const raw = await fs.promises.readFile(registryPath, 'utf8');
        try { registry = JSON.parse(raw || '{}'); } catch (err) { registry = {}; }
      }
      const rel = './.aggo/components/' + path.basename(destPath);
      registry[componentId] = { id: componentId, name: componentName || componentId, category: 'Plugin', icon: '', file: rel };
      await fs.promises.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
      vscode.window.showInformationMessage(`Installed component ${componentId} to ${rel}`);
      // Immediately broadcast registry updates to any open panels
      setTimeout(() => { broadcastComponentRegistryToPanels(); }, 50);
      // Trigger a filesystem event to notify watchers
      // (watchers in providers will pick this up automatically)
    } catch (err: any) {
      console.error('[aggo] failed to install component', err);
      vscode.window.showErrorMessage(`Failed to install component: ${err?.message || String(err)}`);
    }
  }));

  // Register command to uninstall a previously installed component
  context.subscriptions.push(vscode.commands.registerCommand('aggo.uninstallComponent', async () => {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace found.');
        return;
      }
      const registryPath = path.join(workspaceFolder, '.aggo', 'components', 'component_registry.json');
      if (!fs.existsSync(registryPath)) {
        vscode.window.showInformationMessage('No installed components found (.aggo/components/component_registry.json missing).');
        return;
      }
      let registry: any = {};
      try {
        const raw = await fs.promises.readFile(registryPath, 'utf8');
        registry = JSON.parse(raw || '{}');
      } catch {
        registry = {};
      }
      const ids = Object.keys(registry);
      if (ids.length === 0) {
        vscode.window.showInformationMessage('No installed components found.');
        return;
      }

      const items = ids.map((id) => {
        const e = registry[id] || {};
        return {
          label: e.name ? `${e.name}` : id,
          description: id,
          detail: e.file ? String(e.file) : ''
        };
      });
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a component to uninstall' });
      if (!picked) return;
      const componentId = picked.description;
      if (!componentId || !registry[componentId]) return;
      const entry = registry[componentId];
      const relFile = entry?.file as string | undefined;

      // Remove the registry entry first
      delete registry[componentId];
      await fs.promises.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');

      // Remove copied file if it isn't referenced by any remaining component
      if (relFile && typeof relFile === 'string') {
        const stillReferenced = Object.keys(registry).some((k) => registry[k]?.file === relFile);
        if (!stillReferenced) {
          try {
            const targetPath = relFile.startsWith('./') ? path.join(workspaceFolder, relFile.replace(/^\.\//, '')) : relFile;
            if (targetPath.startsWith(workspaceFolder) && fs.existsSync(targetPath)) {
              await fs.promises.unlink(targetPath);
            }
          } catch (err) {
            console.warn('[aggo] failed to delete component file during uninstall', err);
          }
        }
      }

      vscode.window.showInformationMessage(`Uninstalled component ${componentId}`);
      setTimeout(() => { broadcastComponentRegistryToPanels(); }, 50);
    } catch (err: any) {
      console.error('[aggo] failed to uninstall component', err);
      vscode.window.showErrorMessage(`Failed to uninstall component: ${err?.message || String(err)}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aggo.updateElement', (element) => {
      const active = getActivePanel();
      if (active) {
        active.webview.postMessage({ type: 'updateElement', element });
      }
  }));

  // Diagnostics collection for validation results
  const validationDiagnostics = vscode.languages.createDiagnosticCollection('aggoValidation');
  context.subscriptions.push(validationDiagnostics);

  // Register the 'Validate against JSON Schema' command
  const validateCmd = vscode.commands.registerCommand('aggo.validateAgainstSchema', async (uri?: vscode.Uri) => {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      let docUri = uri;
      if (!docUri && activeEditor) docUri = activeEditor.document.uri;
      if (!docUri) {
        vscode.window.showErrorMessage('No active JSON document found to validate.');
        return;
      }
      const doc = await vscode.workspace.openTextDocument(docUri);
      let text = doc.getText();
      // If selection exists, validate only selection
      if (activeEditor && activeEditor.document.uri.toString() === docUri.toString() && !activeEditor.selection.isEmpty) {
        text = activeEditor.document.getText(activeEditor.selection);
      }

      // Find schema files in workspace
      const schemaFiles = await vscode.workspace.findFiles('**/*.schema');
      if (!schemaFiles || schemaFiles.length === 0) {
        vscode.window.showErrorMessage('No .schema files found in workspace.');
        return;
      }

      let schemaUri: vscode.Uri | undefined;
      if (schemaFiles.length === 1) {
        schemaUri = schemaFiles[0];
      } else {
        const items = schemaFiles.map((s) => ({ label: vscode.workspace.asRelativePath(s), description: s.fsPath, uri: s } as any));
        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a JSON Schema to validate against' });
        if (!picked) return;
        schemaUri = picked.uri as vscode.Uri;
      }
      if (!schemaUri) return;

      const schemaDoc = await vscode.workspace.openTextDocument(schemaUri);
      let schemaObj: any;
      try {
        schemaObj = parseJsonText(schemaDoc.getText());
      } catch (err) {
        vscode.window.showErrorMessage('Failed to parse selected schema file as JSON/JSONC');
        return;
      }

      // Load Ajv dynamically; use default export if present
      let AjvConstructor: any;
      try {
        const AjvModule = require('ajv');
        AjvConstructor = AjvModule.default || AjvModule;
        console.log('Aggo: Ajv loaded successfully.');
      } catch (e) {
        vscode.window.showErrorMessage('Aggo: failed to load Ajv (validation not available)');
        console.error('Ajv import failure', e);
        return;
      }
      const ajv = new AjvConstructor({ allErrors: true, strict: false });
      // If the schema explicitly states draft-2020-12, add the meta schema proactively to avoid compile errors
      try {
        if (schemaObj && schemaObj.$schema && String(schemaObj.$schema).includes('2020-12')) {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const draft2020 = require('ajv/dist/refs/json-schema-draft-2020-12.json');
          ajv.addMetaSchema(draft2020);
        }
      } catch (err) {
        // ignore — we'll try to compile and handle missing meta later
      }

      // Helper to compile and add common meta-schemas if Ajv complains about missing refs
      const compileSchemaWithMeta = (schema: any) => {
        try {
          return ajv.compile(schema);
        } catch (e: any) {
          const msg = String(e?.message || e);
          if (/no schema with key or ref/i.test(msg) || /can't resolve reference/i.test(msg)) {
            try {
              // Try to add draft-2020-12 meta schema first (preferred)
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const draft2020 = require('ajv/dist/refs/json-schema-draft-2020-12.json');
              ajv.addMetaSchema(draft2020);
              vscode.window.showInformationMessage('Added Draft-2020-12 meta schema to AJV for validation.');
            } catch (importErr) {
              // cannot load meta schema - continue and rethrow
            }
            try {
              // Fallback to draft-07 if 2020-12 cannot be added
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const draft07 = require('ajv/dist/refs/json-schema-draft-07.json');
              ajv.addMetaSchema(draft07);
              vscode.window.showInformationMessage('Added Draft-07 meta schema to AJV for validation.');
            } catch (importErr) {
              // cannot load meta schema - continue and rethrow
            }
            // Retry compile after adding meta
            return ajv.compile(schema);
          }
          throw e;
        }
      };
      const validate = compileSchemaWithMeta(schemaObj);
      // Parse the target JSON to validate
      let dataToValidate: any;
      try {
        dataToValidate = parseJsonText(text);
      } catch (err) {
        vscode.window.showErrorMessage('Failed to parse JSON/JSONC to validate');
        return;
      }

      const valid = validate(dataToValidate);
      const diagnostics: vscode.Diagnostic[] = [];
      if (valid) {
        // Clear diagnostics for document
        validationDiagnostics.delete(docUri);
        vscode.window.showInformationMessage('Validation succeeded (no errors).');
        return;
      }
      // Map Ajv errors to VS Code diagnostics
      // Load jsonc-parser dynamically, map errors to positions; fallback if not available
      let parseTreeFn: any = undefined;
      let findNodeAtLocationFn: any = undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const jsonc = require('jsonc-parser');
        parseTreeFn = jsonc.parseTree;
        findNodeAtLocationFn = jsonc.findNodeAtLocation;
        console.log('Aggo: jsonc-parser loaded successfully.');
      } catch (err) {
        // jsonc-parser not available in this packaged extension; we will only generate a fallback diagnostic
        parseTreeFn = undefined;
        findNodeAtLocationFn = undefined;
      }
      const tree = parseTreeFn ? parseTreeFn(text) : undefined;
      // If validating a selection, we need to offset node offsets by the selection start
      let baseOffset = 0;
      if (activeEditor && activeEditor.document.uri.toString() === docUri.toString() && !activeEditor.selection.isEmpty) {
        baseOffset = activeEditor.document.offsetAt(activeEditor.selection.start);
      }
      for (const err of (validate.errors || [])) {
        const pointer = ((err as any).instancePath || '') as string;
        const segments = pointer.split('/').slice(1).map((s) => (s === '' ? s : isFinite(Number(s)) ? Number(s) : s));
        let range: vscode.Range | undefined;
        if (tree && findNodeAtLocationFn) {
          const node = findNodeAtLocationFn(tree, segments as any);
          if (node) {
            const start = doc.positionAt(baseOffset + node.offset);
            const end = doc.positionAt(baseOffset + node.offset + node.length);
            range = new vscode.Range(start, end);
          }
        }
        if (!range) {
          // Fallback to document start
          range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
        }
        const message = `${err.message || 'Schema validation error'} (${String(err.keyword || '')})`;
        const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
        diagnostics.push(diag);
      }
      validationDiagnostics.set(docUri, diagnostics);
      vscode.window.showErrorMessage(`Validation failed: ${diagnostics.length} issues found. See Problems pane.`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Validation failed: ${err?.message || String(err)}`);
    }
  });
  try {
    context.subscriptions.push(validateCmd);


  } catch (err: any) {
    console.error('Failed to register command aggo.validateAgainstSchema', err);
    try { vscode.window.showErrorMessage(`Aggo: failed to register validate schema command: ${err?.message || String(err)}`); } catch (_) { }
  }

  // Register Activity Bar views
  // Force production mode to ensure we use the built assets from media/
  const isDev = false; 
  const libraryProvider = new AggoComponentLibraryProvider(context.extensionUri, isDev);
  const propertyProvider = new AggoPropertyViewProvider(context.extensionUri, isDev);
  try {
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(AggoComponentLibraryProvider.viewType, libraryProvider, { webviewOptions: { retainContextWhenHidden: true } }),
      vscode.window.registerWebviewViewProvider(AggoPropertyViewProvider.viewType, propertyProvider, { webviewOptions: { retainContextWhenHidden: true } })
    );
  } catch (err: any) {
    console.error('Failed to register Aggo view providers', err);
    try { vscode.window.showErrorMessage(`Aggo: failed to register activity views: ${err?.message || String(err)}`); } catch (_) { }
  }
  // Create a workspace-level watcher for the component library and broadcast on changes
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      const pattern = new vscode.RelativePattern(workspaceFolder, '.aggo/components/**');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const handler = async (uri?: vscode.Uri, eventType: 'create' | 'change' | 'delete' = 'change') => {
        try {
          if (!uri) { setTimeout(() => { broadcastComponentRegistryToPanels(); }, 20); return; }
          const fsPath = uri.fsPath;
          const basename = path.basename(fsPath);
          const registryPath = path.join(workspaceFolder, '.aggo', 'components', 'component_registry.json');
          if (basename === 'component_registry.json') { setTimeout(() => { broadcastComponentRegistryToPanels(); }, 20); return; }
          if (!fsPath.toLowerCase().endsWith('.js')) { setTimeout(() => { broadcastComponentRegistryToPanels(); }, 20); return; }

          let registry: any = {};
          if (fs.existsSync(registryPath)) {
            try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8') || '{}'); } catch (e) { registry = {}; }
          }

          if (eventType === 'delete') {
            const basenameJs = './.aggo/components/' + basename;
            let changed = false;
            for (const k of Object.keys(registry)) {
              const entryFile = registry[k] && registry[k].file;
              if (!entryFile) continue;
              const possiblePaths = [entryFile, path.join(workspaceFolder, entryFile), path.resolve(workspaceFolder, entryFile)];
              if (possiblePaths.includes(fsPath) || possiblePaths.includes(basenameJs)) { delete registry[k]; changed = true; }
            }
            if (changed) { await fs.promises.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8'); }
          } else {
            const id = path.basename(fsPath, '.js');
            const rel = './.aggo/components/' + basename;
            if (!registry[id]) {
              registry[id] = { id, name: id, category: 'Plugin', icon: '', file: rel };
              await fs.promises.mkdir(path.dirname(registryPath), { recursive: true });
              await fs.promises.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
            }
          }
          setTimeout(() => { broadcastComponentRegistryToPanels(); }, 20);
        } catch (err) { console.warn('[aggo] workspace component watcher handler failed', err); }
      };
      watcher.onDidCreate((u) => handler(u, 'create'));
      watcher.onDidChange((u) => handler(u, 'change'));
      watcher.onDidDelete((u) => handler(u, 'delete'));
      context.subscriptions.push(watcher);
      // Don't broadcast on activate - let each webview load registry when it sends 'ready' message
      // This ensures proper timing and avoids race conditions
    }
  } catch (err) { console.warn('[aggo] failed to register workspace components watcher', err); }
  
  } catch (err: any) {
    console.error('Aggo activation error:', err);
    try { vscode.window.showErrorMessage(`Aggo activation error: ${err?.message || String(err)}`); } catch (_) { }
    throw err;
  }
}

export function deactivate() { }
