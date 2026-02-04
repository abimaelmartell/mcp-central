import type { McpManager } from "./manager.js";
import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";
import { ErrorCodes } from "./types.js";

export class Router {
  constructor(private manager: McpManager) {}

  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const id = request.id;

    switch (request.method) {
      case "initialize":
        return this.handleInitialize(id);

      case "notifications/initialized":
        return { jsonrpc: "2.0", id, result: {} };

      case "tools/list":
        return this.handleToolsList(id);

      case "tools/call":
        return this.handleToolsCall(id, request.params as Record<string, unknown> | undefined);

      case "ping":
        return { jsonrpc: "2.0", id, result: {} };

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: ErrorCodes.METHOD_NOT_FOUND,
            message: `Method not found: ${request.method}`,
          },
        };
    }
  }

  private handleInitialize(id?: string | number): JsonRpcResponse {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: "mcp-central",
          version: "0.1.0",
        },
      },
    };
  }

  private handleToolsList(id?: string | number): JsonRpcResponse {
    const tools = this.manager.listAllTools();
    return {
      jsonrpc: "2.0",
      id,
      result: { tools },
    };
  }

  private async handleToolsCall(
    id: string | number | undefined,
    params: Record<string, unknown> | undefined
  ): Promise<JsonRpcResponse> {
    if (!params?.name || typeof params.name !== "string") {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: ErrorCodes.INVALID_PARAMS,
          message: "Missing 'name' in tools/call params",
        },
      };
    }

    try {
      const result = await this.manager.callTool(
        params.name,
        (params.arguments as Record<string, unknown>) ?? {}
      );
      return { jsonrpc: "2.0", id, result };
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: e instanceof Error ? e.message : String(e),
        },
      };
    }
  }
}
