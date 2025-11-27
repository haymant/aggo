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

    // Send initial state to the webview
    webviewPanel.webview.postMessage({ type: 'init', viewType: this.viewType, title: this.title, uri: document.uri.toString(), text: document.getText() });

    webviewPanel.webview.onDidReceiveMessage(async (msg: any) => {
      switch (msg.type) {
        case 'requestSave': {
          // Placeholder: not performing any save logic; just showing a notification
          vscode.window.showInformationMessage(`Save requested by ${this.title} for ${document.uri.fsPath}`);
          break;
        }
        default:
          vscode.window.showInformationMessage(`Unknown message from webview (${this.title})`);
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview, resource: vscode.Uri, viewType: string, title: string) {
    let scriptUri: vscode.Uri | string;
    let styleUri: vscode.Uri | string | undefined;
    if (this.isDev) {
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
    return `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${this.isDev ? 'http://localhost:5173' : webview.cspSource}; style-src ${this.isDev ? 'http://localhost:5173' : webview.cspSource} 'unsafe-inline'; connect-src ${this.isDev ? 'ws://localhost:5173' : webview.cspSource}; img-src ${webview.cspSource} https: data:;" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          ${styleUri ? `<link rel="stylesheet" href="${styleUri}">` : ''}
          <title>${title}</title>
        </head>
        <body>
          <div id="root"></div>
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
