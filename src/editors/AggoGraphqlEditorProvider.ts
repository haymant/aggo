import * as vscode from 'vscode';
import * as path from 'path';
import { getHtmlForWebview } from '../utils/webviewHelper';
import { setActivePanel, getActivePanel, registerPanel, unregisterPanel } from '../utils/activePanel';
import { AggoPropertyViewProvider } from '../views/AggoPropertyViewProvider';

export class AggoGraphqlEditorProvider implements vscode.CustomTextEditorProvider {
  private viewType: string;
  private title: string;
  private isDev: boolean;

  constructor(
    private readonly extensionUri: vscode.Uri,
    viewType: string,
    title: string,
    isDev: boolean = false
  ) {
    this.viewType = viewType;
    this.title = title;
    this.isDev = isDev;
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: workspaceRoot ? [this.extensionUri, workspaceRoot] : [this.extensionUri]
    };

    webviewPanel.webview.html = getHtmlForWebview(webviewPanel.webview, this.extensionUri, this.viewType, this.title, this.isDev);

    if (webviewPanel.active) setActivePanel(webviewPanel);
    registerPanel(webviewPanel, this.viewType);
    webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) setActivePanel(e.webviewPanel);
      else if (getActivePanel && getActivePanel() === e.webviewPanel) setActivePanel(undefined);
    });

    const themeWatcher = vscode.window.onDidChangeActiveColorTheme((e) => {
      const theme = (e.kind === vscode.ColorThemeKind.Dark || e.kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
      webviewPanel.webview.postMessage({ type: 'theme', theme });
    });
    webviewPanel.onDidDispose(() => themeWatcher.dispose());

    // Runtime GraphQL addons are synced on explicit user action from the webview
    // to avoid noisy errors when runtime settings are not configured.

    const openInTextEditor = async (uri: vscode.Uri) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
    };

    const applyFullTextReplace = async (text: string) => {
      const edit = new vscode.WorkspaceEdit();
      const lastLine = Math.max(0, document.lineCount - 1);
      const endPos = document.lineAt(lastLine).range.end;
      edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), endPos), text || '');
      await vscode.workspace.applyEdit(edit);
    };

    webviewPanel.webview.onDidReceiveMessage(async (msg: any) => {
      if (msg?.type === 'ready') {
        const initialTheme = (vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
        webviewPanel.webview.postMessage({
          type: 'init',
          viewType: this.viewType,
          title: this.title,
          uri: document.uri.toString(),
          text: document.getText(),
          theme: initialTheme
        });
        return;
      }

      if (msg?.type === 'update') {
        try {
          await applyFullTextReplace(msg.text || '');
        } catch (e) {
          console.warn('[aggo] failed applying update from webview (graphql):', e);
        }
        return;
      }

      if (msg?.type === 'requestSave') {
        try {
          await document.save();
        } catch (e) {
          console.warn('[aggo] failed saving graphql document:', e);
        }
        return;
      }

      if (msg?.type === 'openInTextEditor') {
        try {
          const target = typeof msg?.uri === 'string' ? vscode.Uri.parse(msg.uri) : document.uri;
          await openInTextEditor(target);
        } catch (e) {
          console.warn('[aggo] failed opening graphql document in text editor:', e);
        }
        return;
      }

      if (msg?.type === 'openFile') {
        try {
          const p = msg?.path as string | undefined;
          if (!p) return;
          // Allow file: URIs, absolute paths, or workspace-relative paths.
          const uri = p.startsWith('file:')
            ? vscode.Uri.parse(p)
            : path.isAbsolute(p)
              ? vscode.Uri.file(p)
              : workspaceRoot
                ? vscode.Uri.file(path.join(workspaceRoot.fsPath, p))
                : vscode.Uri.file(p);
          await openInTextEditor(uri);
        } catch (e) {
          console.warn('[aggo] failed opening file from graphql webview:', e);
        }
        return;
      }

      if (msg?.type === 'syncGraphqlRuntime') {
        try {
          await vscode.commands.executeCommand('aggo.syncGraphqlRuntime', { schemaPathOrUri: document.uri.toString() });
        } catch (e) {
          console.warn('[aggo] failed syncing GraphQL runtime addons:', e);
        }
        return;
      }

      if (msg?.type === 'scaffoldResolver') {
        // Delegate to runtime sync which will generate resolver stubs when provided.
        try {
          const resolverId = typeof msg?.resolverId === 'string' ? msg.resolverId.trim() : '';
          const schemaUri = typeof msg?.schemaUri === 'string' ? msg.schemaUri : document.uri.toString();
          await vscode.commands.executeCommand('aggo.syncGraphqlRuntime', {
            schemaPathOrUri: schemaUri,
            resolverIds: resolverId ? [resolverId] : []
          });
        } catch (e) {
          console.warn('[aggo] failed scaffolding resolver:', e);
        }
        return;
      }

      if (msg?.type === 'selectionChanged') {
        // Forward selection changes from the GraphQL visual editor to the details/properties pane.
        try {
          AggoPropertyViewProvider.postMessageToWebview({ type: 'selectionChanged', element: msg.element });
        } catch (e) {
          console.warn('[aggo] failed to forward selectionChanged to property view (graphql)', e);
        }
        return;
      }
    });

    webviewPanel.onDidDispose(() => {
      unregisterPanel(webviewPanel, this.viewType);
    });

    const docChangeWatcher = vscode.workspace.onDidChangeTextDocument((ev) => {
      if (ev.document.uri.toString() === document.uri.toString()) {
        webviewPanel.webview.postMessage({ type: 'documentChanged', text: ev.document.getText() });
      }
    });

    webviewPanel.onDidDispose(() => {
      docChangeWatcher.dispose();
    });
  }
}

export default AggoGraphqlEditorProvider;
