import * as vscode from 'vscode';
import { getDevServer } from './devServer';

export function getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri, viewType: string, title: string, isDev: boolean) {
    let scriptUri: vscode.Uri | string;
    let styleUri: vscode.Uri | string | undefined;
    let mainCssUri: vscode.Uri | string | undefined;
    
    // Use the Vite dev server when the extension is running in development mode.
    const useDevServer = isDev;
    const devServer = getDevServer();

    if (useDevServer) {
      // Vite dev server, allow overriding host/port via VITE_DEV_SERVER_URL
      scriptUri = `${devServer.httpUrl}/src/index.tsx`;
      styleUri = `${devServer.httpUrl}/src/styles/index.css`;
    } else {
      const scriptPathOnDisk = vscode.Uri.joinPath(extensionUri, 'media', 'main.webview.js');
      scriptUri = webview.asWebviewUri(scriptPathOnDisk);
        const cssPathOnDisk = vscode.Uri.joinPath(extensionUri, 'media', 'index.css');
        const mainCssPathOnDisk = vscode.Uri.joinPath(extensionUri, 'media', 'main.css');
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

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
