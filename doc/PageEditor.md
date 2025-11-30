# Aggo Page Editor Design

This document outlines the design for the visual page editor (Custom Editor) for `*.page` files.

## 1. Overview
**Goal**: Replicate the "Main Panel" (Canvas) of the reference builder.
**File Type**: `*.page` (JSON format).
**Provider**: `AggoPageEditorProvider`.

## 2. UI Layout
- **Canvas Area**: The central area rendering the page components.
- **Toolbar**: Zoom controls, Preview mode toggle, Device size toggle.
- **Breadcrumbs**: Show hierarchy of selected element (e.g., Page > Container > Form > Button).

## 3. Rendering Engine
- **Renderer**: React components mapping JSON schema to UI.
- **Edit Mode**:
  - Components are wrapped in a `Selectable` wrapper that handles click-to-select.
  - Hover effects to show component boundaries.
  - "Drop Zones" or "Placement Indicators" when in "Insert Mode" (triggered by Library click).

## 4. Data Model (`*.page`)
The file is a JSON object representing the component tree.
```json
{
  "id": "root",
  "type": "Page",
  "children": [
    {
      "id": "btn-1",
      "type": "Button",
      "props": { "label": "Submit" },
      "style": { "marginTop": "10px" }
    }
  ]
}
```

## 5. Interaction Model

### Selection
- User clicks a component on Canvas.
- Editor highlights the component.
- Editor posts `selectionChanged` message to Extension Host (to update Property View).

### Insertion
- Editor receives `insertComponent` message from Extension Host.
- Editor enters "Placement Mode" (cursor changes).
- User clicks a container on Canvas -> Component added as child.
- Editor updates internal state and posts `updateDocument` to save file.

### Property Updates
- Editor receives `updateProperty` message from Extension Host.
- Editor updates the specific component in the tree.
- Editor re-renders and saves file.

## 6. State Management
- **Local State**: The Webview maintains the "live" state of the page (React State / Zustand).
- **Sync**: On every change, the Webview sends the full JSON (or patch) to the Extension Host to write to disk (`vscode.workspace.fs.writeFile` or `edit.replace`).
- **Undo/Redo**: Handled by VS Code's Custom Editor API (if using `CustomTextEditorProvider`, we sync text; if `CustomEditorProvider`, we manage edits). *Decision*: Use `CustomTextEditorProvider` for simpler text-based sync and native Undo/Redo support.

## 7. Implementation Strategy
- Reuse the `MainPanel` logic from the reference app but strip out the "Split Panel" layout logic since VS Code handles window management.
- Focus on the `Canvas` and `ComponentRenderer`.
