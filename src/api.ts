import type { FastifyInstance } from "fastify";
import type { McpManager } from "./manager.js";
import type { McpServerConfig } from "./types.js";
import { readLogs, watchLogs, getStats } from "./logger.js";
import { loadConfig, saveConfig, addServer, removeServer, updateServer } from "./config.js";

interface LogsQuery {
  limit?: string;
  offset?: string;
  mcp?: string;
  success?: string;
}

interface AddServerBody {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

interface UpdateServerBody {
  enabled?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export function registerApiRoutes(app: FastifyInstance, manager: McpManager): void {
  // ============ LOGS API ============

  app.get<{ Querystring: LogsQuery }>("/api/logs", async (request) => {
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
    const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;
    const mcpFilter = request.query.mcp;
    const successFilter = request.query.success;

    let entries = readLogs();

    // Apply filters
    if (mcpFilter) {
      entries = entries.filter((e) => e.mcp === mcpFilter);
    }
    if (successFilter !== undefined) {
      const successBool = successFilter === "true";
      entries = entries.filter((e) => e.success === successBool);
    }

    const total = entries.length;

    // Apply pagination (from the end, since logs are chronological)
    if (offset > 0) {
      entries = entries.slice(0, -offset);
    }
    if (limit > 0) {
      entries = entries.slice(-limit);
    }

    return {
      entries,
      total,
      limit,
      offset,
    };
  });

  app.get("/api/logs/stream", async (request, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");

    // Send initial connection message
    reply.raw.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    const cleanup = await watchLogs((entry) => {
      reply.raw.write(`data: ${JSON.stringify({ type: "log", entry })}\n\n`);
    });

    request.raw.on("close", () => {
      cleanup();
    });

    // Keep connection open - don't return/resolve
    return reply;
  });

  // ============ STATS API ============

  app.get("/api/stats", async () => {
    return getStats();
  });

  // ============ SERVERS API ============

  app.get("/api/servers", async () => {
    const config = loadConfig();
    const connected = manager.getConnectedMcps();

    return {
      servers: config.servers.map((s) => ({
        ...s,
        connected: connected.includes(s.name),
      })),
    };
  });

  app.post<{ Body: AddServerBody }>("/api/servers", async (request, reply) => {
    const { name, command, args = [], env = {}, enabled = true } = request.body;

    if (!name || !command) {
      reply.status(400);
      return { error: "name and command are required" };
    }

    const config = loadConfig();

    try {
      const server: McpServerConfig = { name, command, args, env, enabled };
      addServer(config, server);
      saveConfig(config);
      return { success: true, server };
    } catch (e) {
      reply.status(409);
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });

  app.delete<{ Params: { name: string } }>("/api/servers/:name", async (request, reply) => {
    const { name } = request.params;
    const config = loadConfig();

    try {
      const removed = removeServer(config, name);
      saveConfig(config);
      return { success: true, server: removed };
    } catch (e) {
      reply.status(404);
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });

  app.patch<{ Params: { name: string }; Body: UpdateServerBody }>("/api/servers/:name", async (request, reply) => {
    const { name } = request.params;
    const updates = request.body;
    const config = loadConfig();

    try {
      const updated = updateServer(config, name, updates);
      saveConfig(config);
      return { success: true, server: updated };
    } catch (e) {
      reply.status(404);
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ============ RELOAD API ============

  app.post("/api/reload", async () => {
    // Shutdown all current connections
    await manager.shutdownAll();

    // Reload config and reconnect
    const config = loadConfig();
    await manager.connectAll(config);

    const connected = manager.getConnectedMcps();

    return {
      success: true,
      connected,
      message: `Reconnected to ${connected.length} server(s)`,
    };
  });
}
