import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, Background, Controls, applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../styles/index.css';

import { parse as parseJsonc } from 'jsonc-parser';

declare const acquireVsCodeApi: any;
const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

const defaultNodes = [
  { id: '1', position: { x: 100, y: 100 }, data: { label: 'Node 1' } },
  { id: '2', position: { x: 300, y: 100 }, data: { label: 'Node 2' } }
];
const defaultEdges = [{ id: 'e1-2', source: '1', target: '2' }];
const initialNodes: any[] = [];
const initialEdges: any[] = [];

function parseCpnText(text: string) {
  if (!text || text.trim().length === 0) {
    return { nodes: defaultNodes, edges: defaultEdges };
  }
  try {
    // Try a tolerant parse for JSON / JSONC
    const parsed = parseJsonc(text);
    if (parsed && typeof parsed === 'object') {
      return { nodes: parsed.nodes || [], edges: parsed.edges || [] };
    }
  } catch (e) {
    // fallback to JSON.parse as a last attempt
    try {
      const parsed = JSON.parse(text);
      return { nodes: parsed.nodes || [], edges: parsed.edges || [] };
    } catch (err) {
      return { nodes: defaultNodes, edges: defaultEdges };
    }
  }
  return { nodes: defaultNodes, edges: defaultEdges };
}

function App() {
  const [nodes, setNodes] = React.useState(initialNodes);
  const [edges, setEdges] = React.useState(initialEdges);
  const applyingRemoteUpdate = React.useRef(false);
  // Debounce sending updates to the extension to avoid spamming during fast interactions
  const sendTimer = React.useRef<number | undefined>(undefined);
  const pendingSend = React.useRef<string | undefined>(undefined);

  const sendUpdate = React.useCallback((n: any, e: any) => {
    if (!vscode || applyingRemoteUpdate.current) return;
    const payload = JSON.stringify({ nodes: n, edges: e }, null, 2);
    pendingSend.current = payload;
    if (sendTimer.current) window.clearTimeout(sendTimer.current);
    /* slightly delay sending to coalesce millisecond updates */
    sendTimer.current = window.setTimeout(() => {
      if (pendingSend.current) vscode.postMessage({ type: 'update', text: pendingSend.current });
      pendingSend.current = undefined;
      sendTimer.current = undefined;
    }, 150);
  }, []);

  const onNodesChange = React.useCallback((changes) => {
    setNodes((nds) => {
      const next = applyNodeChanges(changes, nds);
      sendUpdate(next, edges);
      return next;
    });
  }, [edges, sendUpdate]);

  const onEdgesChange = React.useCallback((changes) => {
    setEdges((eds) => {
      const next = applyEdgeChanges(changes, eds);
      sendUpdate(nodes, next);
      return next;
    });
  }, [nodes, sendUpdate]);

  const onConnect = React.useCallback((params) => {
    setEdges((eds) => {
      const next = addEdge(params, eds);
      sendUpdate(nodes, next);
      return next;
    });
  }, [nodes, sendUpdate]);

  const onNodeDragStop = React.useCallback((event, node) => {
    setNodes((nds) => {
      const next = nds.map((n) => n.id === node.id ? { ...n, position: node.position } : n);
      sendUpdate(next, edges);
      return next;
    });
  }, [edges, sendUpdate]);

  React.useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const message = ev.data;
      if (!message) return;
      if (message.type === 'init') {
        try {
              // Try to parse message.text => nodes/edges
              const text = (message.text || '').toString();
              const { nodes: parsedNodes, edges: parsedEdges } = parseCpnText(text);
              if (parsedNodes && Array.isArray(parsedNodes)) setNodes(parsedNodes);
              if (parsedEdges && Array.isArray(parsedEdges)) setEdges(parsedEdges);
          // For now we keep defaults
        } catch (e) {
          // ignore
        }
      }
      if (message.type === 'documentChanged') {
        try {
          const text = (message.text || '').toString();
          const { nodes: parsedNodes, edges: parsedEdges } = parseCpnText(text);
          applyingRemoteUpdate.current = true;
          if (parsedNodes && Array.isArray(parsedNodes)) setNodes(parsedNodes);
          if (parsedEdges && Array.isArray(parsedEdges)) setEdges(parsedEdges);
          setTimeout(() => { applyingRemoteUpdate.current = false; }, 0);
        } catch (e) {
          // ignore
        }
      }
      // handle theme or other messages here
    };
    window.addEventListener('message', handler);
    // indicate readiness so the extension can send init payload
    if (vscode) {
      vscode.postMessage({ type: 'ready' });
    }
    return () => {
      window.removeEventListener('message', handler);
      if (sendTimer.current) window.clearTimeout(sendTimer.current);
    };
  }, []);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView={true} nodesDraggable={true} nodesConnectable={true} nodesSelectable={true}
             onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeDragStop={onNodeDragStop}>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
