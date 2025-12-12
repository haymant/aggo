import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getHtmlForWebview } from '../utils/webviewHelper';
import { setActivePanel, registerPanel, unregisterPanel } from '../utils/activePanel';
import { AggoPropertyViewProvider } from '../views/AggoPropertyViewProvider';
import { attachFileBridgeHandler } from '../utils/attachFileBridgeHandler';

export class AggoPageEditorProvider implements vscode.CustomTextEditorProvider {
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

    const bridge = attachFileBridgeHandler({ webviewPanel, document, openWithEditor: 'aggo.pageEditor', preferDocumentDir: true });

    webviewPanel.webview.onDidReceiveMessage(async (msg: any) => {
      if (msg.type === 'ready') {
        webviewPanel.webview.postMessage({ type: 'init', viewType: this.viewType, title: this.title, uri: document.uri.toString(), text: document.getText() });
        // Also send available component registry if present
        try {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceFolder) {
            const registryPath = path.join(workspaceFolder, '.aggo', 'components', 'component_registry.json');
            if (fs.existsSync(registryPath)) {
              const raw = fs.readFileSync(registryPath, 'utf8');
              const registry = JSON.parse(raw || '{}');
              const mapped: any = {};
              for (const key of Object.keys(registry)) {
                try {
                  const entry = registry[key];
                  const filePath = entry.file && entry.file.startsWith('.') ? path.join(workspaceFolder, entry.file) : entry.file;
                  const fileUri = vscode.Uri.file(filePath);
                  const webUri = webviewPanel.webview.asWebviewUri(fileUri).toString();
                  mapped[key] = { ...entry, file: webUri };
                } catch (err) { console.warn('[aggo] failed mapping registry entry for page editor', err); }
              }
              webviewPanel.webview.postMessage({ type: 'componentCatalogUpdated', registry: mapped });
            }
          }
        } catch (err) {
          console.warn('[aggo] failed to load component registry for page editor', err);
        }
      } else if (msg.type === 'update') {
        try {
          const edit = new vscode.WorkspaceEdit();
          const lastLine = Math.max(0, document.lineCount - 1);
          const endPos = document.lineAt(lastLine).range.end;
          edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), endPos), msg.text || '');
          await vscode.workspace.applyEdit(edit);
        } catch (e) { console.warn('[aggo] failed applying update for page editor', e); }
      } else if (msg.type === 'requestSave') {
        try { await document.save(); } catch (e) { console.warn('[aggo] failed saving page editor doc', e); }
      } else if (msg.type === 'selectionChanged') {
        // Forward selection changes from the page editor to the property view if present
        try {
          AggoPropertyViewProvider.postMessageToWebview({ type: 'selectionChanged', element: msg.element });
          console.debug('[aggo] forwarded selectionChanged from page editor to property view', { elementId: msg?.element?.id });
        } catch (e) { console.warn('[aggo] failed to forward selectionChanged to property view', e); }
      }
    });

    const docChangeWatcher = vscode.workspace.onDidChangeTextDocument((ev) => {
      if (ev.document.uri.toString() === document.uri.toString()) webviewPanel.webview.postMessage({ type: 'documentChanged', text: ev.document.getText() });
    });
    // NOTE: Centralized watcher exists in extension.ts; the page editor will receive broadcasts from the extension
    webviewPanel.onDidDispose(() => { docChangeWatcher.dispose(); bridge.dispose(); unregisterPanel(webviewPanel, this.viewType); });
  }
}

export default AggoPageEditorProvider;
