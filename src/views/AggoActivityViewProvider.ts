import * as vscode from 'vscode';

export class AggoActivityViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aggoActivityHello';
  constructor(private readonly extensionUri: vscode.Uri) {
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    const nonce = this.getNonce();

    // Load media icon as a webview-URI
    const iconUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'aggo.svg'));

    webviewView.webview.html = `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            html,body { padding:0; margin:0; height:100%; }
            .root { display:flex; align-items:center; justify-content:center; height:100%; font-family: sans-serif; }
            .logo { width:24px; height:24px; margin-right:8px; }
            .hello { font-weight:600; }
          </style>
        </head>
        <body>
          <div class="root">
            <img class="logo" src="${iconUri}" alt="Aggo" />
            <div class="hello">Hello, Aggo Action</div>
          </div>
        </body>
      </html>`;
  }

  private getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
