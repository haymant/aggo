import * as vscode from 'vscode';
import * as path from 'path';
import { getHtmlForWebview } from '../utils/webviewHelper';
import { AggoPropertyViewProvider } from '../views/AggoPropertyViewProvider';
import { setActivePanel, getActivePanel } from '../utils/activePanel';
import { normalizeBridgeContent } from '../utils/fileBridge';
import { attachFileBridgeHandler } from '../utils/attachFileBridgeHandler';
import { registerPanel, unregisterPanel } from '../utils/activePanel';

export class AggoSchemaEditorProvider implements vscode.CustomTextEditorProvider {
  public static activePanel: vscode.WebviewPanel | undefined;
  private viewType: string;
  private title: string;
  private isDev: boolean;
  constructor(private readonly extensionUri: vscode.Uri, viewType: string, title: string, isDev: boolean = false) {
    this.isDev = isDev;
    this.viewType = viewType;
    this.title = title;
  }

  public async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    const html = getHtmlForWebview(webviewPanel.webview, this.extensionUri, this.viewType, this.title, this.isDev);
    webviewPanel.webview.html = html;

    if (webviewPanel.active) setActivePanel(webviewPanel);
    registerPanel(webviewPanel, this.viewType);
    webviewPanel.onDidChangeViewState(e => {
      if (e.webviewPanel.active) setActivePanel(e.webviewPanel);
      else if (getActivePanel && getActivePanel() === e.webviewPanel) setActivePanel(undefined);
    });

    const themeWatcher = vscode.window.onDidChangeActiveColorTheme((e) => {
      const theme = (e.kind === vscode.ColorThemeKind.Dark || e.kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
      webviewPanel.webview.postMessage({ type: 'theme', theme });
    });
    webviewPanel.onDidDispose(() => themeWatcher.dispose());

    // attach shared file bridge
    const bridge = attachFileBridgeHandler({ webviewPanel, document, openWithEditor: 'aggo.schemaEditor', preferDocumentDir: true });

    // forward ready/init and other messages
    webviewPanel.webview.onDidReceiveMessage((msg: any) => {
      if (msg.type === 'ready') {
        const initialTheme = (vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
        webviewPanel.webview.postMessage({ type: 'init', viewType: this.viewType, title: this.title, uri: document.uri.toString(), text: document.getText(), theme: initialTheme });
      } else if (msg.type === 'update') {
        // debounced saving handled in caller (copy paste behavior maintained elsewhere)
        try {
          // apply change
          const edit = new vscode.WorkspaceEdit();
          const lastLine = Math.max(0, document.lineCount - 1);
          const endPos = document.lineAt(lastLine).range.end;
          edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), endPos), msg.text || '');
          vscode.workspace.applyEdit(edit);
        } catch (e) { console.warn('[aggo] failed applying update from webview (schema):', e); }
      } else if (msg.type === 'requestSave') {
        try { document.save(); } catch (e) { console.warn('[aggo] failed saving document:', e); }
      }
    });

    webviewPanel.onDidDispose(() => { unregisterPanel(webviewPanel, this.viewType); });
    const docChangeWatcher = vscode.workspace.onDidChangeTextDocument((ev) => {
      if (ev.document.uri.toString() === document.uri.toString()) {
        webviewPanel.webview.postMessage({ type: 'documentChanged', text: ev.document.getText() });
      }
    });
    webviewPanel.onDidDispose(() => { docChangeWatcher.dispose(); bridge.dispose(); });
  }
}

export default AggoSchemaEditorProvider;
