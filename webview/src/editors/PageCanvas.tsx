import React, { useState, useEffect, useCallback } from 'react';
import { vscode } from '../utils/vscode';

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

const ElementRenderer: React.FC<{ 
  element: PageElement; 
  selectedId: string | null; 
  onSelect: (el: PageElement) => void; 
}> = ({ element, selectedId, onSelect }) => {
  const isSelected = element.id === selectedId;
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(element);
  };

  const style: React.CSSProperties = {
    ...element.styles as any,
    outline: isSelected ? '2px solid #3b82f6' : undefined,
    cursor: 'default'
  };

  // Handle void elements (no children/content)
  const voidElements = ['img', 'input', 'hr', 'br'];
  if (voidElements.includes(element.tagName)) {
    return React.createElement(element.tagName, {
      style,
      ...element.attributes,
      onClick: handleClick,
      key: element.id
    });
  }

  return React.createElement(
    element.tagName,
    {
      style,
      ...element.attributes,
      onClick: handleClick,
      key: element.id
    },
    element.content || (element.children?.map(child => (
      <ElementRenderer 
        key={child.id} 
        element={child} 
        selectedId={selectedId} 
        onSelect={onSelect} 
      />
    )))
  );
};

export const PageCanvas: React.FC<PageCanvasProps> = ({ data, onChange }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const handleSelect = (element: PageElement) => {
    setSelectedId(element.id);
    vscode.postMessage({ type: 'selectionChanged', element });
  };

  const addComponent = (template: any) => {
    const newElement = { ...template, id: Math.random().toString(36).substr(2, 9) };
    const newData = JSON.parse(JSON.stringify(data));
    
    // Simple insertion strategy: append to root children
    // In a real app, we would insert into the selected container
    if (newData.children) {
      newData.children.push(newElement);
    } else {
       if (!newData.children) newData.children = [];
       newData.children.push(newElement);
    }
    onChange(newData);
  };

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'insertComponent') {
        addComponent(msg.data);
      } else if (msg.type === 'updateElement' && msg.element) {
        if (!data) return;
        const { tree: updatedTree, match } = mergeElementTree(data, msg.element);
        // Only propagate if tree actually changed
        if (updatedTree !== data) {
          onChange(updatedTree);
          const selectedElement = match || msg.element;
          setSelectedId(selectedElement.id);
          vscode.postMessage({ type: 'selectionChanged', element: selectedElement });
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [data, onChange, mergeElementTree]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const json = e.dataTransfer.getData('application/json');
    if (json) {
      try {
        const template = JSON.parse(json);
        addComponent(template);
      } catch (err) {
        console.error('Failed to drop component', err);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (!data || !data.tagName) return <div>Initializing...</div>;

  return (
    <div 
      className="h-full w-full bg-gray-100 dark:bg-gray-900 overflow-auto"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => { setSelectedId(null); vscode.postMessage({ type: 'selectionChanged', element: null }); }}
    >
      <div className="min-h-full shadow-sm mx-auto bg-white" style={{ maxWidth: '100%' }}>
        <ElementRenderer element={data} selectedId={selectedId} onSelect={handleSelect} />
      </div>
    </div>
  );
};
