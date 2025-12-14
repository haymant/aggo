import * as React from 'react';
import type { AggoStore } from './types';

export function createAggoStore(initialState: any = {}): AggoStore {
  let state = initialState;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const l of Array.from(listeners)) l();
  };

  return {
    getState: () => state,
    setState: (next: any) => {
      state = next;
      notify();
    },
    updateState: (patch: any) => {
      if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
        state = { ...(state ?? {}), ...patch };
      } else {
        state = patch;
      }
      notify();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

const StoreContext = React.createContext<AggoStore | null>(null);

export function AggoStoreProvider(props: { store: AggoStore; children?: React.ReactNode }): React.ReactElement {
  return React.createElement(StoreContext.Provider, { value: props.store }, props.children) as any;
}

export function useAggoStore(): AggoStore {
  const store = React.useContext(StoreContext);
  if (!store) throw new Error('useAggoStore must be used within AggoStoreProvider');
  return store;
}

export function useAggoState<T>(selector: (s: any) => T): T {
  const store = useAggoStore();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return React.useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  );
}
