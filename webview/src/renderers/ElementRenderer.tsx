import * as React from 'react';
import { AggoEditableElementRenderer, type AggoEditableElementRendererProps } from '@aggo/core';
import { vscode } from '../utils/vscode';

export type PageElement = any;
export type ElementRendererProps = Omit<AggoEditableElementRendererProps, 'host'>;

export default function ElementRenderer(props: ElementRendererProps): React.ReactElement {
  // IMPORTANT: don't capture a brand-new {} when __aggo_plugins__ isn't ready yet.
  // Plugin scripts populate window.__aggo_plugins__ asynchronously; we want a stable object reference.
  const host = React.useMemo(() => {
    const globalAny = window as any;
    globalAny.__aggo_plugins__ = globalAny.__aggo_plugins__ || {};

    return {
      components: globalAny.__aggo_plugins__ as any,
      emit: (name: string, payload: unknown) => {
        if (name === 'updateElement') {
          try {
            vscode.postMessage({ type: 'updateElement', element: payload });
          } catch {
            // ignore
          }
        }
      },
      onError: (err: unknown) => console.warn('[aggo] renderer error', err)
    };
  }, []);

  return <AggoEditableElementRenderer {...(props as any)} host={host as any} />;
}
