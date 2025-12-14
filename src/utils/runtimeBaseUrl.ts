export function extractLocalhostBaseUrl(text: string): string | undefined {
  // Common dev-server outputs:
  // - "Local:   http://localhost:5173/"
  // - "http://127.0.0.1:3000"
  // - "ready - started server on 0.0.0.0:3000, url: http://localhost:3000"
  const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/?/i);
  if (!match) return undefined;
  return match[0].replace(/\/$/, '');
}
