import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { getHtmlForWebview } from '../utils/webviewHelper';
import { normalizeBridgeContent } from '../utils/fileBridge';

export class AggoComponentLibraryProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aggo.library';
  private static _instance?: AggoComponentLibraryProvider;
  private _view?: vscode.WebviewView;
  constructor(private readonly extensionUri: vscode.Uri, private readonly isDev: boolean = false) { }

  public static postMessageToWebview(message: any) {
    if (AggoComponentLibraryProvider._instance && AggoComponentLibraryProvider._instance._view) {
      // If registry message is sent, map file paths to webview URIs using this _view
      if (message && message.type === 'componentCatalogUpdated' && message.registry) {
        try {
          const mapped: any = {};
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          for (const key of Object.keys(message.registry)) {
            try {
              const entry = message.registry[key];
              const filePath = entry.file && entry.file.startsWith('.') && workspaceFolder ? path.join(workspaceFolder, entry.file) : entry.file;
              const fileUri = vscode.Uri.file(filePath);
              let webUri = AggoComponentLibraryProvider._instance!._view!.webview.asWebviewUri(fileUri).toString();
              try {
                const mtimeMs = fs.statSync(filePath).mtimeMs;
                if (Number.isFinite(mtimeMs)) {
                  webUri = `${webUri}${webUri.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(mtimeMs))}`;
                }
              } catch (_) { /* ignore */ }
              mapped[key] = { ...entry, file: webUri };
            } catch (err) { console.warn('[aggo] failed mapping registry entry for library provider', err); }
          }
          AggoComponentLibraryProvider._instance._view.webview.postMessage({ ...message, registry: mapped });
          return;
        } catch (err) { console.warn('[aggo] failed to post mapped registry to library', err); }
      }
      AggoComponentLibraryProvider._instance._view.webview.postMessage(message);
    }
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    AggoComponentLibraryProvider._instance = this;
    this._view = webviewView;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: workspaceRoot ? [this.extensionUri, workspaceRoot] : [this.extensionUri]
    };

    const fetchRemoteText = async (url: string): Promise<string> => {
      const fetchFn = (globalThis as any).fetch;
      if (typeof fetchFn !== 'function') {
        throw new Error('Network fetch is not available');
      }
      const response = await fetchFn(url);
      return response.text();
    };

    const respondWithCommand = (command: string, payload: Record<string, any>) => {
      webviewView.webview.postMessage({ ...payload, command, type: command });
    };
    const tempFileMap = new Map<string, vscode.Uri>();

    const resolveLocalUri = (targetPath: string): vscode.Uri => {
      if (targetPath.startsWith('file:')) {
        return vscode.Uri.parse(targetPath);
      }
      if (path.isAbsolute(targetPath)) {
        return vscode.Uri.file(targetPath);
      }
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const baseDir = workspaceFolder ?? process.cwd();
      return vscode.Uri.file(path.resolve(baseDir, targetPath));
    };

    const openWithAggoEditor = async (uri: vscode.Uri) => {
      try {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'aggo.schemaEditor');
        return true;
      } catch (_err) {
        try { const doc = await vscode.workspace.openTextDocument(uri); await vscode.window.showTextDocument(doc, { preview: false }); return true; } catch (e) { console.warn('[aggo] failed to open with aggo.schemaEditor fallback to default', e); return false; }
      }
    };

    const handleFileBridgeCommand = async (message: any): Promise<boolean> => {
      const command = message?.command || message?.type;
      if (command !== 'openFile' && command !== 'saveFile') {
        return false;
      }
      const id = message?.id;
      const targetPath = message?.path as string;
      if (!id || typeof targetPath !== 'string' || targetPath.length === 0) {
        if (command === 'openFile') {
          respondWithCommand('openFileResponse', { id, content: JSON.stringify({ error: 'Missing id or path' }) });
        } else {
          respondWithCommand('saveFileResponse', { id, success: false, error: 'Missing id or path' });
        }
        return true;
      }
      if (command === 'openFile') {
        try {
          if (/^https?:\/\//i.test(targetPath)) {
            const content = await fetchRemoteText(targetPath);
            const tmpName = `aggo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.basename(targetPath)}`;
            const tmpPath = path.join(os.tmpdir(), tmpName);
            const tmpUri = vscode.Uri.file(tmpPath);
            await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(content || '', 'utf8'));
            try { await openWithAggoEditor(tmpUri); } catch (e) { console.warn('[aggo] failed to open temp document for remote schema with aggo editor', e); }
            tempFileMap.set(targetPath, tmpUri);
            respondWithCommand('openFileResponse', { id, content: null });
            return true;
          }
          const uri = resolveLocalUri(targetPath.replace(/^\.\//, ''));
          const bytes = await vscode.workspace.fs.readFile(uri);
          const content = Buffer.from(bytes).toString('utf8');
          // For library view, open local files in host instead of returning content
          try { await openWithAggoEditor(uri); } catch (e) { console.warn('[aggo] failed to open local document in host with aggo editor', e); }
          respondWithCommand('openFileResponse', { id, content: null });
          return true;
        } catch (err: any) {
          respondWithCommand('openFileResponse', { id, content: JSON.stringify({ error: err?.message || String(err) }) });
        }
        return true;
      }
      if (command === 'saveFile') {
        try {
          if (/^https?:\/\//i.test(targetPath)) {
            let tmpUri = tempFileMap.get(targetPath);
            if (!tmpUri) {
              const tmpName = `aggo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.basename(targetPath)}`;
              tmpUri = vscode.Uri.file(path.join(os.tmpdir(), tmpName));
              tempFileMap.set(targetPath, tmpUri);
            }
            const content = typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '', null, 2);
            await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(content || '', 'utf8'));
            console.log('[aggo] saved remote tmp file at', tmpUri.fsPath);
            respondWithCommand('saveFileResponse', { id, success: true, tmpUri: tmpUri.toString() });
            return true;
          }
          const uri = resolveLocalUri(targetPath.replace(/^\.\//, ''));
          const content = typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '', null, 2);
          await vscode.workspace.fs.writeFile(uri, Buffer.from(content || '', 'utf8'));
          respondWithCommand('saveFileResponse', { id, success: true });
        } catch (err: any) {
          respondWithCommand('saveFileResponse', { id, success: false, error: err?.message || String(err) });
        }
        return true;
      }
      return false;
    };

    webviewView.webview.html = getHtmlForWebview(
      webviewView.webview,
      this.extensionUri,
      AggoComponentLibraryProvider.viewType,
      'Aggo Components',
      this.isDev
    );

    // Load component registry and send it to the view when ready
    const sendRegistry = async () => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) return;
        const registryPath = path.join(workspaceFolder, '.aggo', 'components', 'component_registry.json');
        if (!fs.existsSync(registryPath)) return;
        const raw = fs.readFileSync(registryPath, 'utf8');
        const registry = JSON.parse(raw || '{}');
        // Map file references to webview URIs
        const mapped: any = {};
        for (const key of Object.keys(registry)) {
          try {
            const entry = registry[key];
            const filePath = entry.file && entry.file.startsWith('.') ? path.join(workspaceFolder, entry.file) : entry.file;
            const fileUri = vscode.Uri.file(filePath);
            const webUri = webviewView.webview.asWebviewUri(fileUri).toString();
            mapped[key] = { ...entry, file: webUri };
          } catch (err) { console.warn('[aggo] failed mapping registry entry', err); }
        }
        webviewView.webview.postMessage({ type: 'componentCatalogUpdated', registry: mapped });
      } catch (err) { console.warn('[aggo] failed to send component registry', err); }
    };

    // NOTE: Centralized watcher exists in extension.ts; keep provider lightweight and rely on broadcastComponentRegistry
    let watcher: vscode.FileSystemWatcher | undefined;

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (await handleFileBridgeCommand(message)) {
        return;
      }
      if (message.type === 'ready') {
        webviewView.webview.postMessage({
          type: 'init',
          viewType: AggoComponentLibraryProvider.viewType
        });
      } else if (message.type === 'libraryReady') {
        // Library component mounted, now send registry
        await sendRegistry();
      } else if (message.type === 'addComponent') {
        // Broadcast to active editor via a command or event
        // For now, let's try to find the active custom editor. 
        // Since we can't easily get the active custom editor instance, we'll use a global event or command.
        // Let's assume we register a command 'aggo.insertComponent' in extension.ts
        vscode.commands.executeCommand('aggo.insertComponent', message.data);
      }
    });
    webviewView.onDidDispose(() => {
      try { watcher?.dispose(); } catch (e) { /* ignore */ }
    });
  }
}


