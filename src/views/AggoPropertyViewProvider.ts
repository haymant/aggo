import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { getHtmlForWebview } from '../utils/webviewHelper';
import { normalizeBridgeContent } from '../utils/fileBridge';

export class AggoPropertyViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aggo.properties';
  private static _instance?: AggoPropertyViewProvider;
  private _view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri, private readonly isDev: boolean = false) {
    AggoPropertyViewProvider._instance = this;
  }

  public static postMessageToWebview(message: any) {
    if (AggoPropertyViewProvider._instance && AggoPropertyViewProvider._instance._view) {
      AggoPropertyViewProvider._instance._view.webview.postMessage(message);
    }
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
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
          // if this is not the main doc (no document binding for property view), open in host
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
      AggoPropertyViewProvider.viewType,
      'Aggo Properties',
      this.isDev
    );

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (await handleFileBridgeCommand(message)) {
        return;
      }
      if (message.type === 'ready') {
        webviewView.webview.postMessage({
          type: 'init',
          viewType: AggoPropertyViewProvider.viewType
        });
      } else if (message.type === 'updateElement') {
        vscode.commands.executeCommand('aggo.updateElement', message.element);
      }
    });
  }
}


