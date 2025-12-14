import React, { useState, useEffect, useCallback, useRef } from 'react';
import { vscode } from '../utils/vscode';
import { SquarePen, Eye, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';
import ErrorBoundary from '../components/ErrorBoundary';
import ElementRenderer from '../renderers/ElementRenderer';

interface PageElement {
  id: string;
  tagName: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
  content?: string;
  children?: PageElement[];
}

interface PageCanvasProps {
  data: any;
  onChange: (data: any) => void;
}

export const PageCanvas: React.FC<PageCanvasProps> = ({ data, onChange }) => {
  console.debug('[PageCanvas] render data:', data);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<boolean>(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<null | { left:number; top:number; width:number; height:number; type: 'vertical' | 'horizontal' }>(null);
  const [dropMeta, setDropMeta] = useState<null | { parentId: string | null; index: number }>(null);
  const [zoom, setZoom] = useState<number>(1);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Refs for stable access in event listeners
  const dataRef = useRef(data);
  const selectedIdRef = useRef(selectedId);
  const [pluginRegistry, setPluginRegistry] = useState<Record<string, any>>({});
  const [, setPluginLoadTick] = useState(0);
  const loadedScriptsRef = useRef<Record<string, 'pending' | 'loaded' | 'failed'>>({});

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const mergeElementTree = useCallback((tree: PageElement, updated: PageElement) => {
    let matched: PageElement | null = null;

    const walk = (node: PageElement): PageElement => {
      if (node.id === updated.id) {
        const merged: PageElement = {
          ...node,
          ...updated,
          attributes: { ...node.attributes, ...updated.attributes },
          styles: { ...node.styles, ...updated.styles },
          children: typeof updated.children !== 'undefined' ? updated.children : node.children
        };
        matched = merged;
        return merged;
      }

      if (!node.children || node.children.length === 0) {
        return node;
      }

      let changed = false;
      const nextChildren = node.children.map((child) => {
        const next = walk(child);
        if (next !== child) changed = true;
        return next;
      });

      if (changed) {
        return { ...node, children: nextChildren };
      }
      return node;
    };

    const updatedTree = walk(tree);
    return { tree: updatedTree, match: matched };
  }, []);

  // Ensure data has a root or is a list. For simplicity, let's assume root object or array.
  // If empty, initialize with a container.
  useEffect(() => {
    if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && Object.keys(data).length === 0)) {
      onChange({
        id: 'root',
        tagName: 'div',
        attributes: {},
        styles: { 
          minHeight: '100%', 
          padding: '20px', 
          backgroundColor: '#ffffff',
          color: '#000000'
        },
        children: []
      });
    }
  }, [data]);
  // Log when we initialize the default root
  useEffect(() => {
    if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && Object.keys(data).length === 0)) {
      console.debug('[PageCanvas] initializing default root');
    }
  }, [data]);

  const handleSelect = (element: PageElement) => {
    setSelectedId(element.id);
    vscode.postMessage({ type: 'selectionChanged', element });
    if (editMode) {
      const el = document.getElementById(element.id);
      if (el) (el as HTMLElement).focus();
    }
  };

  const flatten = useCallback((node: PageElement, out: PageElement[] = []) => {
    out.push(node);
    if (node.children) node.children.forEach(c => flatten(c, out));
    return out;
  }, []);

  const handleTabNext = useCallback(() => {
    if (!editMode) return;
    if (!data) return;
    const list = flatten(data as PageElement, []);
    if (!selectedId) {
      setSelectedId(list[0]?.id || null);
      if (list[0]) vscode.postMessage({ type: 'selectionChanged', element: list[0] });
      return;
    }
    const idx = list.findIndex(x => x.id === selectedId);
    if (idx === -1) return;
    const next = list[(idx + 1) % list.length];
    if (next) {
      setSelectedId(next.id);
      vscode.postMessage({ type: 'selectionChanged', element: next });
      const el = document.getElementById(next.id);
      if (el) (el as HTMLElement).focus();
    }
  }, [data, selectedId, editMode, flatten]);

  // Utility helpers to find and modify elements in the tree
  const findParent = useCallback((node: PageElement, childId: string, parent: PageElement | null = null): { parent: PageElement | null; index: number } | null => {
    if (!node.children) return null;
    for (let i = 0; i < node.children.length; i++) {
      if (node.children[i].id === childId) return { parent: node, index: i };
      const r = findParent(node.children[i], childId, node);
      if (r) return r;
    }
    return null;
  }, []);

  const findById = useCallback((node: PageElement, id: string): PageElement | null => {
    if (!node) return null as any;
    if (node.id === id) return node;
    if (!node.children) return null;
    for (const c of node.children) {
      const r = findById(c, id);
      if (r) return r;
    }
    return null;
  }, []);

  const findPathToId = useCallback((node: PageElement, id: string, acc: PageElement[] = []): PageElement[] | null => {
    if (!node) return null;
    const next = [...acc, node];
    if (node.id === id) return next;
    if (!node.children) return null;
    for (const c of node.children) {
      const r = findPathToId(c, id, next);
      if (r) return r;
    }
    return null;
  }, []);

  const removeById = useCallback((node: PageElement, id: string): { node: PageElement; removed?: PageElement } => {
    if (!node.children || node.children.length === 0) return { node };
    const nextChildren: PageElement[] = [];
    let removed: PageElement | undefined = undefined;
    for (const c of node.children) {
      if (c.id === id) { removed = c; continue; }
      const res = removeById(c, id);
      nextChildren.push(res.node);
      if (res.removed) removed = res.removed;
    }
    return { node: { ...node, children: nextChildren }, removed };
  }, []);

  const insertAt = useCallback((node: PageElement, parentId: string | null, index: number, toInsert: PageElement): PageElement => {
    if (parentId === null || node.id === parentId) {
      const nextChildren = node.children ? [...node.children] : [];
      nextChildren.splice(index, 0, toInsert);
      return { ...node, children: nextChildren };
    }
    if (!node.children) return node;
    return { ...node, children: node.children.map(c => insertAt(c, parentId, index, toInsert)) };
  }, []);

  const handleDropTo = useCallback((parentId: string | null, index: number) => {
    if (!draggingId || !data) return;
    try {
      const cloned: PageElement = JSON.parse(JSON.stringify(data));
      const sourceParentInfo = findParent(cloned, draggingId);
      const sourceParentId = sourceParentInfo?.parent?.id ?? null;
      const sourceIndex = sourceParentInfo?.index;
      const { node: removedTree, removed } = removeById(cloned, draggingId);
      if (!removed) return;
      // If inserting into same parent and the removal index is before desired index, adjust index--
      if (parentId === sourceParentId && typeof sourceIndex === 'number' && sourceIndex < index) index = index - 1;
      // We'll attempt insertion
      const newTree = insertAt(removedTree, parentId, index, removed);
      onChange(newTree);
    } catch (err) {
      console.error('failed to reorder', err);
    }
  }, [draggingId, data, onChange, removeById, insertAt, findParent]);

  const clearIndicator = useCallback(() => { setDropIndicator(null); }, []);

  const addComponent = useCallback((template: any, insertAtSelected = true) => {
    const currentData = dataRef.current;
    const currentSelectedId = selectedIdRef.current;
    console.debug('[PageCanvas] addComponent', { template, insertAtSelected, selectedId: currentSelectedId });

    // Deep-clone template and assign ids recursively to all nodes
    const cloneAndAssignIds = (tpl: any): PageElement => {
      const node: any = JSON.parse(JSON.stringify(tpl));
      const ensureId = () => Math.random().toString(36).substr(2, 9);
      if (!node.id) node.id = ensureId();
      if (node.children && Array.isArray(node.children)) {
        node.children = node.children.map((c: any) => cloneAndAssignIds(c));
      }
      return node as PageElement;
    };

    const newElement = cloneAndAssignIds(template);
    const newData = JSON.parse(JSON.stringify(currentData));

    // In edit mode if we have a selected container, insert into it
    if (insertAtSelected && currentSelectedId) {
      const findById = (node: PageElement, id: string, parent: PageElement | null = null): { node?: PageElement; parent?: PageElement | null } => {
        if (node.id === id) return { node, parent };
        if (!node.children) return {};
        for (const c of node.children) {
          const r = findById(c, id, node);
          if (r.node) return r;
        }
        return {};
      };
      const selRes = findById(newData as PageElement, currentSelectedId);
      const sel = selRes.node;
      if (sel && !['img', 'input', 'hr', 'br'].includes(sel.tagName)) {
        if (!sel.children) sel.children = [] as PageElement[];
        // If sel has content (text), convert it into a text child
        if (sel.content) {
          const textChild: PageElement = { id: Math.random().toString(36).substr(2, 9), tagName: 'span', attributes: {}, styles: {}, content: sel.content } as any;
          sel.children.push(textChild);
          delete sel.content;
        }
        // Ensure any children of newElement also have ids (they do from cloneAndAssignIds)
        sel.children.push(newElement as PageElement);
        onChange(newData);
        return;
      }
      // If selected is a void/inline element, insert into its parent if available
      if (selRes.parent) {
        const parent = selRes.parent;
        if (!parent.children) parent.children = [] as PageElement[];
        // insert after the selected element
        const idx = parent.children.findIndex(c => c.id === sel!.id);
        parent.children.splice(idx + 1, 0, newElement as PageElement);
        onChange(newData);
        return;
      }
    }
    // Default: append to root children
    if (newData.children) {
      newData.children.push(newElement as PageElement);
    } else {
      if (!newData.children) newData.children = [];
      newData.children.push(newElement as PageElement);
    }
    onChange(newData);
  }, [onChange]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'insertComponent') {
        console.debug('[PageCanvas] insertComponent message received', msg.data);
        addComponent(msg.data);
      } else if (msg.type === 'updateElement' && msg.element) {
        const currentData = dataRef.current;
        if (!currentData) return;
        const { tree: updatedTree, match } = mergeElementTree(currentData, msg.element);
        // Only propagate if tree actually changed
        if (updatedTree !== currentData) {
          onChange(updatedTree);
          const selectedElement = match || msg.element;
          setSelectedId(selectedElement.id);
          vscode.postMessage({ type: 'selectionChanged', element: selectedElement });
        }
      }
      else if (msg.type === 'componentCatalogUpdated' && msg.registry) {
        // Populate registry state and attempt to load plugin artifacts into the webview
        try {
          setPluginRegistry(msg.registry);
          const entries = msg.registry || {};
          for (const key of Object.keys(entries)) {
            const entry = entries[key];
            try {
              // If plugin already registered on window, skip
              if ((window as any).__aggo_plugins__ && (window as any).__aggo_plugins__[key]) continue;
              const url = entry.file as string;
              if (!url) continue;
              const status = loadedScriptsRef.current[url];
              if (status === 'pending' || status === 'loaded') continue;
              const s = document.createElement('script');
              try {
                const nonce = (window as any).__aggo_nonce__ as string | undefined;
                if (nonce) (s as any).nonce = nonce;
              } catch (_) { /* ignore */ }
              s.src = url;
              s.async = true;
              loadedScriptsRef.current[url] = 'pending';
              s.onload = () => {
                loadedScriptsRef.current[url] = 'loaded';
                // Force a React re-render so any <plugin data-component="..."> nodes
                // can resolve to the newly registered plugin component.
                setPluginLoadTick((t) => t + 1);
                console.debug('[PageCanvas] loaded plugin', key);
              };
              s.onerror = (err) => { console.warn('[PageCanvas] failed to load plugin script', url, err); loadedScriptsRef.current[url] = 'failed'; };
              document.head.appendChild(s);
              // Some CSP failures don't reliably trigger onerror; clear pending if not registered soon.
              setTimeout(() => {
                try {
                  if (!(window as any).__aggo_plugins__?.[key] && loadedScriptsRef.current[url] === 'pending') {
                    loadedScriptsRef.current[url] = 'failed';
                  }
                } catch (_) { /* ignore */ }
              }, 1500);
            } catch (err) { console.warn('[PageCanvas] failed to append plugin script', err); }
          }
        } catch (err) { console.warn('[PageCanvas] failed handling componentCatalogUpdated msg', err); }
      }
    };
    window.addEventListener('message', handler);

    // On reload, the host may post the initial registry before our listener is attached.
    // Request it explicitly once we're ready to receive it.
    try { vscode.postMessage({ type: 'requestComponentRegistry' }); } catch (_) { /* ignore */ }

    return () => window.removeEventListener('message', handler);
  }, [onChange, mergeElementTree, addComponent]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!editMode) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        handleTabNext();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdRef.current) {
        e.preventDefault();
        // delete selected element
        const sd = selectedIdRef.current;
        const curr = dataRef.current as PageElement | undefined;
        if (!curr) return;
        const { node: newTree, removed } = removeById(curr, sd);
        if (removed) {
          onChange(newTree);
          setSelectedId(null);
          vscode.postMessage({ type: 'selectionChanged', element: null });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editMode, handleTabNext, removeById, onChange]);

  const handleDrop = (e: React.DragEvent) => {
    if (!editMode) return;
    e.preventDefault();
    const json = e.dataTransfer.getData('application/json');
    if (json) {
      try {
        const template = JSON.parse(json);
        // Distinguish internal drag by checking for id field and whether the id exists in current data; if so treat as move
        const hasId = template && typeof template.id === 'string';
        const isInternalFromData = hasId && !!findById(data as PageElement, template.id);
        if (isInternalFromData && draggingId) {
          // internal re-order is handled by dropMeta / handleDropTo, so nothing additional here
        }

        // If there's explicit drop meta (indicating parent and index), insert there
        if (dropMeta) {
          const newElement = { ...template, id: Math.random().toString(36).substr(2, 9) };
          const cloned: PageElement = JSON.parse(JSON.stringify(data));
          const newTree = insertAt(cloned, dropMeta.parentId, dropMeta.index, newElement);
          onChange(newTree);
        } else {
          addComponent(template, true);
        }
      } catch (err) {
        console.error('Failed to drop component', err);
      }
    }
    // clear any internal drag state
    setDraggingId(null);
    clearIndicator();
    setDropMeta(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Handlers for element-level drag/drop
  const onDragStart = (el: PageElement, e: React.DragEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    setDraggingId(el.id);
    try { e.dataTransfer.setData('application/json', JSON.stringify(el)); } catch (_) {}
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragEnd = (e: React.DragEvent) => {
    setDraggingId(null);
    clearIndicator();
    setDropMeta(null);
  };

  const onDragOverElem = (el: PageElement, e: React.DragEvent) => {
    if (!editMode || !rootRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const parentInfo = findParent(data as PageElement, el.id);
    const parent = parentInfo?.parent ? parentInfo.parent : (data as PageElement);
    const children = parent.children || [];
    // compute child rects
    const childRects = children.map(c => ({ id: c.id, rect: document.getElementById(c.id)?.getBoundingClientRect() }));
    const pointerY = e.clientY;
    const pointerX = e.clientX;
    // insertion index by pointerY midpoint
    let index = children.length;
    for (let i = 0; i < childRects.length; i++) {
      const r = childRects[i].rect;
      if (!r) continue;
      if (pointerY < r.top + r.height / 2) { index = i; break; }
    }
    // determine row vs column: use variability of centerY
    const centers = childRects.filter(c => c.rect).map(c => (c.rect!.top + c.rect!.height/2));
    const isRow = centers.length > 0 && Math.max(...centers) - Math.min(...centers) < 24;
    const rootRect = rootRef.current.getBoundingClientRect();
    if (isRow) {
      // vertical line between siblings
      let left = rootRect.left;
      let top = rootRect.top;
      let height = rootRect.height;
      // compute x position
      if (index === 0) {
        const nextRect = childRects[0].rect; if (nextRect) left = nextRect.left - 2;
      } else if (index >= childRects.length) {
        const prevRect = childRects[childRects.length-1].rect; if (prevRect) left = prevRect.right + 2;
      } else {
        const prev = childRects[index-1].rect; const next = childRects[index].rect;
        if (prev && next) left = (prev.right + next.left) / 2;
      }
      setDropIndicator({ left: left - rootRect.left, top: 0, width: 2, height: rootRect.height, type: 'vertical' });
    } else {
      // horizontal line between rows
      let y = rootRect.top;
      if (index === 0) {
        const nextRect = childRects[0].rect; if (nextRect) y = nextRect.top - 2;
      } else if (index >= childRects.length) {
        const prevRect = childRects[childRects.length-1].rect; if (prevRect) y = prevRect.bottom + 2;
      } else {
        const prev = childRects[index-1].rect; if (prev) y = prev.bottom + 1;
      }
      setDropIndicator({ left: 0, top: y - rootRect.top, width: rootRect.width, height: 2, type: 'horizontal' });
    }
    // store desired parent/index on the drag state (use React state)
    setDropMeta({ parentId: parent.id, index });
    // also set on nativeEvent as a fallback for drops which may cancel state
    (e.nativeEvent as any).__aggo_drop = { parentId: parent.id, index };
  };

  const onDropElem = (el: PageElement, e: React.DragEvent) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    const meta = dropMeta ?? (e.nativeEvent as any).__aggo_drop;
    // If dragging an internal element allow reordering
    if (draggingId && meta) {
      handleDropTo(meta.parentId, meta.index);
      setDraggingId(null);
      clearIndicator();
      setDropMeta(null);
      return;
    }
    // If dropping from external source (library) and we have meta, insert the new element at the location
    const json = e.dataTransfer.getData('application/json');
    if (!draggingId && meta && json) {
      try {
        const template = JSON.parse(json);
        const newElement = { ...template, id: Math.random().toString(36).substr(2, 9) };
        const cloned: PageElement = JSON.parse(JSON.stringify(data));
        const newTree = insertAt(cloned, meta.parentId, meta.index, newElement);
        onChange(newTree);
      } catch (err) {
        console.error('Failed to insert new component on drop', err);
      }
      setDraggingId(null);
      clearIndicator();
      setDropMeta(null);
      return;
    }
    setDraggingId(null);
    clearIndicator();
    setDropMeta(null);
  };

  const isPageData = (obj: any) => obj && typeof obj === 'object' && typeof obj.tagName === 'string';
  if (!data || !isPageData(data)) {
    // If we have some data but it doesn't look like a Page object, give a helpful message
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      return (
        <div className="aggo-placeholder" style={{ padding: 16 }}>
          <div style={{ marginBottom: 8 }}><strong>Document content does not look like a page.</strong></div>
          <div style={{ marginBottom: 12 }}>The Page canvas expects a root element with a `tagName`. You can either switch to the Editor view to work with raw JSON, or initialize the document as a Page.</div>
          <button onClick={() => onChange({ id: 'root', tagName: 'div', attributes: {}, styles: { minHeight: '100%', padding: '20px', backgroundColor: '#ffffff' }, children: [] })}>Initialize as Page</button>
        </div>
      );
    }
    return <div>Initializing...</div>;
  }

  const breadcrumbPath = selectedId ? (data && isPageData(data) ? findPathToId(data as PageElement, selectedId) || [] : []) : [];
  const zoomIn = () => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)));
  const zoomOut = () => setZoom(z => Math.max(0.2, +(z - 0.1).toFixed(2)));
  const resetZoom = () => setZoom(1);

  return (
    <div 
      className="w-full bg-gray-100 dark:bg-gray-900 overflow-auto"
      style={{ height: '100vh' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => { if (!editMode) return; setSelectedId(null); vscode.postMessage({ type: 'selectionChanged', element: null }); }}
      ref={rootRef}
    >
      <div style={{ position: 'absolute', right: 8, top: 0, zIndex: 80, pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={zoomOut}
            className="aggo-toolbar flex items-center justify-center p-0"
            style={{ width: 32, height: 32, borderRadius: 4, backgroundColor: '#ffffff' }}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" aria-hidden />
          </button>
          <div style={{ fontSize: 12, minWidth: 44, textAlign: 'center' }}>{Math.round(zoom * 100)}%</div>
          <button
            onClick={zoomIn}
            className="aggo-toolbar flex items-center justify-center p-0"
            style={{ width: 32, height: 32, borderRadius: 4, backgroundColor: '#ffffff' }}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" aria-hidden />
          </button>
          <button
            onClick={resetZoom}
            className="aggo-toolbar flex items-center justify-center p-0"
            style={{ width: 32, height: 32, borderRadius: 4, backgroundColor: '#ffffff' }}
            title="Reset zoom"
            aria-label="Reset zoom"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
          <button
            onClick={() => setEditMode(v => !v)}
            className="aggo-toolbar flex items-center justify-center p-0"
            style={{
              backgroundColor: editMode ? '#374151' : '#f3f4f6',
              color: editMode ? '#ffffff' : '#111827',
              padding: 0,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            aria-pressed={editMode}
            title={editMode ? 'Switch to Preview Mode' : 'Switch to Edit Mode'}
            aria-label={editMode ? 'Edit mode currently active; switch to preview' : 'Preview mode currently active; switch to edit'}
          >
            {editMode ? <SquarePen className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 8, top: 8, zIndex: 90 }}>
        {breadcrumbPath && breadcrumbPath.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {breadcrumbPath.map((b, idx) => (
              <button
                key={b.id}
                onClick={() => { setSelectedId(b.id); vscode.postMessage({ type: 'selectionChanged', element: b }); }}
                className="px-2 py-0 text-xs border border-border rounded bg-background hover:bg-accent"
                title={`${b.tagName} (${b.id})`}
              >
                {b.tagName}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No selection</div>
        )}
      </div>

      <div className="shadow-sm mx-auto bg-white" style={{ maxWidth: '100%', minHeight: '100vh' }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
          <ElementRenderer element={data} selectedId={selectedId} editMode={editMode} draggingId={draggingId} onSelect={handleSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOverElem={onDragOverElem} onDropElem={onDropElem} onTabNext={handleTabNext} />
        </div>
      </div>
      {dropIndicator && (
        <div style={{ position: 'absolute', left: dropIndicator.left, top: dropIndicator.top, width: dropIndicator.width, height: dropIndicator.height, background: '#3b82f6', zIndex: 50, pointerEvents: 'none' }} />
      )}
    </div>
  );
};
