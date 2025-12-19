import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { getHtmlForWebview } from '../utils/webviewHelper';
import { normalizeBridgeContent } from '../utils/fileBridge';
import { detectNextjsAppDir, routeDirForPageId } from '../utils/nextjsCodegen';
import {
  addHandlerToPageHandlersFile,
  listHandlersFromPageHandlersFile,
  renderPageHandlersFile,
  isValidHandlerName
} from '../utils/pageHandlersFile';

export class AggoPropertyViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aggo.properties';
  private static _instance?: AggoPropertyViewProvider;
  private _view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri, private readonly isDev: boolean = false) {
    AggoPropertyViewProvider._instance = this;
  }

  public static postMessageToWebview(message: any) {
    if (AggoPropertyViewProvider._instance && AggoPropertyViewProvider._instance._view) {
      const view = AggoPropertyViewProvider._instance._view;
      // If we're broadcasting a component registry, ensure file URIs are mapped for THIS webview.
      try {
        if (message?.type === 'componentCatalogUpdated' && message?.registry && typeof message.registry === 'object') {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          const mapped: any = {};
          for (const key of Object.keys(message.registry)) {
            const entry = message.registry[key];
            if (!entry) continue;
            const file = entry.file as string | undefined;
            if (!file) {
              mapped[key] = entry;
              continue;
            }

            // If it's already a webview/remote URI, pass through as-is.
            if (/^(vscode-webview-resource:|vscode-resource:|https?:)/i.test(file)) {
              mapped[key] = entry;
              continue;
            }

            const resolvedPath = file.startsWith('.') && workspaceFolder ? path.join(workspaceFolder, file) : (workspaceFolder && !path.isAbsolute(file) ? path.join(workspaceFolder, file) : file);
            const fileUri = vscode.Uri.file(resolvedPath);
            let webUri = view.webview.asWebviewUri(fileUri).toString();
            try {
              const mtimeMs = fs.statSync(resolvedPath).mtimeMs;
              if (Number.isFinite(mtimeMs)) {
                webUri = `${webUri}${webUri.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(mtimeMs))}`;
              }
            } catch (_) { /* ignore */ }
            mapped[key] = { ...entry, file: webUri };
          }
          view.webview.postMessage({ ...message, registry: mapped });
          return;
        }
      } catch (err) {
        console.warn('[aggo] failed to map registry for property view postMessage', err);
      }
      view.webview.postMessage(message);
    }
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: workspaceRoot ? [this.extensionUri, workspaceRoot] : [this.extensionUri]
    };

    const fetchRemoteText = async (url: string): Promise<string> => {
      const fetchFn = (globalThis as any).fetch;
      if (typeof fetchFn !== 'function') {
        throw new Error('Network fetch is not available');
      }
      const response = await fetchFn(url);
      return response.text();
    };

    const respondWithCommand = (command: string, payload: Record<string, any>) => {
      webviewView.webview.postMessage({ ...payload, command, type: command });
    };
    const tempFileMap = new Map<string, vscode.Uri>();

    const resolveLocalUri = (targetPath: string): vscode.Uri => {
      if (targetPath.startsWith('file:')) {
        return vscode.Uri.parse(targetPath);
      }
      if (path.isAbsolute(targetPath)) {
        return vscode.Uri.file(targetPath);
      }
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const baseDir = workspaceFolder ?? process.cwd();
      return vscode.Uri.file(path.resolve(baseDir, targetPath));
    };

    const resolveRuntimeCwdAbs = (): string | undefined => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceFolder) return undefined;
      const cfg = vscode.workspace.getConfiguration('aggo.runtime');
      const cwdSetting = (cfg.get<string>('cwd') ?? '').trim();
      if (!cwdSetting) return workspaceFolder;
      return path.isAbsolute(cwdSetting) ? cwdSetting : path.join(workspaceFolder, cwdSetting);
    };

    const resolvePageHandlersPath = (runtimeRootAbs: string, pageId: string): { handlersAbs: string; routeDirAbs: string } => {
      const appDir = detectNextjsAppDir(runtimeRootAbs);
      const routeDirAbs = routeDirForPageId(appDir, pageId);
      return { handlersAbs: path.join(routeDirAbs, 'handlers.ts'), routeDirAbs };
    };

    const ensurePageHandlersFile = async (runtimeRootAbs: string, pageId: string): Promise<string> => {
      const { handlersAbs, routeDirAbs } = resolvePageHandlersPath(runtimeRootAbs, pageId);
      if (!fs.existsSync(routeDirAbs)) {
        await fs.promises.mkdir(routeDirAbs, { recursive: true });
      }
      if (!fs.existsSync(handlersAbs)) {
        await fs.promises.writeFile(handlersAbs, renderPageHandlersFile([]), 'utf8');
      }
      return handlersAbs;
    };

    const listPageHandlers = async (pageId: string): Promise<string[]> => {
      const runtimeRootAbs = resolveRuntimeCwdAbs();
      if (!runtimeRootAbs || !fs.existsSync(runtimeRootAbs)) {
        throw new Error('Runtime folder not found. Configure aggo.runtime.cwd first.');
      }
      const handlersAbs = await ensurePageHandlersFile(runtimeRootAbs, pageId);
      const raw = await fs.promises.readFile(handlersAbs, 'utf8');
      return listHandlersFromPageHandlersFile(raw);
    };

    const createPageHandler = async (pageId: string, handlerName: string): Promise<{ handlers: string[]; filePath: string }> => {
      if (!isValidHandlerName(handlerName)) {
        throw new Error('Handler name must be a valid identifier (e.g. onClick, handleSubmit).');
      }
      const runtimeRootAbs = resolveRuntimeCwdAbs();
      if (!runtimeRootAbs || !fs.existsSync(runtimeRootAbs)) {
        throw new Error('Runtime folder not found. Configure aggo.runtime.cwd first.');
      }
      const handlersAbs = await ensurePageHandlersFile(runtimeRootAbs, pageId);
      const raw = await fs.promises.readFile(handlersAbs, 'utf8');
      const { updated, changed } = addHandlerToPageHandlersFile(raw, handlerName);
      if (changed) {
        await fs.promises.writeFile(handlersAbs, updated, 'utf8');
      }
      return { handlers: listHandlersFromPageHandlersFile(updated), filePath: handlersAbs };
    };

    const openWithAggoEditor = async (uri: vscode.Uri) => {
      try {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'aggo.schemaEditor');
        return true;
      } catch (_err) {
        try { const doc = await vscode.workspace.openTextDocument(uri); await vscode.window.showTextDocument(doc, { preview: false }); return true; } catch (e) { console.warn('[aggo] failed to open with aggo.schemaEditor fallback to default', e); return false; }
      }
    };

    const handleFileBridgeCommand = async (message: any): Promise<boolean> => {
      const command = message?.command || message?.type;
      if (command !== 'openFile' && command !== 'saveFile') {
        return false;
      }
      const id = message?.id;
      const targetPath = message?.path as string;
      if (!id || typeof targetPath !== 'string' || targetPath.length === 0) {
        if (command === 'openFile') {
          respondWithCommand('openFileResponse', { id, content: JSON.stringify({ error: 'Missing id or path' }) });
        } else {
          respondWithCommand('saveFileResponse', { id, success: false, error: 'Missing id or path' });
        }
        return true;
      }
      if (command === 'openFile') {
        try {
          if (/^https?:\/\//i.test(targetPath)) {
            const content = await fetchRemoteText(targetPath);
            const tmpName = `aggo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.basename(targetPath)}`;
            const tmpPath = path.join(os.tmpdir(), tmpName);
            const tmpUri = vscode.Uri.file(tmpPath);
            await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(content || '', 'utf8'));
            try { await openWithAggoEditor(tmpUri); } catch (e) { console.warn('[aggo] failed to open temp document for remote schema with aggo editor', e); }
            tempFileMap.set(targetPath, tmpUri);
            respondWithCommand('openFileResponse', { id, content: null });
            return true;
          }
          const uri = resolveLocalUri(targetPath.replace(/^\.\//, ''));
          const bytes = await vscode.workspace.fs.readFile(uri);
          const content = Buffer.from(bytes).toString('utf8');
          // if this is not the main doc (no document binding for property view), open in host
          try { await openWithAggoEditor(uri); } catch (e) { console.warn('[aggo] failed to open local document in host with aggo editor', e); }
          respondWithCommand('openFileResponse', { id, content: null });
          return true;
        } catch (err: any) {
          respondWithCommand('openFileResponse', { id, content: JSON.stringify({ error: err?.message || String(err) }) });
        }
        return true;
      }
      if (command === 'saveFile') {
        try {
          if (/^https?:\/\//i.test(targetPath)) {
            let tmpUri = tempFileMap.get(targetPath);
            if (!tmpUri) {
              const tmpName = `aggo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.basename(targetPath)}`;
              tmpUri = vscode.Uri.file(path.join(os.tmpdir(), tmpName));
              tempFileMap.set(targetPath, tmpUri);
            }
            const content = typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '', null, 2);
            await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(content || '', 'utf8'));
            console.log('[aggo] saved remote tmp file at', tmpUri.fsPath);
            respondWithCommand('saveFileResponse', { id, success: true, tmpUri: tmpUri.toString() });
            return true;
          }
          const uri = resolveLocalUri(targetPath.replace(/^\.\//, ''));
          const content = typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '', null, 2);
          await vscode.workspace.fs.writeFile(uri, Buffer.from(content || '', 'utf8'));
          respondWithCommand('saveFileResponse', { id, success: true });
        } catch (err: any) {
          respondWithCommand('saveFileResponse', { id, success: false, error: err?.message || String(err) });
        }
        return true;
      }
      return false;
    };

    webviewView.webview.html = getHtmlForWebview(
      webviewView.webview,
      this.extensionUri,
      AggoPropertyViewProvider.viewType,
      'Aggo Properties',
      this.isDev
    );

    const loadMappedRegistry = async (onlyIds?: string[]) => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceFolder) return {};
      const registryPath = path.join(workspaceFolder, '.aggo', 'components', 'component_registry.json');
      if (!fs.existsSync(registryPath)) return {};
      let registry: any = {};
      try {
        const raw = fs.readFileSync(registryPath, 'utf8');
        registry = JSON.parse(raw || '{}');
      } catch {
        registry = {};
      }
      const mapped: any = {};
      const keys = onlyIds && onlyIds.length > 0 ? onlyIds : Object.keys(registry);
      for (const key of keys) {
        try {
          const entry = registry[key];
          if (!entry) continue;
          const filePath = entry.file && entry.file.startsWith('.') ? path.join(workspaceFolder, entry.file) : entry.file;
          const fileUri = vscode.Uri.file(filePath);
          let webUri = webviewView.webview.asWebviewUri(fileUri).toString();
          try {
            const mtimeMs = fs.statSync(filePath).mtimeMs;
            if (Number.isFinite(mtimeMs)) {
              webUri = `${webUri}${webUri.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(mtimeMs))}`;
            }
          } catch (_) { /* ignore */ }
          mapped[key] = { ...entry, file: webUri };
        } catch (err) {
          console.warn('[aggo] failed mapping registry entry for property view', err);
        }
      }
      return mapped;
    };

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (await handleFileBridgeCommand(message)) {
        return;
      }
      if (message.type === 'ready') {
        webviewView.webview.postMessage({
          type: 'init',
          viewType: AggoPropertyViewProvider.viewType
        });
        // send initial component registry if present
        try {
          const mapped = await loadMappedRegistry();
          if (Object.keys(mapped).length > 0) {
            webviewView.webview.postMessage({ type: 'componentCatalogUpdated', registry: mapped });
          }
        } catch (err) {
          console.warn('[aggo] failed to load registry for property view', err);
        }
      } else if (message.type === 'requestComponentRegistry') {
        try {
          const mapped = await loadMappedRegistry();
          webviewView.webview.postMessage({ type: 'componentCatalogUpdated', registry: mapped });
        } catch (err) {
          console.warn('[aggo] failed to handle requestComponentRegistry', err);
        }
      } else if (message.type === 'requestComponent') {
        try {
          const id = message?.id as string | undefined;
          if (!id) return;
          const mapped = await loadMappedRegistry([id]);
          if (Object.keys(mapped).length > 0) {
            webviewView.webview.postMessage({ type: 'componentCatalogUpdated', registry: mapped });
          }
        } catch (err) {
          console.warn('[aggo] failed to handle requestComponent', err);
        }
      } else if (message.type === 'updateElement') {
        vscode.commands.executeCommand('aggo.updateElement', message.element);
      } else if (message.type === 'graphqlApplyDirective') {
        // Ask the active editor (GraphQL visual editor) to apply directives to its in-memory SDL,
        // then it will emit an 'update' back to the extension to persist.
        vscode.commands.executeCommand('aggo.graphqlApplyDirective', {
          schemaUri: message?.schemaUri,
          typeName: message?.typeName,
          fieldName: message?.fieldName,
          directiveName: message?.directiveName,
          args: message?.args,
        });
      } else if (message.type === 'graphqlScaffoldResolver') {
        // Delegate to runtime sync, same behavior as the GraphQL editor webview button.
        try {
          const resolverId = typeof message?.resolverId === 'string' ? message.resolverId.trim() : '';
          if (!resolverId) throw new Error('Missing resolverId');
          const schemaUri = typeof message?.schemaUri === 'string' && message.schemaUri ? message.schemaUri : undefined;
          await vscode.commands.executeCommand('aggo.syncGraphqlRuntime', {
            schemaPathOrUri: schemaUri,
            resolverIds: [resolverId],
          });
        } catch (err) {
          console.warn('[aggo] failed scaffolding resolver from property view', err);
        }
      } else if (message.type === 'requestHandlers') {
        const pageId = (message?.pageId as string | undefined) || '';
        const requestId = message?.id;
        try {
          if (!pageId) throw new Error('Missing pageId');
          const handlers = await listPageHandlers(pageId);
          webviewView.webview.postMessage({ type: 'handlersList', id: requestId, pageId, handlers });
        } catch (err: any) {
          webviewView.webview.postMessage({ type: 'handlersList', id: requestId, pageId, handlers: [], error: err?.message || String(err) });
        }
      } else if (message.type === 'createHandler') {
        const pageId = (message?.pageId as string | undefined) || '';
        const name = (message?.name as string | undefined) || '';
        const requestId = message?.id;
        try {
          if (!pageId) throw new Error('Missing pageId');
          if (!name) throw new Error('Missing handler name');
          const result = await createPageHandler(pageId, name);
          webviewView.webview.postMessage({ type: 'handlersList', id: requestId, pageId, handlers: result.handlers });
        } catch (err: any) {
          webviewView.webview.postMessage({ type: 'handlersList', id: requestId, pageId, handlers: [], error: err?.message || String(err) });
        }
      }
    });
  }
}


