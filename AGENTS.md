# Agent Context

Context file for AI agents working on this project.

## What is this?

MCP Bridge is an aggregator/proxy for MCP (Model Context Protocol) servers. It connects to multiple MCP servers and exposes them as a single unified MCP endpoint. Clients connect to one MCP (the bridge) and get access to all tools from all registered servers.

## Tech Stack

- **TypeScript** + Node.js (>=18)
- **commander** - CLI parsing
- **fastify** - HTTP server (daemon mode)
- **vitest** - testing
- Distributed via npm, runnable with `npx mcp-bridge`

## Project Status

**Working:**
- CLI commands: add, remove, list, serve, daemon, logs
- Config management (JSON)
- stdio MCP client (connects to backend MCPs)
- stdio MCP server (for clients like Claude Desktop)
- HTTP daemon mode (for future Mac app)
- Tool namespacing (`{mcp}__{tool}`)
- Request routing to correct backend MCP
- Usage logging with auto-rotation (max 5000 entries)
- Live log tailing (`logs -f`)

**Not implemented yet:**
- Resources aggregation (`resources/list`, `resources/read`)
- Prompts aggregation (`prompts/list`, `prompts/get`)
- Reconnection logic for failed MCPs
- Enable/disable individual servers via CLI
- Environment variable support in CLI (`--env KEY=VALUE`)

## Architecture

```
src/
├── cli.ts        # CLI entry point (commander)
├── index.ts      # Library exports
├── types.ts      # JSON-RPC types, MCP types, Config types
├── config.ts     # loadConfig, saveConfig, addServer, removeServer
├── client.ts     # StdioClient - connects to one MCP via stdio
├── manager.ts    # McpManager - manages multiple StdioClients, logs calls
├── router.ts     # Router - handles requests, routes to correct MCP
├── server.ts     # runStdioServer() - stdio server for MCP clients
├── daemon.ts     # runDaemon() - HTTP server with /mcp, /health, /tools
└── logger.ts     # Usage logging with rotation, formatting, live watching
```

## Key Patterns

**Tool namespacing:**
```typescript
// types.ts
export const NAMESPACE_SEPARATOR = "__";
export function namespaceTools(mcpName: string, toolName: string): string
export function parseNamespacedTool(namespaced: string): { mcp: string; tool: string } | null
```

**Request flow:**
```
Client request → server.ts → Router.handleRequest() → McpManager.callTool() → StdioClient
                                                              ↓
                                                        logger.ts (logs tool call)
```

**Log rotation:**
```typescript
// logger.ts
const MAX_LOG_ENTRIES = 5000;    // Keep last 5000 entries
const ROTATE_THRESHOLD = 6000;   // Rotate when hitting 6000
```

**Config/logs location:**
- macOS: `~/Library/Application Support/mcp-bridge/`
- Linux: `~/.config/mcp-bridge/`
- Files: `config.json`, `usage.log`

## Conventions

- Logs go to stderr (`console.error`), stdout is for MCP protocol (`console.log`)
- All MCP communication is JSON-RPC 2.0, newline-delimited
- Protocol version: `2024-11-05`
- Error codes in `types.ts::ErrorCodes`

## Commands

```bash
npm run build      # compile TypeScript
npm run dev        # watch mode
npm run typecheck  # type check only
npm test           # run vitest
npm run test:watch # vitest watch mode
```

## Testing

```bash
# Unit tests
npm test

# Manual CLI testing
node dist/cli.js list
node dist/cli.js add echo npx -y @modelcontextprotocol/server-everything
node dist/cli.js serve    # then send JSON-RPC to stdin
node dist/cli.js logs     # view usage logs
node dist/cli.js logs -f  # live tail
```

## HTTP Daemon Endpoints

- `GET /health` - health check, returns connected MCPs
- `POST /mcp` - JSON-RPC endpoint for MCP requests
- `GET /tools` - list all aggregated tools

## Future Plans

1. **Mac app** - SwiftUI frontend using daemon mode as backend
2. **SSE transport** - Connect to remote MCPs over HTTP
3. **Tool filtering** - Allow/block specific tools per MCP
4. **Reconnection** - Auto-reconnect failed MCP connections
5. **npm publish** - Publish to npm registry
6. **Metrics** - Track call counts, error rates, latencies
