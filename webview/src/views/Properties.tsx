import React, { useState, useEffect } from 'react';
import { vscode } from '../utils/vscode';

type ElementData = {
  id: string;
  tagName: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
  content?: string;
};

const SpaceSVG: React.FC<{ styles: Record<string, string>; onEdit: (prop: string, val: string) => void }> = ({ styles, onEdit }) => {
  const getValue = (val?: string) => (!val || val === '0' || val === '0px') ? '0' : val.replace('px', '');
  
  const mt = getValue(styles.marginTop);
  const mr = getValue(styles.marginRight);
  const mb = getValue(styles.marginBottom);
  const ml = getValue(styles.marginLeft);
  const pt = getValue(styles.paddingTop);
  const pr = getValue(styles.paddingRight);
  const pb = getValue(styles.paddingBottom);
  const pl = getValue(styles.paddingLeft);

  const promptEdit = (prop: string, current: string) => {
    // In a real app, this might be a popover. For now, simple prompt or just focus an input.
    // We'll just use a simple prompt for this MVP to avoid complex UI code without libraries.
    // Or better, we rely on the inputs below the SVG.
    // Let's just make it clickable to focus the input if we had refs, but for now just visual.
  };

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

export const Properties: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'props' | 'styles'>('props');
  const [element, setElement] = useState<ElementData | null>(null);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data;
      if (msg.type === 'selectionChanged') {
        setElement(msg.element);
      } else if (msg.type === 'update') {
        // Handle updates from extension if needed
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const updateElement = (updates: Partial<ElementData>) => {
    if (!element) return;
    const newElement = { ...element, ...updates };
    setElement(newElement);
    vscode.postMessage({ type: 'updateElement', element: newElement });
  };

  const updateStyle = (key: string, value: string) => {
    if (!element) return;
    const newStyles = { ...element.styles };
    if (!value) {
      delete newStyles[key];
    } else {
      newStyles[key] = value;
    }
    updateElement({ styles: newStyles });
  };

  const updateAttr = (key: string, value: string) => {
    if (!element) return;
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
      <div className="p-4 text-center text-muted-foreground text-sm">
        Select an element on the canvas to edit its properties.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          className={`flex-1 py-2 text-xs font-medium ${activeTab === 'props' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('props')}
        >
          Properties
        </button>
        <button
          className={`flex-1 py-2 text-xs font-medium ${activeTab === 'styles' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('styles')}
        >
          Styles
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'props' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tag Name</label>
              <div className="text-sm font-mono p-1 bg-secondary rounded">{element.tagName}</div>
            </div>

            {element.content !== undefined && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Content</label>
                <textarea
                  className="w-full p-2 text-xs bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring"
                  rows={3}
                  value={element.content}
                  onChange={(e) => updateElement({ content: e.target.value })}
                />
              </div>
            )}

            {element.tagName === 'img' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Source URL</label>
                  <input
                    type="text"
                    className="w-full p-2 text-xs bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring"
                    value={element.attributes.src || ''}
                    onChange={(e) => updateAttr('src', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Alt Text</label>
                  <input
                    type="text"
                    className="w-full p-2 text-xs bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring"
                    value={element.attributes.alt || ''}
                    onChange={(e) => updateAttr('alt', e.target.value)}
                  />
                </div>
              </>
            )}

            {element.tagName === 'a' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Href</label>
                <input
                  type="text"
                  className="w-full p-2 text-xs bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring"
                  value={element.attributes.href || ''}
                  onChange={(e) => updateAttr('href', e.target.value)}
                />
              </div>
            )}
            
            {/* Generic Attributes */}
            <div className="pt-2 border-t border-border">
               <h4 className="text-xs font-bold mb-2">Attributes</h4>
               {Object.entries(element.attributes).map(([key, val]) => (
                 <div key={key} className="grid grid-cols-3 gap-2 mb-2 items-center">
                   <span className="text-xs text-muted-foreground truncate" title={key}>{key}</span>
                   <input 
                      className="col-span-2 p-1 text-xs bg-background border border-input rounded"
                      value={val}
                      onChange={(e) => updateAttr(key, e.target.value)}
                   />
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeTab === 'styles' && (
          <div className="space-y-6">
            {/* Spacing Visualization */}
            <div>
              <h4 className="text-xs font-bold mb-2">Spacing</h4>
              <SpaceSVG styles={element.styles} onEdit={(p, v) => updateStyle(p, v)} />
              <div className="grid grid-cols-2 gap-2">
                 {['marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map(prop => (
                   <div key={prop} className="flex flex-col">
                     <label className="text-[10px] text-muted-foreground">{prop}</label>
                     <input 
                        className="p-1 text-xs bg-background border border-input rounded"
                        value={element.styles[prop] || ''}
                        placeholder="0px"
                        onChange={(e) => updateStyle(prop, e.target.value)}
                     />
                   </div>
                 ))}
              </div>
            </div>

            {/* Layout */}
            <div>
              <h4 className="text-xs font-bold mb-2">Layout</h4>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Display</label>
                <select
                  className="w-full p-1 text-xs bg-background border border-input rounded"
                  value={element.styles.display || ''}
                  onChange={(e) => updateStyle('display', e.target.value)}
                >
                  <option value="">Default</option>
                  <option value="block">Block</option>
                  <option value="inline">Inline</option>
                  <option value="flex">Flex</option>
                  <option value="inline-flex">Inline Flex</option>
                  <option value="grid">Grid</option>
                </select>
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
                    value={element.styles.width || ''}
                    onChange={(e) => updateStyle('width', e.target.value)}
                    placeholder="auto"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Height</label>
                  <input
                    type="text"
                    className="w-full p-1 text-xs bg-background border border-input rounded"
                    value={element.styles.height || ''}
                    onChange={(e) => updateStyle('height', e.target.value)}
                    placeholder="auto"
                  />
                </div>
              </div>
            </div>

            {/* Typography */}
            <div>
              <h4 className="text-xs font-bold mb-2">Typography</h4>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Font Size</label>
                    <input
                        type="text"
                        className="w-full p-1 text-xs bg-background border border-input rounded"
                        value={element.styles.fontSize || ''}
                        onChange={(e) => updateStyle('fontSize', e.target.value)}
                    />
                    </div>
                    <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Color</label>
                    <div className="flex gap-1">
                        <input
                        type="color"
                        className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                        value={element.styles.color || '#000000'}
                        onChange={(e) => updateStyle('color', e.target.value)}
                        />
                        <input
                        type="text"
                        className="flex-1 p-1 text-xs bg-background border border-input rounded"
                        value={element.styles.color || ''}
                        onChange={(e) => updateStyle('color', e.target.value)}
                        />
                    </div>
                    </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Text Align</label>
                  <select 
                    className="w-full p-1 text-xs bg-background border border-input rounded"
                    value={element.styles.textAlign || 'left'}
                    onChange={(e) => updateStyle('textAlign', e.target.value)}
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
                    value={element.styles.backgroundColor || '#ffffff'}
                    onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                    />
                    <input
                    type="text"
                    className="flex-1 p-1 text-xs bg-background border border-input rounded"
                    value={element.styles.backgroundColor || ''}
                    onChange={(e) => updateStyle('backgroundColor', e.target.value)}
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
                        value={element.styles.borderWidth || ''}
                        onChange={(e) => updateStyle('borderWidth', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Radius</label>
                    <input
                        type="text"
                        className="w-full p-1 text-xs bg-background border border-input rounded"
                        value={element.styles.borderRadius || ''}
                        onChange={(e) => updateStyle('borderRadius', e.target.value)}
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
