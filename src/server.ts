import * as readline from "node:readline";
import type { Config } from "./types.js";
import { McpManager } from "./manager.js";
import { Router } from "./router.js";
import type { JsonRpcRequest } from "./types.js";
import { ErrorCodes } from "./types.js";

export async function runStdioServer(config: Config): Promise<void> {
  const manager = new McpManager();
  await manager.connectAll(config);

  const connected = manager.getConnectedMcps();
  if (connected.length === 0) {
    console.error("No MCP servers connected. Add servers with 'mcp-bridge add'");
  } else {
    console.error(`Connected to ${connected.length} MCP servers: ${connected.join(", ")}`);
  }

  const router = new Router(manager);

  const rl = readline.createInterface({ input: process.stdin });

  console.error("MCP bridge ready, waiting for requests on stdin");

  rl.on("line", async (line) => {
    if (!line.trim()) return;

    try {
      const request = JSON.parse(line) as JsonRpcRequest;
      const isNotification = request.id === undefined;

      const response = await router.handleRequest(request);

      if (!isNotification) {
        console.log(JSON.stringify(response));
      }
    } catch (e) {
      console.error("Failed to parse request:", line);
      console.log(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: ErrorCodes.PARSE_ERROR,
            message: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
          },
        })
      );
    }
  });

  rl.on("close", async () => {
    console.error("stdin closed, shutting down");
    await manager.shutdownAll();
    process.exit(0);
  });
}
