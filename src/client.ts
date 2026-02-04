import { spawn, type ChildProcess } from "node:child_process";
import * as readline from "node:readline";
import type {
  McpServerConfig,
  JsonRpcRequest,
  JsonRpcResponse,
  InitializeResult,
  Tool,
  ToolCallParams,
  ToolCallResult,
} from "./types.js";

type PendingRequest = {
  resolve: (response: JsonRpcResponse) => void;
  reject: (error: Error) => void;
};

export class StdioClient {
  readonly name: string;
  readonly config: McpServerConfig;
  private process: ChildProcess | null = null;
  private pending = new Map<string | number, PendingRequest>();
  private nextId = 1;
  serverInfo: InitializeResult | null = null;
  tools: Tool[] = [];

  constructor(config: McpServerConfig) {
    this.name = config.name;
    this.config = config;
  }

  async start(): Promise<void> {
    this.process = spawn(this.config.command, this.config.args, {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, ...this.config.env },
    });

    const rl = readline.createInterface({ input: this.process.stdout! });

    rl.on("line", (line) => {
      if (!line.trim()) return;

      try {
        const response = JSON.parse(line) as JsonRpcResponse;
        if (response.id !== undefined) {
          const pending = this.pending.get(response.id);
          if (pending) {
            this.pending.delete(response.id);
            pending.resolve(response);
          }
        }
      } catch (e) {
        console.error(`[${this.name}] Failed to parse response:`, line);
      }
    });

    this.process.on("exit", (code) => {
      console.error(`[${this.name}] Process exited with code ${code}`);
      for (const pending of this.pending.values()) {
        pending.reject(new Error("Process exited"));
      }
      this.pending.clear();
    });
  }

  private async request(method: string, params?: unknown): Promise<JsonRpcResponse> {
    if (!this.process?.stdin) {
      throw new Error("Process not started");
    }

    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      const json = JSON.stringify(request);
      this.process!.stdin!.write(json + "\n");

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  private notify(method: string, params?: unknown): void {
    if (!this.process?.stdin) return;

    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.process.stdin.write(JSON.stringify(request) + "\n");
  }

  async initialize(): Promise<InitializeResult> {
    const response = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mcp-bridge", version: "0.1.0" },
    });

    if (response.error) {
      throw new Error(`Initialize failed: ${response.error.message}`);
    }

    this.serverInfo = response.result as InitializeResult;
    this.notify("notifications/initialized");

    return this.serverInfo;
  }

  async listTools(): Promise<Tool[]> {
    const response = await this.request("tools/list");

    if (response.error) {
      throw new Error(`tools/list failed: ${response.error.message}`);
    }

    const result = response.result as { tools: Tool[] };
    this.tools = result.tools;
    return this.tools;
  }

  async callTool(params: ToolCallParams): Promise<ToolCallResult> {
    const response = await this.request("tools/call", params);

    if (response.error) {
      throw new Error(`tools/call failed: ${response.error.message}`);
    }

    return response.result as ToolCallResult;
  }

  async shutdown(): Promise<void> {
    this.notify("notifications/cancelled");
    this.process?.kill();
    this.process = null;
  }
}
