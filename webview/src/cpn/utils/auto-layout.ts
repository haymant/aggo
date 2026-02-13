import type { Node, Edge } from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js';
import type { Dispatch, SetStateAction } from 'react';

export interface PetriNodeData extends Record<string, unknown> {
  kind?: string
  name?: string
  tokens?: number | any[]
  tType?: string
  guardExpression?: string
  isStart?: boolean
}

export interface PetriEdgeData extends Record<string, unknown> {
  label?: string
  expression?: string
}

interface LayoutOptions {
  horizontalGap?: number
  verticalGap?: number
  startX?: number
  startY?: number
}

export type PetriLayoutDirection = 'RIGHT' | 'DOWN'

export interface PetriLayoutGraphOptions extends LayoutOptions {
  /**
   * Layout direction.
   * - RIGHT: left-to-right (legacy)
   * - DOWN: top-to-bottom (Mermaid-like)
   */
  direction?: PetriLayoutDirection
  /** Prefer ELK (layered + orthogonal edge routing). Falls back to simple layout on failure. */
  engine?: 'elk' | 'simple'
  /**
   * When true, include edge polyline points in returned edges (used by custom edge renderer).
   * Defaults to true for ELK.
   */
  includeEdgeRoutes?: boolean
}

export type PetriLayoutGraphResult = {
  nodes: Node<PetriNodeData>[]
  edges: Edge<PetriEdgeData>[]
}

// Build layered layout left->right starting from start places; arcs direct token flow.
export function computePetriLayout(nodes: Node<PetriNodeData>[], edges: Edge<PetriEdgeData>[], opts: LayoutOptions = {}) {
  const { horizontalGap = 240, verticalGap = 120, startX = 120, startY = 80 } = opts
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const outAdj: Record<string, string[]> = {}
  nodes.forEach(n => { outAdj[n.id] = [] })

  edges.forEach(e => {
    const src = nodeMap.get(e.source)
    const tgt = nodeMap.get(e.target)
    if (!src || !tgt) return
    // Keep given direction: place->transition (IN) or transition->place (OUT)
    outAdj[e.source].push(e.target)
  })

  // Prefer left-to-right layout: start from explicit start places, otherwise any places, otherwise any node.
  // IMPORTANT: do not rely on indegree-based topological sorting.
  // Petri nets often contain cycles; indegree/Kahn will collapse cycles into a single layer (ugly top-down column).
  const startNodes = (() => {
    const explicit = nodes.filter(n => n.type === 'place' && (n.data as any)?.isStart)
    if (explicit.length) return explicit
    const places = nodes.filter(n => n.type === 'place')
    if (places.length) return places
    return nodes.slice(0, 1)
  })()

  const layerMap: Record<string, number> = {}
  const q: string[] = []
  for (const n of startNodes) {
    layerMap[n.id] = 0
    q.push(n.id)
  }

  // Propagate layers with bounded relaxation to support cycles.
  // Each node's layer is capped to nodes.length - 1 to guarantee termination.
  const layerCap = Math.max(0, nodes.length - 1)
  while (q.length) {
    const id = q.shift() as string
    const base = layerMap[id] ?? 0
    for (const nxt of outAdj[id]) {
      const nextLayer = Math.min(layerCap, base + 1)
      const prev = layerMap[nxt]
      if (prev === undefined || nextLayer > prev) {
        layerMap[nxt] = nextLayer
        q.push(nxt)
      }
    }
  }

  nodes.forEach(n => { if (layerMap[n.id] === undefined) layerMap[n.id] = 0 })

  const layers: Record<number, Node<PetriNodeData>[]> = {}
  nodes.forEach(n => { const l = layerMap[n.id]; (layers[l] = layers[l] || []).push(n) })

  const ordered = Object.entries(layers).map(([k, list]) => {
    const places = list.filter(n => n.type === 'place')
    const transitions = list.filter(n => n.type === 'transition')
    return [Number(k), [...places, ...transitions]] as [number, Node<PetriNodeData>[]]
  }).sort((a,b) => a[0]-b[0])

  const positioned: Record<string, { x: number; y: number }> = {}
  ordered.forEach(([layer, list]) => {
    list.forEach((n, idx) => {
      positioned[n.id] = { x: startX + layer * horizontalGap, y: startY + idx * verticalGap }
    })
  })

  return nodes.map(n => ({ ...n, position: positioned[n.id] || n.position }))
}

type ElkPoint = { x: number; y: number }

function nodeSizeForElk(n: Node<PetriNodeData>): { width: number; height: number } {
  // Keep sizes slightly larger than the rendered nodes to avoid overlaps.
  if (n.type === 'place') return { width: 110, height: 110 }
  if (n.type === 'transition') return { width: 240, height: 110 }
  return { width: 180, height: 100 }
}

function addOffset(points: ElkPoint[], dx: number, dy: number): ElkPoint[] {
  if (!dx && !dy) return points
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

/**
 * Mermaid-like auto-layout using ELK layered layout.
 * - Direction defaults to DOWN
 * - Edge routing uses ORTHOGONAL bend points
 *
 * Returns both nodes and edges; edges may carry `data.points: Array<{x,y}>`.
 */
export async function computePetriLayoutGraph(
  nodes: Node<PetriNodeData>[],
  edges: Edge<PetriEdgeData>[],
  opts: PetriLayoutGraphOptions = {},
): Promise<PetriLayoutGraphResult> {
  const {
    direction = 'DOWN',
    engine = 'elk',
    includeEdgeRoutes = engine === 'elk',
    // Keep legacy defaults for callers that still pass these values.
    horizontalGap = 240,
    verticalGap = 120,
    startX = 120,
    startY = 80,
  } = opts

  if (engine === 'simple') {
    return { nodes: computePetriLayout(nodes, edges, { horizontalGap, verticalGap, startX, startY }), edges }
  }

  try {
    const elk = new ELK()

    const elkNodes = nodes.map((n) => {
      const { width, height } = nodeSizeForElk(n)
      return {
        id: n.id,
        width,
        height,
      }
    })

    const elkEdges = edges
      .filter((e) => e?.id && e?.source && e?.target)
      .map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      }))

    const layerGap = String(Math.max(60, verticalGap))
    const nodeGap = String(Math.max(40, Math.min(horizontalGap, 240)))

    const graph: any = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': direction,
        // Orthogonal routing is the big readability win vs. current Bezier-only routing.
        'elk.edgeRouting': 'ORTHOGONAL',
        // Spacing tuned for Petri nets: spread layers (top-down) while keeping siblings readable.
        'elk.layered.spacing.nodeNodeBetweenLayers': layerGap,
        'elk.spacing.nodeNode': nodeGap,
        'elk.spacing.edgeNode': '30',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        // Petri nets often have cycles; let ELK break cycles but keep stable placement.
        'elk.layered.cycleBreaking.strategy': 'GREEDY',
        // Slightly bias towards straight edges.
        'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      },
      children: elkNodes,
      edges: elkEdges,
    }

    const out: any = await elk.layout(graph)

    const nodePos = new Map<string, { x: number; y: number }>()
    for (const child of out?.children ?? []) {
      if (!child?.id) continue
      nodePos.set(String(child.id), {
        x: Number(child.x ?? 0) + startX,
        y: Number(child.y ?? 0) + startY,
      })
    }

    const routedById = new Map<string, ElkPoint[]>()
    if (includeEdgeRoutes) {
      for (const e of out?.edges ?? []) {
        const id = String(e?.id ?? '')
        if (!id) continue
        const section = Array.isArray(e?.sections) ? e.sections[0] : undefined
        if (!section?.startPoint || !section?.endPoint) continue
        const bendPoints = Array.isArray(section?.bendPoints) ? section.bendPoints : []
        const points: ElkPoint[] = [section.startPoint, ...bendPoints, section.endPoint]
          .map((p: any) => ({ x: Number(p.x ?? 0), y: Number(p.y ?? 0) }))
          .filter((p: any) => Number.isFinite(p.x) && Number.isFinite(p.y))
        if (points.length >= 2) {
          routedById.set(id, addOffset(points, startX, startY))
        }
      }
    }

    const nextNodes = nodes.map((n) => {
      const pos = nodePos.get(n.id)
      return pos ? { ...n, position: pos } : n
    })

    const nextEdges = edges.map((e) => {
      const points = routedById.get(e.id)
      const prevData: any = e.data && typeof e.data === 'object' ? e.data : {}
      if (!points) {
        // Keep any existing points from a previous layout if we can’t compute new ones.
        return e
      }
      return {
        ...e,
        data: {
          ...prevData,
          points,
        },
      }
    })

    return { nodes: nextNodes, edges: nextEdges }
  } catch (err) {
    // Keep editor usable even if ELK fails in this environment.
    return { nodes: computePetriLayout(nodes, edges, { horizontalGap, verticalGap, startX, startY }), edges }
  }
}

export function applyPetriLayout(setNodes: Dispatch<SetStateAction<Node<PetriNodeData>[]>>, edges: Edge<PetriEdgeData>[], opts?: LayoutOptions) {
  setNodes(curr => computePetriLayout(curr, edges, opts))
}
