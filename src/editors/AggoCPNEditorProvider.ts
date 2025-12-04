import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { getDevServer } from '../utils/devServer';
import { setActivePanel } from '../utils/activePanel';
import { normalizeBridgeContent } from '../utils/fileBridge';

export class AggoCPNEditorProvider implements vscode.CustomTextEditorProvider {
  private isDev: boolean;
  constructor(private readonly extensionUri: vscode.Uri, private readonly title = 'Aggo CPN Editor', isDev: boolean = false) { this.isDev = isDev; }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };

    const html = this.getHtmlForWebview(webviewPanel.webview);
    webviewPanel.webview.html = html;

    if (webviewPanel.active) setActivePanel(webviewPanel);
    webviewPanel.onDidChangeViewState(e => { if (e.webviewPanel.active) setActivePanel(e.webviewPanel); else setActivePanel(undefined); });

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

    const tempFileMap = new Map<string, vscode.Uri>();

    const resolveLocalUri = (targetPath: string): vscode.Uri => {
      if (targetPath.startsWith('file:')) {
        return vscode.Uri.parse(targetPath);
      }
      if (path.isAbsolute(targetPath)) {
        return vscode.Uri.file(targetPath);
      }
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const baseDir = workspaceFolder ?? path.dirname(document.uri.fsPath);
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

    const handleFileBridgeCommand = async (msg: any): Promise<boolean> => {
      const command = msg?.command || msg?.type;
      if (command !== 'openFile' && command !== 'saveFile') {
        return false;
      }
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
          if (uri.toString() !== document.uri.toString()) {
            try { await openWithAggoEditor(uri); } catch (e) { console.warn('[aggo] failed to open local document in host with aggo editor', e); }
            respondWithCommand('openFileResponse', { id, content: null });
            return true;
          }
          respondWithCommand('openFileResponse', { id, content: normalizeBridgeContent(content) });
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
            const content = typeof msg?.content === 'string' ? msg.content : JSON.stringify(msg?.content ?? '', null, 2);
            await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(content || '', 'utf8'));
            console.log('[aggo] saved remote tmp file at', tmpUri.fsPath);
            respondWithCommand('saveFileResponse', { id, success: true, tmpUri: tmpUri.toString() });
            return true;
          }
          const uri = resolveLocalUri(targetPath.replace(/^\.\//, ''));
          const content = typeof msg?.content === 'string' ? msg.content : JSON.stringify(msg?.content ?? '', null, 2);
          await vscode.workspace.fs.writeFile(uri, Buffer.from(content || '', 'utf8'));
          respondWithCommand('saveFileResponse', { id, success: true });
        } catch (err: any) {
          respondWithCommand('saveFileResponse', { id, success: false, error: err?.message || String(err) });
        }
        return true;
      }
      return false;
    };

    // Handshake: accept `ready` and send a lightweight `init`
    webviewPanel.webview.onDidReceiveMessage(async (msg: any) => {
      if (await handleFileBridgeCommand(msg)) {
        return;
      }
      switch (msg?.type) {
        case 'ready': {
          webviewPanel.webview.postMessage({ type: 'init', text: document.getText(), uri: document.uri.toString() });
          break;
        }
        case 'requestSave': {
          try { await document.save(); } catch (e) { console.warn('Failed to save', e); }
          break;
        }
        case 'update': {
          try {
              // Coalesce frequent updates (e.g. during drag) into a single WorkspaceEdit
              pendingUpdateText = msg.text;
              if (updateTimer) clearTimeout(updateTimer);
              updateTimer = setTimeout(async () => {
                try {
                  const current = document.getText();
                  if (current === pendingUpdateText) { pendingUpdateText = undefined; updateTimer = undefined; return; }
                  const edit = new vscode.WorkspaceEdit();
                  const lastLine = Math.max(0, document.lineCount - 1);
                  const endPos = document.lineAt(lastLine).range.end;
                  edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), endPos), pendingUpdateText || '');
                  await vscode.workspace.applyEdit(edit);
                  // mark we last wrote this text so we can avoid echo loops when onDidChangeTextDocument fires
                  lastWrittenText = pendingUpdateText;
                  pendingUpdateText = undefined;
                  updateTimer = undefined;
                } catch (err) {
                  console.warn('Failed applying update from webview (cpn):', err);
                }
              }, 200 /* debounce ms */);
            // Do not save here automatically — let the user save or use requestSave
          } catch (err) {
            console.warn('Failed applying update from webview (cpn):', err);
          }
          break;
        }
        default: {
          if (!msg?.command) {
            // intentionally quiet for command-only payloads
          }
        }
      }
    });

    // Keep track of last text written to avoid echo loops (not yet implemented)
    let lastWrittenText: string | undefined;
    // Debounce applying updates from the webview so drags/rapid updates don't spam workspace edits
    let updateTimer: NodeJS.Timeout | undefined;
    let pendingUpdateText: string | undefined;

    const docChangeWatcher = vscode.workspace.onDidChangeTextDocument((ev) => {
      if (ev.document.uri.toString() === document.uri.toString()) {
        try {
          const docText = ev.document.getText();
          if (typeof lastWrittenText !== 'undefined' && lastWrittenText === docText) {
            lastWrittenText = undefined;
            return;
          }
        } catch (e) { /* ignore */ }
        try { webviewPanel.webview.postMessage({ type: 'documentChanged', text: ev.document.getText() }); } catch (e) { console.warn('Failed to forward document change to webview (cpn):', e); }
      }
    });
    webviewPanel.onDidDispose(() => { docChangeWatcher.dispose(); if (updateTimer) clearTimeout(updateTimer); });
    
      // Forward theme changes to the webview to keep the UI consistent
      const themeWatcher = vscode.window.onDidChangeActiveColorTheme((e) => {
        const theme = (e.kind === vscode.ColorThemeKind.Dark || e.kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
        webviewPanel.webview.postMessage({ type: 'theme', theme });
      });
      webviewPanel.onDidDispose(() => themeWatcher.dispose());
  }

  private getHtmlForWebview(webview: vscode.Webview) {
    const nonce = this.getNonce();
    // Use dev server when in development; otherwise load packaged assets from `media/cpn.webview.js` that Vite builds
    const useDevServer = this.isDev;
    const devServer = getDevServer();
    const scriptSource = useDevServer ? devServer.httpUrl : webview.cspSource;
    // Dev server path for cpn uses the same app CSS (styles/index.css) as other webviews.
    const scriptUri = useDevServer ? `${devServer.httpUrl}/src/cpn/index.tsx` : webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'cpn.webview.js'));
    const styleUri = useDevServer ? `${devServer.httpUrl}/src/styles/index.css` : webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'cpn.css'));
    const mainCssUri = useDevServer ? `${devServer.httpUrl}/src/styles/index.css` : webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'));
    const viteClientUri = useDevServer ? `${devServer.httpUrl}/@vite/client` : '';
    return `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta http-equiv="Content-Security-Policy"
            content="default-src 'none'; ${useDevServer ? `script-src ${devServer.httpUrl} 'unsafe-inline'; style-src ${devServer.httpUrl} 'unsafe-inline'; connect-src ${devServer.httpUrl} ${devServer.wsUrl};` : `script-src 'nonce-${nonce}' ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; connect-src ${webview.cspSource};`} img-src ${webview.cspSource} https: data:;" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          ${useDevServer ? `<link rel="stylesheet" href="${styleUri}">` : `<link rel="stylesheet" href="${styleUri}">`}
          ${!useDevServer ? `<link rel="stylesheet" href="${mainCssUri}">` : ''}
          <style>
            html,body,#root{height:100%;width:100%;margin:0}
            .aggo-root{height:100%;}
          </style>
        </head>
        <body>
          <div id="root" class="aggo-root"></div>
          ${useDevServer ? `
          <script nonce="${nonce}" type="module">
            import { injectIntoGlobalHook } from "${devServer.httpUrl}/@react-refresh";
            injectIntoGlobalHook(window);
            window.$RefreshReg$ = () => {};
            window.$RefreshSig$ = () => (type) => type;
          </script>
          <script nonce="${nonce}" type="module" src="${viteClientUri}"></script>
          ` : ''}
          <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
        </body>
      </html>`;
  }

  private getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
  }
}
