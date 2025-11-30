import * as vscode from 'vscode';
import { getHtmlForWebview } from '../utils/webviewHelper';

export class AggoPropertyViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aggo.properties';
  private static _instance?: AggoPropertyViewProvider;
  private _view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri, private readonly isDev: boolean = false) {
    AggoPropertyViewProvider._instance = this;
  }

  public static postMessageToWebview(message: any) {
    if (AggoPropertyViewProvider._instance && AggoPropertyViewProvider._instance._view) {
      AggoPropertyViewProvider._instance._view.webview.postMessage(message);
    }
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = getHtmlForWebview(
      webviewView.webview,
      this.extensionUri,
      AggoPropertyViewProvider.viewType,
      'Aggo Properties',
      this.isDev
    );

    webviewView.webview.onDidReceiveMessage(message => {
      if (message.type === 'ready') {
        webviewView.webview.postMessage({
          type: 'init',
          viewType: AggoPropertyViewProvider.viewType
        });
      } else if (message.type === 'updateElement') {
        vscode.commands.executeCommand('aggo.updateElement', message.element);
      }
    });
  }
}


