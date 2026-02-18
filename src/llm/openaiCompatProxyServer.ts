import * as http from 'http';
import { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import { buildChatCompletionResponse, createOpenAiError, toOpenAiModels, validateOpenAiTools, getProxyTools } from './openaiProxyMapper';
import { LmProxyHost, OpenAiChatCompletionRequest } from './openaiProxyTypes';

const MAX_BODY_SIZE_BYTES = 1024 * 1024;

class ProxyHttpError extends Error {
  readonly statusCode: number;
  readonly errorType: string;
  readonly code?: string;

  constructor(statusCode: number, message: string, errorType = 'invalid_request_error', code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.code = code;
  }
}

export interface OpenAiCompatProxyOptions {
  port: number;
  host?: string;
  apiKeys: string[];
  lmHost: LmProxyHost;
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

export class OpenAiCompatProxyServer {
  private readonly logger: Pick<Console, 'log' | 'warn' | 'error'>;
  private readonly lmHost: LmProxyHost;
  private readonly host: string;

  private apiKeys: Set<string>;
  private port: number;
  private server: http.Server | undefined;

  constructor(opts: OpenAiCompatProxyOptions) {
    this.port = opts.port;
    this.host = opts.host ?? '127.0.0.1';
    this.apiKeys = new Set((opts.apiKeys ?? []).filter(Boolean));
    this.lmHost = opts.lmHost;
    this.logger = opts.logger ?? console;
  }

  updateConfig(opts: { port: number; apiKeys: string[] }) {
    this.port = opts.port;
    this.apiKeys = new Set((opts.apiKeys ?? []).filter(Boolean));
  }

  getPort(): number {
    if (!this.server) return this.port;
    const address = this.server.address();
    if (!address || typeof address === 'string') return this.port;
    return address.port;
  }

  isRunning(): boolean {
    return Boolean(this.server?.listening);
  }

  async start(): Promise<number> {
    if (this.server?.listening) {
      return this.getPort();
    }

    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.server?.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        this.server?.off('error', onError);
        resolve();
      };
      this.server?.once('error', onError);
      this.server?.once('listening', onListening);
      this.server?.listen(this.port, this.host);
    });

    this.logger.log(`[aggo][llm-proxy] started on http://${this.host}:${this.getPort()}/v1`);
    return this.getPort();
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = undefined;

    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.logger.log('[aggo][llm-proxy] stopped');
  }

  async restart(): Promise<number> {
    await this.stop();
    return this.start();
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const method = req.method ?? 'GET';
      const rawUrl = req.url ?? '/';
      const parsedUrl = new URL(rawUrl, `http://${this.host}`);

      this.checkAuth(req);

      if (method === 'GET' && parsedUrl.pathname === '/v1/models') {
        const models = await this.lmHost.listModels();
        this.sendJson(res, 200, toOpenAiModels(models));
        return;
      }

      if (method === 'GET' && parsedUrl.pathname === '/v1/tools') {
        const proxyTools = getProxyTools();
        let hostTools: any[] = [];

        // If the LM host exposes tools (via LmProxyHost.listTools), include them.
        if (typeof (this.lmHost as any).listTools === 'function') {
          try {
            hostTools = (await (this.lmHost as any).listTools()) || [];
          } catch (e) {
            this.logger.warn('[aggo][llm-proxy] failed to get host tools', e);
            hostTools = [];
          }
        }

        // Normalize host tools into OpenAI `function` schema if they aren't already.
        const normalizedHostTools = (hostTools ?? []).map((t: any) => {
          if (t?.type === 'function' && t?.function) return t;
          const params = t?.function?.parameters ?? t?.parameters ?? t?.inputSchema ?? t?.schema ?? {};
          return { type: 'function', function: { name: t?.name ?? (t?.function && t.function.name), description: t?.description ?? '', parameters: params } };
        }).filter(Boolean);

        // Merge host tools (authoritative) + proxy fallback tools (dedupe by name)
        const merged: any[] = [];
        const seen = new Set<string>();
        for (const t of normalizedHostTools) {
          const n = t?.function?.name;
          if (!n || seen.has(n)) continue;
          seen.add(n);
          merged.push(t);
        }
        for (const t of proxyTools) {
          const n = t?.function?.name;
          if (!n || seen.has(n)) continue;
          seen.add(n);
          merged.push(t);
        }

        this.sendJson(res, 200, { tools: merged });
        return;
      }

      if (method === 'POST' && parsedUrl.pathname === '/v1/chat/completions') {
        const body = await this.readJsonBody(req);
        await this.handleChatCompletions(req, res, body);
        return;
      }

      if (method === 'POST' && parsedUrl.pathname === '/v1/tool_calls') {
        const body = await this.readJsonBody(req);
        await this.handleToolCall(req, res, body);
        return;
      }

      this.sendJson(res, 404, createOpenAiError('Endpoint not found', 'invalid_request_error', 'not_found'));
    } catch (err) {
      this.writeError(res, err);
    }
  }

  private checkAuth(req: http.IncomingMessage) {
    if (this.apiKeys.size === 0) return;

    const authHeader = req.headers.authorization;
    const xApiKey = req.headers['x-api-key'];
    const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const keyFromHeader = typeof xApiKey === 'string' ? xApiKey.trim() : '';
    const providedKey = bearer || keyFromHeader;

    if (!providedKey || !this.apiKeys.has(providedKey)) {
      throw new ProxyHttpError(401, 'Invalid API key', 'authentication_error', 'invalid_api_key');
    }
  }

  private async handleChatCompletions(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: OpenAiChatCompletionRequest
  ): Promise<void> {
    this.validateChatRequest(body);

    // If the client provided a `function_call` hint, inject a short system message to
    // encourage the model to emit a function/tool call (helps models that otherwise
    // produce plan-text instead of structured tool_call objects).
    if (body.function_call && typeof body.function_call === 'object' && body.function_call.name) {
      const hint = `When responding, call the function named \"${String(body.function_call.name)}\" and return only a function/tool call in OpenAI function-calling format. Do not emit assistant text.`;
      body.messages = Array.isArray(body.messages) ? [{ role: 'system', content: hint }, ...body.messages] : [{ role: 'system', content: hint }];
    }

    const requestId = `chatcmpl-${randomUUID()}`;
    const abortController = new AbortController();
    const onClientClose = () => abortController.abort();
    req.on('close', onClientClose);

    try {
      if (body.stream) {
        await this.streamChatCompletion(res, requestId, body, abortController.signal);
        return;
      }

      const result = await this.lmHost.complete(body, abortController.signal);
      const response = buildChatCompletionResponse({
        id: requestId,
        model: result.model ?? body.model ?? 'copilot',
        content: result.content,
        toolCalls: result.toolCalls,
        finishReason: result.finishReason,
        usage: result.usage
      });
      this.sendJson(res, 200, response);
    } finally {
      req.off('close', onClientClose);
    }
  }

  private async handleToolCall(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
    // Expected body: { id?: string, name: string, arguments?: object }
    if (!body || typeof body !== 'object') {
      throw new ProxyHttpError(400, 'Request body must be a JSON object');
    }
    const name = typeof body.name === 'string' ? body.name : undefined;
    const args = body.arguments ?? body.args ?? {};
    if (!name) {
      throw new ProxyHttpError(400, 'tool call must include a `name` string');
    }

    if (typeof (this.lmHost as any).executeTool !== 'function') {
      throw new ProxyHttpError(501, `Tool execution not supported by host: ${name}`);
    }

    const abortController = new AbortController();
    const onClientClose = () => abortController.abort();
    req.on('close', onClientClose);

    try {
      const result = await (this.lmHost as any).executeTool(name, args, abortController.signal);
      this.sendJson(res, 200, { id: body.id ?? null, result });
    } finally {
      req.off('close', onClientClose);
    }
  }

  private async streamChatCompletion(
    res: http.ServerResponse,
    requestId: string,
    request: OpenAiChatCompletionRequest,
    signal: AbortSignal
  ): Promise<void> {
    const model = request.model ?? 'copilot';

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform'
    });

    for await (const chunk of this.lmHost.streamComplete(request, signal)) {
      if (signal.aborted) break;

      const payload = {
        id: requestId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: {
              ...(chunk.delta ? { content: chunk.delta } : {}),
              ...(chunk.toolCalls?.length
                ? {
                    tool_calls: chunk.toolCalls.map((toolCall) => ({
                      id: toolCall.id,
                      type: 'function',
                      function: {
                        name: toolCall.name,
                        arguments: toolCall.arguments
                      }
                    }))
                  }
                : {})
            },
            finish_reason: chunk.finishReason ?? null
          }
        ]
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  }

  private validateChatRequest(body: OpenAiChatCompletionRequest) {
    if (!body || typeof body !== 'object') {
      throw new ProxyHttpError(400, 'Request body must be a JSON object');
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw new ProxyHttpError(400, 'messages must be a non-empty array');
    }

    // Validate optional `tools` array early and give a helpful 400 if invalid
    const toolErrors = validateOpenAiTools((body as any).tools);
    if (toolErrors.length > 0) {
      throw new ProxyHttpError(400, `Invalid tools schema: ${toolErrors.join('; ')}`);
    }
  }

  private async readJsonBody(req: http.IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.byteLength;
      if (size > MAX_BODY_SIZE_BYTES) {
        throw new ProxyHttpError(413, 'Request body too large');
      }
      chunks.push(buf);
    }

    if (chunks.length === 0) return {};

    let parsed: any;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new ProxyHttpError(400, 'Invalid JSON body');
    }
    return parsed;
  }

  private writeError(res: http.ServerResponse, err: unknown) {
    if (res.writableEnded) return;

    if (err instanceof ProxyHttpError) {
      this.sendJson(res, err.statusCode, createOpenAiError(err.message, err.errorType, err.code));
      return;
    }

    const asAny = err as any;
    const message = asAny?.message ? String(asAny.message) : 'Internal server error';
    if (/rate limit/i.test(message)) {
      this.sendJson(res, 429, createOpenAiError(message, 'rate_limit_error', 'rate_limited'));
      return;
    }
    if (/model.+not.+found|unknown model/i.test(message)) {
      this.sendJson(res, 404, createOpenAiError(message, 'invalid_request_error', 'model_not_found'));
      return;
    }
    if (/aborted|cancelled|canceled/i.test(message)) {
      this.sendJson(res, 499, createOpenAiError(message, 'request_aborted', 'request_aborted'));
      return;
    }

    this.logger.error('[aggo][llm-proxy] unhandled error', err);
    this.sendJson(res, 500, createOpenAiError(message, 'server_error', 'internal_error'));
  }

  private sendJson(res: http.ServerResponse, statusCode: number, payload: unknown) {
    if (res.writableEnded) return;
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
  }
}

export function getAddressInfo(server: OpenAiCompatProxyServer): AddressInfo | undefined {
  const port = server.getPort();
  if (!port) return undefined;
  return { address: '127.0.0.1', family: 'IPv4', port };
}
