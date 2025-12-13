import * as vscode from 'vscode';
// Ajv is loaded lazily in validate command to avoid module load issues during activation
// import { parseTree, findNodeAtLocation } from 'jsonc-parser';
import { AggoSchemaEditorProvider } from './editors/AggoSchemaEditorProvider';
import { AggoPageEditorProvider } from './editors/AggoPageEditorProvider';
import { AggoDataSourceEditorProvider } from './editors/AggoDataSourceEditorProvider';
import { AggoMcpEditorProvider } from './editors/AggoMcpEditorProvider';
import { AggoColorEditorProvider } from './editors/AggoColorEditorProvider';
import { AggoCPNEditorProvider } from './editors/AggoCPNEditorProvider';
import { AggoComponentLibraryProvider } from './views/AggoComponentLibraryProvider';
import { AggoPropertyViewProvider } from './views/AggoPropertyViewProvider';
import { parseJsonText, createSchemaFromJson } from './utils/schemaInference';
import { getActivePanel } from './utils/activePanel';
import * as path from 'path';
import * as fs from 'fs';
import { getPanelByViewType } from './utils/activePanel';

// Broadcast component registry to all registered panels (library, page editor, properties)
async function broadcastComponentRegistryToPanels() {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return;
    const registryPath = path.join(workspaceFolder, '.aggo', 'components', 'component_registry.json');
    if (!fs.existsSync(registryPath)) return;
    const raw = fs.readFileSync(registryPath, 'utf8');
    const registry = JSON.parse(raw || '{}');
    // Post to Activity view 'library' using the provider's own webview instance
    try {
      const mappedLib: any = {};
      for (const key of Object.keys(registry)) {
        try {
          const entry = registry[key];
          const filePath = entry.file && entry.file.startsWith('.') ? path.join(workspaceFolder, entry.file) : entry.file;
          const fileUri = vscode.Uri.file(filePath);
          // For library we don't have a panel reference but the AggoComponentLibraryProvider has a static instance that can post back
            mappedLib[key] = { ...entry, file: entry.file };
        } catch (err) { console.warn('[aggo] failed mapping registry entry for broadcast to library', err); }
      }
      AggoComponentLibraryProvider.postMessageToWebview({ type: 'componentCatalogUpdated', registry: mappedLib });
    } catch (err) { /* ignore */ }

    // Post to page editor and property view panels (webview panels)
    try {
      const mappedPanels: any = {};
      for (const key of Object.keys(registry)) {
        try {
          const entry = registry[key];
          const filePath = entry.file && entry.file.startsWith('.') ? path.join(workspaceFolder, entry.file) : entry.file;
          mappedPanels[key] = { ...entry, file: filePath };
        } catch (err) { console.warn('[aggo] failed mapping registry entry for broadcast to panels', err); }
      }
      const pagePanel = getPanelByViewType('aggo.pageEditor');
      if (pagePanel) {
        const mappedForPage: any = {};
        for (const key of Object.keys(registry)) {
          try {
            const entry = registry[key];
            const filePath = entry.file && entry.file.startsWith('.') ? path.join(workspaceFolder, entry.file) : entry.file;
            const fileUri = vscode.Uri.file(filePath);
            let webUri = pagePanel.webview.asWebviewUri(fileUri).toString();
            try {
              const mtimeMs = fs.statSync(filePath).mtimeMs;
              if (Number.isFinite(mtimeMs)) {
                webUri = `${webUri}${webUri.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(mtimeMs))}`;
              }
            } catch (_) { /* ignore */ }
            mappedForPage[key] = { ...entry, file: webUri };
          } catch (err) { console.warn('[aggo] failed mapping registry entry for page panel broadcast', err); }
        }
        pagePanel.webview.postMessage({ type: 'componentCatalogUpdated', registry: mappedForPage });
      }
      // properties view doesn't need webview as a resource; provide raw mapped file paths
      AggoPropertyViewProvider.postMessageToWebview({ type: 'componentCatalogUpdated', registry: mappedPanels });
    } catch (err) { console.warn('[aggo] failed broadcasting registry to page/editor/property panels', err); }
  } catch (err) { console.warn('[aggo] failed to broadcast component registry', err); }
}

export function activate(context: vscode.ExtensionContext) {
  try {
    console.log('Aggo Builder extension activating.');
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
    // const isDev = context.extensionMode === vscode.ExtensionMode.Development;
    const isDev = false; // Force production mode
    let provider: vscode.CustomTextEditorProvider;
    switch (vt.viewType) {
      case 'aggo.cpnEditor':
        provider = new AggoCPNEditorProvider(context.extensionUri, vt.title, isDev);
        break;
      case 'aggo.schemaEditor':
        provider = new AggoSchemaEditorProvider(context.extensionUri, vt.viewType, vt.title, isDev);
        break;
      case 'aggo.pageEditor':
        provider = new AggoPageEditorProvider(context.extensionUri, vt.viewType, vt.title, isDev);
        break;
      case 'aggo.dataSourceEditor':
        provider = new AggoDataSourceEditorProvider(context.extensionUri, vt.viewType, vt.title, isDev);
        break;
      case 'aggo.mcpEditor':
        provider = new AggoMcpEditorProvider(context.extensionUri, vt.viewType, vt.title, isDev);
        break;
      case 'aggo.colorEditor':
        provider = new AggoColorEditorProvider(context.extensionUri, vt.viewType, vt.title, isDev);
        break;
      default:
        // fallback - use AggoSchemaEditorProvider for other view types
        provider = new AggoSchemaEditorProvider(context.extensionUri, vt.viewType, vt.title, isDev);
    }
    try {
      context.subscriptions.push(vscode.window.registerCustomEditorProvider(vt.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false
    }));
    } catch (err: any) {
      console.error('Failed to register custom editor provider for', vt.viewType, err);
      try { vscode.window.showErrorMessage(`Aggo: failed to register custom editor ${vt.viewType}: ${err?.message || String(err)}`); } catch (_) { }
    }

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
    try {
      context.subscriptions.push(disposable);
    } catch (err: any) {
      console.error(`Failed registering command ${commandId}`, err);
      try { vscode.window.showErrorMessage(`Aggo: failed to register command ${commandId}: ${err?.message || String(err)}`); } catch (_) { }
    }
  }

  // Register an 'Infer Schema from JSON' command usable from editor context menus
  const inferSchemaCmd = vscode.commands.registerCommand('aggo.inferSchemaFromJson', async (uri?: vscode.Uri) => {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      let docUri = uri;
      if (!docUri && activeEditor) docUri = activeEditor.document.uri;
      if (!docUri) {
        vscode.window.showErrorMessage('No active JSON document found to infer schema from.');
        return;
      }
      const doc = await vscode.workspace.openTextDocument(docUri);
      const editor = vscode.window.activeTextEditor; // read the active editor after the document is open
      let text = doc.getText();
      // If there is a selection in the active editor, use the selection text to infer
      if (editor && editor.document.uri.toString() === docUri.toString() && !editor.selection.isEmpty) {
        text = editor.document.getText(editor.selection);
      }
      if (!text || text.trim().length === 0) {
        vscode.window.showErrorMessage('Document is empty. Cannot infer schema.');
        return;
      }
      let jsonObject;
      try {
        jsonObject = parseJsonText(text);
      } catch (err) {
        vscode.window.showErrorMessage('Failed to parse JSON/JSONC from document');
        return;
      }
      const inferredSchema = createSchemaFromJson(jsonObject);
      const schemaText = JSON.stringify(inferredSchema, null, 2);

      // Create a new file in the same folder: foo.schema or foo.inferred.schema if exists
      const folder = path.dirname(docUri.fsPath);
      const basename = path.basename(docUri.fsPath, path.extname(docUri.fsPath));
      let schemaPath = path.join(folder, `${basename}.schema`);
      if (fs.existsSync(schemaPath)) {
        // try different name with increment
        let i = 1;
        let candidate = path.join(folder, `${basename}.inferred.schema`);
        while (fs.existsSync(candidate)) {
          candidate = path.join(folder, `${basename}.inferred.${i}.schema`);
          i += 1;
        }
        schemaPath = candidate;
      }
      const schemaUri = vscode.Uri.file(schemaPath);
      await vscode.workspace.fs.writeFile(schemaUri, Buffer.from(schemaText, 'utf8'));
      // Open with Aggo Schema Editor
      await vscode.commands.executeCommand('vscode.openWith', schemaUri, 'aggo.schemaEditor');
      vscode.window.showInformationMessage(`Generated schema and opened: ${path.basename(schemaPath)}`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to infer schema: ${err?.message || String(err)}`);
    }
  });
  try {
    context.subscriptions.push(inferSchemaCmd);
  } catch (err: any) {
    console.error('Failed to register command aggo.inferSchemaFromJson', err);
    try { vscode.window.showErrorMessage(`Aggo: failed to register infer schema command: ${err?.message || String(err)}`); } catch (_) { }
  }

  // Register command to insert component from library
  context.subscriptions.push(vscode.commands.registerCommand('aggo.insertComponent', (data) => {
      const active = getActivePanel();
      if (active) {
        active.webview.postMessage({ type: 'insertComponent', data });
        return;
      }
      // Fallback: send to any open page editor panel (even if not focused)
      try {
        const panel = getPanelByViewType('aggo.pageEditor');
        if (panel) panel.webview.postMessage({ type: 'insertComponent', data });
      } catch (e) {
        console.warn('[aggo] insertComponent: no active page editor to receive insert', e);
      }
  }));

  // Register command to install component JS bundles into workspace component library
  context.subscriptions.push(vscode.commands.registerCommand('aggo.installComponent', async () => {
    try {
      const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'JavaScript': ['js'] } });
      if (!picked || picked.length === 0) return;
      const fileUri = picked[0];
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace found to install component in.');
        return;
      }
      const componentsDir = path.join(workspaceFolder, '.aggo', 'components');
      await fs.promises.mkdir(componentsDir, { recursive: true });
      const destPath = path.join(componentsDir, path.basename(fileUri.fsPath));
      await fs.promises.copyFile(fileUri.fsPath, destPath);
      // Prompt for component id and name
      const defaultId = path.basename(fileUri.fsPath, '.js');
      const componentId = await vscode.window.showInputBox({ prompt: 'Component ID', value: defaultId });
      if (!componentId) return;
      const componentName = await vscode.window.showInputBox({ prompt: 'Display name for component', value: defaultId });
      // Update registry
      const registryPath = path.join(workspaceFolder, '.aggo', 'components', 'component_registry.json');
      let registry: any = {};
      if (fs.existsSync(registryPath)) {
        const raw = await fs.promises.readFile(registryPath, 'utf8');
        try { registry = JSON.parse(raw || '{}'); } catch (err) { registry = {}; }
      }
      const rel = './.aggo/components/' + path.basename(destPath);
      registry[componentId] = { id: componentId, name: componentName || componentId, category: 'Plugin', icon: '', file: rel };
      await fs.promises.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
      vscode.window.showInformationMessage(`Installed component ${componentId} to ${rel}`);
      // Immediately broadcast registry updates to any open panels
      setTimeout(() => { broadcastComponentRegistryToPanels(); }, 50);
      // Trigger a filesystem event to notify watchers
      // (watchers in providers will pick this up automatically)
    } catch (err: any) {
      console.error('[aggo] failed to install component', err);
      vscode.window.showErrorMessage(`Failed to install component: ${err?.message || String(err)}`);
    }
  }));

  // Register command to uninstall a previously installed component
  context.subscriptions.push(vscode.commands.registerCommand('aggo.uninstallComponent', async () => {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace found.');
        return;
      }
      const registryPath = path.join(workspaceFolder, '.aggo', 'components', 'component_registry.json');
      if (!fs.existsSync(registryPath)) {
        vscode.window.showInformationMessage('No installed components found (.aggo/components/component_registry.json missing).');
        return;
      }
      let registry: any = {};
      try {
        const raw = await fs.promises.readFile(registryPath, 'utf8');
        registry = JSON.parse(raw || '{}');
      } catch {
        registry = {};
      }
      const ids = Object.keys(registry);
      if (ids.length === 0) {
        vscode.window.showInformationMessage('No installed components found.');
        return;
      }

      const items = ids.map((id) => {
        const e = registry[id] || {};
        return {
          label: e.name ? `${e.name}` : id,
          description: id,
          detail: e.file ? String(e.file) : ''
        };
      });
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a component to uninstall' });
      if (!picked) return;
      const componentId = picked.description;
      if (!componentId || !registry[componentId]) return;
      const entry = registry[componentId];
      const relFile = entry?.file as string | undefined;

      // Remove the registry entry first
      delete registry[componentId];
      await fs.promises.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');

      // Remove copied file if it isn't referenced by any remaining component
      if (relFile && typeof relFile === 'string') {
        const stillReferenced = Object.keys(registry).some((k) => registry[k]?.file === relFile);
        if (!stillReferenced) {
          try {
            const targetPath = relFile.startsWith('./') ? path.join(workspaceFolder, relFile.replace(/^\.\//, '')) : relFile;
            if (targetPath.startsWith(workspaceFolder) && fs.existsSync(targetPath)) {
              await fs.promises.unlink(targetPath);
            }
          } catch (err) {
            console.warn('[aggo] failed to delete component file during uninstall', err);
          }
        }
      }

      vscode.window.showInformationMessage(`Uninstalled component ${componentId}`);
      setTimeout(() => { broadcastComponentRegistryToPanels(); }, 50);
    } catch (err: any) {
      console.error('[aggo] failed to uninstall component', err);
      vscode.window.showErrorMessage(`Failed to uninstall component: ${err?.message || String(err)}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aggo.updateElement', (element) => {
      const active = getActivePanel();
      if (active) {
        active.webview.postMessage({ type: 'updateElement', element });
      }
  }));

  // Diagnostics collection for validation results
  const validationDiagnostics = vscode.languages.createDiagnosticCollection('aggoValidation');
  context.subscriptions.push(validationDiagnostics);

  // Register the 'Validate against JSON Schema' command
  const validateCmd = vscode.commands.registerCommand('aggo.validateAgainstSchema', async (uri?: vscode.Uri) => {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      let docUri = uri;
      if (!docUri && activeEditor) docUri = activeEditor.document.uri;
      if (!docUri) {
        vscode.window.showErrorMessage('No active JSON document found to validate.');
        return;
      }
      const doc = await vscode.workspace.openTextDocument(docUri);
      let text = doc.getText();
      // If selection exists, validate only selection
      if (activeEditor && activeEditor.document.uri.toString() === docUri.toString() && !activeEditor.selection.isEmpty) {
        text = activeEditor.document.getText(activeEditor.selection);
      }

      // Find schema files in workspace
      const schemaFiles = await vscode.workspace.findFiles('**/*.schema');
      if (!schemaFiles || schemaFiles.length === 0) {
        vscode.window.showErrorMessage('No .schema files found in workspace.');
        return;
      }

      let schemaUri: vscode.Uri | undefined;
      if (schemaFiles.length === 1) {
        schemaUri = schemaFiles[0];
      } else {
        const items = schemaFiles.map((s) => ({ label: vscode.workspace.asRelativePath(s), description: s.fsPath, uri: s } as any));
        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a JSON Schema to validate against' });
        if (!picked) return;
        schemaUri = picked.uri as vscode.Uri;
      }
      if (!schemaUri) return;

      const schemaDoc = await vscode.workspace.openTextDocument(schemaUri);
      let schemaObj: any;
      try {
        schemaObj = parseJsonText(schemaDoc.getText());
      } catch (err) {
        vscode.window.showErrorMessage('Failed to parse selected schema file as JSON/JSONC');
        return;
      }

      // Load Ajv dynamically; use default export if present
      let AjvConstructor: any;
      try {
        const AjvModule = require('ajv');
        AjvConstructor = AjvModule.default || AjvModule;
        console.log('Aggo: Ajv loaded successfully.');
      } catch (e) {
        vscode.window.showErrorMessage('Aggo: failed to load Ajv (validation not available)');
        console.error('Ajv import failure', e);
        return;
      }
      const ajv = new AjvConstructor({ allErrors: true, strict: false });
      // If the schema explicitly states draft-2020-12, add the meta schema proactively to avoid compile errors
      try {
        if (schemaObj && schemaObj.$schema && String(schemaObj.$schema).includes('2020-12')) {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const draft2020 = require('ajv/dist/refs/json-schema-draft-2020-12.json');
          ajv.addMetaSchema(draft2020);
        }
      } catch (err) {
        // ignore — we'll try to compile and handle missing meta later
      }

      // Helper to compile and add common meta-schemas if Ajv complains about missing refs
      const compileSchemaWithMeta = (schema: any) => {
        try {
          return ajv.compile(schema);
        } catch (e: any) {
          const msg = String(e?.message || e);
          if (/no schema with key or ref/i.test(msg) || /can't resolve reference/i.test(msg)) {
            try {
              // Try to add draft-2020-12 meta schema first (preferred)
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const draft2020 = require('ajv/dist/refs/json-schema-draft-2020-12.json');
              ajv.addMetaSchema(draft2020);
              vscode.window.showInformationMessage('Added Draft-2020-12 meta schema to AJV for validation.');
            } catch (importErr) {
              // cannot load meta schema - continue and rethrow
            }
            try {
              // Fallback to draft-07 if 2020-12 cannot be added
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const draft07 = require('ajv/dist/refs/json-schema-draft-07.json');
              ajv.addMetaSchema(draft07);
              vscode.window.showInformationMessage('Added Draft-07 meta schema to AJV for validation.');
            } catch (importErr) {
              // cannot load meta schema - continue and rethrow
            }
            // Retry compile after adding meta
            return ajv.compile(schema);
          }
          throw e;
        }
      };
      const validate = compileSchemaWithMeta(schemaObj);
      // Parse the target JSON to validate
      let dataToValidate: any;
      try {
        dataToValidate = parseJsonText(text);
      } catch (err) {
        vscode.window.showErrorMessage('Failed to parse JSON/JSONC to validate');
        return;
      }

      const valid = validate(dataToValidate);
      const diagnostics: vscode.Diagnostic[] = [];
      if (valid) {
        // Clear diagnostics for document
        validationDiagnostics.delete(docUri);
        vscode.window.showInformationMessage('Validation succeeded (no errors).');
        return;
      }
      // Map Ajv errors to VS Code diagnostics
      // Load jsonc-parser dynamically, map errors to positions; fallback if not available
      let parseTreeFn: any = undefined;
      let findNodeAtLocationFn: any = undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const jsonc = require('jsonc-parser');
        parseTreeFn = jsonc.parseTree;
        findNodeAtLocationFn = jsonc.findNodeAtLocation;
        console.log('Aggo: jsonc-parser loaded successfully.');
      } catch (err) {
        // jsonc-parser not available in this packaged extension; we will only generate a fallback diagnostic
        parseTreeFn = undefined;
        findNodeAtLocationFn = undefined;
      }
      const tree = parseTreeFn ? parseTreeFn(text) : undefined;
      // If validating a selection, we need to offset node offsets by the selection start
      let baseOffset = 0;
      if (activeEditor && activeEditor.document.uri.toString() === docUri.toString() && !activeEditor.selection.isEmpty) {
        baseOffset = activeEditor.document.offsetAt(activeEditor.selection.start);
      }
      for (const err of (validate.errors || [])) {
        const pointer = ((err as any).instancePath || '') as string;
        const segments = pointer.split('/').slice(1).map((s) => (s === '' ? s : isFinite(Number(s)) ? Number(s) : s));
        let range: vscode.Range | undefined;
        if (tree && findNodeAtLocationFn) {
          const node = findNodeAtLocationFn(tree, segments as any);
          if (node) {
            const start = doc.positionAt(baseOffset + node.offset);
            const end = doc.positionAt(baseOffset + node.offset + node.length);
            range = new vscode.Range(start, end);
          }
        }
        if (!range) {
          // Fallback to document start
          range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
        }
        const message = `${err.message || 'Schema validation error'} (${String(err.keyword || '')})`;
        const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
        diagnostics.push(diag);
      }
      validationDiagnostics.set(docUri, diagnostics);
      vscode.window.showErrorMessage(`Validation failed: ${diagnostics.length} issues found. See Problems pane.`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Validation failed: ${err?.message || String(err)}`);
    }
  });
  try {
    context.subscriptions.push(validateCmd);


  } catch (err: any) {
    console.error('Failed to register command aggo.validateAgainstSchema', err);
    try { vscode.window.showErrorMessage(`Aggo: failed to register validate schema command: ${err?.message || String(err)}`); } catch (_) { }
  }

  // Register Activity Bar views
  // Force production mode to ensure we use the built assets from media/
  const isDev = false; 
  const libraryProvider = new AggoComponentLibraryProvider(context.extensionUri, isDev);
  const propertyProvider = new AggoPropertyViewProvider(context.extensionUri, isDev);
  try {
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(AggoComponentLibraryProvider.viewType, libraryProvider, { webviewOptions: { retainContextWhenHidden: true } }),
      vscode.window.registerWebviewViewProvider(AggoPropertyViewProvider.viewType, propertyProvider, { webviewOptions: { retainContextWhenHidden: true } })
    );
  } catch (err: any) {
    console.error('Failed to register Aggo view providers', err);
    try { vscode.window.showErrorMessage(`Aggo: failed to register activity views: ${err?.message || String(err)}`); } catch (_) { }
  }
  // Create a workspace-level watcher for the component library and broadcast on changes
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      const pattern = new vscode.RelativePattern(workspaceFolder, '.aggo/components/**');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const handler = async (uri?: vscode.Uri, eventType: 'create' | 'change' | 'delete' = 'change') => {
        try {
          if (!uri) { setTimeout(() => { broadcastComponentRegistryToPanels(); }, 20); return; }
          const fsPath = uri.fsPath;
          const basename = path.basename(fsPath);
          const registryPath = path.join(workspaceFolder, '.aggo', 'components', 'component_registry.json');
          if (basename === 'component_registry.json') { setTimeout(() => { broadcastComponentRegistryToPanels(); }, 20); return; }
          if (!fsPath.toLowerCase().endsWith('.js')) { setTimeout(() => { broadcastComponentRegistryToPanels(); }, 20); return; }

          let registry: any = {};
          if (fs.existsSync(registryPath)) {
            try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8') || '{}'); } catch (e) { registry = {}; }
          }

          if (eventType === 'delete') {
            const basenameJs = './.aggo/components/' + basename;
            let changed = false;
            for (const k of Object.keys(registry)) {
              const entryFile = registry[k] && registry[k].file;
              if (!entryFile) continue;
              const possiblePaths = [entryFile, path.join(workspaceFolder, entryFile), path.resolve(workspaceFolder, entryFile)];
              if (possiblePaths.includes(fsPath) || possiblePaths.includes(basenameJs)) { delete registry[k]; changed = true; }
            }
            if (changed) { await fs.promises.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8'); }
          } else {
            const id = path.basename(fsPath, '.js');
            const rel = './.aggo/components/' + basename;
            if (!registry[id]) {
              registry[id] = { id, name: id, category: 'Plugin', icon: '', file: rel };
              await fs.promises.mkdir(path.dirname(registryPath), { recursive: true });
              await fs.promises.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
            }
          }
          setTimeout(() => { broadcastComponentRegistryToPanels(); }, 20);
        } catch (err) { console.warn('[aggo] workspace component watcher handler failed', err); }
      };
      watcher.onDidCreate((u) => handler(u, 'create'));
      watcher.onDidChange((u) => handler(u, 'change'));
      watcher.onDidDelete((u) => handler(u, 'delete'));
      context.subscriptions.push(watcher);
      // Don't broadcast on activate - let each webview load registry when it sends 'ready' message
      // This ensures proper timing and avoids race conditions
    }
  } catch (err) { console.warn('[aggo] failed to register workspace components watcher', err); }
  
  } catch (err: any) {
    console.error('Aggo activation error:', err);
    try { vscode.window.showErrorMessage(`Aggo activation error: ${err?.message || String(err)}`); } catch (_) { }
    throw err;
  }
}

export function deactivate() { }
