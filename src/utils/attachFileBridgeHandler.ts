import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { normalizeBridgeContent } from './fileBridge';

export interface AttachFileBridgeOptions {
  webviewPanel: vscode.WebviewPanel;
  document?: vscode.TextDocument;
  openWithEditor?: string; // default 'aggo.schemaEditor'
  preferDocumentDir?: boolean; // default true
}

export function attachFileBridgeHandler({ webviewPanel, document, openWithEditor = 'aggo.schemaEditor', preferDocumentDir = true }: AttachFileBridgeOptions) {
  const tempFileMap = new Map<string, vscode.Uri>();
  const pendingSaves = new Map<string, (r: any) => void>();

  const fetchRemoteText = async (url: string): Promise<string> => {
    const fetchFn = (globalThis as any).fetch;
    if (typeof fetchFn !== 'function') {
      throw new Error('Network fetch is not available');
    }
    const response = await fetchFn(url);
    return response.text();
  };

  const respondWithCommand = (command: string, payload: Record<string, any>) => {
    webviewPanel.webview.postMessage({ ...payload, command, type: command });
  };

  const resolveLocalUri = (targetPath: string): vscode.Uri => {
    if (targetPath.startsWith('file:')) {
      return vscode.Uri.parse(targetPath);
    }
    if (path.isAbsolute(targetPath)) {
      return vscode.Uri.file(targetPath);
    }
    let baseDir: string | undefined;
    if (preferDocumentDir && document) baseDir = path.dirname(document.uri.fsPath);
    if (!baseDir && vscode.workspace.workspaceFolders?.[0]?.uri.fsPath) baseDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
    if (!baseDir) baseDir = process.cwd();
    return vscode.Uri.file(path.resolve(baseDir, targetPath));
  };

  const openWithAggoEditor = async (uri: vscode.Uri) => {
    try {
      await vscode.commands.executeCommand('vscode.openWith', uri, openWithEditor);
      return true;
    } catch (_err) {
      // fallback to default
      try { const doc = await vscode.workspace.openTextDocument(uri); await vscode.window.showTextDocument(doc, { preview: false }); return true; } catch (e) { console.warn('[aggo] failed to open with aggo.editor fallback to default', e); return false; }
    }
  };

  const handler = async (msg: any) => {
    const command = msg?.command || msg?.type;
    if (command !== 'openFile' && command !== 'saveFile') return false;
    const id = msg?.id;
    const targetPath = msg?.path as string;
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
        // If caller document exists and the uri isn't the caller, open in host
        if (document && uri.toString() !== document.uri.toString()) {
          try { await openWithAggoEditor(uri); } catch (e) { console.warn('[aggo] failed to open local document in host with aggo editor', e); }
          respondWithCommand('openFileResponse', { id, content: null });
          return true;
        }
        respondWithCommand('openFileResponse', { id, content: normalizeBridgeContent(content) });
        return true;
      } catch (err: any) {
        respondWithCommand('openFileResponse', { id, content: JSON.stringify({ error: err?.message || String(err) }) });
        return true;
      }
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
          const content = typeof msg?.content === 'string' ? msg.content : JSON.stringify(msg?.content ?? '', null, 2);
          await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(content || '', 'utf8'));
          respondWithCommand('saveFileResponse', { id, success: true, tmpUri: tmpUri.toString() });
          return true;
        }
        const uri = resolveLocalUri(targetPath.replace(/^\.\//, ''));
        const content = typeof msg?.content === 'string' ? msg.content : JSON.stringify(msg?.content ?? '', null, 2);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content || '', 'utf8'));
        respondWithCommand('saveFileResponse', { id, success: true });
        return true;
      } catch (err: any) {
        respondWithCommand('saveFileResponse', { id, success: false, error: err?.message || String(err) });
        return true;
      }
    }

    return false;
  };

  const disposable = webviewPanel.webview.onDidReceiveMessage(async (msg: any) => {
    await handler(msg);
  });

  return {
    dispose: () => disposable.dispose(),
    tempFileMap,
  };
}
