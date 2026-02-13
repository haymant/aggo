import type { Node, Edge } from '@xyflow/react';

let yamlLoad: ((text: string) => any) | undefined;
let yamlDump: ((obj: any, opts?: any) => string) | undefined;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const yaml = require('js-yaml');
  yamlLoad = yaml.load;
  yamlDump = yaml.dump;
} catch (err) {
  // If js-yaml isn't available (packaging), callers will get a controlled error.
}

export type CpnGraph = {
  nodes: Array<Node>;
  edges: Array<Edge>;
  errors?: string[];
};

function asNumber(value: any): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function getId(obj: any): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  return (typeof obj.id === 'string' && obj.id) ? obj.id : (typeof obj['@id'] === 'string' ? obj['@id'] : undefined);
}

function getPos(obj: any): { x?: number; y?: number } {
  const pos = obj?.graphics?.position;
  const x = asNumber(pos?.x ?? pos?.['@x']);
  const y = asNumber(pos?.y ?? pos?.['@y']);
  return { x, y };
}

function pageFromPnml(parsed: any): any {
  const pnml = parsed?.pnml;
  const net = Array.isArray(pnml?.net) ? pnml.net[0] : pnml?.net;
  const page = Array.isArray(net?.page) ? net.page[0] : net?.page;
  return page;
}

export function pnmlYamlToCpnGraph(text: string): CpnGraph {
  if (!yamlLoad) {
    return { nodes: [], edges: [], errors: ['js-yaml is not available in this environment'] };
  }

  if (!text || text.trim().length === 0) {
    return { nodes: [], edges: [] };
  }

  let parsed: any;
  try {
    parsed = yamlLoad(text);
  } catch (err: any) {
    return { nodes: [], edges: [], errors: [err?.message || String(err)] };
  }

  const page = pageFromPnml(parsed);
  const places: any[] = Array.isArray(page?.place) ? page.place : [];
  const transitions: any[] = Array.isArray(page?.transition) ? page.transition : [];
  const arcs: any[] = Array.isArray(page?.arc) ? page.arc : [];

  const nodes: Array<Node> = [];
  const edges: Array<Edge> = [];

  const fallbackStartX = 120;
  const fallbackStartY = 80;
  const fallbackGapY = 90;

  let placeIdx = 0;
  for (const p of places) {
    const id = getId(p);
    if (!id) continue;
    const name = p?.name?.text ?? p?.name?.['text'] ?? id;
    const pos = getPos(p);

    nodes.push({
      id,
      type: 'place',
      position: {
        x: pos.x ?? fallbackStartX,
        y: pos.y ?? (fallbackStartY + placeIdx * fallbackGapY),
      },
      data: {
        kind: 'place',
        name,
        tokenSchemaRef: p?.evolve?.tokenSchemaRef,
        tokenKind: p?.evolve?.tokenKind,
        initialTokens: p?.evolve?.initialTokens,
      },
    });
    placeIdx++;
  }

  let transitionIdx = 0;
  for (const t of transitions) {
    const id = getId(t);
    if (!id) continue;
    const name = t?.name?.text ?? t?.name?.['text'] ?? id;
    const pos = getPos(t);

    nodes.push({
      id,
      type: 'transition',
      position: {
        x: pos.x ?? (fallbackStartX + 260),
        y: pos.y ?? (fallbackStartY + transitionIdx * fallbackGapY),
      },
      data: {
        kind: 'transition',
        name,
        tType: t?.evolve?.kind,
        inscriptions: t?.evolve?.inscriptions,
      },
    });
    transitionIdx++;
  }

  let arcIdx = 0;
  for (const a of arcs) {
    const id = getId(a) ?? `a-${arcIdx}`;
    const source = a?.source ?? a?.['@source'];
    const target = a?.target ?? a?.['@target'];
    if (typeof source !== 'string' || typeof target !== 'string') continue;

    const label = a?.name?.text;
    const inscription = a?.evolve?.inscription;
    const expression = typeof inscription?.code === 'string' ? inscription.code : (typeof label === 'string' ? label : undefined);

    edges.push({
      id,
      source,
      target,
      type: 'labeled',
      data: { expression },
    });
    arcIdx++;
  }

  return { nodes, edges };
}

export function applyLayoutToPnmlYaml(text: string, nodes: any[]): string {
  if (!yamlLoad || !yamlDump) {
    throw new Error('js-yaml is not available in this environment');
  }

  let parsed: any;
  parsed = yamlLoad(text || '') ?? {};

  const page = pageFromPnml(parsed);
  if (!page || typeof page !== 'object') {
    // If document doesn't look like PNML YAML, keep it untouched.
    return text;
  }

  const places: any[] = Array.isArray(page.place) ? page.place : [];
  const transitions: any[] = Array.isArray(page.transition) ? page.transition : [];

  const placeById = new Map<string, any>();
  for (const p of places) {
    const id = getId(p);
    if (id) placeById.set(id, p);
  }

  const transitionById = new Map<string, any>();
  for (const t of transitions) {
    const id = getId(t);
    if (id) transitionById.set(id, t);
  }

  for (const n of nodes) {
    const id = typeof n?.id === 'string' ? n.id : undefined;
    if (!id) continue;

    const x = asNumber(n?.position?.x);
    const y = asNumber(n?.position?.y);
    if (x === undefined || y === undefined) continue;

    const isPlace = n?.type === 'place';
    const target = isPlace ? placeById.get(id) : transitionById.get(id);
    if (!target || typeof target !== 'object') continue;

    if (!target.graphics || typeof target.graphics !== 'object') target.graphics = {};
    if (!target.graphics.position || typeof target.graphics.position !== 'object') target.graphics.position = {};
    target.graphics.position.x = x;
    target.graphics.position.y = y;
  }

  // Keep output relatively stable and readable.
  return yamlDump(parsed, {
    lineWidth: 120,
    noCompatMode: true,
    sortKeys: false,
  });
}
