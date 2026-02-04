import { describe, it, expect } from "vitest";
import { addServer, removeServer, getEnabledServers } from "./config.js";
import type { Config, McpServerConfig } from "./types.js";

function createConfig(): Config {
  return {
    settings: { logLevel: "info", daemonPort: 3000 },
    servers: [],
  };
}

function createServer(name: string): McpServerConfig {
  return {
    name,
    command: "echo",
    args: ["hello"],
    env: {},
    enabled: true,
  };
}

describe("config", () => {
  describe("addServer", () => {
    it("should add a server", () => {
      const config = createConfig();
      addServer(config, createServer("test"));
      expect(config.servers).toHaveLength(1);
      expect(config.servers[0].name).toBe("test");
    });

    it("should throw if server already exists", () => {
      const config = createConfig();
      addServer(config, createServer("test"));
      expect(() => addServer(config, createServer("test"))).toThrow("already exists");
    });
  });

  describe("removeServer", () => {
    it("should remove a server", () => {
      const config = createConfig();
      addServer(config, createServer("test"));
      const removed = removeServer(config, "test");
      expect(removed.name).toBe("test");
      expect(config.servers).toHaveLength(0);
    });

    it("should throw if server not found", () => {
      const config = createConfig();
      expect(() => removeServer(config, "nonexistent")).toThrow("not found");
    });
  });

  describe("getEnabledServers", () => {
    it("should return only enabled servers", () => {
      const config = createConfig();
      addServer(config, createServer("enabled1"));
      addServer(config, { ...createServer("disabled"), enabled: false });
      addServer(config, createServer("enabled2"));

      const enabled = getEnabledServers(config);
      expect(enabled).toHaveLength(2);
      expect(enabled.map((s) => s.name)).toEqual(["enabled1", "enabled2"]);
    });
  });
});
