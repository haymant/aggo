import * as vscode from 'vscode';

let activePanel: vscode.WebviewPanel | undefined;

export function setActivePanel(panel: vscode.WebviewPanel | undefined) {
  activePanel = panel;
}

export function getActivePanel(): vscode.WebviewPanel | undefined {
  return activePanel;
}
