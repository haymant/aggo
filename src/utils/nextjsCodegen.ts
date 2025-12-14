import * as fs from 'fs';
import * as path from 'path';

import {
  renderPageHandlersFile,
  AGGO_PAGE_HANDLER_FUNCS_START,
  AGGO_PAGE_HANDLER_FUNCS_END,
  AGGO_PAGE_HANDLER_MAP_START,
  AGGO_PAGE_HANDLER_MAP_END
} from './pageHandlersFile';

export const AGGO_GENERATED_TAG = '@aggo-generated';
const AGGO_HANDLERS_REGION_START = `// ${AGGO_GENERATED_TAG}-handlers-start`;
const AGGO_HANDLERS_REGION_END = `// ${AGGO_GENERATED_TAG}-handlers-end`;

export type NextjsRuntimeLayout = {
  runtimeRoot: string;
  appDir: string;
  generatedDir: string;
};

export type NextjsCodegenOptions = {
  workspaceRoot: string;
  runtimeCwdAbs: string;
  /** If provided, used to confirm potentially-destructive operations. */
  confirm?: (message: string, kind: 'overwrite' | 'delete') => Promise<boolean>;
};

type ComponentRegistryEntry = {
  file?: string;
  name?: string;
  category?: string;
  icon?: string;
};

export function detectNextjsAppDir(runtimeRoot: string): string {
  const srcApp = path.join(runtimeRoot, 'src', 'app');
  if (fs.existsSync(srcApp)) return srcApp;
  const app = path.join(runtimeRoot, 'app');
  if (fs.existsSync(app)) return app;
  // Default for create-next-app when using --src-dir is src/app.
  return srcApp;
}

export function getNextjsLayout(opts: NextjsCodegenOptions): NextjsRuntimeLayout {
  const appDir = detectNextjsAppDir(opts.runtimeCwdAbs);
  const generatedDir = path.join(opts.runtimeCwdAbs, 'src', 'aggo', 'generated');
  return { runtimeRoot: opts.runtimeCwdAbs, appDir, generatedDir };
}

export function normalizePageId(pageId: string): string {
  let id = pageId.split('\\').join('/');
  while (id.startsWith('/')) id = id.slice(1);
  while (id.endsWith('/')) id = id.slice(0, -1);
  return id;
}

export function routeDirForPageId(appDir: string, pageId: string): string {
  const id = normalizePageId(pageId);
  const segments = id.length ? id.split('/') : ['index'];
  return path.join(appDir, 'aggo', 'page', ...segments);
}

function routeHandlersPathForPageId(appDir: string, pageId: string): string {
  const dir = routeDirForPageId(appDir, pageId);
  return path.join(dir, 'handlers.ts');
}

function routeClientTsxPathForPageId(appDir: string, pageId: string): string {
  const dir = routeDirForPageId(appDir, pageId);
  return path.join(dir, 'client.tsx');
}

export function isAggoGeneratedFile(contents: string): boolean {
  return contents.includes(AGGO_GENERATED_TAG);
}

async function safeReadText(filePath: string): Promise<string | undefined> {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function writeText(filePath: string, contents: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, contents, 'utf8');
}

async function safeReadJson(filePath: string): Promise<any | undefined> {
  const raw = await safeReadText(filePath);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function copyFileEnsuringDir(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.promises.copyFile(src, dest);
}

async function syncRuntimePluginArtifacts(opts: NextjsCodegenOptions): Promise<{ scripts: string[] }>{
  // Read workspace component registry (if present) and copy plugin JS files into runtime/public.
  const registryPath = path.join(opts.workspaceRoot, '.aggo', 'components', 'component_registry.json');
  const registry = (await safeReadJson(registryPath)) as Record<string, ComponentRegistryEntry> | undefined;
  if (!registry || typeof registry !== 'object') return { scripts: [] };

  const outScripts: string[] = [];
  const runtimePublic = path.join(opts.runtimeCwdAbs, 'public', 'aggo', 'plugins');
  await ensureDir(runtimePublic);

  for (const id of Object.keys(registry)) {
    const entry = registry[id];
    if (!entry) continue;
    const file = entry.file;
    if (!file || typeof file !== 'string') continue;

    const abs = file.startsWith('.') ? path.join(opts.workspaceRoot, file) : file;
    if (!fs.existsSync(abs)) continue;

    const dest = path.join(runtimePublic, `${id}.js`);
    await copyFileEnsuringDir(abs, dest);

    // cache-bust via mtime
    let v = '';
    try {
      const mtimeMs = fs.statSync(dest).mtimeMs;
      if (Number.isFinite(mtimeMs)) v = `?v=${encodeURIComponent(String(mtimeMs))}`;
    } catch {
      // ignore
    }
    outScripts.push(`/aggo/plugins/${encodeURIComponent(id)}.js${v}`);
  }

  return { scripts: outScripts };
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

function renderHandlerStubs(handlerIds: string[]): string {
  if (!handlerIds.length) {
    return `  // (no handlers referenced by pages yet)`;
  }

  return handlerIds
    .map((id) => {
      const key = JSON.stringify(id);
      return `  ${key}: async (ctx) => {\n    console.log('[aggo] handler', ${key}, ctx);\n  },`;
    })
    .join('\n');
}

async function ensureUserHandlersFile(opts: NextjsCodegenOptions, handlerIds: string[]): Promise<void> {
  const userHandlersPath = path.join(opts.runtimeCwdAbs, 'src', 'aggo', 'user', 'handlers.ts');
  const existing = await safeReadText(userHandlersPath);

  const header = `// User-editable handler registry for Aggo runtime\n// Generated/updated by the Aggo VS Code extension.\n//\n// Notes:\n// - Only the region between ${AGGO_HANDLERS_REGION_START} and ${AGGO_HANDLERS_REGION_END} is regenerated.\n// - Add custom code outside that region to keep it stable across codegen.\n`;

  const base = `${header}\nimport type { AggoHandlers } from '@aggo/core';\n\nexport const handlers: AggoHandlers = {\n${AGGO_HANDLERS_REGION_START}\n${renderHandlerStubs(handlerIds)}\n${AGGO_HANDLERS_REGION_END}\n};\n`;

  if (!existing) {
    await writeText(userHandlersPath, base);
    return;
  }

  // If the file exists, only patch the marked region.
  if (existing.includes(AGGO_HANDLERS_REGION_START) && existing.includes(AGGO_HANDLERS_REGION_END)) {
    const updated = replaceRegion({
      contents: existing,
      start: AGGO_HANDLERS_REGION_START,
      end: AGGO_HANDLERS_REGION_END,
      replacement: renderHandlerStubs(handlerIds)
    });
    await writeText(userHandlersPath, updated);
    return;
  }

  // If it exists but has no region markers, leave it untouched to avoid destructive edits.
}

async function ensureGeneratedHandlersModule(opts: NextjsCodegenOptions): Promise<void> {
  const layout = getNextjsLayout(opts);
  await ensureDir(layout.generatedDir);

  const handlersPath = path.join(layout.generatedDir, 'handlers.ts');
  const contents = `// ${AGGO_GENERATED_TAG}\n// Generated by the Aggo VS Code extension.\n// Thin wrapper over user-editable handlers.\n\nexport { handlers } from '@/aggo/user/handlers';\nexport type { AggoHandlers, AggoHandler, AggoHandlerContext } from '@aggo/core';\n`;

  const existing = await safeReadText(handlersPath);
  if (!existing || isAggoGeneratedFile(existing)) {
    await writeText(handlersPath, contents);
  }
}

function collectHandlerIdsFromElement(el: any, out: Set<string>): void {
  if (!el || typeof el !== 'object') return;

  const add = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.add(v.trim());
    if (v && typeof v === 'object') {
      const anyV = v as any;
      if (typeof anyV.handler === 'string' && anyV.handler.trim()) out.add(anyV.handler.trim());
      if (typeof anyV.id === 'string' && anyV.id.trim()) out.add(anyV.id.trim());
    }
  };

  const events = (el as any).events;
  if (events && typeof events === 'object') {
    for (const v of Object.values(events)) add(v);
  }

  const lifecycle = (el as any).lifecycle;
  if (lifecycle && typeof lifecycle === 'object') {
    for (const v of Object.values(lifecycle)) add(v);
  }

  const attrs = (el as any).attributes;
  if (attrs && typeof attrs === 'object') {
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('data-on-')) add(v);
      if (k === 'data-on-mount' || k === 'data-on-unmount') add(v);
    }
  }

  const children = (el as any).children;
  if (Array.isArray(children)) {
    for (const c of children) collectHandlerIdsFromElement(c, out);
  }
}

async function collectHandlerIdsFromPages(opts: NextjsCodegenOptions, pageIds: string[]): Promise<string[]> {
  const out = new Set<string>();
  for (const pageId of pageIds) {
    const id = normalizePageId(pageId);
    const filePath = path.join(opts.workspaceRoot, 'resources', 'page', id + '.page');
    const raw = await safeReadText(filePath);
    if (!raw) continue;
    try {
      const root = JSON.parse(raw);
      collectHandlerIdsFromElement(root, out);
    } catch {
      // ignore invalid JSON
    }
  }
  return Array.from(out).sort();
}

export async function ensureRuntimeGeneratedFiles(opts: NextjsCodegenOptions): Promise<void> {
  const layout = getNextjsLayout(opts);
  await ensureDir(layout.generatedDir);

  const loadPagePath = path.join(layout.generatedDir, 'loadPage.ts');
  const rendererPath = path.join(layout.generatedDir, 'renderer.tsx');
  const pluginsPath = path.join(layout.generatedDir, 'plugins.ts');
  const usePluginsPath = path.join(layout.generatedDir, 'usePlugins.tsx');

  const loadPage = `// ${AGGO_GENERATED_TAG}
// This file is generated by the Aggo VS Code extension.
// It loads *.page JSON files from the workspace and returns the parsed element tree.

import * as path from 'path';
import * as fs from 'fs/promises';

export type AggoPageElement = {
  id: string;
  tagName: string;
  attributes?: Record<string, string>;
  styles?: Record<string, string>;
  content?: string;
  children?: AggoPageElement[];
  // future: events/lifecycle/store
};

export async function loadAggoPageFromWorkspace(args: { workspaceRoot: string; pageId: string }): Promise<AggoPageElement> {
  // Strip leading slashes without using a regex literal to avoid tooling/parser edge cases.
  let pageId = args.pageId || '';
  while (pageId.startsWith('/')) pageId = pageId.slice(1);
  const filePath = path.join(args.workspaceRoot, 'resources', 'page', pageId + '.page');
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as AggoPageElement;
}
`;

  const { scripts: pluginScripts } = await syncRuntimePluginArtifacts(opts);

  const pluginsModule = `// ${AGGO_GENERATED_TAG}
// Generated by the Aggo VS Code extension.
// List of plugin script URLs to load in the runtime.

export const AGGO_PLUGIN_SCRIPTS: string[] = ${JSON.stringify(pluginScripts, null, 2)};
`;

  const usePlugins = `// ${AGGO_GENERATED_TAG}
// Generated by the Aggo VS Code extension.
// Client-side loader for Aggo plugin scripts (which populate window.__aggo_plugins__).

'use client';

import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { jsx as jsxRuntimeJsx, jsxs as jsxRuntimeJsxs, Fragment as jsxRuntimeFragment } from 'react/jsx-runtime';
import { AGGO_PLUGIN_SCRIPTS } from './plugins';

type PluginRegistry = Record<string, any>;

export function useAggoPlugins(): { registry: PluginRegistry } {
  const [, bump] = React.useState(0);

  React.useEffect(() => {
    const w = window as any;
    const g = globalThis as any;
    w.__aggo_plugins__ = w.__aggo_plugins__ || {};

    // Compatibility for prebuilt plugin bundles:
    // - Some expect window.React / window.ReactDOM
    // - Some expect automatic JSX runtime helpers (window.jsx/window.jsxs/window.Fragment)
    // - Some alias jsx to a short name like s.
    try {
      w.React = React;
      w.ReactDOM = ReactDOM;
      w.jsx = jsxRuntimeJsx;
      w.jsxs = jsxRuntimeJsxs;
      w.Fragment = jsxRuntimeFragment;
      w.s = jsxRuntimeJsx;

      // Some bundlers/plugins reference globals via globalThis.
      g.React = React;
      g.ReactDOM = ReactDOM;
      g.jsx = jsxRuntimeJsx;
      g.jsxs = jsxRuntimeJsxs;
      g.Fragment = jsxRuntimeFragment;
      g.s = jsxRuntimeJsx;
    } catch {
      // ignore
    }

    let cancelled = false;
    const loadOne = (src: string) => {
      try {
        // Dedup by exact src (including cache-bust query)
        const existing = Array.from(document.getElementsByTagName('script')).some((s) => s.src === src);
        if (existing) return;
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => {
          if (cancelled) return;
          bump((x) => x + 1);
        };
        s.onerror = () => {
          if (cancelled) return;
          bump((x) => x + 1);
        };
        document.head.appendChild(s);
      } catch {
        // ignore
      }
    };

    for (const src of AGGO_PLUGIN_SCRIPTS) {
      loadOne(src);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const w = typeof window !== 'undefined' ? (window as any) : ({} as any);
  w.__aggo_plugins__ = w.__aggo_plugins__ || {};
  return { registry: w.__aggo_plugins__ as PluginRegistry };
}
`;

  const renderer = `// ${AGGO_GENERATED_TAG}
// This file is generated by the Aggo VS Code extension.
// It wraps the single-source renderer from @aggo/core and injects runtime plugins.

'use client';

import * as React from 'react';
import { AggoPage as CoreAggoPage, AggoElementRenderer as CoreAggoElementRenderer } from '@aggo/core';
import type { AggoRendererHost, AggoPageElement } from '@aggo/core';
import { useAggoPlugins } from './usePlugins';

export { CoreAggoElementRenderer as AggoElementRenderer };
export type { AggoPageElement, AggoHandlers, AggoHandler, AggoHandlerContext, AggoStore } from '@aggo/core';

export function AggoPage(props: { root: AggoPageElement; host?: AggoRendererHost; initialState?: any }): React.ReactElement {
  const { registry } = useAggoPlugins();
  const host: AggoRendererHost = { ...(props.host ?? {}), components: registry };
  return React.createElement(CoreAggoPage as any, { root: props.root, host, initialState: props.initialState });
}
`;

  const existingLoadPage = await safeReadText(loadPagePath);
  if (!existingLoadPage || isAggoGeneratedFile(existingLoadPage)) {
    await writeText(loadPagePath, loadPage);
  }

  const existingPlugins = await safeReadText(pluginsPath);
  if (!existingPlugins || isAggoGeneratedFile(existingPlugins)) {
    await writeText(pluginsPath, pluginsModule);
  }

  const existingUsePlugins = await safeReadText(usePluginsPath);
  if (!existingUsePlugins || isAggoGeneratedFile(existingUsePlugins)) {
    await writeText(usePluginsPath, usePlugins);
  }

  const existingRenderer = await safeReadText(rendererPath);
  if (!existingRenderer || isAggoGeneratedFile(existingRenderer)) {
    await writeText(rendererPath, renderer);
  }

  await ensureGeneratedHandlersModule(opts);
}

function routePageTsx(args: { workspaceRoot: string; pageId: string }): string {
  const id = normalizePageId(args.pageId);
  return `// ${AGGO_GENERATED_TAG}
// Route for /aggo/page/${id}
// Generated by Aggo VS Code extension. Do not hand-edit unless you remove the ${AGGO_GENERATED_TAG} tag.

import { loadAggoPageFromWorkspace } from '@/aggo/generated/loadPage';
import { AggoPageClient } from './client';

export default async function AggoPageRoute() {
  const element = await loadAggoPageFromWorkspace({ workspaceRoot: ${JSON.stringify(args.workspaceRoot)}, pageId: ${JSON.stringify(id)} });
  return <AggoPageClient root={element} pageId={${JSON.stringify(id)}} />;
}
`;
}

function routeClientTsx(args: { pageId: string }): string {
  const id = normalizePageId(args.pageId);
  return `// ${AGGO_GENERATED_TAG}
// Client wrapper for /aggo/page/${id}
// Generated by Aggo VS Code extension.

'use client';

import * as React from 'react';
import { AggoPage } from '@/aggo/generated/renderer';
import type { AggoPageElement, AggoRendererHost } from '@aggo/core';
import { handlers } from './handlers';

export function AggoPageClient(props: { root: AggoPageElement; pageId: string; initialState?: any }): React.ReactElement {
  const host: AggoRendererHost = { pageId: props.pageId, handlers };
  return React.createElement(AggoPage as any, { root: props.root, host, initialState: props.initialState });
}
`;
}

async function ensureRouteHandlersFile(opts: NextjsCodegenOptions, pageId: string): Promise<void> {
  const layout = getNextjsLayout(opts);
  const handlersPath = routeHandlersPathForPageId(layout.appDir, pageId);
  const existing = await safeReadText(handlersPath);
  if (existing) return;

  const base = renderPageHandlersFile([]);
  // Sanity: ensure markers exist (defensive)
  if (!base.includes(AGGO_PAGE_HANDLER_FUNCS_START) || !base.includes(AGGO_PAGE_HANDLER_FUNCS_END)) {
    throw new Error('renderPageHandlersFile missing function markers');
  }
  if (!base.includes(AGGO_PAGE_HANDLER_MAP_START) || !base.includes(AGGO_PAGE_HANDLER_MAP_END)) {
    throw new Error('renderPageHandlersFile missing map markers');
  }

  await writeText(handlersPath, base);
}

async function ensureRouteClientModule(opts: NextjsCodegenOptions, pageId: string): Promise<void> {
  const layout = getNextjsLayout(opts);
  const filePath = routeClientTsxPathForPageId(layout.appDir, pageId);
  const nextContents = routeClientTsx({ pageId });

  const existing = await safeReadText(filePath);
  if (!existing || isAggoGeneratedFile(existing)) {
    await writeText(filePath, nextContents);
  }
}

export async function ensureRouteForPageId(opts: NextjsCodegenOptions, pageId: string): Promise<void> {
  const layout = getNextjsLayout(opts);
  await ensureRuntimeGeneratedFiles(opts);

  // Ensure per-page handlers and client wrapper exist.
  await ensureRouteHandlersFile(opts, pageId);
  await ensureRouteClientModule(opts, pageId);

  const dir = routeDirForPageId(layout.appDir, pageId);
  const filePath = path.join(dir, 'page.tsx');
  const nextContents = routePageTsx({ workspaceRoot: opts.workspaceRoot, pageId });

  const existing = await safeReadText(filePath);
  if (!existing) {
    await writeText(filePath, nextContents);
    return;
  }

  if (isAggoGeneratedFile(existing)) {
    await writeText(filePath, nextContents);
    return;
  }

  if (opts.confirm) {
    const ok = await opts.confirm(`Next.js route already exists and is not marked as generated: ${path.relative(opts.runtimeCwdAbs, filePath)}. Overwrite?`, 'overwrite');
    if (!ok) return;
    await writeText(filePath, nextContents);
  }
}

async function removeEmptyDirsUpward(startDir: string, stopDir: string): Promise<void> {
  let cur = startDir;
  const stop = path.resolve(stopDir);
  while (path.resolve(cur).startsWith(stop)) {
    const entries = await fs.promises.readdir(cur).catch(() => [] as string[]);
    if (entries.length > 0) break;
    await fs.promises.rmdir(cur).catch(() => undefined);
    const next = path.dirname(cur);
    if (next === cur) break;
    cur = next;
  }
}

export async function deleteRouteForPageId(opts: NextjsCodegenOptions, pageId: string): Promise<void> {
  const layout = getNextjsLayout(opts);
  const dir = routeDirForPageId(layout.appDir, pageId);
  const filePath = path.join(dir, 'page.tsx');

  const existing = await safeReadText(filePath);
  if (!existing) return;

  const isGenerated = isAggoGeneratedFile(existing);
  if (!isGenerated && opts.confirm) {
    const ok = await opts.confirm(`Next.js route exists but is not marked as generated: ${path.relative(opts.runtimeCwdAbs, filePath)}. Delete anyway?`, 'delete');
    if (!ok) return;
  }

  if (isGenerated && opts.confirm) {
    const ok = await opts.confirm(`Delete generated Next.js route for page '${normalizePageId(pageId)}'?`, 'delete');
    if (!ok) return;
  }

  await fs.promises.unlink(filePath).catch(() => undefined);
  await removeEmptyDirsUpward(dir, path.join(layout.appDir, 'aggo', 'page'));
}

export async function syncNextjsRoutes(opts: NextjsCodegenOptions, pageIds: string[]): Promise<void> {
  await ensureRuntimeGeneratedFiles(opts);
  const uniqueIds = Array.from(new Set(pageIds.map(normalizePageId))).filter(Boolean);

  for (const id of uniqueIds) {
    await ensureRouteForPageId(opts, id);
  }

  const handlerIds = await collectHandlerIdsFromPages(opts, uniqueIds);
  await ensureUserHandlersFile(opts, handlerIds);
}
