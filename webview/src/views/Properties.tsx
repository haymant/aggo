import React, { useState, useEffect, useRef } from "react";
import { vscode } from "../utils/vscode";
import builtins from '@aggo/core';

type ElementData = {
  id: string;
  tagName?: string;
  attributes?: Record<string, string>;
  styles?: Record<string, string>;
  content?: string;
  events?: Record<string, any>;
  lifecycle?: { onMount?: any; onUnmount?: any };
  // CPN specific
  type?: string;
  data?: any;
  isEdge?: boolean;
};

const SpaceSVG: React.FC<{ styles: Record<string, string>; onEdit: (prop: string, val: string) => void }> = ({ styles, onEdit }) => {
  const getValue = (val?: string) => (!val || val === "0" || val === "0px") ? "0" : String(val).replace("px", "");
  
  const mt = getValue(styles.marginTop || styles.margin?.split(' ')[0]);
  const mr = getValue(styles.marginRight || styles.margin?.split(' ')[1] || styles.margin?.split(' ')[0]);
  const mb = getValue(styles.marginBottom || styles.margin?.split(' ')[2] || styles.margin?.split(' ')[0]);
  const ml = getValue(styles.marginLeft || styles.margin?.split(' ')[3] || styles.margin?.split(' ')[1] || styles.margin?.split(' ')[0]);
  const pt = getValue(styles.paddingTop || styles.padding?.split(' ')[0]);
  const pr = getValue(styles.paddingRight || styles.padding?.split(' ')[1] || styles.padding?.split(' ')[0]);
  const pb = getValue(styles.paddingBottom || styles.padding?.split(' ')[2] || styles.padding?.split(' ')[0]);
  const pl = getValue(styles.paddingLeft || styles.padding?.split(' ')[3] || styles.padding?.split(' ')[1] || styles.padding?.split(' ')[0]);

  const updateSide = (key: string, value: string) => {
    // take numeric input and store with px if needed
    let v = value === '' ? '' : (String(value).match(/px$/) ? value : value + 'px');
    onEdit(key, v);
  };

  return (
    <div className="flex justify-center p-4 select-none">
      <svg width="220" height="160" viewBox="0 0 220 160" className="text-xs font-mono">
        {/* Margin Box */}
        <rect x="10" y="10" width="200" height="140" fill="rgba(251, 146, 60, 0.1)" stroke="rgb(251, 146, 60)" strokeDasharray="4,2" rx="4" />
        <foreignObject x="80" y="12" width="60" height="20">
          <input className="text-xs w-full p-0 text-center" value={mt} onChange={(e) => updateSide('marginTop', e.target.value)} />
        </foreignObject>
        <foreignObject x="80" y="128" width="60" height="20">
          <input className="text-xs w-full p-0 text-center" value={mb} onChange={(e) => updateSide('marginBottom', e.target.value)} />
        </foreignObject>
        <foreignObject x="12" y="60" width="50" height="20">
          <input className="text-xs w-full p-0 text-center" value={ml} onChange={(e) => updateSide('marginLeft', e.target.value)} />
        </foreignObject>
        <foreignObject x="158" y="60" width="50" height="20">
          <input className="text-xs w-full p-0 text-center" value={mr} onChange={(e) => updateSide('marginRight', e.target.value)} />
        </foreignObject>
        <text x="14" y="15" fill="rgb(234, 88, 12)" fontSize="8">margin</text>

        {/* Padding Box */}
        <rect x="30" y="30" width="160" height="100" fill="rgba(163, 230, 53, 0.1)" stroke="rgb(132, 204, 22)" strokeDasharray="4,2" rx="2" />
        <foreignObject x="100" y="34" width="40" height="20">
          <input className="text-xs w-full p-0 text-center" value={pt} onChange={(e) => updateSide('paddingTop', e.target.value)} />
        </foreignObject>
        <foreignObject x="100" y="108" width="40" height="20">
          <input className="text-xs w-full p-0 text-center" value={pb} onChange={(e) => updateSide('paddingBottom', e.target.value)} />
        </foreignObject>
        <foreignObject x="38" y="64" width="40" height="20">
          <input className="text-xs w-full p-0 text-center" value={pl} onChange={(e) => updateSide('paddingLeft', e.target.value)} />
        </foreignObject>
        <foreignObject x="142" y="64" width="40" height="20">
          <input className="text-xs w-full p-0 text-center" value={pr} onChange={(e) => updateSide('paddingRight', e.target.value)} />
        </foreignObject>
        <text x="34" y="38" fill="rgb(101, 163, 13)" fontSize="8">padding</text>

        {/* Content Box */}
        <rect x="60" y="50" width="100" height="60" fill="rgba(96, 165, 250, 0.1)" stroke="rgb(59, 130, 246)" rx="1" />
        <text x="110" y="85" textAnchor="middle" fill="rgb(37, 99, 235)">content</text>
      </svg>
    </div>
  );
};

const CPNProperties: React.FC<{ element: ElementData; onUpdate: (data: ElementData) => void }> = ({ element, onUpdate }) => {
  const [activeTab, setActiveTab] = useState("props");
  const data = element.data || {};

  const updateData = (key: string, value: any) => {
    const newData = { ...data, [key]: value };
    onUpdate({ ...element, data: newData });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-border">
        <button
          className={`px-4 py-2 text-xs font-medium ${activeTab === "props" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("props")}
        >
          Properties
        </button>
        {element.type === "place" && (
          <button
            className={`px-4 py-2 text-xs font-medium ${activeTab === "tokens" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setActiveTab("tokens")}
          >
            Tokens
          </button>
        )}
        <button
          className={`px-4 py-2 text-xs font-medium ${activeTab === "sim" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("sim")}
        >
          Simulation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "props" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                type="text"
                className="w-full p-1 text-xs bg-background border border-input rounded"
                value={data.name || ""}
                onChange={(e) => updateData("name", e.target.value)}
              />
            </div>
            
            {element.type === "transition" && (
              <>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Kind</label>
                  <select
                    className="w-full p-1 text-xs bg-background border border-input rounded"
                    value={data.kind || "Manual"}
                    onChange={(e) => updateData("kind", e.target.value)}
                  >
                    <option value="Manual">Manual</option>
                    <option value="Auto">Auto</option>
                    <option value="Message">Message</option>
                    <option value="LLM">LLM</option>
                    <option value="Tools">Tools</option>
                    <option value="Retriever">Retriever</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Guard Expression</label>
                  <textarea
                    className="w-full p-1 text-xs bg-background border border-input rounded h-20 font-mono"
                    value={data.guardExpression || ""}
                    onChange={(e) => updateData("guardExpression", e.target.value)}
                  />
                </div>
              </>
            )}

            {element.type === "place" && (
               <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Capacity</label>
                  <input
                    type="number"
                    className="w-full p-1 text-xs bg-background border border-input rounded"
                    value={data.capacity || 0}
                    onChange={(e) => updateData("capacity", parseInt(e.target.value))}
                  />
                </div>
            )}

            {element.isEdge && (
               <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Expression</label>
                  <input
                    type="text"
                    className="w-full p-1 text-xs bg-background border border-input rounded font-mono"
                    value={data.expression || ""}
                    onChange={(e) => updateData("expression", e.target.value)}
                  />
                </div>
            )}
          </div>
        )}

        {activeTab === "tokens" && element.type === "place" && (
          <div className="space-y-4">
             <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold">Initial Tokens</h4>
                <button 
                    className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                    onClick={() => {
                        const tokens = data.tokens || [];
                        updateData("tokens", [...tokens, { color: "#000000" }]);
                    }}
                >
                    Add Token
                </button>
             </div>
             <div className="space-y-2">
                {(data.tokens || []).map((token: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 border p-2 rounded">
                        <input 
                            type="color" 
                            value={token.color || "#000000"}
                            onChange={(e) => {
                                const tokens = [...(data.tokens || [])];
                                tokens[idx] = { ...tokens[idx], color: e.target.value };
                                updateData("tokens", tokens);
                            }}
                            className="w-6 h-6 border-0 p-0 rounded cursor-pointer"
                        />
                        <span className="text-xs flex-1">Token {idx + 1}</span>
                        <button 
                            className="text-xs text-destructive hover:text-destructive/80"
                            onClick={() => {
                                const tokens = [...(data.tokens || [])];
                                tokens.splice(idx, 1);
                                updateData("tokens", tokens);
                            }}
                        >
                            Remove
                        </button>
                    </div>
                ))}
                {(data.tokens || []).length === 0 && <div className="text-xs text-muted-foreground italic">No tokens</div>}
             </div>
          </div>
        )}

        {activeTab === "sim" && (
            <div className="space-y-4">
                <div className="p-2 bg-muted rounded text-xs">
                    Simulation controls will appear here when the simulation is running.
                </div>
                <button className="w-full py-1 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80">
                    Start Simulation
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export const Properties: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"props" | "styles">("props");
  const [element, setElement] = useState<ElementData | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [availableHandlers, setAvailableHandlers] = useState<string[]>([]);
  const [pluginRegistry, setPluginRegistry] = useState<Record<string, any>>({});
  const loadedScriptsRef = useRef<Record<string, 'pending' | 'loaded' | 'failed'>>({});
  const pluginRegistryRef = useRef<Record<string, any>>({});
  const requestedComponentRef = useRef<Record<string, boolean>>({});
  const handlersRequestIdRef = useRef(1);

  useEffect(() => {
    pluginRegistryRef.current = pluginRegistry || {};
  }, [pluginRegistry]);

  const ensurePluginLoaded = (componentId: string) => {
    try {
      if (!componentId) return;
      if ((window as any).__aggo_plugins__?.[componentId]) return;
      const regEntry = pluginRegistryRef.current?.[componentId];
      const url = regEntry?.file as string | undefined;
      if (!url) {
        // Ask the extension host to send us the registry entry for this component id
        if (!requestedComponentRef.current[componentId]) {
          requestedComponentRef.current[componentId] = true;
          try { vscode.postMessage({ type: 'requestComponent', id: componentId }); } catch (_) { /* ignore */ }
        }
        return;
      }
      const status = loadedScriptsRef.current[url];
      if (status === 'pending' || status === 'loaded') return;

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
        // Trigger a re-render so schema-based fields appear
        setElement((cur) => (cur ? { ...cur } : cur));
      };
      s.onerror = (err) => {
        console.warn('[Properties] failed to load plugin script', url, err);
        loadedScriptsRef.current[url] = 'failed';
      };
      document.head.appendChild(s);
      // Some CSP failures don't reliably trigger onerror; clear pending if not registered soon.
      setTimeout(() => {
        try {
          if (!(window as any).__aggo_plugins__?.[componentId] && loadedScriptsRef.current[url] === 'pending') {
            loadedScriptsRef.current[url] = 'failed';
          }
        } catch (_) { /* ignore */ }
      }, 1500);
    } catch (_) {
      // ignore
    }
  };

  const requestHandlers = (pid: string) => {
    try {
      const id = `req-${handlersRequestIdRef.current++}`;
      vscode.postMessage({ type: 'requestHandlers', id, pageId: pid });
    } catch (_) {
      // ignore
    }
  };

  const pickUniqueHandlerName = (base: string): string => {
    const normalizedBase = (base || 'handler').trim() || 'handler';
    const set = new Set((availableHandlers || []).filter(Boolean));
    if (!set.has(normalizedBase)) return normalizedBase;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${normalizedBase}${i}`;
      if (!set.has(candidate)) return candidate;
    }
    return `${normalizedBase}${Date.now()}`;
  };

  const createHandler = async (pid: string, args: { suggestedName?: string; prompt?: boolean }): Promise<string | null> => {
    const prompt = args.prompt ?? true;
    const suggested = pickUniqueHandlerName(args.suggestedName || 'onClick');
    const name = prompt
      ? (window.prompt('New handler name', suggested) || '').trim()
      : suggested;
    if (!name) return null;
    try {
      const id = `req-${handlersRequestIdRef.current++}`;
      vscode.postMessage({ type: 'createHandler', id, pageId: pid, name });
      return name;
    } catch (_) {
      return null;
    }
  };

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data;
      if (msg.type === "selectionChanged") {
        setElement(msg.element);
        if (typeof msg.pageId === 'string' && msg.pageId.trim()) {
          const pid = msg.pageId.trim();
          setPageId(pid);
          requestHandlers(pid);
        }
      } else if (msg.type === 'componentCatalogUpdated') {
        try {
          const registry = msg.registry || {};
          setPluginRegistry((prev) => {
            const next = { ...(prev || {}), ...(registry || {}) };
            pluginRegistryRef.current = next;
            return next;
          });
          // Load plugin artifacts into the Properties webview so schemas are available
          for (const key of Object.keys(registry)) {
            const entry = registry[key];
            const url = entry?.file as string | undefined;
            if (!url) continue;
            // If plugin already registered on window, skip
            if ((window as any).__aggo_plugins__ && (window as any).__aggo_plugins__[key]) continue;
            // Attempt load; ensurePluginLoaded handles dedupe + retry safety
            ensurePluginLoaded(key);
          }
        } catch (err) {
          console.warn('[aggo properties] invalid registry', err);
        }
      } else if (msg.type === "update") {
        // Handle updates from extension if needed
      } else if (msg.type === 'handlersList') {
        try {
          if (msg.error) {
            console.warn('[aggo properties] handlersList error', msg.error);
          }
          if (typeof msg.pageId === 'string' && pageId && msg.pageId !== pageId) {
            // Ignore stale responses.
            return;
          }
          const handlers = Array.isArray(msg.handlers) ? msg.handlers.filter(Boolean) : [];
          setAvailableHandlers(handlers);
        } catch (_) {
          // ignore
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [pageId]);

  const updateElement = (updates: Partial<ElementData>) => {
    if (!element) return;
    const newElement = { ...element, ...updates };
    setElement(newElement);
    vscode.postMessage({ type: "updateElement", element: newElement });
  };

  const updateStyle = (key: string, value: string) => {
    if (!element) return;
    const newStyles = { ...(element.styles || {}) };
    if (!value) {
      delete newStyles[key];
    } else {
      newStyles[key] = value;
    }
    updateElement({ styles: newStyles });
  };

  const updateAttr = (key: string, value: string) => {
    if (!element || !element.attributes) return;
    const newAttrs = { ...element.attributes };
    if (!value) {
      delete newAttrs[key];
    } else {
      newAttrs[key] = value;
    }
    updateElement({ attributes: newAttrs });
  };

  const updateEventHandler = (eventName: string, handlerId: string) => {
    if (!element) return;
    const nextEvents = { ...(element.events || {}) } as any;
    const trimmed = (handlerId || '').trim();
    if (!trimmed) {
      delete nextEvents[eventName];
    } else {
      nextEvents[eventName] = trimmed;
    }
    updateElement({ events: nextEvents });
  };

  const updateLifecycleHandler = (key: 'onMount' | 'onUnmount', handlerId: string) => {
    if (!element) return;
    const nextLifecycle: any = { ...(element.lifecycle || {}) };
    const trimmed = (handlerId || '').trim();
    if (!trimmed) {
      delete nextLifecycle[key];
    } else {
      nextLifecycle[key] = trimmed;
    }
    updateElement({ lifecycle: nextLifecycle });
  };

  const suggestHandlerName = (evName: string) => {
    const raw = String(evName || '').replace(/^on/i, '');
    const cap = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Click';
    return `on${cap}`;
  };

  if (!element) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select an element to view properties
      </div>
    );
  }

  // CPN Element Handling
  if (element.type === "place" || element.type === "transition" || element.isEdge) {
      return <CPNProperties element={element} onUpdate={(newData) => {
          setElement(newData);
          vscode.postMessage({ type: "updateElement", element: newData });
      }} />;
  }

  // HTML Element Handling (Page Editor)
  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-border">
        <button
          className={`px-4 py-2 text-xs font-medium ${activeTab === "props" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("props")}
        >
          Properties
        </button>
        <button
          className={`px-4 py-2 text-xs font-medium ${activeTab === "styles" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("styles")}
        >
          Styles
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "props" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tag Name</label>
              <input
                type="text"
                className="w-full p-1 text-xs bg-background border border-input rounded"
                value={element.tagName || ""}
                readOnly
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">ID</label>
              <input
                type="text"
                className="w-full p-1 text-xs bg-background border border-input rounded"
                value={element.attributes?.id || ""}
                onChange={(e) => updateAttr("id", e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Classes</label>
              <input
                type="text"
                className="w-full p-1 text-xs bg-background border border-input rounded"
                value={element.attributes?.class || ""}
                onChange={(e) => updateAttr("class", e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Content</label>
              <textarea
                className="w-full p-1 text-xs bg-background border border-input rounded h-20"
                value={element.content || ""}
                onChange={(e) => updateElement({ content: e.target.value })}
              />
            </div>
            {/* Plugin props section */}
            {(() => {
              // Determine the schema entry for either a plugin component or a built-in
              let entry: any = undefined;
              if (element?.attributes && (element.attributes as any)['data-component']) {
                const cid = (element.attributes as any)['data-component'] as string;
                // Prefer the loaded plugin's registration (includes schema)
                entry = (window as any).__aggo_plugins__?.[cid];
                if (!entry) {
                  // If we don't have registry info yet, ask the host for it.
                  if (!pluginRegistryRef.current || Object.keys(pluginRegistryRef.current).length === 0) {
                    try { vscode.postMessage({ type: 'requestComponentRegistry' }); } catch (_) { /* ignore */ }
                  }
                  ensurePluginLoaded(cid);
                }
              }
              if (!entry && element?.tagName) {
                entry = (builtins as any)[element.tagName] || (builtins as any)[String(element.tagName).toLowerCase()];
              }
              if (!entry || !entry.schema) return <></>;
              const propsSchema = (entry.schema as any).properties || {};
              const schemaEvents: Array<{ name: string; title?: string; description?: string }> = Array.isArray((entry.schema as any).events)
                ? (entry.schema as any).events
                : [];
              const existingEventKeys = Object.keys(element.events || {});
              const eventNames = Array.from(new Set([...
                schemaEvents.map((e) => e.name),
                ...existingEventKeys
              ])).filter(Boolean);

              return (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold">Plugin Properties</h4>
                  {Object.keys(propsSchema).map((p) => {
                    const def = propsSchema[p];
                    if (def.type === 'string') {
                      const currentValue = ((element.attributes as any)?.[p] ?? def.default ?? '') as string;
                      return (
                        <div key={p} className="space-y-1">
                          <label className="text-xs text-muted-foreground">{def.title || p}</label>
                          <input type="text" className="w-full p-1 text-xs bg-background border border-input rounded" value={currentValue} onChange={(e) => updateAttr(p, e.target.value)} />
                        </div>
                      );
                    }
                    return (<div key={p}>{p}: unsupported field type</div>);
                  })}

                  {(eventNames.length > 0) && (
                    <div className="space-y-2 pt-2">
                      <h4 className="text-xs font-bold">Events</h4>
                      {eventNames.map((evName) => {
                        const spec = schemaEvents.find((e) => e.name === evName);
                        const current = (() => {
                          const v = (element.events as any)?.[evName];
                          if (typeof v === 'string') return v;
                          if (v && typeof v === 'object' && typeof (v as any).handler === 'string') return (v as any).handler;
                          return '';
                        })();
                        return (
                          <div key={evName} className="space-y-1">
                            <label className="text-xs text-muted-foreground">{spec?.title || evName}</label>
                            <div className="flex gap-2">
                              <select
                                className="flex-1 p-1 text-xs bg-background border border-input rounded"
                                value={current}
                                onChange={(e) => updateEventHandler(evName, e.target.value)}
                              >
                                <option value="">(none)</option>
                                {availableHandlers.map((h) => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
                                disabled={!pageId}
                                onClick={async () => {
                                  if (!pageId) return;
                                  const isEmpty = !current;
                                  const created = await createHandler(pageId, {
                                    suggestedName: suggestHandlerName(evName),
                                    // When nothing is wired yet, create a default handler without prompting.
                                    prompt: !isEmpty
                                  });
                                  if (created) {
                                    // Optimistically set selection; list will refresh from host response.
                                    updateEventHandler(evName, created);
                                  }
                                }}
                              >
                                New
                              </button>
                            </div>
                            {spec?.description ? <div className="text-[10px] text-muted-foreground">{spec.description}</div> : null}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {(element.id === 'root') && (
                    <div className="space-y-2 pt-2">
                      <h4 className="text-xs font-bold">Page Lifecycle</h4>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">onMount</label>
                        <div className="flex gap-2">
                          <select
                            className="flex-1 p-1 text-xs bg-background border border-input rounded"
                            value={(element.lifecycle as any)?.onMount || ''}
                            onChange={(e) => updateLifecycleHandler('onMount', e.target.value)}
                          >
                            <option value="">(none)</option>
                            {availableHandlers.map((h) => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
                            disabled={!pageId}
                            onClick={async () => {
                              if (!pageId) return;
                              const existing = String((element.lifecycle as any)?.onMount || '').trim();
                              const created = await createHandler(pageId, { suggestedName: 'onMount', prompt: !!existing });
                              if (created) updateLifecycleHandler('onMount', created);
                            }}
                          >
                            New
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">onUnmount</label>
                        <div className="flex gap-2">
                          <select
                            className="flex-1 p-1 text-xs bg-background border border-input rounded"
                            value={(element.lifecycle as any)?.onUnmount || ''}
                            onChange={(e) => updateLifecycleHandler('onUnmount', e.target.value)}
                          >
                            <option value="">(none)</option>
                            {availableHandlers.map((h) => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
                            disabled={!pageId}
                            onClick={async () => {
                              if (!pageId) return;
                              const existing = String((element.lifecycle as any)?.onUnmount || '').trim();
                              const created = await createHandler(pageId, { suggestedName: 'onUnmount', prompt: !!existing });
                              if (created) updateLifecycleHandler('onUnmount', created);
                            }}
                          >
                            New
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground">Lifecycle handlers run in the runtime (Run/Debug), not in the editor webview.</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === "styles" && (
          <div className="space-y-4">
            <SpaceSVG styles={element.styles || {}} onEdit={updateStyle} />
            
            {/* Typography */}
            <div>
              <h4 className="text-xs font-bold mb-2">Typography</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Color</label>
                  <div className="flex gap-1">
                    <input
                      type="color"
                      className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                      value={element.styles.color || "#000000"}
                      onChange={(e) => updateStyle("color", e.target.value)}
                    />
                    <input
                      type="text"
                      className="flex-1 p-1 text-xs bg-background border border-input rounded"
                      value={element.styles.color || ""}
                      onChange={(e) => updateStyle("color", e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Font Size</label>
                  <input
                    type="text"
                    className="w-full p-1 text-xs bg-background border border-input rounded"
                    value={element.styles.fontSize || ""}
                    onChange={(e) => updateStyle("fontSize", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Font Weight</label>
                  <select 
                    className="w-full p-1 text-xs bg-background border border-input rounded"
                    value={element.styles.fontWeight || "normal"}
                    onChange={(e) => updateStyle("fontWeight", e.target.value)}
                  >
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="300">300</option>
                    <option value="400">400</option>
                    <option value="500">500</option>
                    <option value="600">600</option>
                    <option value="700">700</option>
                    <option value="800">800</option>
                    <option value="900">900</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Text Align</label>
                  <select 
                    className="w-full p-1 text-xs bg-background border border-input rounded"
                    value={element.styles.textAlign || "left"}
                    onChange={(e) => updateStyle("textAlign", e.target.value)}
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                    <option value="justify">Justify</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Size */}
            <div>
              <h4 className="text-xs font-bold mb-2">Size</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Width</label>
                  <input
                    type="text"
                    className="w-full p-1 text-xs bg-background border border-input rounded"
                    value={element.styles.width || ""}
                    onChange={(e) => updateStyle("width", e.target.value)}
                    placeholder="auto"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Height</label>
                  <input
                    type="text"
                    className="w-full p-1 text-xs bg-background border border-input rounded"
                    value={element.styles.height || ""}
                    onChange={(e) => updateStyle("height", e.target.value)}
                    placeholder="auto"
                  />
                </div>
              </div>
            </div>

            {/* Layout */}
            <div>
              <h4 className="text-xs font-bold mb-2">Layout</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Display</label>
                  <select
                    className="w-full p-1 text-xs bg-background border border-input rounded"
                    value={(element.styles && element.styles.display) || "block"}
                    onChange={(e) => updateStyle("display", e.target.value)}
                  >
                    <option value="block">block</option>
                    <option value="inline">inline</option>
                    <option value="inline-block">inline-block</option>
                    <option value="flex">flex</option>
                    <option value="inline-flex">inline-flex</option>
                    <option value="grid">grid</option>
                    <option value="inline-grid">inline-grid</option>
                    <option value="none">none</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Flex Direction</label>
                  <select
                    className="w-full p-1 text-xs bg-background border border-input rounded"
                    value={(element.styles && element.styles.flexDirection) || "row"}
                    onChange={(e) => updateStyle("flexDirection", e.target.value)}
                  >
                    <option value="row">row</option>
                    <option value="row-reverse">row-reverse</option>
                    <option value="column">column</option>
                    <option value="column-reverse">column-reverse</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Background */}
            <div>
              <h4 className="text-xs font-bold mb-2">Background</h4>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Color</label>
                <div className="flex gap-1">
                    <input
                    type="color"
                    className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                    value={element.styles.backgroundColor || "#ffffff"}
                    onChange={(e) => updateStyle("backgroundColor", e.target.value)}
                    />
                    <input
                    type="text"
                    className="flex-1 p-1 text-xs bg-background border border-input rounded"
                    value={element.styles.backgroundColor || ""}
                    onChange={(e) => updateStyle("backgroundColor", e.target.value)}
                    />
                </div>
              </div>
            </div>
            
            {/* Border */}
            <div>
              <h4 className="text-xs font-bold mb-2">Border</h4>
              <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Width</label>
                    <input
                        type="text"
                        className="w-full p-1 text-xs bg-background border border-input rounded"
                        value={element.styles.borderWidth || ""}
                        onChange={(e) => updateStyle("borderWidth", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Radius</label>
                    <input
                        type="text"
                        className="w-full p-1 text-xs bg-background border border-input rounded"
                        value={element.styles.borderRadius || ""}
                        onChange={(e) => updateStyle("borderRadius", e.target.value)}
                    />
                  </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
