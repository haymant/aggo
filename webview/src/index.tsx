import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import * as Tabs from '@radix-ui/react-tabs';
import './styles/index.css';

declare const acquireVsCodeApi: any;

interface InitMessage {
  type: 'init';
  viewType: string;
  title: string;
  uri: string;
  text: string;
}

const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

const App: React.FC = () => {
  const [state, setState] = React.useState<InitMessage | null>(null);

  React.useEffect(() => {
    window.addEventListener('message', (ev: MessageEvent) => {
      const data = ev.data as InitMessage;
      if (data?.type === 'init') {
        setState(data);
      }
    });
  }, []);

  if (!state) return <div className="aggo-placeholder">No data yet. Waiting for editor to initialize...</div>;

  return (
    <div className="aggo-root">
      <div className="aggo-header">
        <h2>{state.title}</h2>
        <div className="aggo-subtitle">{state.uri}</div>
      </div>
      <Tabs.Root defaultValue="editor" className="tabs-root">
        <Tabs.List aria-label="Labels">
          <Tabs.Trigger value="editor">Editor</Tabs.Trigger>
          <Tabs.Trigger value="preview">Preview</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="editor">
          <textarea className="editor-text" defaultValue={state.text} />
        </Tabs.Content>
        <Tabs.Content value="preview">
          <pre className="preview">{state.text}</pre>
        </Tabs.Content>
      </Tabs.Root>
      <div className="aggo-footer">
        <button onClick={() => vscode?.postMessage({ type: 'requestSave' })}>Save (Placeholder)</button>
      </div>
    </div>
  );
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
