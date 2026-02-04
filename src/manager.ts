import { StdioClient } from "./client.js";
import type { Config, McpServerConfig, Tool, ToolCallResult } from "./types.js";
import { namespaceTools, parseNamespacedTool } from "./types.js";
import { logToolCall } from "./logger.js";

export class McpManager {
  private clients = new Map<string, StdioClient>();

  async connectAll(config: Config): Promise<void> {
    const enabled = config.servers.filter((s) => s.enabled);

    for (const serverConfig of enabled) {
      try {
        await this.connect(serverConfig);
      } catch (e) {
        console.error(`Failed to connect to ${serverConfig.name}:`, e);
      }
    }
  }

  async connect(config: McpServerConfig): Promise<void> {
    console.error(`Connecting to MCP server: ${config.name}`);

    const client = new StdioClient(config);
    await client.start();

    const initResult = await client.initialize();
    console.error(`Connected to ${initResult.serverInfo.name} (${initResult.serverInfo.version})`);

    const tools = await client.listTools();
    console.error(`${config.name} provides ${tools.length} tools`);

    this.clients.set(config.name, client);
  }

  async disconnect(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.shutdown();
      this.clients.delete(name);
    }
  }

  listAllTools(): Tool[] {
    const allTools: Tool[] = [];

    for (const [mcpName, client] of this.clients) {
      for (const tool of client.tools) {
        allTools.push({
          name: namespaceTools(mcpName, tool.name),
          description: tool.description ? `[${mcpName}] ${tool.description}` : undefined,
          inputSchema: tool.inputSchema,
        });
      }
    }

    return allTools;
  }

  async callTool(namespacedName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const parsed = parseNamespacedTool(namespacedName);
    if (!parsed) {
      throw new Error(`Invalid tool name format: ${namespacedName}`);
    }

    const client = this.clients.get(parsed.mcp);
    if (!client) {
      throw new Error(`MCP server '${parsed.mcp}' not connected`);
    }

    const startTime = Date.now();
    let success = true;
    let error: string | undefined;

    try {
      const result = await client.callTool({ name: parsed.tool, arguments: args });
      success = !result.isError;
      return result;
    } catch (e) {
      success = false;
      error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      logToolCall({
        mcp: parsed.mcp,
        tool: parsed.tool,
        args,
        durationMs: Date.now() - startTime,
        success,
        error,
      });
    }
  }

  getConnectedMcps(): string[] {
    return Array.from(this.clients.keys());
  }

  async shutdownAll(): Promise<void> {
    for (const [name, client] of this.clients) {
      console.error(`Shutting down ${name}`);
      await client.shutdown();
    }
    this.clients.clear();
  }
}
