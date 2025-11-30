import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { SchemaVisualEditor, TranslationContext, en, JSONSchema } from 'jsonjoy-builder';
import { parse as parseJsonc } from 'jsonc-parser';
import 'jsonjoy-builder/styles.css';
import './styles/index.css';

declare const acquireVsCodeApi: any;

interface InitMessage {
  type: 'init';
  viewType: string;
  title: string;
  uri: string;
  text: string;
  theme?: 'light' | 'dark';
}

const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

const App: React.FC = () => {
  const [state, setState] = React.useState<InitMessage | null>(null);
  const [schema, setSchema] = React.useState<JSONSchema>({ type: 'object', properties: {}, required: [] });
  const schemaRef = React.useRef(schema);
  React.useEffect(() => { schemaRef.current = schema; }, [schema]);
  const applyingRemoteUpdate = React.useRef(false);

  React.useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const data = ev.data as InitMessage;
      if (data?.type === 'init') {
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

  const handleChange = (newSchema: JSONSchema) => {
    setSchema(newSchema);
    if (applyingRemoteUpdate.current) return;
    if (vscode) {
      vscode.postMessage({
        type: 'update',
        text: JSON.stringify(newSchema, null, 2)
      });
    }
  };

  if (!state) return <div className="aggo-placeholder">Loading...</div>;

  return (
    <TranslationContext value={en}>
      <div className="aggo-root h-screen flex flex-col bg-background text-foreground">
         <div className="flex-1 overflow-auto p-4">
            <SchemaVisualEditor
              schema={schema}
              onChange={handleChange}
              readOnly={false}
            />
         </div>
      </div>
    </TranslationContext>
  );
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
