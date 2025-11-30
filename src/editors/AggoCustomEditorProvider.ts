import * as vscode from 'vscode';
import * as path from 'path';
import { getHtmlForWebview } from '../utils/webviewHelper';
import { AggoPropertyViewProvider } from '../views/AggoPropertyViewProvider';

export class AggoCustomEditorProvider implements vscode.CustomTextEditorProvider {
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
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    const html = getHtmlForWebview(webviewPanel.webview, this.extensionUri, this.viewType, this.title, this.isDev);
    webviewPanel.webview.html = html;

    // Track active panel
    if (webviewPanel.active) {
      AggoCustomEditorProvider.activePanel = webviewPanel;
    }
    webviewPanel.onDidChangeViewState(e => {
      if (e.webviewPanel.active) {
        AggoCustomEditorProvider.activePanel = e.webviewPanel;
      } else if (AggoCustomEditorProvider.activePanel === e.webviewPanel) {
        AggoCustomEditorProvider.activePanel = undefined;
      }
    });

    // We'll wait for the webview 'ready' handshake before sending large payloads

    // Watch for theme changes and notify webview
    const themeWatcher = vscode.window.onDidChangeActiveColorTheme((e) => {
      const theme = (e.kind === vscode.ColorThemeKind.Dark || e.kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
      webviewPanel.webview.postMessage({ type: 'theme', theme });
    });
    webviewPanel.onDidDispose(() => themeWatcher.dispose());

    // Keep track of last text the extension wrote so we can avoid echoing it back
    let lastWrittenText: string | undefined;
    // Debounce applying updates from the webview to avoid frequent WorkspaceEdit writes
    let updateTimer: NodeJS.Timeout | undefined;
    let pendingUpdateText: string | undefined;

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
                lastWrittenText = pendingUpdateText;
                await vscode.workspace.applyEdit(edit);
                pendingUpdateText = undefined;
                updateTimer = undefined;
              } catch (err) {
                console.warn('Failed applying update from webview:', err);
              }
            }, 200);
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
        case 'selectionChanged': {
          AggoPropertyViewProvider.postMessageToWebview({
            type: 'selectionChanged',
            element: msg.element
          });
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
    webviewPanel.onDidDispose(() => { docChangeWatcher.dispose(); if (updateTimer) clearTimeout(updateTimer); });
  }
}
