# PNML Editor (Evolve PNML YAML) — Design + Implementation Plan

This document covers:

1. How `*.cpn` JSON files (example: `tmp/1.cpn`) are rendered when using **Open with Aggo CPN Editor**.
2. How we extend that approach to support a new PNML-derived Petri net YAML format (example: `tmp/evolve.evolve.yaml`, schema: `src/schema/pnml.schema`).
3. The design + implementation plan for **Open with Aggo PNML Editor** and an auto-layout toolbar button.

## 1) How `*.cpn` is rendered today

### 1.1 VS Code contributions (context menu + custom editor)

The CPN editor is registered in `package.json` under `contributes.customEditors` with:

- `viewType: aggo.cpnEditor`
- selector `*.cpn`

The Explorer context menu entry **Open with Aggo CPN Editor** is also contributed via `contributes.menus.explorer/context`.

When the command runs, the extension executes:

- `vscode.openWith(uri, 'aggo.cpnEditor')`

### 1.2 Extension-side provider wiring

At activation time, `src/extension.ts` registers a `CustomTextEditorProvider` for `aggo.cpnEditor`:

- Provider class: `src/editors/AggoCPNEditorProvider.ts`

When a `.cpn` file is opened with that viewType, VS Code calls:

- `AggoCPNEditorProvider.resolveCustomTextEditor(document, webviewPanel, token)`

The provider:

1. Sets `webviewPanel.webview.html` to an HTML shell.
2. Loads a JS entrypoint:
	 - Dev mode: `http://localhost:5173/src/cpn/index.tsx`
	 - Packaged: `media/cpn.webview.js`
3. Starts a message channel between the webview and the extension.

### 1.3 Webview-side rendering (ReactFlow)

The webview entrypoint is `webview/src/cpn/index.tsx`.

Flow:

1. Webview sends `{ type: 'ready' }`.
2. Extension replies `{ type: 'init', text: document.getText(), uri }`.
3. The webview parses the `.cpn` text as JSON (via `jsonc-parser` → fallback `JSON.parse`).
4. The parsed object shape is expected to be:

```json
{ "nodes": [...], "edges": [...] }
```

5. The webview renders:
	 - nodes using custom node types `place` and `transition`
	 - edges using a custom edge type `labeled`
	 - ReactFlow state hooks (`useNodesState`, `useEdgesState`) to manage interactions

### 1.4 Persisting changes

When the user drags nodes, adds nodes/edges, or edits labels, the webview debounces updates and posts:

- `{ type: 'update', text: JSON.stringify({ nodes, edges }, null, 2) }`

The extension receives this and replaces the entire document text via a `WorkspaceEdit`.

### 1.5 Auto-layout button

The “tiny toolbar” is implemented by `webview/src/cpn/components/CanvasControls.tsx`.

The auto-layout action calls `computePetriLayout(...)` from `webview/src/cpn/utils/auto-layout.ts` and then:

- updates node positions
- triggers a `fitView()`
- persists the updated JSON back into the document via the existing update channel

## 2) PNML YAML format (schema + sample)

The new format is a YAML representation of a PNML-derived JSON model:

- Schema: `src/schema/pnml.schema`
- Sample instance: `tmp/evolve.evolve.yaml`

Relevant structural subset for the editor:

- `pnml.net[].page[]`
	- `place[]`, `transition[]`, `arc[]`
- IDs:
	- `id` (friendly) or `@id` (XML-ish)
- Arc endpoints:
	- `source`/`target` (friendly) or `@source`/`@target`
- Optional positions:
	- `graphics.position.{x,y}` (friendly) or `graphics.position.{@x,@y}`

## 3) PNML Editor design

### 3.1 Goals

1. Add a context menu action **Open with Aggo PNML Editor** for:
	 - `*.evolve.yaml`
	 - `*.pnml.yaml`
2. Reuse the existing CPN editor UI/renderer:
	 - ReactFlow canvas
	 - Place/Transition node components
	 - Labeled edge component
	 - CanvasControls toolbar
	 - Auto-layout algorithm
3. Add an auto-layout button to the toolbar.
	 - Already exists in CanvasControls; PNML editor must expose it.

### 3.2 Non-goals (for initial implementation)

- Full PNML authoring / structural edits (creating/removing places/transitions/arcs) with a lossless YAML round-trip.
- Preserving YAML comments and formatting on save.

### 3.3 UX

- Right-click a `*.evolve.yaml` or `*.pnml.yaml` file → **Open with Aggo PNML Editor**.
- Diagram renders as a Petri net.
- User can:
	- drag nodes
	- click auto-layout (wand) in the canvas toolbar
- Saving behavior:
	- layout changes persist back into YAML by updating `graphics.position.x/y` on matching places/transitions.

### 3.4 Architecture

We introduce a new custom editor viewType:

- `aggo.pnmlEditor`

#### Extension side

- `src/editors/AggoPNMLEditorProvider.ts`
	- mirrors `AggoCPNEditorProvider`
	- loads a PNML webview bundle
	- responds to webview messages:
		- `ready` → send parsed graph `{ nodes, edges }`
		- `updateLayout` → apply node positions into YAML and replace document text

- `src/utils/pnmlGraph.ts`
	- `pnmlYamlToCpnGraph(text)` converts YAML → `{nodes, edges}`
	- `applyLayoutToPnmlYaml(text, nodes)` writes node positions into PNML YAML

YAML parsing/dumping uses `js-yaml`.

#### Webview side

- `webview/src/pnml/index.tsx`
	- reuses the CPN renderer components
	- receives `{type: 'init'|'documentChanged', graph}`
	- on drag / auto-layout posts `{ type: 'updateLayout', nodes, edges }`

### 3.5 Auto-layout

Auto-layout uses the existing `computePetriLayout` function (layered left→right) and persists updated `graphics.position` back to YAML.

## 4) Implementation plan

### Epic 1 — Add PNML editor registration

Stories:

1. Add `aggo.pnmlEditor` to `contributes.customEditors` for `*.evolve.yaml` and `*.pnml.yaml`.
2. Add explorer context menu command **Open with Aggo PNML Editor**.
3. Wire activation in `src/extension.ts`.

### Epic 2 — Implement PNML provider + YAML layout persistence

Stories:

1. Implement `pnmlYamlToCpnGraph`.
2. Implement `applyLayoutToPnmlYaml`.
3. Implement provider message flow:
	 - init graph on `ready`
	 - update YAML on `updateLayout`
	 - re-parse on external document changes

### Epic 3 — PNML webview renderer

Stories:

1. Add a PNML webview entrypoint that reuses CPN components.
2. Ensure the toolbar includes auto-layout.
3. Disable structural edits initially (no add-place/add-transition buttons).

### Epic 4 — Tests

Stories:

1. Add unit tests for conversion + layout application.
2. Ensure `pnpm test` passes.

## 5) Unit test cases

These tests are implemented in `src/test/runTest.ts`.

1. **pnmlYamlToCpnGraphBasic**
	 - input: minimal PNML YAML with 1 place, 1 transition, 1 arc
	 - expect: nodes length 2, edges length 1, transition `data.tType` matches `evolve.kind`

2. **applyLayoutToPnmlYamlAddsGraphicsPositions**
	 - input: PNML YAML with no `graphics`
	 - apply layout nodes with explicit positions
	 - expect: output YAML parses and contains `graphics.position.x/y` for the matching place/transition


## 6) Auto-layout v2 — “Mermaid-quality” top-down layout

The current Petri auto-layout (`computePetriLayout`) is a simple layered relaxation that:

- uses a left→right layer propagation heuristic (handles cycles but does not optimize crossings)
- does not compute routed edge paths (edges are drawn as Bezier curves between handles)

This combination is why complex PNML nets end up with unreadable edge bundles and overlaps.

### 6.1 Goals

For PNML (and ideally CPN) auto-layout, we want output closer to Mermaid flowcharts:

- Top-down (START near top, END near bottom)
- Stable layering even with cycles
- Fewer crossings, fewer overlaps
- Orthogonal/polyline edges that route *around* nodes instead of cutting through them

### 6.2 Design: ELK layered + orthogonal edge routing

We already ship `elkjs` (used by the GraphQL view). We reuse it for Petri nets.

**Layout engine**: ELK `layered`

- `elk.direction = DOWN` (top→bottom)
- `elk.edgeRouting = ORTHOGONAL` (produces bend points / polylines)
- spacing tuned for Petri nodes:
	- `elk.layered.spacing.nodeNodeBetweenLayers` ≈ layer gap (vertical spacing)
	- `elk.spacing.nodeNode` ≈ sibling gap (horizontal spacing)
- cycle handling:
	- `elk.layered.cycleBreaking.strategy = GREEDY` (Petri nets frequently contain feedback loops)

**Node sizing** (important for overlap avoidance)

- Places render as circles (~80×80) plus label; ELK size uses a slightly larger envelope (~110×110)
- Transitions render as cards (~192px wide); ELK size uses ~240×110 to allow badges/labels

### 6.3 Design: custom edge rendering using ELK bend points

ReactFlow edges normally compute their path from `sourceX/targetX` and draw a Bezier.

For Mermaid-quality readability we instead:

1. Run ELK layout and capture edge route sections:
	- `startPoint`, `bendPoints[]`, `endPoint`
2. Store the resulting polyline as `edge.data.points: Array<{x,y}>`
3. Render a custom edge that:
	- uses `BaseEdge` with an SVG path `M … L … L …`
	- positions the edge label at the midpoint of the polyline length
	- falls back to the old Bezier path when no `points` are present

This is aligned with ReactFlow’s “custom edges” pattern:
https://reactflow.dev/examples/edges/custom-edges

### 6.3.1 Design: top/bottom connection points (ports)

Even with orthogonal routing, **left/right handles** force many edges to start by moving sideways.
In a top-down (`DOWN`) layout, this creates immediate edge bundling and overlap.

For Mermaid-like readability we standardize Petri node ports as:

- **Incoming arcs** connect to the **top** handle (`type="target"`, `Position.Top`)
- **Outgoing arcs** connect to the **bottom** handle (`type="source"`, `Position.Bottom`)

This applies to both `PlaceNode` and `TransitionNode`.

### 6.4 Editor wiring

Auto-layout button behavior (CPN + PNML):

- Call `computePetriLayoutGraph(nodes, edges, { direction: 'DOWN' })`
- Update both ReactFlow state slices:
	- `setNodes(layouted.nodes)`
	- `setEdges(layouted.edges)`
- Persist:
	- CPN: write JSON `{nodes,edges}`
	- PNML: write only node positions back into YAML (`graphics.position.x/y`)

### 6.5 Test cases (unit + integration)

These are *layout-specific* tests to keep the “Mermaid-quality” bar from regressing.

#### Unit tests (layout engine wrapper)

1. **petriElkLayoutTopDownProducesIncreasingY**
	- input: simple chain `p_start -> t1 -> p_end`
	- expect: `y(p_start) < y(t1) < y(p_end)` (top-down ordering)

2. **petriElkLayoutReturnsOrthogonalPolylinePoints**
	- input: branching net with at least 3 edges
	- expect: every edge has `data.points` with `len >= 2` and all points finite
	- expect: at least one edge has a bend (`len > 2`) for non-trivial routing

3. **petriEdgeLabelMidpointStable**
	- input: a polyline with multiple segments
	- expect: computed label position lies on the polyline (within epsilon)

#### Integration tests (webview + persistence)

1. **pnmlEditorAutoLayoutPersistsGraphicsPosition**
	- open `tmp/evolve.evolve.yaml` with `aggo.pnmlEditor`
	- click auto-layout
	- expect: YAML updates with `graphics.position.x/y` for all places/transitions
	- expect: reopening preserves positions

2. **cpnEditorAutoLayoutPersistsEdgeRoutesNonBreaking**
	- open a `.cpn`
	- click auto-layout
	- expect: document remains valid JSON with unchanged edge semantics
	- expect: if edge routes are stored, they are under `edges[].data.points` (non-breaking, optional)

3. **largePnmlLayoutDoesNotFreezeUI**
	- net with 100+ nodes
	- expect: layout finishes within an acceptable time budget (e.g. < 1s typical, < 3s worst)

## 7) Implementation plan — Auto-layout v2

1. **Layout engine upgrade**
	- Add `computePetriLayoutGraph(...)` (async) using ELK layered + `DOWN` direction
	- Keep `computePetriLayout(...)` as a sync fallback

2. **Custom edge routing**
	- Extend the existing `LabeledEdge` to render a polyline when `edge.data.points` exists
	- Keep Bezier fallback when not present (backward compatible)

3. **Editor integration**
	- Update CPN and PNML auto-layout handlers to:
		- await `computePetriLayoutGraph`
		- update both nodes and edges state
		- persist via existing channels

4. **Validation**
	- Ensure `pnpm run build:webview` succeeds
	- Ensure `pnpm test` succeeds
	- Manual sanity check: run auto-layout on `tmp/evolve.evolve.yaml` and compare to Mermaid output

