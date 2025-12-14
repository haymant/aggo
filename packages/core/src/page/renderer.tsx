'use client';

import * as React from 'react';
import ErrorBoundary from './ErrorBoundary';
import type { AggoEventName, AggoHandlers, AggoHandlerContext, AggoPageElement, AggoStore } from './types';
import { AggoStoreProvider, createAggoStore } from './store';

export type AggoComponentRegistryEntry = { Component: React.ComponentType<any> } | React.ComponentType<any>;
export type AggoComponentRegistry = Record<string, AggoComponentRegistryEntry>;

export type AggoRendererHost = {
  pageId?: string;
  handlers?: AggoHandlers;
  store?: AggoStore;
  emit?: (eventName: string, payload: unknown) => void;
  components?: AggoComponentRegistry;
  onError?: (err: unknown) => void;
};

function normalizeDomAttributes(attrs: Record<string, any> | undefined): Record<string, any> {
  const src = attrs ?? {};
  const out: Record<string, any> = {};

  for (const [k, v] of Object.entries(src)) {
    if (k === 'class' && !('className' in src)) {
      out.className = v;
      continue;
    }
    if (k === 'for' && !('htmlFor' in src)) {
      out.htmlFor = v;
      continue;
    }
    out[k] = v;
  }

  return out;
}

function getHandlerIdForEvent(el: AggoPageElement, eventName: AggoEventName): string | undefined {
  const extract = (v: unknown): string | undefined => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      const anyV = v as any;
      if (typeof anyV.handler === 'string') return anyV.handler;
      if (typeof anyV.id === 'string') return anyV.id;
    }
    return undefined;
  };

  const events: any = el.events as any;
  if (events) {
    const direct = extract(events[eventName]);
    if (direct) return direct;
    const onKey = `on${eventName[0].toUpperCase()}${eventName.slice(1)}`;
    const onVal = extract(events[onKey]);
    if (onVal) return onVal;
  }
  const attrs = el.attributes ?? {};
  // Supported attribute conventions:
  // - data-on-click="handlerId"
  // - data-onclick="handlerId"
  // - data-onChange="handlerId" (less preferred)
  const kebab = `data-on-${eventName}`;
  if (typeof attrs[kebab] === 'string') return attrs[kebab];
  const compact = `data-on${eventName}`;
  if (typeof attrs[compact] === 'string') return attrs[compact];
  const camel = `data-on${eventName[0].toUpperCase()}${eventName.slice(1)}`;
  if (typeof attrs[camel] === 'string') return attrs[camel];
  return undefined;
}

function reactPropForEvent(eventName: AggoEventName): string {
  switch (eventName) {
    case 'click':
      return 'onClick';
    case 'change':
      return 'onChange';
    case 'input':
      return 'onInput';
    case 'submit':
      return 'onSubmit';
    case 'keydown':
      return 'onKeyDown';
    case 'keyup':
      return 'onKeyUp';
    case 'focus':
      return 'onFocus';
    case 'blur':
      return 'onBlur';
    default:
      return 'onClick';
  }
}

function attachEventHandlers(el: AggoPageElement, host: Required<Pick<AggoRendererHost, 'handlers' | 'emit' | 'store'>> & { pageId?: string }): Record<string, any> {
  const props: Record<string, any> = {};
  const supported: AggoEventName[] = ['click', 'change', 'input', 'submit', 'keydown', 'keyup', 'focus', 'blur'];

  for (const eventName of supported) {
    const handlerId = getHandlerIdForEvent(el, eventName);
    if (!handlerId) continue;

    const reactProp = reactPropForEvent(eventName);
    props[reactProp] = async (event: unknown) => {
      const handler = host.handlers?.[handlerId];
      const ctx: AggoHandlerContext = {
        pageId: host.pageId,
        elementId: el.id,
        element: el,
        eventName,
        event,
        store: host.store,
        emit: host.emit
      };

      if (!handler) return;
      await handler(ctx);
    };
  }

  return props;
}

function buildPluginEventCallbacks(el: AggoPageElement, host: Required<Pick<AggoRendererHost, 'handlers' | 'emit' | 'store'>> & { pageId?: string }): Record<string, (...args: any[]) => void> {
  const callbacks: Record<string, (...args: any[]) => void> = {};
  const supported: AggoEventName[] = ['click', 'change', 'input', 'submit', 'keydown', 'keyup', 'focus', 'blur'];

  for (const eventName of supported) {
    const handlerId = getHandlerIdForEvent(el, eventName);
    if (!handlerId) continue;

    const handler = host.handlers?.[handlerId];
    if (!handler) continue;

    const invoke = async (event: unknown) => {
      const ctx: AggoHandlerContext = {
        pageId: host.pageId,
        elementId: el.id,
        element: el,
        eventName,
        event,
        store: host.store,
        emit: host.emit
      };
      await handler(ctx);
    };

    // Provide both canonical and React-style names.
    callbacks[eventName] = (event?: any) => {
      void invoke(event);
    };
    callbacks[reactPropForEvent(eventName)] = (event?: any) => {
      void invoke(event);
    };
  }

  return callbacks;
}

export function AggoElementRenderer(props: { element: AggoPageElement; host?: AggoRendererHost }): React.ReactElement {
  const host: AggoRendererHost = props.host ?? {};
  const store = host.store ?? createAggoStore({});
  const emit = host.emit ?? (() => undefined);
  const handlers = host.handlers ?? {};

  const el = props.element;
  const tag: any = el.tagName || 'div';
  const attrs = normalizeDomAttributes(el.attributes);
  const style = (el.styles ?? {}) as any;

  const componentId = (attrs && (attrs as any)['data-component']) as string | undefined;
  const registry = host.components ?? {};
  const entry = componentId ? registry[componentId] : undefined;
  const Component = entry ? ((entry as any).Component ? (entry as any).Component : entry) : undefined;

  const voidElements = new Set(['img', 'input', 'hr', 'br']);
  const eventProps = attachEventHandlers(el, { handlers, emit, store, pageId: host.pageId });

  if (Component) {
    const pluginEvents = buildPluginEventCallbacks(el, { handlers, emit, store, pageId: host.pageId });
    const pluginProps: any = {
      id: el.id,
      attributes: el.attributes ?? {},
      content: el.content,
      styles: el.styles ?? {},
      editMode: false,
      events: pluginEvents,
      emit,
      ctx: { pageId: host.pageId, store },
      // webview editing support: plugin may call this; hosts can listen via "emit".
      onChange: (delta: any) => emit('element.change', { id: el.id, delta })
    };

    return React.createElement(
      ErrorBoundary,
      { onError: (err) => host.onError?.(err) },
      React.createElement(Component as any, pluginProps)
    );
  }

  if (voidElements.has(String(tag).toLowerCase())) {
    return React.createElement(tag, { ...attrs, style, ...eventProps });
  }

  const hasChildren = el.children && el.children.length > 0;
  const children = hasChildren
    ? el.children!.map((c) => React.createElement(AggoElementRenderer, { key: c.id, element: c, host }))
    : typeof el.content === 'string' || typeof el.content === 'number'
      ? el.content
      : el.content;

  return React.createElement(tag, { ...attrs, style, ...eventProps }, children as any);
}

export function AggoPage(props: { root: AggoPageElement; host?: AggoRendererHost; initialState?: any }): React.ReactElement {
  const store = React.useMemo(() => (props.host?.store ? props.host.store : createAggoStore(props.initialState ?? {})), []);
  const host: AggoRendererHost = { ...(props.host ?? {}), store };

  // Lifecycle handlers (page-level): onMount/onUnmount on root.lifecycle or root attributes.
  React.useEffect(() => {
    const handlers = host.handlers ?? {};
    const emit = host.emit ?? (() => undefined);

    const onMountId = props.root.lifecycle?.onMount ?? (props.root.attributes?.['data-on-mount'] as string | undefined);
    const onUnmountId = props.root.lifecycle?.onUnmount ?? (props.root.attributes?.['data-on-unmount'] as string | undefined);

    const run = async (id: string | undefined, eventName: AggoEventName, phase: 'mount' | 'unmount') => {
      if (!id) return;
      const handler = handlers[id];
      if (!handler) return;
      const ctx: AggoHandlerContext = {
        pageId: host.pageId,
        elementId: props.root.id,
        element: props.root,
        eventName,
        event: { phase },
        store,
        emit
      };
      await handler(ctx);
    };

    void run(onMountId, 'focus', 'mount');
    return () => {
      void run(onUnmountId, 'blur', 'unmount');
    };
  }, []);

  // Default wrapper to avoid blank/black pages when root has no explicit styling.
  const wrapperStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: (props.root.styles as any)?.backgroundColor ?? '#ffffff',
    color: (props.root.styles as any)?.color ?? '#000000'
  };

  // Avoid JSX here so downstream bundlers don't rely on injected jsx-runtime helpers.
  return React.createElement(
    AggoStoreProvider,
    { store },
    React.createElement(
      'div',
      { style: wrapperStyle },
      React.createElement(AggoElementRenderer, { element: props.root, host })
    )
  );
}
