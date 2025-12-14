import * as path from 'path';

export const PAGE_ROOT_SEGMENTS = ['resources', 'page'] as const;

export function isPageFsPath(fsPath: string): boolean {
  return fsPath.endsWith('.page');
}

export function pageIdFromFsPath(workspaceRoot: string, pageFsPath: string): string {
  const rel = path.relative(workspaceRoot, pageFsPath);
  const normalized = rel.split(path.sep).join('/');
  const withoutExt = normalized.replace(/\.page$/i, '');

  const marker = PAGE_ROOT_SEGMENTS.join('/') + '/';
  const idx = withoutExt.indexOf(marker);
  if (idx === -1) {
    // If the file isn't under resources/page, use the basename without extension.
    return path.basename(withoutExt);
  }

  return withoutExt.slice(idx + marker.length);
}

export function pageUrlFromId(baseUrl: string, pageId: string): string {
  const trimmedBase = baseUrl.replace(/\/$/, '');
  const normalizedId = pageId.replace(/^\//, '');
  return `${trimmedBase}/aggo/page/${normalizedId}`;
}
