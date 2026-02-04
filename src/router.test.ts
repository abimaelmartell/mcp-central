import { describe, it, expect, vi } from "vitest";
import { Router } from "./router.js";
import type { McpManager } from "./manager.js";
import { ErrorCodes } from "./types.js";

function createMockManager(tools = [{ name: "test__tool", description: "A test tool", inputSchema: {} }]) {
  return {
    listAllTools: vi.fn().mockReturnValue(tools),
    callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] }),
    getConnectedMcps: vi.fn().mockReturnValue(["test"]),
  } as unknown as McpManager;
}

describe("router", () => {
  describe("initialize", () => {
    it("should return server info", async () => {
      const router = new Router(createMockManager());
      const response = await router.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      });

      expect(response.result).toMatchObject({
        protocolVersion: "2024-11-05",
        serverInfo: { name: "mcp-central" },
      });
    });
  });

  describe("tools/list", () => {
    it("should return aggregated tools", async () => {
      const manager = createMockManager();
      const router = new Router(manager);

      const response = await router.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      });

      expect(manager.listAllTools).toHaveBeenCalled();
      expect(response.result).toEqual({
        tools: [{ name: "test__tool", description: "A test tool", inputSchema: {} }],
      });
    });
  });

  describe("tools/call", () => {
    it("should call the tool", async () => {
      const manager = createMockManager();
      const router = new Router(manager);

      const response = await router.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "test__tool", arguments: { foo: "bar" } },
      });

      expect(manager.callTool).toHaveBeenCalledWith("test__tool", { foo: "bar" });
      expect(response.result).toEqual({ content: [{ type: "text", text: "result" }] });
    });

    it("should error if name is missing", async () => {
      const router = new Router(createMockManager());

      const response = await router.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {},
      });

      expect(response.error?.code).toBe(ErrorCodes.INVALID_PARAMS);
    });
  });

  describe("unknown method", () => {
    it("should return method not found", async () => {
      const router = new Router(createMockManager());

      const response = await router.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "unknown/method",
      });

      expect(response.error?.code).toBe(ErrorCodes.METHOD_NOT_FOUND);
    });
  });
});
