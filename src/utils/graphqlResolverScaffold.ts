import * as path from 'path';

export const AGGO_GRAPHQL_RESOLVERS_REGION_START = `// @aggo-generated-graphql-resolvers-start`;
export const AGGO_GRAPHQL_RESOLVERS_REGION_END = `// @aggo-generated-graphql-resolvers-end`;

export function renderResolverStubs(resolverIds: string[]): string {
  if (!resolverIds.length) {
    return `  // (no resolvers scaffolded yet)`;
  }

  return resolverIds
    .map((id) => {
      const key = JSON.stringify(id);
      return `  ${key}: async (parent, args, ctx) => {\n    console.log('[aggo] resolver', ${key}, { parent, args });\n    return null;\n  },`;
    })
    .join('\n');
}

export function replaceRegion(args: { contents: string; start: string; end: string; replacement: string }): string {
  const { contents, start, end, replacement } = args;
  const startIdx = contents.indexOf(start);
  const endIdx = contents.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return contents;

  const before = contents.slice(0, startIdx + start.length);
  const after = contents.slice(endIdx);
  return `${before}\n${replacement}\n${after}`;
}

export function renderUserResolversFile(resolverIds: string[]): string {
  const header = `// User-editable GraphQL resolver registry for Aggo runtime\n// Generated/updated by the Aggo VS Code extension.\n//\n// Notes:\n// - Only the region between ${AGGO_GRAPHQL_RESOLVERS_REGION_START} and ${AGGO_GRAPHQL_RESOLVERS_REGION_END} is regenerated.\n// - Add custom code outside that region to keep it stable across codegen.\n`;

  return `${header}\nimport type { GraphQLFieldResolver } from 'graphql';\n\nexport type ResolverFn = GraphQLFieldResolver<any, any>;\n\nexport const resolverRegistry: Record<string, ResolverFn> = {\n${AGGO_GRAPHQL_RESOLVERS_REGION_START}\n${renderResolverStubs(resolverIds)}\n${AGGO_GRAPHQL_RESOLVERS_REGION_END}\n};\n`;
}

export function upsertResolverRegion(existing: string | undefined, resolverIds: string[]): { updated: string; changed: boolean } {
  const base = renderUserResolversFile(resolverIds);
  if (!existing) return { updated: base, changed: true };

  if (existing.includes(AGGO_GRAPHQL_RESOLVERS_REGION_START) && existing.includes(AGGO_GRAPHQL_RESOLVERS_REGION_END)) {
    const updated = replaceRegion({
      contents: existing,
      start: AGGO_GRAPHQL_RESOLVERS_REGION_START,
      end: AGGO_GRAPHQL_RESOLVERS_REGION_END,
      replacement: renderResolverStubs(resolverIds)
    });
    return { updated, changed: updated !== existing };
  }

  // If it exists but has no region markers, leave it untouched.
  return { updated: existing, changed: false };
}

export function computeSchemaPathLiteral(args: { runtimeRootAbs: string; schemaFsPath: string }): string {
  const rel = path.relative(args.runtimeRootAbs, args.schemaFsPath).split(path.sep).join('/');
  const relLiteral = rel.startsWith('.') ? rel : `./${rel}`;
  return relLiteral;
}
