import { ModelInfo, OpenAiMessage, ProxyToolCall } from './openaiProxyTypes';

export function toLmMessages(messages: OpenAiMessage[] | undefined): Array<{ role: string; content: string }> {
  if (!Array.isArray(messages)) return [];

  return messages.map((m) => {
    if (m.role === 'tool') {
      const toolId = m.tool_call_id ? `tool_call_id=${m.tool_call_id} ` : '';
      return {
        role: 'user',
        content: `${toolId}${m.content ?? ''}`.trim()
      };
    }
    return { role: m.role, content: String(m.content ?? '') };
  });
}

export function toOpenAiToolCalls(toolCalls: ProxyToolCall[] | undefined): Array<{
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}> {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.map((call) => ({
    id: call.id,
    type: 'function',
    function: {
      name: call.name,
      arguments: call.arguments
    }
  }));
}

export function toOpenAiModels(models: ModelInfo[]): { object: 'list'; data: Array<{ id: string; object: 'model'; owned_by: string }> } {
  return {
    object: 'list',
    data: models.map((m) => ({
      id: m.id,
      object: 'model' as const,
      owned_by: m.owned_by ?? 'copilot'
    }))
  };
}

export function buildChatCompletionResponse(params: {
  id: string;
  model: string;
  content: string;
  toolCalls?: ProxyToolCall[];
  finishReason?: 'stop' | 'length' | 'tool_calls';
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}) {
  const mappedToolCalls = toOpenAiToolCalls(params.toolCalls);
  const hasToolCalls = mappedToolCalls.length > 0;

  return {
    id: params.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: params.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: hasToolCalls ? null : params.content,
          ...(hasToolCalls ? { tool_calls: mappedToolCalls } : {})
        },
        finish_reason: params.finishReason ?? (hasToolCalls ? 'tool_calls' : 'stop')
      }
    ],
    usage: {
      prompt_tokens: params.usage?.prompt_tokens ?? 0,
      completion_tokens: params.usage?.completion_tokens ?? 0,
      total_tokens: params.usage?.total_tokens ?? 0
    }
  };
}

export function createOpenAiError(message: string, type = 'invalid_request_error', code?: string) {
  return {
    error: {
      message,
      type,
      ...(code ? { code } : {})
    }
  };
}

// Convert OpenAI-style `tools` (function schema) into the
// `LanguageModelChatTool` shape expected by `vscode.lm`.
export function openAiToolsToLmTools(openAiTools: any[] | undefined) {
  if (!Array.isArray(openAiTools)) return undefined;

  const mapped: Array<{ name: string; description?: string; inputSchema?: object }> = [];
  for (const t of openAiTools) {
    try {
      const fn = t?.function ?? t;
      const name = typeof fn?.name === 'string' ? fn.name : undefined;
      if (!name) continue;
      const description = fn?.description ?? t?.description ?? '';
      const inputSchema = fn?.parameters ?? fn?.arguments ?? undefined;
      mapped.push({ name, description, inputSchema });
    } catch {
      // skip invalid tool entries
      continue;
    }
  }
  return mapped.length > 0 ? mapped : undefined;
}

// Validate OpenAI-style `tools` entries and return an array of human-readable
// error strings (empty array = valid).
export function validateOpenAiTools(openAiTools: any[] | undefined): string[] {
  const errors: string[] = [];
  if (openAiTools === undefined) return errors;
  if (!Array.isArray(openAiTools)) {
    errors.push('tools must be an array');
    return errors;
  }

  openAiTools.forEach((t, i) => {
    if (!t || typeof t !== 'object') {
      errors.push(`tools[${i}]: must be an object`);
      return;
    }

    if (t.type !== undefined && t.type !== 'function') {
      errors.push(`tools[${i}].type must be 'function' if provided`);
    }

    const fn = t.function ?? t;
    if (!fn || typeof fn !== 'object') {
      errors.push(`tools[${i}]: missing 'function' definition`);
      return;
    }

    if (typeof fn.name !== 'string' || fn.name.trim().length === 0) {
      errors.push(`tools[${i}].function.name must be a non-empty string`);
    }

    if (fn.parameters !== undefined && (typeof fn.parameters !== 'object' || Array.isArray(fn.parameters))) {
      errors.push(`tools[${i}].function.parameters must be an object (JSON Schema)`);
    }
  });

  return errors;
}

// Return proxy-provided tools (OpenAI `function` schema). Keep this empty for now —
// the proxy prefers host-registered `vscode.lm.tools`. Add fallbacks here only for
// extension-provided helper tools that the host does not expose.
export function getProxyTools() {
  return [] as any[];
}
