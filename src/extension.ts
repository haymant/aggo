import * as vscode from 'vscode';
import { AggoCustomEditorProvider } from './editors/AggoCustomEditorProvider';
import { AggoCPNEditorProvider } from './editors/AggoCPNEditorProvider';
import { AggoActivityViewProvider } from './views/AggoActivityViewProvider';

export function activate(context: vscode.ExtensionContext) {
  const viewTypes = [
    { viewType: 'aggo.pageEditor', ext: '.page', title: 'Aggo Page Editor' },
    { viewType: 'aggo.dataSourceEditor', ext: '.ds', title: 'Aggo DataSource Editor' },
    { viewType: 'aggo.schemaEditor', ext: '.schema', title: 'Aggo Schema Editor' },
    { viewType: 'aggo.cpnEditor', ext: '.cpn', title: 'Aggo CPN Editor' },
    { viewType: 'aggo.mcpEditor', ext: '.mcp', title: 'Aggo MCP Editor' },
    { viewType: 'aggo.colorEditor', ext: '.color', title: 'Aggo Color Editor' }
  ];

  const commandMap: {[key: string]: string} = {
    'aggo.pageEditor': 'aggo.openAggoPageEditor',
    'aggo.dataSourceEditor': 'aggo.openAggoDataSourceEditor',
    'aggo.schemaEditor': 'aggo.openAggoSchemaEditor',
    'aggo.cpnEditor': 'aggo.openAggoCPNEditor',
    'aggo.mcpEditor': 'aggo.openAggoMCPEditor',
    'aggo.colorEditor': 'aggo.openAggoColorEditor'
  };

  for (const vt of viewTypes) {
    const isDev = context.extensionMode === vscode.ExtensionMode.Development;
    let provider: vscode.CustomTextEditorProvider;
    if (vt.viewType === 'aggo.cpnEditor') {
      provider = new AggoCPNEditorProvider(context.extensionUri, vt.title, isDev);
    } else {
      provider = new AggoCustomEditorProvider(context.extensionUri, vt.viewType, vt.title, isDev);
    }
    context.subscriptions.push(vscode.window.registerCustomEditorProvider(vt.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false
    }));

    // Register command to open files explicitly from explorer/context
    const commandId = commandMap[vt.viewType];
    const disposable = vscode.commands.registerCommand(commandId, async (uri: vscode.Uri) => {
      if (!uri) {
        const active = vscode.window.activeTextEditor;
        if (!active) return;
        uri = active.document.uri;
      }
      await vscode.commands.executeCommand('vscode.openWith', uri, vt.viewType);
    });
    context.subscriptions.push(disposable);
  }

  // Register a simple Activity Bar view for a placeholder action
  const activityProvider = new AggoActivityViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aggoActivityHello', activityProvider, { webviewOptions: { retainContextWhenHidden: true } })
  );
}

export function deactivate() { }
