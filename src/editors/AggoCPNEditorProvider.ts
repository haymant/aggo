import * as vscode from 'vscode';
import { getDevServer } from '../utils/devServer';

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

    // Handshake: accept `ready` and send a lightweight `init`
    webviewPanel.webview.onDidReceiveMessage(async (msg: any) => {
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
          // intentionally quiet
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
