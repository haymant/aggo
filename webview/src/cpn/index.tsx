import React, { useCallback, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  Background,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  OnSelectionChangeParams,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../styles/index.css";

import { parse as parseJsonc } from "jsonc-parser";
import { PlaceNode } from "./components/PlaceNode";
import { TransitionNode } from "./components/TransitionNode";
import { LabeledEdge } from "./components/LabeledEdge";
import { CanvasControls } from "./components/CanvasControls";
import { computePetriLayout } from "./utils/auto-layout";

declare const acquireVsCodeApi: any;
const vscode = typeof acquireVsCodeApi !== "undefined" ? acquireVsCodeApi() : null;

const nodeTypes = {
  place: PlaceNode,
  transition: TransitionNode,
};

const edgeTypes = {
  labeled: LabeledEdge,
};

const defaultNodes: Node[] = [
  { id: "p1", type: "place", position: { x: 100, y: 100 }, data: { name: "Start", tokens: [{ color: "#000" }] } },
  { id: "t1", type: "transition", position: { x: 300, y: 100 }, data: { name: "Process", kind: "Manual" } },
  { id: "p2", type: "place", position: { x: 500, y: 100 }, data: { name: "End", tokens: [] } }
];
const defaultEdges: Edge[] = [
  { id: "e1", source: "p1", target: "t1", type: "labeled", data: { expression: "1" } },
  { id: "e2", source: "t1", target: "p2", type: "labeled", data: { expression: "1" } }
];

function parseCpnText(text: string) {
  if (!text || text.trim().length === 0) {
    return { nodes: defaultNodes, edges: defaultEdges };
  }
  try {
    const parsed = parseJsonc(text);
    if (parsed && typeof parsed === "object") {
      return { 
        nodes: parsed.nodes || [], 
        edges: parsed.edges || [] 
      };
    }
  } catch (e) {
    try {
      const parsed = JSON.parse(text);
      return { 
        nodes: parsed.nodes || [], 
        edges: parsed.edges || [] 
      };
    } catch (err) {
      return { nodes: defaultNodes, edges: defaultEdges };
    }
  }
  return { nodes: defaultNodes, edges: defaultEdges };
}

function CPNEditor() {
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const applyingRemoteUpdate = useRef(false);
  const { screenToFlowPosition, fitView, zoomIn, zoomOut } = useReactFlow();
  // react to theme changes from the body via the observer; useful for any JS-only adjustments
  useEffect(() => {
    const onTheme = (ev: Event) => {
      const detail: any = (ev as CustomEvent).detail || {};
      // future: allow nodes/edges that require JS theme updates to respond
      // e.g., rerender chart canvas, outline colors, etc.
      // We can dispatch a per-node event or set local state as needed.
      // For now we call fitView to ensure UI settles after theme change (harmless call)
      try { fitView?.({ padding: 0.25, duration: 200 }); } catch {}
    };
    window.addEventListener('aggo-theme-change', onTheme);
    return () => window.removeEventListener('aggo-theme-change', onTheme);
  }, [fitView]);
  
  // Debounce sending updates
  const sendTimer = useRef<any>(undefined);

  const sendUpdate = useCallback((n: Node[], e: Edge[]) => {
    if (applyingRemoteUpdate.current) return;
    
    if (sendTimer.current) clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => {
      if (vscode) {
        vscode.postMessage({
          type: "update",
          text: JSON.stringify({ nodes: n, edges: e }, null, 2)
        });
      }
    }, 500);
  }, []);

  const addPlace = useCallback(() => {
    const id = `p-${Math.random().toString(36).slice(2, 7)}`;
    const pos = screenToFlowPosition({ x: 200, y: 150 });
    
    const newNode: Node = {
      id,
      type: "place",
      position: pos,
      data: { kind: "place", name: `Place ${id.slice(-3)}`, tokens: 0, tokenList: [], colorSet: 'INT' },
    };
    
    setNodes((nds) => {
        const next = [...nds, newNode];
        sendUpdate(next, edges);
        return next;
    });
  }, [screenToFlowPosition, setNodes, edges, sendUpdate]);

  const addTransition = useCallback(() => {
    const id = `t-${Math.random().toString(36).slice(2, 7)}`;
    const pos = screenToFlowPosition({ x: 420, y: 150 });
    
    const newNode: Node = {
      id,
      type: "transition",
      position: pos,
      data: { kind: "transition", name: `Transition ${id.slice(-3)}`, tType: "Manual", guardExpression: "true" },
    };
    
    setNodes((nds) => {
        const next = [...nds, newNode];
        sendUpdate(next, edges);
        return next;
    });
  }, [screenToFlowPosition, setNodes, edges, sendUpdate]);

  const onAutoLayout = useCallback(() => {
      setNodes((curr) => {
          const layouted = computePetriLayout(curr, edges, { horizontalGap: 260, verticalGap: 120, startX: 120, startY: 80 });
          sendUpdate(layouted, edges);
          return layouted;
      });
      setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 30);
  }, [edges, fitView, setNodes, sendUpdate]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        sendUpdate(next, edges);
        return next;
      });
    },
    [edges, sendUpdate, setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        sendUpdate(nodes, next);
        return next;
      });
    },
    [nodes, sendUpdate, setEdges]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const next = addEdge({ ...params, type: "labeled" }, eds);
        sendUpdate(nodes, next);
        return next;
      });
    },
    [nodes, sendUpdate, setEdges]
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    if (vscode) {
      // Send the first selected node or edge, or null if nothing selected
      const selectedNode = params.nodes[0];
      const selectedEdge = params.edges[0];
      const selected = selectedNode || selectedEdge || null;
      
      vscode.postMessage({
        type: "selectionChanged",
        element: selected ? {
          id: selected.id,
          type: selected.type || "default",
          data: selected.data,
          isEdge: !!selectedEdge
        } : null
      });
    }
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "init" || message.type === "documentChanged") {
          const text = message.text;
          const { nodes: newNodes, edges: newEdges } = parseCpnText(text);
          applyingRemoteUpdate.current = true;
          setNodes(newNodes);
          setEdges(newEdges);
          // Allow state to settle before enabling updates again
          setTimeout(() => {
            applyingRemoteUpdate.current = false;
          }, 100);
      } else if (message.type === "updateElement") {
          const element = message.element;
          if (element.isEdge) {
             setEdges((eds) => eds.map((e) => e.id === element.id ? { ...e, data: element.data } : e));
          } else {
             setNodes((nds) => nds.map((n) => n.id === element.id ? { ...n, data: element.data } : n));
          }
      }
    };

    window.addEventListener("message", handleMessage);
    
    // Signal ready
    if (vscode) {
      vscode.postMessage({ type: "ready" });
    }

    return () => window.removeEventListener("message", handleMessage);
  }, [setNodes, setEdges]);

  // Theme observer: watch for VS Code theme class changes on the body and emit lightweight event for JS-driven components
  useEffect(() => {
    const updateTheme = () => {
      try {
        const cls = document.body.className || '';
        const theme = cls.includes('vscode-light') ? 'light' : cls.includes('vscode-dark') ? 'dark' : cls.includes('vscode-high-contrast') ? 'high-contrast' : 'unknown';
        document.documentElement.setAttribute('data-aggo-theme', theme);
        window.dispatchEvent(new CustomEvent('aggo-theme-change', { detail: { theme } }));
      } catch (e) { /* ignore */ }
    };
    updateTheme();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          updateTheme();
        }
      }
    });
    observer.observe(document.body, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Watch for body class changes from VS Code to detect theme changes (light/dark/high-contrast)
  useEffect(() => {
    const applyThemeAttr = (className: string) => {
      const root = document.documentElement;
      if (className.includes('vscode-light')) {
        root.setAttribute('data-theme', 'light');
      } else if (className.includes('vscode-dark')) {
        root.setAttribute('data-theme', 'dark');
      } else if (className.includes('vscode-high-contrast')) {
        root.setAttribute('data-theme', 'hc');
      } else {
        root.removeAttribute('data-theme');
      }
    };

    // initial
    try { applyThemeAttr(document.body.className || ''); } catch {}

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          applyThemeAttr(document.body.className || '');
        }
      }
    });
    obs.observe(document.body, { attributes: true });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="aggo-root" style={{ width: "100vw", height: "100vh" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
      >
        <Background />
        <CanvasControls 
            addPlace={addPlace}
            addTransition={addTransition}
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

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <ReactFlowProvider>
      <CPNEditor />
    </ReactFlowProvider>
  );
}
