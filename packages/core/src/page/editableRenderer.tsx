'use client';

import * as React from 'react';
import ErrorBoundary from './ErrorBoundary';
import type { AggoPageElement } from './types';
import type { AggoComponentRegistry, AggoRendererHost } from './renderer';

export type AggoEditableElementRendererProps = {
  element: AggoPageElement;
  selectedId: string | null;
  editMode: boolean;
  draggingId: string | null;
  onSelect: (el: AggoPageElement) => void;
  onDragStart: (el: AggoPageElement, e: React.DragEvent) => void;
  onDragOverElem: (el: AggoPageElement, e: React.DragEvent) => void;
  onDropElem: (el: AggoPageElement, e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onTabNext: () => void;
  parentTag?: string;
  host?: AggoRendererHost;
};

function getComponentFromRegistry(registry: AggoComponentRegistry | undefined, componentId: string | undefined): React.ComponentType<any> | undefined {
  if (!registry || !componentId) return undefined;
  const entry = (registry as any)[componentId];
  if (!entry) return undefined;
  return (entry as any).Component ? (entry as any).Component : entry;
}

export function AggoEditableElementRenderer(props: AggoEditableElementRendererProps): React.ReactElement {
  const { element, selectedId, editMode, draggingId, onSelect, onDragStart, onDragOverElem, onDropElem, onDragEnd, onTabNext, parentTag } = props;
  const host = props.host ?? {};

  const isSelected = element.id === selectedId;
  const ref = React.useRef<HTMLElement | null>(null);

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
  const PluginComponent = getComponentFromRegistry(host.components as any, componentId);

  if (componentId && PluginComponent) {
    const pluginProps: any = {
      id: element.id,
      attributes: element.attributes || {},
      content: element.content,
      styles: element.styles || {},
      editMode,
      onSelect: () => onSelect(element),
      onChange: (delta: any) => {
        const updated = { id: element.id, ...delta } as any;
        try {
          host.emit?.('updateElement', updated);
        } catch {
          // ignore
        }
      }
    };

    if (editMode) {
      const wrapperStyle = { ...(style || {}), position: (style as any)?.position || 'relative' } as any;
      const wrapperTag: any = String(element.tagName).toLowerCase() === 'plugin' ? 'div' : element.tagName;
      const wrapperProps: any = {
        style: wrapperStyle,
        ...(element.attributes as any),
        id: element.id,
        draggable: editMode,
        onDragStart: (e: React.DragEvent) => onDragStart(element, e),
        onDragEnd: (e: React.DragEvent) => onDragEnd?.(e),
        onDragOver: (e: React.DragEvent) => onDragOverElem(element, e),
        onDrop: (e: React.DragEvent) => onDropElem(element, e),
        onPointerDownCapture: (e: React.PointerEvent) => {
          try {
            e.stopPropagation();
          } catch {
            // ignore
          }
          onSelect(element);
        },
        onClickCapture: (e: React.MouseEvent) => {
          if (!editMode) return;
          try {
            e.stopPropagation();
          } catch {
            // ignore
          }
          try {
            e.preventDefault();
          } catch {
            // ignore
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
        wrapperTag,
        wrapperProps,
        React.createElement(
          ErrorBoundary,
          { onError: (err) => host.onError?.(err) },
          React.createElement(PluginComponent, pluginProps)
        ),
        overlay
      );
    }

    return React.createElement(
      ErrorBoundary,
      { onError: (err) => host.onError?.(err) },
      React.createElement(PluginComponent, pluginProps)
    );
  }

  const voidElements = ['img', 'input', 'hr', 'br'];
  if (voidElements.includes(String(element.tagName).toLowerCase())) {
    const baseProps: any = {
      style,
      ...(element.attributes as any),
      id: element.id,
      ...(element.tagName === 'input' ? { id: element.id, name: (element.attributes as any)?.name || element.id } : {}),
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
    if (
      element.tagName === 'input' &&
      (((element.attributes as any)?.type === 'checkbox') || ((element.attributes as any)?.type === 'radio'))
    ) {
      const type = (element.attributes as any)?.type;

      if (parentTag === 'label') {
        const simpleInputProps: any = {
          id: element.id,
          ...(element.attributes as any),
          type,
          style: { display: 'inline-block', cursor: 'pointer' },
          draggable: editMode,
          onDragStart: (e: React.DragEvent) => onDragStart(element, e),
          onDragEnd: (e: React.DragEvent) => onDragEnd?.(e),
          onDragOver: (e: React.DragEvent) => onDragOverElem(element, e),
          onDrop: (e: React.DragEvent) => onDropElem(element, e),
          tabIndex: editMode ? 0 : -1
        };
        if (type === 'radio') simpleInputProps.name = (element.attributes as any)?.name || (element.attributes as any)?.group || element.id;
        simpleInputProps.onClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (editMode) e.preventDefault();
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

      const inputProps: any = {
        id: element.id,
        ...(element.attributes as any),
        type,
        style: { display: 'inline-block', cursor: 'pointer', ...(((element.attributes as any)?.style) ? (element.attributes as any).style : {}) },
        draggable: editMode,
        onDragStart: (e: React.DragEvent) => onDragStart(element, e),
        onDragEnd: (e: React.DragEvent) => onDragEnd?.(e),
        onDragOver: (e: React.DragEvent) => onDragOverElem(element, e),
        onDrop: (e: React.DragEvent) => onDropElem(element, e),
        tabIndex: editMode ? 0 : -1
      };

      if (type === 'radio') {
        inputProps.name = (element.attributes as any)?.name || (element.attributes as any)?.group || element.id;
      }

      inputProps.onClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (editMode) e.preventDefault();
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
      return React.createElement('label', wrapperProps, React.createElement('input', inputProps), labelContent);
    }

    return React.createElement(element.tagName, baseProps);
  }

  const domProps: any = {
    style,
    ...(element.attributes as any),
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

  const hasChildren = element.children && element.children.length > 0;
  const childContent = hasChildren
    ? element.children!.map((child) => (
        <AggoEditableElementRenderer
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
          host={host}
        />
      ))
    : element.content;

  return React.createElement(element.tagName, domProps, childContent as any);
}
