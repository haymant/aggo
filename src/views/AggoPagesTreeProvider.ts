import * as vscode from 'vscode';
import * as path from 'path';

export type AggoPagesNode = {
  type: 'folder' | 'page';
  label: string;
  fullPath: string;
  uri?: vscode.Uri;
};

export class AggoPagesTreeProvider implements vscode.TreeDataProvider<AggoPagesNode>, vscode.Disposable {
  public static readonly viewId = 'aggo.pages';

  private readonly disposables: vscode.Disposable[] = [];
  private readonly didChangeTreeDataEmitter = new vscode.EventEmitter<AggoPagesNode | undefined>();
  public readonly onDidChangeTreeData = this.didChangeTreeDataEmitter.event;

  private nodesByPath = new Map<string, AggoPagesNode>();
  private childrenByPath = new Map<string, string[]>();

  constructor(private readonly workspaceRoot: string) {
    // Watch for page changes.
    const pagesPattern = new vscode.RelativePattern(workspaceRoot, 'resources/page/**/*.page');
    const watcher = vscode.workspace.createFileSystemWatcher(pagesPattern);
    watcher.onDidCreate(() => this.refresh(), this, this.disposables);
    watcher.onDidDelete(() => this.refresh(), this, this.disposables);
    watcher.onDidChange(() => this.refresh(), this, this.disposables);
    this.disposables.push(watcher);

    // Initial load.
    void this.refresh();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.didChangeTreeDataEmitter.dispose();
  }

  public refresh(): void {
    void this.rebuild();
  }

  private async rebuild(): Promise<void> {
    this.nodesByPath.clear();
    this.childrenByPath.clear();

    const pages = await vscode.workspace.findFiles(
      new vscode.RelativePattern(this.workspaceRoot, 'resources/page/**/*.page')
    );

    const rootKey = '';
    this.childrenByPath.set(rootKey, []);

    for (const uri of pages) {
      const rel = path.relative(this.workspaceRoot, uri.fsPath).split(path.sep).join('/');
      const parts = rel.split('/');

      // Expect: resources/page/<...>/<name>.page
      const idx = parts.indexOf('resources');
      if (idx === -1 || parts[idx + 1] !== 'page') continue;

      const pageParts = parts.slice(idx + 2); // everything under resources/page
      if (pageParts.length === 0) continue;

      // Build folder nodes.
      let parentKey = rootKey;
      let runningPath = '';
      for (let i = 0; i < pageParts.length; i++) {
        const seg = pageParts[i];
        const isLeaf = i === pageParts.length - 1;

        if (isLeaf) {
          const label = seg.replace(/\.page$/i, '');
          const fullPath = runningPath ? `${runningPath}/${label}` : label;
          const node: AggoPagesNode = { type: 'page', label, fullPath, uri };
          this.nodesByPath.set(fullPath, node);
          this.addChild(parentKey, fullPath);
        } else {
          runningPath = runningPath ? `${runningPath}/${seg}` : seg;
          const folderKey = runningPath;
          if (!this.nodesByPath.has(folderKey)) {
            const folderNode: AggoPagesNode = { type: 'folder', label: seg, fullPath: folderKey };
            this.nodesByPath.set(folderKey, folderNode);
          }
          this.addChild(parentKey, folderKey);
          parentKey = folderKey;
        }
      }
    }

    this.didChangeTreeDataEmitter.fire(undefined);
  }

  private addChild(parentKey: string, childKey: string): void {
    const list = this.childrenByPath.get(parentKey) ?? [];
    if (!list.includes(childKey)) list.push(childKey);
    list.sort((a, b) => a.localeCompare(b));
    this.childrenByPath.set(parentKey, list);
  }

  getTreeItem(element: AggoPagesNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.label,
      element.type === 'folder' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );

    if (element.type === 'page' && element.uri) {
      item.resourceUri = element.uri;
      item.command = {
        command: 'aggo.openPageFromTree',
        title: 'Open Page',
        arguments: [element.uri]
      };
      item.contextValue = 'aggoPage';
    } else {
      item.contextValue = 'aggoFolder';
    }

    return item;
  }

  getChildren(element?: AggoPagesNode): Thenable<AggoPagesNode[]> {
    const key = element ? element.fullPath : '';
    const children = (this.childrenByPath.get(key) ?? []).map((k) => this.nodesByPath.get(k)).filter(Boolean) as AggoPagesNode[];
    return Promise.resolve(children);
  }
}
