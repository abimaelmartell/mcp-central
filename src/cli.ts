#!/usr/bin/env node

import { program } from "commander";
import { loadConfig, saveConfig, addServer, removeServer } from "./config.js";
import { runStdioServer } from "./server.js";
import { runDaemon } from "./daemon.js";
import { readLogs, watchLogs, formatLogEntry, formatLogHeader, formatWatchingHeader } from "./logger.js";
import type { McpServerConfig } from "./types.js";

program
  .name("mcp-bridge")
  .description("MCP aggregator - connect multiple MCP servers through a single endpoint")
  .version("0.1.0");

program
  .command("add")
  .description("Add a new MCP server")
  .argument("<name>", "Unique name for this MCP server")
  .argument("<command>", "Command to execute")
  .argument("[args...]", "Arguments for the command")
  .action((name: string, command: string, args: string[]) => {
    const config = loadConfig();
    const server: McpServerConfig = {
      name,
      command,
      args: args || [],
      env: {},
      enabled: true,
    };

    try {
      addServer(config, server);
      saveConfig(config);
      console.log(`Added MCP server '${name}'`);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  });

program
  .command("remove")
  .description("Remove an MCP server")
  .argument("<name>", "Name of the MCP server to remove")
  .action((name: string) => {
    const config = loadConfig();

    try {
      removeServer(config, name);
      saveConfig(config);
      console.log(`Removed MCP server '${name}'`);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List all configured MCP servers")
  .action(() => {
    const config = loadConfig();

    if (config.servers.length === 0) {
      console.log("No MCP servers configured.");
      console.log("\nAdd one with: mcp-bridge add <name> <command> [args...]");
      return;
    }

    console.log("Configured MCP servers:\n");
    for (const server of config.servers) {
      const status = server.enabled ? "enabled" : "disabled";
      console.log(`  ${server.name} [${status}]`);
      console.log(`    command: ${server.command} ${server.args.join(" ")}`);
      if (Object.keys(server.env).length > 0) {
        console.log(`    env: ${JSON.stringify(server.env)}`);
      }
      console.log();
    }
  });

program
  .command("serve")
  .description("Start the bridge in stdio mode (for MCP clients)")
  .action(async () => {
    const config = loadConfig();
    await runStdioServer(config);
  });

program
  .command("daemon")
  .description("Start the bridge as an HTTP daemon")
  .option("-p, --port <port>", "Port to listen on", "3000")
  .action(async (options: { port: string }) => {
    const config = loadConfig();
    await runDaemon(config, parseInt(options.port, 10));
  });

program
  .command("logs")
  .description("View tool usage logs")
  .option("-f, --follow", "Follow logs in real-time")
  .option("-n, --limit <count>", "Number of entries to show", "20")
  .option("-a, --all", "Show all entries (no limit)")
  .action(async (options: { follow?: boolean; limit: string; all?: boolean }) => {
    if (options.follow) {
      // Live mode
      const entries = readLogs(10);

      if (entries.length > 0) {
        console.log(formatLogHeader(entries.length, entries.length));
        for (const entry of entries) {
          console.log(formatLogEntry(entry, { showDate: true }));
        }
        console.log();
      }

      console.log(formatWatchingHeader());

      const stop = await watchLogs((entry) => {
        console.log(formatLogEntry(entry));
      });

      process.on("SIGINT", () => {
        stop();
        console.log("\n");
        process.exit(0);
      });
    } else {
      // Static mode
      const limit = options.all ? undefined : parseInt(options.limit, 10);
      const allEntries = readLogs();
      const entries = limit ? allEntries.slice(-limit) : allEntries;

      if (entries.length === 0) {
        console.log("No usage logs yet. Logs are recorded when tools are called via the bridge.");
        return;
      }

      console.log(formatLogHeader(entries.length, allEntries.length));

      for (const entry of entries) {
        console.log(formatLogEntry(entry, { showDate: true }));
      }
    }
  });

program.parse();
