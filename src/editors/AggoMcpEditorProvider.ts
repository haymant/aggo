import * as vscode from 'vscode';
import { getHtmlForWebview } from '../utils/webviewHelper';
import { setActivePanel, registerPanel, unregisterPanel } from '../utils/activePanel';
import { attachFileBridgeHandler } from '../utils/attachFileBridgeHandler';

export class AggoMcpEditorProvider implements vscode.CustomTextEditorProvider {
  private isDev: boolean;
  private title: string;
  private viewType: string;
  constructor(private readonly extensionUri: vscode.Uri, viewType: string, title: string, isDev: boolean = false) { this.isDev = isDev; this.title = title; this.viewType = viewType; }

  public async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    webviewPanel.webview.html = getHtmlForWebview(webviewPanel.webview, this.extensionUri, this.viewType, this.title, this.isDev);
    if (webviewPanel.active) setActivePanel(webviewPanel);
    registerPanel(webviewPanel, this.viewType);
    webviewPanel.onDidChangeViewState(e => { if (e.webviewPanel.active) setActivePanel(e.webviewPanel); else setActivePanel(undefined); });

    const bridge = attachFileBridgeHandler({ webviewPanel, document, openWithEditor: 'aggo.mcpEditor', preferDocumentDir: true });

    webviewPanel.webview.onDidReceiveMessage(async (msg: any) => {
      if (msg.type === 'ready') {
        webviewPanel.webview.postMessage({ type: 'init', viewType: this.viewType, title: this.title, uri: document.uri.toString(), text: document.getText() });
      } else if (msg.type === 'update') {
        try {
          const edit = new vscode.WorkspaceEdit();
          const lastLine = Math.max(0, document.lineCount - 1);
          const endPos = document.lineAt(lastLine).range.end;
          edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), endPos), msg.text || '');
          await vscode.workspace.applyEdit(edit);
        } catch (e) { console.warn('[aggo] failed applying update for mcp editor', e); }
      } else if (msg.type === 'requestSave') {
        try { await document.save(); } catch (e) { console.warn('[aggo] failed saving mcp editor doc', e); }
      }
    });

    const docChangeWatcher = vscode.workspace.onDidChangeTextDocument((ev) => {
      if (ev.document.uri.toString() === document.uri.toString()) webviewPanel.webview.postMessage({ type: 'documentChanged', text: ev.document.getText() });
    });
    webviewPanel.onDidDispose(() => { docChangeWatcher.dispose(); bridge.dispose(); unregisterPanel(webviewPanel, this.viewType); });
  }
}

export default AggoMcpEditorProvider;
