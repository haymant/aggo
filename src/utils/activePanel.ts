import * as vscode from 'vscode';

let activePanel: vscode.WebviewPanel | undefined;
const panelsByView = new Map<string, Set<vscode.WebviewPanel>>();

export function setActivePanel(panel: vscode.WebviewPanel | undefined) {
  activePanel = panel;
}

export function getActivePanel(): vscode.WebviewPanel | undefined {
  return activePanel;
}

export function registerPanel(panel: vscode.WebviewPanel, viewType: string) {
  const set = panelsByView.get(viewType) ?? new Set();
  set.add(panel);
  panelsByView.set(viewType, set);
}

export function unregisterPanel(panel: vscode.WebviewPanel, viewType: string) {
  const set = panelsByView.get(viewType);
  if (!set) return;
  set.delete(panel);
  if (set.size === 0) panelsByView.delete(viewType);
}

export function getPanelByViewType(viewType: string): vscode.WebviewPanel | undefined {
  const set = panelsByView.get(viewType);
  if (!set) return undefined;
  // Return first panel (most recently opened typically)
  for (const p of set) return p;
  return undefined;
}
