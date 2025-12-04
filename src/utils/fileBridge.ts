import { parseJsonText } from './schemaInference';

/**
 * Attempts to parse JSON/JSONC content so the webview receives structured data.
 * Falls back to the original string if parsing fails.
 */
export function normalizeBridgeContent(raw: string): unknown {
  if (typeof raw !== 'string' || raw.length === 0) {
    return raw;
  }
  try {
    const parsed = parseJsonText(raw);
    return typeof parsed === 'undefined' ? raw : parsed;
  } catch (_err) {
    return raw;
  }
}
