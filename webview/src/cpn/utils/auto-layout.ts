import type { Node, Edge } from '@xyflow/react'

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

// Build layered layout left->right starting from start places; arcs direct token flow.
export function computePetriLayout(nodes: Node<PetriNodeData>[], edges: Edge<PetriEdgeData>[], opts: LayoutOptions = {}) {
  const { horizontalGap = 240, verticalGap = 120, startX = 120, startY = 80 } = opts
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const outAdj: Record<string, string[]> = {}
  const inDeg: Record<string, number> = {}
  nodes.forEach(n => { outAdj[n.id] = []; inDeg[n.id] = 0 })

  edges.forEach(e => {
    const src = nodeMap.get(e.source)
    const tgt = nodeMap.get(e.target)
    if (!src || !tgt) return
    // Keep given direction: place->transition (IN) or transition->place (OUT)
    outAdj[e.source].push(e.target)
    inDeg[e.target] += 1
  })

  const startNodes = nodes.filter(n => n.type === 'place' && ((n.data as any).isStart || inDeg[n.id] === 0))
  const layerMap: Record<string, number> = {}
  const q: string[] = []
  startNodes.forEach(n => { q.push(n.id); layerMap[n.id] = 0 })

  while (q.length) {
    const id = q.shift() as string
    const base = layerMap[id] ?? 0
    for (const nxt of outAdj[id]) {
      const nextLayer = Math.max(layerMap[nxt] ?? 0, base + 1)
      layerMap[nxt] = nextLayer
      inDeg[nxt] -= 1
      if (inDeg[nxt] <= 0) q.push(nxt)
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

export function applyPetriLayout(setNodes: React.Dispatch<React.SetStateAction<Node<PetriNodeData>[]>>, edges: Edge<PetriEdgeData>[], opts?: LayoutOptions) {
  setNodes(curr => computePetriLayout(curr, edges, opts))
}
