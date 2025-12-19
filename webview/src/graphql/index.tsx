import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import '../styles/index.css';
import { vscode } from '../utils/vscode';

import type { GraphqlAnalysis } from './graphqlLogic';
import {
  analyzeSdl,
  analyzeSdlWithLayout,
  applyDirectiveToField,
  readDirectivesForField,
  reorderFieldInType,
} from './graphqlLogic';
import type { GraphqlWorkerResponse, GraphqlWorkerRequest } from './graphqlWorker';
import { AggoRelationEdge } from './AggoRelationEdge';

type InitMessage = {
  type: 'init';
  viewType: string;
  title: string;
  uri: string;
  text: string;
  theme?: 'light' | 'dark';
};

function applyTheme(theme: 'light' | 'dark') {
  const root = document.getElementById('root');
  if (!root) return;
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
}

type GraphqlType = GraphqlAnalysis['types'][number];

function nodeHeightForType(fieldsCount: number): number {
  const rows = Math.min(12, Math.max(0, fieldsCount));
  return 52 + rows * 18 + (fieldsCount > 12 ? 18 : 0);
}

function kindClasses(kind: GraphqlAnalysis['types'][number]['kind']): string {
  // Tailwind palette classes only; keep it subtle and compatible with light/dark.
  switch (kind) {
    case 'object':
      return 'border-sky-400/20 bg-sky-500/10';
    case 'input':
      return 'border-amber-400/20 bg-amber-500/10';
    case 'interface':
      return 'border-violet-400/20 bg-violet-500/10';
    case 'enum':
      return 'border-emerald-400/20 bg-emerald-500/10';
    case 'union':
      return 'border-fuchsia-400/20 bg-fuchsia-500/10';
    case 'scalar':
      return 'border-slate-400/20 bg-slate-500/10';
    default:
      return 'border-white/10 bg-white/5';
  }
}

function kindToEdgeColor(kind: GraphqlType['kind']): string {
  // Keep it subtle; edge component uses this as its default stroke.
  switch (kind) {
    case 'object':
      return 'rgba(56,189,248,0.38)';
    case 'input':
      return 'rgba(251,191,36,0.38)';
    case 'interface':
      return 'rgba(167,139,250,0.38)';
    case 'enum':
      return 'rgba(52,211,153,0.38)';
    case 'union':
      return 'rgba(232,121,249,0.38)';
    case 'scalar':
      return 'rgba(148,163,184,0.38)';
    default:
      return 'rgba(255,255,255,0.28)';
  }
}

function buildEdges(analysis: GraphqlAnalysis): Edge[] {
  const typeMap = new Map(analysis.types.map((t) => [t.name, t.kind] as const));
  const edges: Edge[] = [];

  for (const r of analysis.relations ?? []) {
    const toKind = typeMap.get(r.toType) ?? 'other';
    const color = kindToEdgeColor(toKind);
    const id = `${r.fromType}.${r.fromField}->${r.toType}`;
    edges.push({
      id,
      source: r.fromType,
      target: r.toType,
      type: 'aggoRelation',
      data: { label: r.fromField, color },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color,
      },
    });
  }

  // De-dupe edges by id.
  const seen = new Set<string>();
  return edges.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  ref.current = value;
  return ref;
}

const DRAG_MIME = 'application/x-aggo-graphql-field';

const GraphqlTypeCard: React.FC<{
  t: GraphqlType;
  selectedType: string;
  selectedField: string;
  onSelectType: (typeName: string) => void;
  onSelectField: (typeName: string, fieldName: string, fieldType: string) => void;
  onReorderField: (typeName: string, fromField: string, toField: string) => void;
}> = ({ t, selectedType, selectedField, onSelectType, onSelectField, onReorderField }) => {
  const isSelected = selectedType && t.name === selectedType;
  const titleStyle = (() => {
    // Minimal font-style differences by kind (no new fonts).
    if (t.kind === 'input') return 'italic';
    if (t.kind === 'interface') return 'italic';
    return '';
  })();
  return (
    <div className="text-xs leading-tight">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelectType(t.name);
        }}
        className={
          [
            'nodrag nopan',
            'block w-full text-left',
            'font-semibold',
            'mb-2',
            titleStyle,
            isSelected ? 'opacity-100' : 'opacity-95',
          ].join(' ')
        }
        title="Select type"
      >
        {t.name}
      </button>

      <div className="opacity-90">
        {t.fields.slice(0, 12).map((f) => {
          const fieldSelected = isSelected && selectedField && f.name === selectedField;
          return (
            <div
              key={f.name}
              className={
                [
                  'nodrag nopan',
                  'flex items-start gap-1.5',
                  'rounded px-1 py-0.5',
                  fieldSelected ? 'bg-white/10' : 'hover:bg-white/5',
                ].join(' ')
              }
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ typeName: t.name, fieldName: f.name }));
              }}
              onDragOver={(e) => {
                // allow drop
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData(DRAG_MIME);
                if (!raw) return;
                try {
                  const parsed = JSON.parse(raw);
                  if (parsed?.typeName !== t.name) return;
                  const from = String(parsed.fieldName ?? '');
                  const to = f.name;
                  if (!from || !to || from === to) return;
                  onReorderField(t.name, from, to);
                } catch {
                  // ignore
                }
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectField(t.name, f.name, f.type);
                }}
                className="nodrag nopan text-left flex-1"
                title="Select field"
              >
                <span className="opacity-90">{f.name}</span>
                <span className="opacity-70">: </span>
                <span className="opacity-80">{f.type}</span>
              </button>
            </div>
          );
        })}
        {t.fields.length > 12 ? <div className="opacity-60">…</div> : null}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [state, setState] = React.useState<InitMessage | null>(null);
  const [sdl, setSdl] = React.useState<string>('');
  const [analysis, setAnalysis] = React.useState<GraphqlAnalysis>({ errors: [], types: [], relations: [] });
  const [selectedType, setSelectedType] = React.useState<string>('');
  const [selectedField, setSelectedField] = React.useState<string>('');

  const schemaUriRef = React.useRef<string | undefined>(undefined);

  const workerRef = React.useRef<Worker | null>(null);
  const [workerMode, setWorkerMode] = React.useState<'worker' | 'main'>('worker');

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const analysisRef = useLatest(analysis);
  const sdlRef = useLatest(sdl);
  const nodesRef = useLatest(nodes);

  React.useEffect(() => {
    // VS Code webviews can block cross-origin module Workers when using the Vite dev server.
    // If worker creation fails (SecurityError), fall back to running analysis on the main thread.
    try {
      workerRef.current = new Worker(new URL('./graphqlWorker.ts', import.meta.url), { type: 'module' });
      const w = workerRef.current;
      w.onmessage = (ev: MessageEvent<GraphqlWorkerResponse>) => {
        const msg = ev.data;
        if (msg.type === 'analysis') {
          setAnalysis(msg.analysis);
        } else if (msg.type === 'applied') {
          setSdl(msg.sdl);
          setAnalysis(msg.analysis);
          vscode?.postMessage({ type: 'update', text: msg.sdl });
        } else if (msg.type === 'reordered') {
          setSdl(msg.sdl);
          setAnalysis(msg.analysis);
          vscode?.postMessage({ type: 'update', text: msg.sdl });
        }
      };
      setWorkerMode('worker');
      return () => {
        w.terminate();
        workerRef.current = null;
      };
    } catch (e) {
      console.warn('[aggo graphql] worker blocked; falling back to main-thread analysis', e);
      setWorkerMode('main');
      workerRef.current = null;
      return;
    }
  }, []);

  const analyzeToken = React.useRef(0);
  const analyze = React.useCallback((nextSdl: string) => {
    if (workerMode === 'main') {
      const token = ++analyzeToken.current;
      // Provide a quick sync analysis for responsiveness, then upgrade with ELK layout.
      setAnalysis(analyzeSdl(nextSdl));
      void (async () => {
        const upgraded = await analyzeSdlWithLayout(nextSdl);
        if (token !== analyzeToken.current) return;
        setAnalysis(upgraded);
      })();
      return;
    }
    const w = workerRef.current;
    if (!w) return;
    const req: GraphqlWorkerRequest = { type: 'analyze', sdl: nextSdl };
    w.postMessage(req);
  }, [workerMode]);

  React.useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const data = ev.data as any;

      if (data?.type === 'init') {
        setState(data as InitMessage);
        setSdl((data.text as string) || '');
        analyze((data.text as string) || '');
        if (data.theme) applyTheme(data.theme);
        schemaUriRef.current = typeof data.uri === 'string' ? data.uri : undefined;
      }

      if (data?.type === 'theme') {
        applyTheme(data.theme as 'light' | 'dark');
      }

      if (data?.type === 'documentChanged') {
        const next = (data.text as string) || '';
        setSdl(next);
        analyze(next);
      }

      if (data?.type === 'graphqlApplyDirective') {
        const typeName = typeof data?.typeName === 'string' ? data.typeName : '';
        const fieldName = typeof data?.fieldName === 'string' ? data.fieldName : '';
        const directiveName = data?.directiveName === 'http' || data?.directiveName === 'resolver' ? data.directiveName : undefined;
        const args = (data?.args && typeof data.args === 'object') ? data.args : {};
        if (!typeName || !fieldName || !directiveName) return;

        // Apply directive in the same way as the old left panel did.
        if (workerMode === 'main') {
          const next = applyDirectiveToField({
            sdl,
            typeName,
            fieldName,
            directiveName,
            directiveArgs: args,
          });
          setSdl(next);
          void (async () => {
            setAnalysis(analyzeSdl(next));
            setAnalysis(await analyzeSdlWithLayout(next));
          })();
          vscode?.postMessage({ type: 'update', text: next });
          return;
        }

        workerRef.current?.postMessage({
          type: 'applyDirective',
          sdl,
          typeName,
          fieldName,
          directiveName,
          args,
        } satisfies GraphqlWorkerRequest);
      }
    };

    window.addEventListener('message', handler);
    vscode?.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, [analyze]);

  const postSelection = React.useCallback((payload: any) => {
    try {
      vscode?.postMessage({ type: 'selectionChanged', element: payload });
    } catch {
      // ignore
    }
  }, []);

  const onSelectType = React.useCallback((typeName: string) => {
    setSelectedType(typeName);
    setSelectedField('');
    postSelection({
      __aggoKind: 'graphql',
      selectionType: 'type',
      id: typeName,
      typeName,
      schemaUri: schemaUriRef.current,
    });
  }, [postSelection]);

  const onSelectField = React.useCallback((typeName: string, fieldName: string, fieldType: string) => {
    setSelectedType(typeName);
    setSelectedField(fieldName);
    const directives = readDirectivesForField({ sdl, typeName, fieldName });
    postSelection({
      __aggoKind: 'graphql',
      selectionType: 'field',
      id: `${typeName}.${fieldName}`,
      typeName,
      fieldName,
      fieldType,
      schemaUri: schemaUriRef.current,
      directives,
    });
  }, [postSelection, sdl]);

  const onReorderField = React.useCallback((typeName: string, fromField: string, toField: string) => {
    if (!typeName || !fromField || !toField || fromField === toField) return;

    if (workerMode === 'main') {
      const next = reorderFieldInType({
        sdl: sdlRef.current,
        typeName,
        fromFieldName: fromField,
        toFieldName: toField,
      });
      setSdl(next);
      void (async () => {
        setAnalysis(analyzeSdl(next));
        setAnalysis(await analyzeSdlWithLayout(next));
      })();
      vscode?.postMessage({ type: 'update', text: next });
      return;
    }

    workerRef.current?.postMessage({
      type: 'reorderField',
      sdl: sdlRef.current,
      typeName,
      fromFieldName: fromField,
      toFieldName: toField,
    } satisfies GraphqlWorkerRequest);
  }, [sdlRef, workerMode]);

  // Keep ReactFlow nodes/edges in sync with the latest analysis, but preserve user-dragged positions.
  React.useEffect(() => {
    const interesting = analysis.types
      .filter((t) => t.kind === 'object' || t.kind === 'input' || t.kind === 'interface')
      .slice(0, 80);

    const prevById = new Map(nodesRef.current.map((n) => [String(n.id), n] as const));

    const gapX = 280;
    const gapY = 180;

    const nextNodes: Node[] = interesting.map((t, idx) => {
      const prev = prevById.get(t.name);
      const layoutPos = analysis.layout?.[t.name];
      const fallbackPos = { x: (idx % 4) * gapX, y: Math.floor(idx / 4) * gapY };
      const position = prev?.position ?? (layoutPos ? { x: layoutPos.x, y: layoutPos.y } : fallbackPos);

      const selected = selectedType && t.name === selectedType;
      const label = (
        <GraphqlTypeCard
          t={t}
          selectedType={selectedType}
          selectedField={selectedField}
          onSelectType={onSelectType}
          onSelectField={onSelectField}
          onReorderField={onReorderField}
        />
      );

      return {
        id: t.name,
        position,
        data: { label },
        style: {
          width: 250,
          height: layoutPos?.height ?? nodeHeightForType(t.fields.length),
        },
        className: `rounded border ${kindClasses(t.kind)} ${selected ? 'ring-2 ring-white/20' : ''}`.trim(),
      };
    });

    const present = new Set(nextNodes.map((n) => String(n.id)));
    const nextEdges = buildEdges(analysis).filter((e) => present.has(String(e.source)) && present.has(String(e.target)));

    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [analysis, nodesRef, onReorderField, onSelectField, onSelectType, selectedField, selectedType, setEdges, setNodes]);

  const edgeTypes = React.useMemo(() => ({ aggoRelation: AggoRelationEdge }), []);

  const applyCurrentLayout = React.useCallback(async () => {
    const current = analysisRef.current;
    if (current.layout) {
      setNodes((curr) =>
        curr.map((n) => {
          const pos = current.layout?.[String(n.id)];
          return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n;
        }),
      );
      return;
    }
    // If we don't have layout (e.g. just switched to main-thread mode), compute it.
    const upgraded = await analyzeSdlWithLayout(sdlRef.current);
    setAnalysis(upgraded);
  }, [analysisRef, sdlRef, setNodes]);

  return (
    <div className="h-screen w-screen relative">
      <div className="absolute left-3 top-3 z-10 flex gap-2">
        <button
          className="px-3 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10"
          onClick={() => vscode?.postMessage({ type: 'openInTextEditor', uri: state?.uri })}
        >
          Edit SDL
        </button>
        <button
          className="px-3 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10"
          onClick={() => vscode?.postMessage({ type: 'syncGraphqlRuntime' })}
        >
          Sync Runtime
        </button>
        <button
          className="px-3 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10"
          onClick={() => vscode?.postMessage({ type: 'requestSave' })}
        >
          Save
        </button>
        <button
          className="px-3 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10"
          onClick={() => void applyCurrentLayout()}
          title="Re-run auto layout"
        >
          Auto layout
        </button>
        {!state ? (
          <div className="px-2 py-1 rounded border border-white/10 bg-white/5 text-xs opacity-80">
            Waiting for init…
          </div>
        ) : null}
      </div>

      <div className="absolute inset-0">
        <ReactFlow
          edgeTypes={edgeTypes}
          nodes={nodes}
          edges={edges}
          fitView
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onPaneClick={() => {
            setSelectedType('');
            setSelectedField('');
            postSelection({ __aggoKind: 'graphql', selectionType: 'none', id: 'none', schemaUri: schemaUriRef.current });
          }}
          onNodeClick={(_, n) => {
            // Clicking a node background selects the type.
            onSelectType(String(n.id));
          }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      {analysis.errors.length ? (
        <div className="absolute left-3 bottom-3 z-10 max-w-[520px] rounded border border-white/10 bg-black/30 p-2 text-xs">
          <div className="font-semibold mb-1">SDL parse errors</div>
          {analysis.errors.slice(0, 3).map((e, i) => (
            <div key={i} style={{ opacity: 0.9 }}>{e}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);
