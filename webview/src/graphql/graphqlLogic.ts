import { parse, print, Kind } from 'graphql';
import ELK from 'elkjs/lib/elk.bundled.js';

export type GraphqlAnalysis = {
  errors: string[];
  types: Array<{
    name: string;
    kind: 'object' | 'input' | 'interface' | 'enum' | 'union' | 'scalar' | 'other';
    fields: Array<{ name: string; type: string; args?: Array<{ name: string; type: string }> }>;
  }>;
  relations: Array<{ fromType: string; fromField: string; toType: string }>;
  layout?: Record<
    string,
    {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  >;
};

function baseNamedType(typeRef: string): string {
  // Strip GraphQL wrappers like [T!]! -> T
  return typeRef.replace(/[\[\]!\s]/g, '');
}

function nodeHeightForType(fieldsCount: number): number {
  // Roughly matches the current rendered label: header + up to 12 fields.
  const rows = Math.min(12, Math.max(0, fieldsCount));
  return 52 + rows * 18 + (fieldsCount > 12 ? 18 : 0);
}

async function computeElkLayout(analysis: GraphqlAnalysis): Promise<NonNullable<GraphqlAnalysis['layout']>> {
  const elk = new ELK();

  const nodes = analysis.types
    .filter((t) => t.kind === 'object' || t.kind === 'input' || t.kind === 'interface')
    .map((t) => ({
      id: t.name,
      width: 250,
      height: nodeHeightForType(t.fields.length),
    }));

  const edges = analysis.relations
    .map((r) => ({
      id: `${r.fromType}.${r.fromField}->${r.toType}`,
      sources: [r.fromType],
      targets: [r.toType],
    }));

  const graph: any = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'POLYLINE',
      'elk.layered.spacing.nodeNodeBetweenLayers': '140',
      'elk.spacing.nodeNode': '70',
    },
    children: nodes,
    edges,
  };

  const out = await elk.layout(graph);
  const layout: NonNullable<GraphqlAnalysis['layout']> = {};
  for (const child of out.children ?? []) {
    if (!child?.id) continue;
    layout[String(child.id)] = {
      x: Number(child.x ?? 0),
      y: Number(child.y ?? 0),
      width: Number(child.width ?? 250),
      height: Number(child.height ?? 120),
    };
  }
  return layout;
}

function typeKindFromDefinition(def: any): GraphqlAnalysis['types'][number]['kind'] {
  switch (def.kind) {
    case Kind.OBJECT_TYPE_DEFINITION:
    case Kind.OBJECT_TYPE_EXTENSION:
      return 'object';
    case Kind.INPUT_OBJECT_TYPE_DEFINITION:
    case Kind.INPUT_OBJECT_TYPE_EXTENSION:
      return 'input';
    case Kind.INTERFACE_TYPE_DEFINITION:
    case Kind.INTERFACE_TYPE_EXTENSION:
      return 'interface';
    case Kind.ENUM_TYPE_DEFINITION:
    case Kind.ENUM_TYPE_EXTENSION:
      return 'enum';
    case Kind.UNION_TYPE_DEFINITION:
    case Kind.UNION_TYPE_EXTENSION:
      return 'union';
    case Kind.SCALAR_TYPE_DEFINITION:
    case Kind.SCALAR_TYPE_EXTENSION:
      return 'scalar';
    default:
      return 'other';
  }
}

function renderTypeRef(t: any): string {
  if (!t) return '';
  if (t.kind === Kind.NON_NULL_TYPE) return `${renderTypeRef(t.type)}!`;
  if (t.kind === Kind.LIST_TYPE) return `[${renderTypeRef(t.type)}]`;
  if (t.kind === Kind.NAMED_TYPE) return t.name?.value ?? '';
  return '';
}

export function analyzeSdl(sdl: string): GraphqlAnalysis {
  const errors: string[] = [];
  try {
    const doc = parse(sdl, { noLocation: true });
    const types: GraphqlAnalysis['types'] = [];

    for (const def of doc.definitions) {
      if (!('name' in def) || !def.name?.value) continue;
      const kind = typeKindFromDefinition(def);

      const fields: Array<{ name: string; type: string; args?: Array<{ name: string; type: string }> }> = [];
      const defFields = (def as any).fields;
      if (Array.isArray(defFields)) {
        for (const f of defFields) {
          const argsAst = Array.isArray((f as any).arguments) ? (f as any).arguments : [];
          const args = argsAst
            .map((a: any) => ({
              name: a?.name?.value ?? '',
              type: renderTypeRef(a?.type),
            }))
            .filter((a: any) => a.name && a.type);

          fields.push({
            name: f.name?.value ?? '',
            type: renderTypeRef(f.type),
            args: args.length ? args : undefined,
          });
        }
      }

      types.push({ name: def.name.value, kind, fields });
    }

    const typeMap = new Map(types.map((t) => [t.name, t.kind] as const));
    const relations: GraphqlAnalysis['relations'] = [];
    for (const t of types) {
      if (!(t.kind === 'object' || t.kind === 'input' || t.kind === 'interface')) continue;
      for (const f of t.fields) {
        // Return type relation
        const returnTarget = baseNamedType(f.type);
        if (returnTarget && returnTarget !== t.name && typeMap.has(returnTarget)) {
          relations.push({ fromType: t.name, fromField: f.name, toType: returnTarget });
        }

        // Argument type relations (e.g. Mutation.createOrder(input: CreateOrderInput!): ...)
        for (const a of f.args ?? []) {
          const argTarget = baseNamedType(a.type);
          if (!argTarget || argTarget === t.name) continue;
          if (!typeMap.has(argTarget)) continue;
          // Use a stable label so edges are distinct vs return-type edges.
          relations.push({ fromType: t.name, fromField: `${f.name}.${a.name}`, toType: argTarget });
        }
      }
    }

    return { errors, types, relations };
  } catch (e: any) {
    errors.push(e?.message || String(e));
    return { errors, types: [], relations: [] };
  }
}

export async function analyzeSdlWithLayout(sdl: string): Promise<GraphqlAnalysis> {
  const analysis = analyzeSdl(sdl);
  // Only compute layout when we have a valid schema and at least one type node.
  if (analysis.errors.length) return analysis;
  try {
    analysis.layout = await computeElkLayout(analysis);
  } catch (e: any) {
    // Layout is optional; keep analysis usable even if ELK fails.
    analysis.layout = undefined;
  }
  return analysis;
}

function ensureDirectiveDefinition(doc: any, name: string, args: Array<{ name: string; type: any }>): any {
  const exists = doc.definitions.some((d: any) => d.kind === Kind.DIRECTIVE_DEFINITION && d.name?.value === name);
  if (exists) return doc;

  const directiveDef = {
    kind: Kind.DIRECTIVE_DEFINITION,
    name: { kind: Kind.NAME, value: name },
    arguments: args.map((a) => ({
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: { kind: Kind.NAME, value: a.name },
      type: a.type,
      directives: [],
    })),
    repeatable: false,
    locations: [{ kind: Kind.NAME, value: 'FIELD_DEFINITION' }],
  };

  return {
    ...doc,
    definitions: [directiveDef, ...doc.definitions],
  };
}

export function applyDirectiveToField(args: {
  sdl: string;
  typeName: string;
  fieldName: string;
  directiveName: 'http' | 'resolver';
  directiveArgs: Record<string, string>;
}): string {
  const doc = parse(args.sdl);

  const directiveArgsAst = Object.entries(args.directiveArgs).map(([k, v]) => ({
    kind: Kind.ARGUMENT,
    name: { kind: Kind.NAME, value: k },
    value: { kind: Kind.STRING, value: String(v) },
  }));

  const directiveNode = {
    kind: Kind.DIRECTIVE,
    name: { kind: Kind.NAME, value: args.directiveName },
    arguments: directiveArgsAst,
  };

  const withDirectiveDefs = (() => {
    if (args.directiveName === 'http') {
      return ensureDirectiveDefinition(doc, 'http', [
        {
          name: 'url',
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: { kind: Kind.NAMED_TYPE, name: { kind: Kind.NAME, value: 'String' } },
          },
        },
        { name: 'method', type: { kind: Kind.NAMED_TYPE, name: { kind: Kind.NAME, value: 'String' } } },
      ]);
    }

    return ensureDirectiveDefinition(doc, 'resolver', [
      {
        name: 'name',
        type: {
          kind: Kind.NON_NULL_TYPE,
          type: { kind: Kind.NAMED_TYPE, name: { kind: Kind.NAME, value: 'String' } },
        },
      },
    ]);
  })();

  const newDefs = withDirectiveDefs.definitions.map((def: any) => {
    if (
      (def.kind === Kind.OBJECT_TYPE_DEFINITION || def.kind === Kind.OBJECT_TYPE_EXTENSION) &&
      def.name?.value === args.typeName &&
      Array.isArray(def.fields)
    ) {
      const fields = def.fields.map((f: any) => {
        if (f.name?.value !== args.fieldName) return f;
        const directives = Array.isArray(f.directives) ? f.directives : [];
        const filtered = directives.filter((d: any) => d?.name?.value !== args.directiveName);
        return { ...f, directives: [...filtered, directiveNode] };
      });
      return { ...def, fields };
    }
    return def;
  });

  const updatedDoc = { ...withDirectiveDefs, definitions: newDefs };
  return print(updatedDoc);
}

export function reorderFieldInType(args: {
  sdl: string;
  typeName: string;
  fromFieldName: string;
  toFieldName: string;
}): string {
  const doc = parse(args.sdl);
  const newDefs = doc.definitions.map((def: any) => {
    if (
      (def.kind === Kind.OBJECT_TYPE_DEFINITION || def.kind === Kind.OBJECT_TYPE_EXTENSION) &&
      def.name?.value === args.typeName &&
      Array.isArray(def.fields)
    ) {
      const fields = [...def.fields];
      const fromIdx = fields.findIndex((f: any) => f?.name?.value === args.fromFieldName);
      const toIdx = fields.findIndex((f: any) => f?.name?.value === args.toFieldName);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return def;

      const [moved] = fields.splice(fromIdx, 1);
      const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
      fields.splice(insertIdx, 0, moved);
      return { ...def, fields };
    }
    return def;
  });
  return print({ ...doc, definitions: newDefs });
}

export function readDirectivesForField(args: {
  sdl: string;
  typeName: string;
  fieldName: string;
}): { http?: { url?: string; method?: string }; resolver?: { name?: string } } {
  try {
    const doc = parse(args.sdl, { noLocation: true });
    for (const def of doc.definitions as any[]) {
      if (
        (def.kind === Kind.OBJECT_TYPE_DEFINITION || def.kind === Kind.OBJECT_TYPE_EXTENSION) &&
        def.name?.value === args.typeName &&
        Array.isArray(def.fields)
      ) {
        const f = def.fields.find((x: any) => x?.name?.value === args.fieldName);
        if (!f) return {};
        const out: any = {};
        const directives = Array.isArray(f.directives) ? f.directives : [];
        for (const d of directives) {
          const dName = d?.name?.value;
          if (dName !== 'http' && dName !== 'resolver') continue;
          const argMap: Record<string, string> = {};
          const dArgs = Array.isArray(d.arguments) ? d.arguments : [];
          for (const a of dArgs) {
            const k = a?.name?.value;
            const v = a?.value?.value;
            if (typeof k === 'string' && typeof v === 'string') argMap[k] = v;
          }
          if (dName === 'http') {
            out.http = { url: argMap.url, method: argMap.method };
          }
          if (dName === 'resolver') {
            out.resolver = { name: argMap.name };
          }
        }
        return out;
      }
    }
  } catch {
    // ignore
  }
  return {};
}
