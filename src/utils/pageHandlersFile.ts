export const AGGO_PAGE_HANDLERS_TAG = '@aggo-page-handlers';

export const AGGO_PAGE_HANDLER_FUNCS_START = `// ${AGGO_PAGE_HANDLERS_TAG}-functions-start`;
export const AGGO_PAGE_HANDLER_FUNCS_END = `// ${AGGO_PAGE_HANDLERS_TAG}-functions-end`;
export const AGGO_PAGE_HANDLER_MAP_START = `// ${AGGO_PAGE_HANDLERS_TAG}-map-start`;
export const AGGO_PAGE_HANDLER_MAP_END = `// ${AGGO_PAGE_HANDLERS_TAG}-map-end`;

export function isValidHandlerName(name: string): boolean {
  if (!name) return false;
  // Basic TS identifier validation.
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function replaceRegion(args: { contents: string; start: string; end: string; replacement: string }): string {
  const { contents, start, end, replacement } = args;
  const startIdx = contents.indexOf(start);
  const endIdx = contents.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return contents;

  const before = contents.slice(0, startIdx + start.length);
  const after = contents.slice(endIdx);
  return `${before}\n${replacement}\n${after}`;
}

export function renderPageHandlersFile(initialHandlers: string[] = []): string {
  const unique = Array.from(new Set(initialHandlers.filter(Boolean))).sort();
  const funcs = unique.length
    ? unique
        .map(
          (name) =>
            `export async function ${name}(ctx: AggoHandlerContext) {\n  console.log('[aggo] handler ${name}', ctx);\n}`
        )
        .join('\n\n')
    : `// Add handler functions here.\n// Example:\n// export async function onClick(ctx: AggoHandlerContext) {\n//   console.log('clicked', ctx);\n// }`;

  const mapEntries = unique.length ? unique.map((n) => `  ${n},`).join('\n') : `  // (no handlers yet)`;

  return `// User-editable per-page handlers\n// This file lives next to the route and is safe to edit.\n\nimport type { AggoHandlers, AggoHandlerContext } from '@aggo/core';\n\n${AGGO_PAGE_HANDLER_FUNCS_START}\n${funcs}\n${AGGO_PAGE_HANDLER_FUNCS_END}\n\nexport const handlers: AggoHandlers = {\n${AGGO_PAGE_HANDLER_MAP_START}\n${mapEntries}\n${AGGO_PAGE_HANDLER_MAP_END}\n};\n`;
}

export function listHandlersFromPageHandlersFile(contents: string): string[] {
  const startIdx = contents.indexOf(AGGO_PAGE_HANDLER_MAP_START);
  const endIdx = contents.indexOf(AGGO_PAGE_HANDLER_MAP_END);

  const out = new Set<string>();

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const region = contents.slice(startIdx + AGGO_PAGE_HANDLER_MAP_START.length, endIdx);
    for (const line of region.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      const m = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*,?$/);
      if (m?.[1]) out.add(m[1]);
    }
    return Array.from(out).sort();
  }

  // Fallback: any exported function/const.
  const re = /export\s+(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(|export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(contents))) {
    const name = match[1] || match[2];
    if (name) out.add(name);
  }
  return Array.from(out).sort();
}

export function addHandlerToPageHandlersFile(contents: string, handlerName: string): { updated: string; changed: boolean } {
  if (!isValidHandlerName(handlerName)) {
    throw new Error(`Invalid handler name: ${handlerName}`);
  }

  const existing = new Set(listHandlersFromPageHandlersFile(contents));
  if (existing.has(handlerName)) {
    return { updated: contents, changed: false };
  }

  if (!contents.includes(AGGO_PAGE_HANDLER_FUNCS_START) || !contents.includes(AGGO_PAGE_HANDLER_FUNCS_END)) {
    throw new Error(`handlers.ts missing required markers (${AGGO_PAGE_HANDLERS_TAG}). Recreate the file or add markers.`);
  }
  if (!contents.includes(AGGO_PAGE_HANDLER_MAP_START) || !contents.includes(AGGO_PAGE_HANDLER_MAP_END)) {
    throw new Error(`handlers.ts missing required markers (${AGGO_PAGE_HANDLERS_TAG}). Recreate the file or add markers.`);
  }

  // Patch functions region.
  const funcsStartIdx = contents.indexOf(AGGO_PAGE_HANDLER_FUNCS_START);
  const funcsEndIdx = contents.indexOf(AGGO_PAGE_HANDLER_FUNCS_END);
  const funcsRegion = contents.slice(funcsStartIdx + AGGO_PAGE_HANDLER_FUNCS_START.length, funcsEndIdx).trim();
  const newFunc = `export async function ${handlerName}(ctx: AggoHandlerContext) {\n  console.log('[aggo] handler ${handlerName}', ctx);\n}`;
  const nextFuncs = funcsRegion && !funcsRegion.startsWith('// Add handler functions here.')
    ? `${funcsRegion}\n\n${newFunc}`
    : newFunc;

  let updated = replaceRegion({
    contents,
    start: AGGO_PAGE_HANDLER_FUNCS_START,
    end: AGGO_PAGE_HANDLER_FUNCS_END,
    replacement: nextFuncs
  });

  // Patch map region.
  const mapStartIdx = updated.indexOf(AGGO_PAGE_HANDLER_MAP_START);
  const mapEndIdx = updated.indexOf(AGGO_PAGE_HANDLER_MAP_END);
  const mapRegion = updated.slice(mapStartIdx + AGGO_PAGE_HANDLER_MAP_START.length, mapEndIdx).trim();
  const lines = mapRegion
    ? mapRegion.split(/\r?\n/).filter((l) => !l.trim().startsWith('//'))
    : [];

  const entries = new Set<string>();
  for (const l of lines) {
    const m = l.trim().match(/^([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (m?.[1]) entries.add(m[1]);
  }
  entries.add(handlerName);

  const nextMap = Array.from(entries).sort().map((n) => `  ${n},`).join('\n');
  updated = replaceRegion({
    contents: updated,
    start: AGGO_PAGE_HANDLER_MAP_START,
    end: AGGO_PAGE_HANDLER_MAP_END,
    replacement: nextMap || '  // (no handlers yet)'
  });

  return { updated, changed: true };
}
