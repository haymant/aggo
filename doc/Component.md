## Component and Plugin Architecture for Aggo (monorepo)

This document describes the component model used by Aggo pages, including:

1. Built-in components (bundled in the webview).
2. Plugin components (loaded dynamically into the webview sandbox).
3. The missing contracts needed for **events**, **handler wiring**, **page lifecycle**, and **state store** so that user TypeScript is runnable/debuggable in a real runtime.

The guiding principle is:

- The webview is for editing.
- The user runtime is for executing/debugging.

---

## 1. Terminology

- Component: a React component implementation used by the renderer.
- Element: a JSON node in a `*.page` document.
- Plugin: a third-party component bundle loaded at runtime in the webview.
- Handler: user-authored TypeScript function referenced by name from JSON.

---

## 2. Existing Plugin Loading (Current)

What exists today:

1. The extension maintains `./.aggo/components/component_registry.json`.
2. The page editor webview receives `componentCatalogUpdated`.
3. The webview injects `<script src="...">` and the bundle registers itself into `window.__aggo_plugins__`.
4. `ElementRenderer` renders plugin components when `element.attributes['data-component']` is present.

This is a solid editing-time plugin model.

What it does not yet define:

- How components describe their supported events (so the property panel can offer event wiring).
- How event handler names become debuggable functions in a real runtime.

---

## 3. Unified Component Contract

Both built-ins and plugins should conform to the same public contract so the renderer and property panel can treat them identically.

### 3.1 Component Manifest Shape

```ts
export type AggoComponentMeta = {
  id: string;
  name: string;
  category?: string;
  icon?: string;
};

export type AggoComponentEventSpec = {
  name: string;
  title?: string;
  description?: string;
  // Optional: a string type description for UI and docs.
  payloadType?: string;
};

export type AggoComponentSchema = {
  title: string;
  properties: Record<string, unknown>;
  // New: events supported by the component.
  events?: AggoComponentEventSpec[];
};

export type AggoComponentModule = {
  meta: AggoComponentMeta;
  schema: AggoComponentSchema;
  Component: React.ComponentType<AggoComponentProps>;
};
```

### 3.2 Component Props

```ts
export type AggoComponentProps = {
  id: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
  content?: string;
  editMode: boolean;

  // Editing-only:
  onSelect?: () => void;
  onChange?: (delta: unknown) => void;

  // Runtime-only (Run/Debug):
  events?: Record<string, (...args: any[]) => void>;
  emit?: (eventName: string, payload?: unknown) => void;
  ctx?: unknown; // page context (store, route params, etc.)
};
```

Notes:

- In the webview canvas (Edit Mode), `events/emit/ctx` may be omitted.
- In runtime (Run/Debug), `events/emit/ctx` are present and should be used.

---

## 4. Event Model (Missing Today)

Aggo needs two related concepts:

1. Event surface: what events a component can fire.
2. Event wiring: how an element maps events to handler references.

### 4.1 Declaring Events (Component Schema)

Components declare supported events in `schema.events`.

Example (Button):

```ts
export const schema = {
  title: 'Button',
  properties: {
    text: { type: 'string', default: 'Submit' }
  },
  events: [
    { name: 'onClick', title: 'Click', payloadType: 'React.MouseEvent' }
  ]
};
```

This enables the property panel to show an “Events” section with dropdowns.

### 4.2 Wiring Events (Page JSON)

Each element may contain an `events` object:

```json
{
  "id": "btn-1",
  "tagName": "button",
  "attributes": { "type": "button" },
  "events": {
    "onClick": { "handler": "rfq.view.onSubmit" }
  }
}
```

Handler references are strings so they can be statically analyzed and stored safely.

Optional future extension (not required for MVP): allow arguments mapping:

```json
"onClick": {
  "handler": "rfq.view.onSubmit",
  "args": [{"$event": true}]
}
```

---

## 5. Handler Discovery (Extension Host)

The extension host should discover user handlers via static analysis (e.g. `ts-morph`).

Suggested discovery rules:

- User code lives in a predictable folder (configurable): `src/aggo/handlers/**` or `resources/handlers/**`.
- Only exported functions are selectable.
- Optional naming convention: `on*` for event handlers, `createStore` for store factories, `onMount/onUnmount` for lifecycle.

The extension posts the discovered symbols to the webview so the property panel can populate dropdowns.

---

## 6. Handler Resolution (Runtime)

To debug user code, the runtime must call the real user functions from real source files.

### 6.1 Registry Pattern

The runtime should import handlers via a registry module that maps string IDs to functions.

Two viable options:

1. User-maintained registry (simplest): user exports a map.
2. Extension-generated registry (best UX): extension writes a generated file that imports exports and builds the map.

Example runtime registry shape:

```ts
export const AggoHandlerRegistry: Record<string, Function> = {
  'rfq.view.onSubmit': onSubmit,
  'rfq.view.onMount': onMount
};
```

Runtime wiring example:

```ts
function resolveHandler(name?: string) {
  if (!name) return undefined;
  return AggoHandlerRegistry[name];
}

const onClick = resolveHandler(element.events?.onClick?.handler);
```

Debugging outcome:

- Breakpoints hit because the handler is real TS/TSX compiled by the user's build.

---

## 7. Lifecycle and Store Touchpoints

Components must remain agnostic to page lifecycle and store decisions, but they should be able to:

- Access context (`props.ctx`) to read store/router info.
- Emit events (`props.emit`) and/or receive pre-wired callbacks (`props.events`).

Page-level lifecycle (`onInit/onMount/onUnmount`) is resolved and invoked by the runtime (see doc/PageEditor.md).

---

## 8. Security and Trust Boundaries

- Never execute plugin JS in the extension host.
- Never execute user handler code in the extension host or the editing webview.
- Plugin bundles run only in the webview sandbox.
- User handler code runs only in the user's runtime server (dev/preview) where the debugger attaches.

---

## 9. Notes on Current Implementation

The current `ElementRenderer` already provides:

- A plugin rendering path for `data-component`.
- An edit-mode wrapper that keeps plugin components selectable/draggable.

To support events end-to-end, the missing piece is adding:

- `schema.events` so the property panel knows what to wire.
- `element.events` in the `*.page` model.
- A runtime registry so event strings become real functions.
