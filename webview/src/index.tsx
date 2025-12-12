import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { parse as parseJsonc } from 'jsonc-parser';
// Delay loading jsonjoy builder to avoid pulling it into the initial bundle
// which ajv/jsonjoy may use `new Function` and break under the webview CSP.
// When we route to the schema editor view we will import the builder dynamically.
import './styles/index.css';

import { Library } from './views/Library';
import { Properties } from './views/Properties';
import { PageCanvas } from './editors/PageCanvas';
import ErrorBoundary from './components/ErrorBoundary';
import { vscode } from './utils/vscode';

interface InitMessage {
  type: 'init';
  viewType: string;
  title: string;
  uri: string;
  text: string;
  theme?: 'light' | 'dark';
}

const App: React.FC = () => {
  const [state, setState] = React.useState<InitMessage | null>(null);
  const [schema, setSchema] = React.useState<any>({ type: 'object', properties: {}, required: [] });
  const [displaySchema, setDisplaySchema] = React.useState<any>(schema);
  const schemaRef = React.useRef(schema);
  React.useEffect(() => { schemaRef.current = schema; }, [schema]);
  const applyingRemoteUpdate = React.useRef(false);
  // Builder related state/hooks must be declared at top-level to avoid invalid hook calls
  const [builderComponents, setBuilderComponents] = React.useState<any>(null);
  const [builderError, setBuilderError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Expose React and ReactDOM globally for plugin artifacts that rely on window.React
    try { (window as any).React = React; (window as any).ReactDOM = ReactDOM; } catch (err) { /* ignore */ }
    const handler = (ev: MessageEvent) => {
      const data = ev.data as InitMessage;
      if (data?.type === 'init') {
        console.debug('[aggo] received init', data.viewType, data.title, data.uri);
        setState(data);
          try {
            if (data.text && data.text.trim() !== '') {
              const parsed = tryParseJsonC(data.text);
              setSchema(parsed);
            }
          } catch (e) {
            console.error("Failed to parse JSONC/JSON", e);
          }
        if (data.theme) {
          applyTheme(data.theme);
        }
      }
      // Theme-only messages
      if (ev.data?.type === 'theme') {
        const t = ev.data?.theme as 'light' | 'dark';
        applyTheme(t);
      }
      // Document updated externally (e.g. saved via text editor or other editor)
      if (ev.data?.type === 'documentChanged') {
        try {
          const text = ev.data?.text as string;
          if (text && text.trim() !== '') {
            const parsed = tryParseJsonC(text);
            // Avoid unnecessary re-render if schema is unchanged
            const cur = JSON.stringify(schemaRef.current);
            const next = JSON.stringify(parsed);
            if (cur !== next) {
              applyingRemoteUpdate.current = true;
              setSchema(parsed);
              setTimeout(() => { applyingRemoteUpdate.current = false; }, 0);
            }
          }
        } catch (e) {
          console.error('Failed to parse incoming document change', e);
        }
      }
    };
    window.addEventListener('message', handler);
    
    // Signal that the webview is ready to receive the init message
    if (vscode) {
      vscode.postMessage({ type: 'ready' });
    }

    return () => window.removeEventListener('message', handler);
  }, []);

  React.useEffect(() => {
    if (!(state?.viewType === 'aggo.schemaEditor' || state?.viewType === 'aggo.cpnEditor' || state?.viewType === 'aggo.mcpEditor' || state?.viewType === 'aggo.colorEditor')) {
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const mod = await import('aggo-schema-editor');
        // Try to load the editor stylesheet; silence TypeScript if .css typings are not present
        try {
          // @ts-ignore: stylesheet import may not have type declarations
          await import('aggo-schema-editor/styles.css');
        } catch (err) {
          // ignore stylesheet load errors
        }
        if (!cancelled) setBuilderComponents(mod);
      } catch (e: any) {
        console.error('[aggo] failed to load aggo-schema-editor', e);
        setBuilderError(String(e));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [state?.viewType]);

    function tryParseJsonC(text: string) {
      try {
        return parseJsonc(text as any);
      } catch (e) {
        try {
          return JSON.parse(text);
        } catch (err) {
          throw e;
        }
      }
    }

  const applyTheme = (theme: 'light' | 'dark') => {
    const root = document.getElementById('root');
    if (!root) return;
    // Always ensure base .jsonjoy class is present
    root.classList.add('jsonjoy');
    if (theme === 'dark') {
      root.classList.add('dark');
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      root.classList.remove('dark');
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  };

  function cloneDeep<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  const shouldPrefix = (ref: string) => {
    if (!ref) return false;
    if (ref.startsWith('#')) return false;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ref)) return false;
    if (ref.includes('/')) return false;
    return /\.[a-zA-Z0-9]+$/.test(ref);
  };

  const normalizeRefsForDisplay = (obj: any) => {
    if (!obj || typeof obj !== 'object') return obj;
    const out: any = Array.isArray(obj) ? [] : {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (k === '$ref' && typeof v === 'string' && shouldPrefix(v)) {
        out[k] = './' + v;
      } else {
        out[k] = normalizeRefsForDisplay(v);
      }
    }
    return out;
  };

  const revertRefsForSave = (obj: any) => {
    if (!obj || typeof obj !== 'object') return obj;
    const out: any = Array.isArray(obj) ? [] : {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (k === '$ref' && typeof v === 'string') {
        if (v.startsWith('./') && shouldPrefix(v.slice(2))) {
          out[k] = v.slice(2);
        } else {
          out[k] = v;
        }
      } else {
        out[k] = revertRefsForSave(v);
      }
    }
    return out;
  };

  const handleChange = (newSchema: any) => {
    const reverted = revertRefsForSave(newSchema);
    setSchema(reverted);
    if (applyingRemoteUpdate.current) return;
    if (vscode) {
      vscode.postMessage({
        type: 'update',
        text: JSON.stringify(newSchema, null, 2)
      });
    }
  };

  React.useEffect(() => {
    try {
      const cloned = cloneDeep(schema);
      const norm = normalizeRefsForDisplay(cloned);
      setDisplaySchema(norm);
    } catch (e) {
      setDisplaySchema(schema);
    }
  }, [schema]);

  const handleOpenInHost = React.useCallback(async (path: string) => {
    console.log('[aggo webview] handleOpenInHost called with path:', path);
    const anyWindow = window as any;
    if (typeof anyWindow?.vscodeOpenFile === 'function') {
      try {
        console.log('[aggo webview] calling vscodeOpenFile...');
        const result = await anyWindow.vscodeOpenFile(path);
        console.log('[aggo webview] vscodeOpenFile result type:', typeof result, result === null ? 'null' : result === undefined ? 'undefined' : '');
        // If the host already parsed it, return as-is; otherwise parse string response
        if (typeof result === 'string') {
          console.log('[aggo webview] result is string, length:', result.length);
          try {
            const parsed = tryParseJsonC(result);
            console.log('[aggo webview] parsed string result, type:', typeof parsed);
            return parsed;
          } catch (_e) {
            console.log('[aggo webview] failed to parse string, returning raw');
            return result;
          }
        }
        if (result && typeof result === 'object') {
          console.log('[aggo webview] result is object with keys:', Object.keys(result).slice(0, 5));
        }
        return result;
      } catch (err) {
        console.error('[aggo webview] vscodeOpenFile failed', err);
      }
    } else {
      console.log('[aggo webview] vscodeOpenFile not available');
    }
    if (/^https?:\/\//i.test(path)) {
      try {
        const resp = await fetch(path);
        if (resp.ok) {
          const text = await resp.text();
          try {
            return tryParseJsonC(text);
          } catch (_e) {
            return text;
          }
        }
      } catch (err) {
        console.error('[aggo webview] fallback fetch failed', err);
      }
    }
    console.log('[aggo webview] handleOpenInHost returning undefined');
    return undefined;
  }, []);

  if (!state) return <div className="aggo-placeholder">Loading...</div>;

  // Route based on viewType
  if (state.viewType === 'aggo.library') {
    return <Library />;
  }
  if (state.viewType === 'aggo.properties') {
    return <Properties />;
  }
  if (state.viewType === 'aggo.pageEditor') {
    // Page editor doesn't require aggo-schema-editor so it stays lightweight
    return <PageCanvas data={schema as any} onChange={handleChange} />;
  }

  if (state.viewType === 'aggo.schemaEditor' || state.viewType === 'aggo.cpnEditor' || state.viewType === 'aggo.mcpEditor' || state.viewType === 'aggo.colorEditor') {
    if (!builderComponents) {
      return (
        <div className="aggo-root h-screen flex flex-col bg-background text-foreground">
          <div className="flex-1 overflow-auto p-4">{builderError ? <div style={{ color: 'salmon' }}>Failed to load visual editor: {builderError}</div> : <div>Loading visual editor…</div>}</div>
        </div>
      );
    }

    const { SchemaVisualEditor: RemoteSchemaVisualEditor, TranslationContext: RemoteTranslationContext, en: RemoteEn } = builderComponents;
    return (
      <RemoteTranslationContext value={RemoteEn}>
        <div className="aggo-root h-screen flex flex-col bg-background text-foreground">
           <div className="flex-1 overflow-auto p-4">
              <ErrorBoundary onError={(err) => setBuilderError(String(err))}>
                <RemoteSchemaVisualEditor
                  schema={schema}
                  onChange={handleChange}
                  readOnly={false}
                  onOpenInHost={handleOpenInHost}
                />
              </ErrorBoundary>
           </div>
        </div>
      </RemoteTranslationContext>
    );
  }
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
