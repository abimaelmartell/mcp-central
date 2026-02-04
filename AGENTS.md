# Agent Context

Context file for AI agents working on this project.

## What is this?

MCP Bridge is an aggregator/proxy for MCP (Model Context Protocol) servers. It connects to multiple MCP servers and exposes them as a single unified MCP endpoint. Clients connect to one MCP (the bridge) and get access to all tools from all registered servers.

## Project Status

**Working:**
- CLI commands: add, remove, list, serve, daemon
- Config management (TOML)
- stdio MCP client (connects to backend MCPs)
- stdio MCP server (for clients like Claude Desktop)
- HTTP daemon mode (for future Mac app)
- Tool namespacing (`{mcp}__{tool}`)
- Request routing to correct backend MCP

**Not implemented yet:**
- Resources aggregation (`resources/list`, `resources/read`)
- Prompts aggregation (`prompts/list`, `prompts/get`)
- JSON import from Claude Desktop config
- Reconnection logic for failed MCPs
- Enable/disable individual servers via CLI
- Environment variable support in CLI (`--env KEY=VALUE`)

## Architecture

```
src/
├── main.rs           # CLI entry, clap commands
├── config/
│   ├── types.rs      # Config, McpServerConfig, Settings
│   └── loader.rs     # load_config, save_config, add_server, remove_server
├── protocol/
│   └── types.rs      # JSON-RPC types, MCP types, namespace_tool()
├── client/
│   ├── stdio.rs      # StdioClient - connects to one MCP via stdio
│   └── manager.rs    # McpManager - manages multiple StdioClients
├── server/
│   ├── stdio.rs      # run() - stdio server for MCP clients
│   └── http.rs       # run() - HTTP daemon with /mcp and /health endpoints
└── aggregator/
    └── router.rs     # Router - handles requests, routes to correct MCP
```

## Key Patterns

**Tool namespacing:**
```rust
// protocol/types.rs
pub const NAMESPACE_SEPARATOR: &str = "__";
pub fn namespace_tool(mcp_name: &str, tool_name: &str) -> String
pub fn parse_namespaced_tool(namespaced: &str) -> Option<(&str, &str)>
```

**Request flow:**
```
Client request → server/stdio.rs → Router.handle_request() → McpManager.call_tool() → StdioClient
```

**Config location:**
- macOS: `~/Library/Application Support/mcp-bridge/config.toml`
- Linux: `~/.config/mcp-bridge/config.toml`

## Dependencies

- `tokio` - async runtime
- `clap` - CLI parsing
- `serde` / `toml` / `serde_json` - serialization
- `axum` - HTTP server (daemon mode)
- `tracing` - logging

## Conventions

- Logs go to stderr (stdout is for MCP protocol)
- All MCP communication is JSON-RPC 2.0, newline-delimited
- Protocol version: `2024-11-05`
- Error codes follow JSON-RPC spec (see `protocol/types.rs::error_codes`)

## Testing

```bash
cargo test                    # unit tests
cargo build && ./target/debug/mcp-bridge list   # manual CLI test
```

To test with a real MCP:
```bash
mcp-bridge add echo npx -y @modelcontextprotocol/server-everything
mcp-bridge serve   # then send JSON-RPC to stdin
```

## Future Plans

1. **Mac app** - SwiftUI frontend using daemon mode as backend
2. **SSE transport** - Connect to remote MCPs over HTTP
3. **Tool filtering** - Allow/block specific tools per MCP
4. **Status dashboard** - Show connected MCPs, tool counts, errors
