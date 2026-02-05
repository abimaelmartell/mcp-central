import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Config, McpServerConfig } from "./types.js";

function getConfigDir(): string {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "mcp-central");
  }
  return path.join(os.homedir(), ".config", "mcp-central");
}

function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function loadConfig(): Config {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return {
      settings: { logLevel: "info", daemonPort: 3000 },
      servers: [],
    };
  }

  const content = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(content) as Config;
}

export function saveConfig(config: Config): void {
  const configDir = getConfigDir();
  fs.mkdirSync(configDir, { recursive: true });

  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function addServer(config: Config, server: McpServerConfig): void {
  if (config.servers.some((s) => s.name === server.name)) {
    throw new Error(`Server '${server.name}' already exists`);
  }
  config.servers.push(server);
}

export function removeServer(config: Config, name: string): McpServerConfig {
  const idx = config.servers.findIndex((s) => s.name === name);
  if (idx === -1) {
    throw new Error(`Server '${name}' not found`);
  }
  return config.servers.splice(idx, 1)[0];
}

export function updateServer(
  config: Config,
  name: string,
  updates: Partial<Omit<McpServerConfig, "name">>
): McpServerConfig {
  const server = config.servers.find((s) => s.name === name);
  if (!server) {
    throw new Error(`Server '${name}' not found`);
  }
  Object.assign(server, updates);
  return server;
}

export function getEnabledServers(config: Config): McpServerConfig[] {
  return config.servers.filter((s) => s.enabled);
}
