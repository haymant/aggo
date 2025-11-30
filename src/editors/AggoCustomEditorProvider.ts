import * as vscode from 'vscode';
import * as path from 'path';

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
      enableScripts: true
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
            const current = document.getText();
            if (current === msg.text) break;
            const edit = new vscode.WorkspaceEdit();
            const lastLine = Math.max(0, document.lineCount - 1);
            const endPos = document.lineAt(lastLine).range.end;
            edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), endPos), msg.text);
            lastWrittenText = msg.text;
            await vscode.workspace.applyEdit(edit);
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
    webviewPanel.onDidDispose(() => docChangeWatcher.dispose());
  }

  private getHtmlForWebview(webview: vscode.Webview, resource: vscode.Uri, viewType: string, title: string) {
    let scriptUri: vscode.Uri | string;
    let styleUri: vscode.Uri | string | undefined;
    
    // Use the Vite dev server when the extension is running in development mode.
    const useDevServer = this.isDev;

    if (useDevServer) {
      // Vite dev server
      scriptUri = 'http://localhost:5173/src/index.tsx';
      styleUri = 'http://localhost:5173/src/styles/index.css';
    } else {
      const scriptPathOnDisk = vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.js');
      scriptUri = webview.asWebviewUri(scriptPathOnDisk);
      const cssPathOnDisk = vscode.Uri.joinPath(this.extensionUri, 'media', 'index.css');
      styleUri = webview.asWebviewUri(cssPathOnDisk);
    }

    const nonce = getNonce();
    const initialTheme = (vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
    
    return `<!doctype html>
      <html lang="en" class="${initialTheme}">
        <head>
          <meta charset="utf-8" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${useDevServer ? 'http://localhost:5173' : webview.cspSource}; style-src ${useDevServer ? 'http://localhost:5173' : webview.cspSource} 'unsafe-inline'; connect-src ${useDevServer ? 'ws://localhost:5173' : webview.cspSource}; img-src ${webview.cspSource} https: data:;" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          ${styleUri ? `<link rel="stylesheet" href="${styleUri}">` : ''}
          <title>${title}</title>
        </head>
        <body class="${initialTheme}">
          <div id="root" class="jsonjoy ${initialTheme}"></div>
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
