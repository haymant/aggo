import React, { useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ReactFlow,
  Background,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  OnSelectionChangeParams,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../styles/index.css';

import { PlaceNode } from '../cpn/components/PlaceNode';
import { TransitionNode } from '../cpn/components/TransitionNode';
import { LabeledEdge } from '../cpn/components/LabeledEdge';
import { CanvasControls } from '../cpn/components/CanvasControls';
import { computePetriLayoutGraph } from '../cpn/utils/auto-layout';

declare const acquireVsCodeApi: any;
const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

const nodeTypes = {
  place: PlaceNode,
  transition: TransitionNode,
};

const edgeTypes = {
  labeled: LabeledEdge,
};

type GraphPayload = {
  nodes: Node[];
  edges: Edge[];
  errors?: string[];
};

function PNMLEditor() {
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);

  const applyingRemoteUpdate = useRef(false);
  const sendTimer = useRef<any>(undefined);
  const hasInitialized = useRef(false);

  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const sendLayoutUpdate = useCallback((n: Node[], e: Edge[]) => {
    if (applyingRemoteUpdate.current) return;
    if (sendTimer.current) clearTimeout(sendTimer.current);

    sendTimer.current = setTimeout(() => {
      if (!vscode) return;
      vscode.postMessage({
        type: 'updateLayout',
        nodes: n,
        edges: e,
      });
    }, 250);
  }, []);

  const onAutoLayout = useCallback(async () => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = await computePetriLayoutGraph(nodes, edges, {
      direction: 'DOWN',
      horizontalGap: 220,
      verticalGap: 140,
      startX: 120,
      startY: 80,
    });
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    sendLayoutUpdate(layoutedNodes, layoutedEdges);
    setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 30);
  }, [edges, fitView, nodes, sendLayoutUpdate, setEdges, setNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        const shouldPersist = changes.some((change: any) => {
          if (change?.type !== 'position') return false;
          // Persist when drag ends to avoid self-update churn while actively dragging.
          if (change?.dragging === false) return true;
          // Also persist explicit position updates that are not drag-state toggles.
          return !!change?.position;
        });
        if (shouldPersist) {
          sendLayoutUpdate(next, edges);
        }
        return next;
      });
    },
    [edges, sendLayoutUpdate, setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // Allow editing edge labels, but do not persist structural changes back into PNML yet.
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdges]
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    if (!vscode) return;

    const selectedNode = params.nodes[0];
    const selectedEdge = params.edges[0];
    const selected = selectedNode || selectedEdge || null;

    vscode.postMessage({
      type: 'selectionChanged',
      element: selected
        ? {
            id: selected.id,
            type: (selected as any).type || 'default',
            data: (selected as any).data,
            isEdge: !!selectedEdge,
          }
        : null,
    });
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type !== 'init' && message.type !== 'documentChanged') return;

      const graph: GraphPayload | undefined = message.graph;
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return;

      applyingRemoteUpdate.current = true;
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setTimeout(() => {
        applyingRemoteUpdate.current = false;
        if (!hasInitialized.current || message.type === 'init') {
          try {
            fitView({ padding: 0.25, duration: 200 });
          } catch {
            // ignore
          }
          hasInitialized.current = true;
        }
      }, 100);
    };

    window.addEventListener('message', handleMessage);

    if (vscode) {
      vscode.postMessage({ type: 'ready' });
    }

    return () => window.removeEventListener('message', handleMessage);
  }, [fitView, setEdges, setNodes]);

  return (
    <div className="aggo-root" style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        autoPanOnNodeDrag={false}
        fitView
      >
        <Background />
        <CanvasControls
          onAutoLayout={onAutoLayout}
          zoomIn={(opts) => zoomIn(opts)}
          zoomOut={(opts) => zoomOut(opts)}
          fitView={(opts) => fitView(opts)}
        />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <ReactFlowProvider>
      <PNMLEditor />
    </ReactFlowProvider>
  );
}
