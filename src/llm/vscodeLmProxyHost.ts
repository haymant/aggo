import * as vscode from 'vscode';
import { toLmMessages } from './openaiProxyMapper';
import {
  LmProxyHost,
  ModelInfo,
  OpenAiChatCompletionRequest,
  ProxyChatResult,
  ProxyStreamEvent,
  ProxyToolCall
} from './openaiProxyTypes';

function normalizeToolCalls(part: any): ProxyToolCall[] {
  const source = part?.toolCalls ?? part?.tool_calls ?? part?.toolCall ?? [];
  const calls = Array.isArray(source) ? source : [source];
  const normalized: ProxyToolCall[] = [];

  for (const call of calls) {
    const fn = call?.function ?? call;
    const id = String(call?.id ?? fn?.id ?? `call_${Math.random().toString(36).slice(2, 8)}`);
    const name = String(fn?.name ?? call?.name ?? 'tool');
    const args = typeof fn?.arguments === 'string'
      ? fn.arguments
      : JSON.stringify(fn?.arguments ?? call?.arguments ?? {});
    normalized.push({ id, name, arguments: args });
  }

  return normalized;
}

function toAbortToken(signal: AbortSignal): vscode.CancellationToken {
  const source = new vscode.CancellationTokenSource();
  if (signal.aborted) {
    source.cancel();
  } else {
    signal.addEventListener('abort', () => source.cancel(), { once: true });
  }
  return source.token;
}

export class VscodeLmProxyHost implements LmProxyHost {
  async listModels(): Promise<ModelInfo[]> {
    const lm = (vscode as any).lm;
    if (!lm?.selectChatModels) {
      return [{ id: 'copilot', object: 'model', owned_by: 'copilot' }];
    }

    const models = await lm.selectChatModels({ vendor: 'copilot' });
    return (models ?? []).map((model: any) => ({
      id: String(model?.id ?? model?.name ?? 'copilot'),
      object: 'model',
      owned_by: 'copilot'
    }));
  }

  // Expose host-registered LM tools (when available) as OpenAI-style `function` schemas.
  async listTools(): Promise<any[]> {
    const lm = (vscode as any).lm;
    if (!lm?.tools || !Array.isArray(lm.tools)) return [];

    return (lm.tools as any[]).map((t) => {
      const params = t?.inputSchema ?? t?.parameters ?? t?.schema ?? {};
      return {
        type: 'function',
        function: {
          name: String(t?.name ?? t?.function?.name ?? ''),
          description: String(t?.description ?? ''),
          parameters: params || { type: 'object' }
        }
      };
    });
  }

  // Execute a small set of host-supported tools on behalf of the proxy/client.
  // For tools the host doesn't support, return an error.
  async executeTool(name: string, args: any): Promise<any> {
    // Implement safe, whitelisted tool executions here.
    if (name === 'readFile') {
      const filePath = String(args?.path ?? '');
      if (!filePath) throw new Error('readFile requires `path` argument');

      // Resolve relative to first workspace folder when possible
      const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
      const base = workspaceFolders[0]?.uri?.fsPath ?? process.cwd();
      const resolved = require('path').isAbsolute(filePath) ? filePath : require('path').join(base, filePath);

      const buf = await require('fs').promises.readFile(resolved);
      return { status: 200, body: buf.toString('utf8') };
    }

    // If the LM host itself exposes execution, prefer to call it (experimental API)
    const lm = (vscode as any).lm;
    if (lm?.tools && Array.isArray(lm.tools)) {
      const t = (lm.tools as any[]).find((x) => String(x?.name) === name);
      if (t && typeof t?.call === 'function') {
        // Some hosts may expose a `call` function on the tool descriptor — attempt to use it.
        return await t.call(args);
      }
    }

    throw new Error(`Tool not available: ${name}`);
  }

  async complete(request: OpenAiChatCompletionRequest, signal: AbortSignal): Promise<ProxyChatResult> {
    let content = '';
    const toolCalls: ProxyToolCall[] = [];
    let finishReason: ProxyChatResult['finishReason'] = 'stop';
    let selectedModel = request.model ?? 'copilot';

    for await (const event of this.streamComplete(request, signal)) {
      if (event.delta) content += event.delta;
      if (event.toolCalls?.length) {
        toolCalls.push(...event.toolCalls);
        finishReason = 'tool_calls';
      }
      if (event.finishReason) finishReason = event.finishReason;
    }

    return {
      model: selectedModel,
      content,
      toolCalls,
      finishReason
    };
  }

  async *streamComplete(request: OpenAiChatCompletionRequest, signal: AbortSignal): AsyncIterable<ProxyStreamEvent> {
    const lm = (vscode as any).lm;
    if (!lm?.selectChatModels) {
      throw new Error('vscode.lm API is not available in this VS Code version');
    }

    const allModels = await lm.selectChatModels({ vendor: 'copilot' });
    if (!Array.isArray(allModels) || allModels.length === 0) {
      throw new Error('No chat models available');
    }

    const selected = request.model
      ? allModels.find((model: any) => String(model?.id ?? model?.name) === request.model)
      : allModels[0];
    if (!selected) {
      throw new Error(`Model not found: ${request.model}`);
    }

    const messages = toLmMessages(request.messages);
    const options: any = {
      temperature: request.temperature,
      topP: request.top_p,
      maxOutputTokens: request.max_tokens,
      // map OpenAI-style tools -> LanguageModelChatTool[] for vscode.lm
      tools: require('./openaiProxyMapper').openAiToolsToLmTools(request.tools)
    };

    const token = toAbortToken(signal);
    const response = await selected.sendRequest(messages, options, token);
    const stream = response?.stream ?? response;
    if (!stream?.[Symbol.asyncIterator]) {
      if (typeof response?.text === 'string') {
        yield { delta: response.text, finishReason: 'stop' };
        return;
      }
      return;
    }

    for await (const part of stream) {
      if (signal.aborted) break;

      if (typeof part === 'string') {
        yield { delta: part };
        continue;
      }

      const text = typeof part?.value === 'string'
        ? part.value
        : typeof part?.text === 'string'
          ? part.text
          : undefined;
      if (text) {
        yield { delta: text };
      }

      const tools = normalizeToolCalls(part);
      if (tools.length > 0) {
        yield { toolCalls: tools, finishReason: 'tool_calls' };
      }
    }

    yield { finishReason: 'stop' };
  }
}
