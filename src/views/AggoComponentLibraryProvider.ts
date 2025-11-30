import * as vscode from 'vscode';
import { getHtmlForWebview } from '../utils/webviewHelper';

export class AggoComponentLibraryProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aggo.library';
  constructor(private readonly extensionUri: vscode.Uri, private readonly isDev: boolean = false) { }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = getHtmlForWebview(
      webviewView.webview,
      this.extensionUri,
      AggoComponentLibraryProvider.viewType,
      'Aggo Components',
      this.isDev
    );

    webviewView.webview.onDidReceiveMessage(message => {
      if (message.type === 'ready') {
        webviewView.webview.postMessage({
          type: 'init',
          viewType: AggoComponentLibraryProvider.viewType
        });
      } else if (message.type === 'addComponent') {
        // Broadcast to active editor via a command or event
        // For now, let's try to find the active custom editor. 
        // Since we can't easily get the active custom editor instance, we'll use a global event or command.
        // Let's assume we register a command 'aggo.insertComponent' in extension.ts
        vscode.commands.executeCommand('aggo.insertComponent', message.data);
      }
    });
  }
}


