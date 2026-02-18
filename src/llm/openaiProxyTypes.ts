export type OpenAiRole = 'system' | 'user' | 'assistant' | 'tool';

export interface OpenAiMessage {
  role: OpenAiRole;
  content?: string | null;
  tool_call_id?: string;
  name?: string;
}

export interface OpenAiToolFunction {
  name: string;
  description?: string;
  parameters?: unknown;
}

export interface OpenAiTool {
  type: 'function';
  function: OpenAiToolFunction;
}

export interface OpenAiChatCompletionRequest {
  model?: string;
  messages?: OpenAiMessage[];
  tools?: OpenAiTool[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  // Optional OpenAI-style function_call hint. Can be { name: 'toolName' } or 'auto'.
  function_call?: { name?: string } | 'auto';
}

export interface ProxyToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ProxyChatResult {
  model?: string;
  content: string;
  toolCalls?: ProxyToolCall[];
  finishReason?: 'stop' | 'length' | 'tool_calls';
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface ProxyStreamEvent {
  delta?: string;
  toolCalls?: ProxyToolCall[];
  finishReason?: 'stop' | 'length' | 'tool_calls';
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface ModelInfo {
  id: string;
  object?: string;
  owned_by?: string;
}

export interface LmProxyHost {
  listModels(): Promise<ModelInfo[]>;
  complete(request: OpenAiChatCompletionRequest, signal: AbortSignal): Promise<ProxyChatResult>;
  streamComplete(request: OpenAiChatCompletionRequest, signal: AbortSignal): AsyncIterable<ProxyStreamEvent>;
  // Optional: host may expose a list of registered tools (vscode.lm.tools / MCP)
  listTools?(): Promise<any[]>;
  // Optional: execute a named tool with arguments and return a tool result object.
  executeTool?(name: string, args: any, signal?: AbortSignal): Promise<any>;
}
