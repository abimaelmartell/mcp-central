import Fastify from "fastify";
import type { Config, JsonRpcRequest } from "./types.js";
import { McpManager } from "./manager.js";
import { Router } from "./router.js";

export async function runDaemon(config: Config, port: number): Promise<void> {
  const manager = new McpManager();
  await manager.connectAll(config);

  const connected = manager.getConnectedMcps();
  if (connected.length === 0) {
    console.error("No MCP servers connected. Add servers with 'mcp-central add'");
  } else {
    console.error(`Connected to ${connected.length} MCP servers: ${connected.join(", ")}`);
  }

  const router = new Router(manager);

  const app = Fastify({ logger: false });

  app.get("/health", async () => {
    return {
      status: "ok",
      service: "mcp-central",
      version: "0.1.0",
      connected: manager.getConnectedMcps(),
    };
  });

  app.post("/mcp", async (request) => {
    const jsonRpcRequest = request.body as JsonRpcRequest;
    return router.handleRequest(jsonRpcRequest);
  });

  app.get("/tools", async () => {
    return { tools: manager.listAllTools() };
  });

  try {
    await app.listen({ port, host: "0.0.0.0" });
    console.error(`MCP bridge daemon listening on http://0.0.0.0:${port}`);
    console.error("Endpoints: /health, /mcp (POST), /tools");
  } catch (err) {
    console.error("Failed to start daemon:", err);
    process.exit(1);
  }
}
