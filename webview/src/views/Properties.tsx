import React, { useState, useEffect } from "react";
import { vscode } from "../utils/vscode";

type ElementData = {
  id: string;
  tagName?: string;
  attributes?: Record<string, string>;
  styles?: Record<string, string>;
  content?: string;
  // CPN specific
  type?: string;
  data?: any;
  isEdge?: boolean;
};

const SpaceSVG: React.FC<{ styles: Record<string, string>; onEdit: (prop: string, val: string) => void }> = ({ styles, onEdit }) => {
  const getValue = (val?: string) => (!val || val === "0" || val === "0px") ? "0" : val.replace("px", "");
  
  const mt = getValue(styles.marginTop);
  const mr = getValue(styles.marginRight);
  const mb = getValue(styles.marginBottom);
  const ml = getValue(styles.marginLeft);
  const pt = getValue(styles.paddingTop);
  const pr = getValue(styles.paddingRight);
  const pb = getValue(styles.paddingBottom);
  const pl = getValue(styles.paddingLeft);

  return (
    <div className="flex justify-center p-4 select-none">
      <svg width="200" height="160" viewBox="0 0 200 160" className="text-xs font-mono">
        {/* Margin Box */}
        <rect x="10" y="10" width="180" height="140" fill="rgba(251, 146, 60, 0.1)" stroke="rgb(251, 146, 60)" strokeDasharray="4,2" rx="4" />
        <text x="100" y="25" textAnchor="middle" fill="rgb(234, 88, 12)">{mt}</text>
        <text x="100" y="145" textAnchor="middle" fill="rgb(234, 88, 12)">{mb}</text>
        <text x="25" y="85" textAnchor="middle" fill="rgb(234, 88, 12)" transform="rotate(-90, 25, 85)">{ml}</text>
        <text x="175" y="85" textAnchor="middle" fill="rgb(234, 88, 12)" transform="rotate(90, 175, 85)">{mr}</text>
        <text x="14" y="15" fill="rgb(234, 88, 12)" fontSize="8">margin</text>

        {/* Padding Box */}
        <rect x="30" y="30" width="140" height="100" fill="rgba(163, 230, 53, 0.1)" stroke="rgb(132, 204, 22)" strokeDasharray="4,2" rx="2" />
        <text x="100" y="45" textAnchor="middle" fill="rgb(101, 163, 13)">{pt}</text>
        <text x="100" y="125" textAnchor="middle" fill="rgb(101, 163, 13)">{pb}</text>
        <text x="45" y="85" textAnchor="middle" fill="rgb(101, 163, 13)" transform="rotate(-90, 45, 85)">{pl}</text>
        <text x="155" y="85" textAnchor="middle" fill="rgb(101, 163, 13)" transform="rotate(90, 155, 85)">{pr}</text>
        <text x="34" y="38" fill="rgb(101, 163, 13)" fontSize="8">padding</text>

        {/* Content Box */}
        <rect x="50" y="50" width="100" height="60" fill="rgba(96, 165, 250, 0.1)" stroke="rgb(59, 130, 246)" rx="1" />
        <text x="100" y="85" textAnchor="middle" fill="rgb(37, 99, 235)">content</text>
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

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data;
      if (msg.type === "selectionChanged") {
        setElement(msg.element);
      } else if (msg.type === "update") {
        // Handle updates from extension if needed
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const updateElement = (updates: Partial<ElementData>) => {
    if (!element) return;
    const newElement = { ...element, ...updates };
    setElement(newElement);
    vscode.postMessage({ type: "updateElement", element: newElement });
  };

  const updateStyle = (key: string, value: string) => {
    if (!element || !element.styles) return;
    const newStyles = { ...element.styles };
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
          </div>
        )}

        {activeTab === "styles" && element.styles && (
          <div className="space-y-4">
            <SpaceSVG styles={element.styles} onEdit={updateStyle} />
            
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
