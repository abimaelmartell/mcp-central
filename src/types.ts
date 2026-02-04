// JSON-RPC types

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// MCP types

export interface InitializeParams {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: { name: string; version: string };
}

export interface ClientCapabilities {
  roots?: { listChanged?: boolean };
  sampling?: object;
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: { name: string; version: string };
}

export interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema: object;
}

export interface ToolsListResult {
  tools: Tool[];
}

export interface ToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface ToolCallResult {
  content: ToolContent[];
  isError?: boolean;
}

export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };

// Error codes
export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// Config types

export interface Config {
  settings: Settings;
  servers: McpServerConfig[];
}

export interface Settings {
  logLevel: string;
  daemonPort: number;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

// Namespacing

export const NAMESPACE_SEPARATOR = "__";

export function namespaceTools(mcpName: string, toolName: string): string {
  return `${mcpName}${NAMESPACE_SEPARATOR}${toolName}`;
}

export function parseNamespacedTool(namespaced: string): { mcp: string; tool: string } | null {
  const idx = namespaced.indexOf(NAMESPACE_SEPARATOR);
  if (idx === -1) return null;
  return {
    mcp: namespaced.slice(0, idx),
    tool: namespaced.slice(idx + NAMESPACE_SEPARATOR.length),
  };
}
