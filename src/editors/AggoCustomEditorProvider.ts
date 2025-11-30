import * as vscode from 'vscode';
import * as path from 'path';
import { getDevServer } from '../utils/devServer';

export class AggoCustomEditorProvider implements vscode.CustomTextEditorProvider {
  private viewType: string;
  private title: string;
  private isDev: boolean;
  constructor(private readonly extensionUri: vscode.Uri, viewType: string, title: string, isDev: boolean = false) {
    this.isDev = isDev;
    this.viewType = viewType;
    this.title = title;
  }

  public async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    const html = this.getHtmlForWebview(webviewPanel.webview, document.uri, this.viewType, this.title);
    webviewPanel.webview.html = html;

    // We'll wait for the webview 'ready' handshake before sending large payloads

    // Watch for theme changes and notify webview
    const themeWatcher = vscode.window.onDidChangeActiveColorTheme((e) => {
      const theme = (e.kind === vscode.ColorThemeKind.Dark || e.kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
      webviewPanel.webview.postMessage({ type: 'theme', theme });
    });
    webviewPanel.onDidDispose(() => themeWatcher.dispose());

    // Keep track of last text the extension wrote so we can avoid echoing it back
    let lastWrittenText: string | undefined;
    // Debounce applying updates from the webview to avoid frequent WorkspaceEdit writes
    let updateTimer: NodeJS.Timeout | undefined;
    let pendingUpdateText: string | undefined;

    webviewPanel.webview.onDidReceiveMessage(async (msg: any) => {
      switch (msg.type) {
        case 'ready': {
          const initialTheme = (vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
          webviewPanel.webview.postMessage({ type: 'init', viewType: this.viewType, title: this.title, uri: document.uri.toString(), text: document.getText(), theme: initialTheme });
          break;
        }
        case 'theme': {
          // Not expected: webview notifying extension of theme; ignore
          break;
        }
        case 'update': {
          // Avoid writing the document if content is identical
          try {
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
                lastWrittenText = pendingUpdateText;
                await vscode.workspace.applyEdit(edit);
                pendingUpdateText = undefined;
                updateTimer = undefined;
              } catch (err) {
                console.warn('Failed applying update from webview:', err);
              }
            }, 200);
          } catch (err) {
            console.warn('Failed applying update from webview:', err);
          }
          break;
        }
        case 'requestSave': {
          // Attempt to persist the current text document when requested from the webview.
          try {
            await document.save();
          } catch (err) {
            console.warn(`Failed to save document ${document.uri.fsPath}:`, err);
          }
          break;
        }
        default:
          console.warn(`Unknown message from webview (${this.title}):`, msg);
      }
    });

    // Listen for document changes and forward them to the webview to keep the UI in sync
    const docChangeWatcher = vscode.workspace.onDidChangeTextDocument((ev) => {
      if (ev.document.uri.toString() === document.uri.toString()) {
        // If the change was written by this provider (or mirrored from the webview), skip echoing it back.
        try {
          const docText = ev.document.getText();
          if (typeof lastWrittenText !== 'undefined' && lastWrittenText === docText) {
            lastWrittenText = undefined;
            return;
          }
        } catch (e) {
          /* ignore */
        }
        try {
          webviewPanel.webview.postMessage({ type: 'documentChanged', text: ev.document.getText() });
        } catch (e) {
          console.warn('Failed to forward document change to webview:', e);
        }
      }
    });
    webviewPanel.onDidDispose(() => { docChangeWatcher.dispose(); if (updateTimer) clearTimeout(updateTimer); });
  }

  private getHtmlForWebview(webview: vscode.Webview, resource: vscode.Uri, viewType: string, title: string) {
    let scriptUri: vscode.Uri | string;
    let styleUri: vscode.Uri | string | undefined;
    let mainCssUri: vscode.Uri | string | undefined;
    
    // Use the Vite dev server when the extension is running in development mode.
    const useDevServer = this.isDev;
    const devServer = getDevServer();

    if (useDevServer) {
      // Vite dev server, allow overriding host/port via VITE_DEV_SERVER_URL
      scriptUri = `${devServer.httpUrl}/src/index.tsx`;
      styleUri = `${devServer.httpUrl}/src/styles/index.css`;
    } else {
      const scriptPathOnDisk = vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.js');
      scriptUri = webview.asWebviewUri(scriptPathOnDisk);
        const cssPathOnDisk = vscode.Uri.joinPath(this.extensionUri, 'media', 'index.css');
        const mainCssPathOnDisk = vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css');
        mainCssUri = webview.asWebviewUri(mainCssPathOnDisk);
        styleUri = webview.asWebviewUri(cssPathOnDisk);
    }

    const nonce = getNonce();
    const initialTheme = (vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
    
    const viteClientUri = useDevServer ? `${devServer.httpUrl}/@vite/client` : '';
    return `<!doctype html>
      <html lang="en" class="${initialTheme}">
        <head>
          <meta charset="utf-8" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; ${useDevServer ? `script-src ${devServer.httpUrl} 'unsafe-inline'; style-src ${devServer.httpUrl} 'unsafe-inline'; connect-src ${devServer.httpUrl} ${devServer.wsUrl};` : `script-src 'nonce-${nonce}' ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; connect-src ${webview.cspSource};`} img-src ${webview.cspSource} https: data:;" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          ${styleUri ? `<link rel="stylesheet" href="${styleUri}">` : ''}
          ${mainCssUri ? `<link rel="stylesheet" href="${mainCssUri}">` : ''}
          <title>${title}</title>
        </head>
        <body class="${initialTheme}">
          <div id="root" class="jsonjoy ${initialTheme}"></div>
          ${useDevServer ? `
          <script nonce="${nonce}" type="module">
            import { injectIntoGlobalHook } from "${devServer.httpUrl}/@react-refresh";
            injectIntoGlobalHook(window);
            window.$RefreshReg$ = () => {};
            window.$RefreshSig$ = () => (type) => type;
          </script>
          <script nonce="${nonce}" type="module" src="${viteClientUri}"></script>
          ` : ''}
          <script nonce="${nonce}" src="${scriptUri}" type="module"></script>
        </body>
      </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
