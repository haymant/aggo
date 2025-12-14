import React, { useRef } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import { vscode } from '../utils/vscode';

export interface PageElement {
  id: string;
  tagName: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
  content?: string;
  children?: PageElement[];
}

export interface ElementRendererProps {
  element: PageElement;
  selectedId: string | null;
  editMode: boolean;
  draggingId: string | null;
  onSelect: (el: PageElement) => void;
  onDragStart: (el: PageElement, e: React.DragEvent) => void;
  onDragOverElem: (el: PageElement, e: React.DragEvent) => void;
  onDropElem: (el: PageElement, e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onTabNext: () => void;
  parentTag?: string;
}

export const ElementRenderer: React.FC<ElementRendererProps> = ({
  element,
  selectedId,
  editMode,
  draggingId,
  onSelect,
  onDragStart,
  onDragOverElem,
  onDropElem,
  onDragEnd,
  onTabNext,
  parentTag
}) => {
  const isSelected = element.id === selectedId;
  const ref = useRef<HTMLElement | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (editMode) {
      e.stopPropagation();
      e.preventDefault();
      onSelect(element);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!editMode) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      onTabNext();
    }
  };

  const style: React.CSSProperties = {
    ...(element.styles as any),
    outline: isSelected ? '2px solid #3b82f6' : undefined,
    cursor: editMode ? 'grab' : 'default'
  };

  // Plugin rendering path: if element declares a data-component attribute and the plugin is loaded, use it
  const componentId = (element.attributes && (element.attributes as any)['data-component']) as string | undefined;
  if (componentId && (window as any).__aggo_plugins__ && (window as any).__aggo_plugins__[componentId]) {
    const plugin = (window as any).__aggo_plugins__[componentId];
    if (plugin && plugin.Component) {
      const pluginProps: any = {
        id: element.id,
        attributes: element.attributes || {},
        content: element.content,
        styles: element.styles || {},
        editMode,
        onSelect: () => onSelect(element),
        onChange: (delta: any) => {
          // map plugin-driven changes back to host via postMessage
          const updated = { id: element.id, ...delta } as any;
          // send update request to host
          try {
            vscode.postMessage({ type: 'updateElement', element: updated });
          } catch (err) {
            /* noop */
          }
        }
      };

      // Important: keep the element selectable/draggable even if the plugin component
      // doesn't wire click handlers. In edit mode we wrap it with the standard handlers.
      if (editMode) {
        const wrapperStyle = { ...(style || {}), position: (style as any)?.position || 'relative' } as any;
        const wrapperProps: any = {
          style: wrapperStyle,
          ...element.attributes,
          id: element.id,
          draggable: editMode,
          onDragStart: (e: React.DragEvent) => onDragStart(element, e),
          onDragEnd: (e: React.DragEvent) => onDragEnd?.(e),
          onDragOver: (e: React.DragEvent) => onDragOverElem(element, e),
          onDrop: (e: React.DragEvent) => onDropElem(element, e),
          // Use capture so selection works even if plugin stops propagation.
          onPointerDownCapture: (e: React.PointerEvent) => {
            try {
              e.stopPropagation();
            } catch (_) {
              /* ignore */
            }
            onSelect(element);
          },
          // Also stop click at capture to avoid the canvas background click handler
          // immediately clearing selection when plugin content doesn't forward clicks.
          onClickCapture: (e: React.MouseEvent) => {
            if (!editMode) return;
            try {
              e.stopPropagation();
            } catch (_) {
              /* ignore */
            }
            try {
              e.preventDefault();
            } catch (_) {
              /* ignore */
            }
            onSelect(element);
          },
          onClick: handleClick,
          onKeyDown: handleKeyDown,
          tabIndex: editMode ? 0 : -1,
          ref: (el: HTMLElement | null) => {
            ref.current = el;
          }
        };
        const overlay = isSelected
          ? React.createElement('div', {
              style: {
                position: 'absolute',
                inset: 0,
                border: '2px solid #3b82f6',
                pointerEvents: 'none',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }
            })
          : null;
        return React.createElement(
          element.tagName,
          wrapperProps,
          React.createElement(
            ErrorBoundary,
            { onError: (err) => console.warn('[aggo] plugin render failed', componentId, err) },
            React.createElement(plugin.Component, pluginProps)
          ),
          overlay
        );
      }

      // In preview mode, render the plugin directly to avoid introducing extra DOM wrappers.
      return React.createElement(
        ErrorBoundary,
        { onError: (err) => console.warn('[aggo] plugin render failed', componentId, err) },
        React.createElement(plugin.Component, pluginProps)
      );
    }
  }

  // Handle void elements (no children/content) with exceptions for checkbox/radio inputs
  const voidElements = ['img', 'input', 'hr', 'br'];
  if (voidElements.includes(element.tagName)) {
    const props: any = {
      style,
      ...element.attributes,
      id: element.id,
      // ensure input-like elements have id/name set for uniqueness
      ...(element.tagName === 'input' ? { id: element.id, name: element.attributes?.name || element.id } : {}),
      draggable: editMode,
      onDragStart: (e: React.DragEvent) => onDragStart(element, e),
      onDragEnd: (e: React.DragEvent) => onDragEnd?.(e),
      onDragOver: (e: React.DragEvent) => onDragOverElem(element, e),
      onDrop: (e: React.DragEvent) => onDropElem(element, e),
      onClick: handleClick,
      onKeyDown: handleKeyDown,
      tabIndex: editMode ? 0 : -1,
      ref: (el: HTMLElement | null) => {
        ref.current = el;
      }
    };

    // Special-case: input elements (checkbox/radio)
    if (element.tagName === 'input' && (element.attributes?.type === 'checkbox' || element.attributes?.type === 'radio')) {
      // If input is already within a label (parentTag), just render the input itself to avoid nested labels
      if (parentTag === 'label') {
        const simpleInputProps: any = {
          id: element.id,
          ...element.attributes,
          type: element.attributes?.type,
          style: { display: 'inline-block', cursor: 'pointer' },
          draggable: editMode,
          onDragStart: (e: React.DragEvent) => onDragStart(element, e),
          onDragEnd: (e: React.DragEvent) => onDragEnd?.(e),
          onDragOver: (e: React.DragEvent) => onDragOverElem(element, e),
          onDrop: (e: React.DragEvent) => onDropElem(element, e),
          tabIndex: editMode ? 0 : -1
        };
        if (element.attributes?.type === 'radio') simpleInputProps.name = element.attributes?.name || element.attributes?.group || element.id;
        simpleInputProps.onClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (editMode) {
            e.preventDefault();
          }
        };
        simpleInputProps.onPointerDown = (e: React.PointerEvent) => {
          if (editMode) {
            e.preventDefault();
            e.stopPropagation();
          }
        };
        simpleInputProps.onChange = (e: React.ChangeEvent) => {
          if (editMode) {
            (e as any).preventDefault && (e as any).preventDefault();
            (e as any).stopPropagation && (e as any).stopPropagation();
          }
        };
        return React.createElement('input', simpleInputProps);
      }

      // Build a minimal set of props to pass to the input itself; avoid copying all element styles that belong to the wrapper
      const inputProps: any = {
        id: element.id,
        ...element.attributes,
        type: element.attributes?.type,
        style: { display: 'inline-block', cursor: 'pointer', ...(element.attributes?.style ? (element.attributes as any).style : {}) },
        draggable: editMode,
        onDragStart: (e: React.DragEvent) => onDragStart(element, e),
        onDragEnd: (e: React.DragEvent) => onDragEnd?.(e),
        onDragOver: (e: React.DragEvent) => onDragOverElem(element, e),
        onDrop: (e: React.DragEvent) => onDropElem(element, e),
        tabIndex: editMode ? 0 : -1
      };
      if (element.attributes?.type === 'radio') {
        // preserve explicit group name when set; otherwise generate per-element name to avoid cross-instance grouping
        inputProps.name = element.attributes?.name || element.attributes?.group || element.id;
      }
      // Stop propagation on the input; let the label handle selection; prevent toggling in editMode
      inputProps.onClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (editMode) {
          e.preventDefault();
        }
      };
      inputProps.onPointerDown = (e: React.PointerEvent) => {
        if (editMode) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      inputProps.onChange = (e: React.ChangeEvent) => {
        if (editMode) {
          (e as any).preventDefault && (e as any).preventDefault();
          (e as any).stopPropagation && (e as any).stopPropagation();
        }
      };

      // Wrapper representing the label; apply element styles here but ensure a flex layout for proper alignment
      const displayVal = element.styles && String((element.styles as any).display) === 'inline' ? 'inline-flex' : 'flex';
      const wrapperProps: any = {
        style: { ...(element.styles || {}), display: displayVal, alignItems: 'center' },
        onClick: handleClick,
        onDragStart: (e: React.DragEvent) => onDragStart(element, e),
        onDragEnd: (e: React.DragEvent) => onDragEnd?.(e),
        onDragOver: (e: React.DragEvent) => onDragOverElem(element, e),
        onDrop: (e: React.DragEvent) => onDropElem(element, e),
        draggable: editMode,
        tabIndex: editMode ? 0 : -1
      };
      const labelContent = element.content ? React.createElement('span', { style: { marginLeft: '8px' } }, element.content) : null;
      // Use a label wrapper to present the input + label text inline and make drag/select comfortable
      return React.createElement('label', wrapperProps, React.createElement('input', inputProps), labelContent);
    }

    return React.createElement(element.tagName, props);
  }

  const props: any = {
    style,
    ...element.attributes,
    id: element.id,
    draggable: editMode,
    onDragStart: (e: React.DragEvent) => onDragStart(element, e),
    onDragEnd: (e: React.DragEvent) => onDragEnd?.(e),
    onDragOver: (e: React.DragEvent) => onDragOverElem(element, e),
    onDrop: (e: React.DragEvent) => onDropElem(element, e),
    onClick: handleClick,
    onKeyDown: handleKeyDown,
    tabIndex: editMode ? 0 : -1,
    ref: (el: HTMLElement | null) => {
      ref.current = el;
    }
  };

  // Prioritize children over content when children array has elements
  const hasChildren = element.children && element.children.length > 0;
  const childContent = hasChildren
    ? element.children!.map((child) => (
        <ElementRenderer
          key={child.id}
          element={child}
          selectedId={selectedId}
          editMode={editMode}
          draggingId={draggingId}
          onSelect={onSelect}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOverElem={onDragOverElem}
          onDropElem={onDropElem}
          onTabNext={onTabNext}
          parentTag={element.tagName}
        />
      ))
    : element.content;

  return React.createElement(element.tagName, props, childContent as any);
};

export default ElementRenderer;
