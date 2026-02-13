import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { getDevServer } from '../utils/devServer';
import { setActivePanel, registerPanel, unregisterPanel } from '../utils/activePanel';
import { AggoPropertyViewProvider } from '../views/AggoPropertyViewProvider';
import { pnmlYamlToCpnGraph, applyLayoutToPnmlYaml } from '../utils/pnmlGraph';

export class AggoPNMLEditorProvider implements vscode.CustomTextEditorProvider {
  private isDev: boolean;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly title = 'Aggo PNML Editor',
    isDev: boolean = false
  ) {
    this.isDev = isDev;
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    if (webviewPanel.active) setActivePanel(webviewPanel);
    registerPanel(webviewPanel, 'aggo.pnmlEditor');
    webviewPanel.onDidChangeViewState(e => {
      if (e.webviewPanel.active) setActivePanel(e.webviewPanel);
      else setActivePanel(undefined);
    });

    const postGraph = (type: 'init' | 'documentChanged', text: string) => {
      try {
        const graph = pnmlYamlToCpnGraph(text);
        webviewPanel.webview.postMessage({ type, graph, uri: document.uri.toString() });
      } catch (err: any) {
        webviewPanel.webview.postMessage({ type, graph: { nodes: [], edges: [], errors: [err?.message || String(err)] }, uri: document.uri.toString() });
      }
    };

    let lastWrittenText: string | undefined;
    let updateTimer: NodeJS.Timeout | undefined;
    let pendingNodes: any[] | undefined;
    let suppressNextDocumentChange = false;

    const applyLayoutUpdate = async () => {
      try {
        const current = document.getText();
        const next = applyLayoutToPnmlYaml(current, pendingNodes || []);
        pendingNodes = undefined;
        updateTimer = undefined;

        if (current === next) return;

        const edit = new vscode.WorkspaceEdit();
        const lastLine = Math.max(0, document.lineCount - 1);
        const endPos = document.lineAt(lastLine).range.end;
        edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), endPos), next);
        suppressNextDocumentChange = true;
        await vscode.workspace.applyEdit(edit);
        lastWrittenText = next;
      } catch (err) {
        console.warn('Failed applying update from webview (pnml):', err);
      }
    };

    webviewPanel.webview.onDidReceiveMessage(async (msg: any) => {
      switch (msg?.type) {
        case 'ready': {
          postGraph('init', document.getText());
          break;
        }
        case 'selectionChanged': {
          AggoPropertyViewProvider.postMessageToWebview({ type: 'selectionChanged', element: msg.element });
          break;
        }
        case 'updateLayout': {
          // Coalesce frequent layout updates (drag/auto-layout) into a single WorkspaceEdit.
          try {
            if (!Array.isArray(msg.nodes)) return;
            pendingNodes = msg.nodes;
            if (updateTimer) clearTimeout(updateTimer);
            updateTimer = setTimeout(applyLayoutUpdate, 200);
          } catch (err) {
            console.warn('Failed applying updateLayout (pnml):', err);
          }
          break;
        }
      }
    });

    const docChangeWatcher = vscode.workspace.onDidChangeTextDocument((ev) => {
      if (ev.document.uri.toString() !== document.uri.toString()) return;

      if (suppressNextDocumentChange) {
        suppressNextDocumentChange = false;
        return;
      }

      try {
        const docText = ev.document.getText();
        if (typeof lastWrittenText !== 'undefined' && lastWrittenText === docText) {
          lastWrittenText = undefined;
          return;
        }
      } catch {
        // ignore
      }

      try {
        postGraph('documentChanged', ev.document.getText());
      } catch (e) {
        console.warn('Failed to forward document change to webview (pnml):', e);
      }
    });

    webviewPanel.onDidDispose(() => {
      docChangeWatcher.dispose();
      if (updateTimer) clearTimeout(updateTimer);
      unregisterPanel(webviewPanel, 'aggo.pnmlEditor');
    });

    const themeWatcher = vscode.window.onDidChangeActiveColorTheme((e) => {
      const theme = (e.kind === vscode.ColorThemeKind.Dark || e.kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
      webviewPanel.webview.postMessage({ type: 'theme', theme });
    });
    webviewPanel.onDidDispose(() => themeWatcher.dispose());
  }

  private getHtmlForWebview(webview: vscode.Webview) {
    const nonce = crypto.randomBytes(16).toString('base64');
    const initialTheme = (vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';

    const useDevServer = this.isDev;
    const devServer = getDevServer();

    const scriptUri = useDevServer
      ? `${devServer.httpUrl}/src/pnml/index.tsx`
      : webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'pnml.webview.js'));
    const styleUri = useDevServer
      ? `${devServer.httpUrl}/src/pnml/index.tsx`
      : webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'cpn.css'));
    const mainCssUri = useDevServer
      ? `${devServer.httpUrl}/src/styles/index.css`
      : webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'index.css'));
    const viteClientUri = useDevServer ? `${devServer.httpUrl}/@vite/client` : '';

    return `<!doctype html>
      <html lang="en" class="${initialTheme}">
        <head>
          <meta charset="utf-8" />
          <meta http-equiv="Content-Security-Policy"
            content="default-src 'none'; ${useDevServer ? `script-src ${devServer.httpUrl} 'unsafe-inline'; style-src ${devServer.httpUrl} 'unsafe-inline'; connect-src ${devServer.httpUrl} ${devServer.wsUrl};` : `script-src 'nonce-${nonce}' ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; connect-src ${webview.cspSource};`} img-src ${webview.cspSource} https: data:;" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <link rel="stylesheet" href="${styleUri}">
          ${!useDevServer ? `<link rel="stylesheet" href="${mainCssUri}">` : ''}
          <style>
            html,body,#root{height:100%;width:100%;margin:0}
            .aggo-root{height:100%;}
          </style>
        </head>
        <body class="${initialTheme}">
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
}
