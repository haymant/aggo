export function getDevServer() {
  // Let users override the dev server URL via env var. Default to localhost:5173.
  const httpUrl = process.env.VITE_DEV_SERVER_URL || process.env.AGGOV_DEV_SERVER_URL || 'http://localhost:5173';
  let wsUrl = httpUrl;
  if (wsUrl.startsWith('http://')) wsUrl = wsUrl.replace('http://', 'ws://');
  if (wsUrl.startsWith('https://')) wsUrl = wsUrl.replace('https://', 'wss://');
  return { httpUrl, wsUrl };
}
