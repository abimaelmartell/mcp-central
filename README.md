# mcp-bridge

MCP aggregator - connect to multiple MCP servers through a single endpoint.

```
┌──────────────────┐      ┌─────────────────────────────────────┐
│  Claude Desktop  │      │            mcp-bridge               │
│  Cursor          │─────▶│                                     │
│  Any MCP Client  │      │   ┌─────┐  ┌─────┐  ┌─────┐        │
└──────────────────┘      │   │github│  │slack│  │ fs  │  ...   │
                          │   └─────┘  └─────┘  └─────┘        │
                          └─────────────────────────────────────┘
```

## Install

```bash
npm install -g mcp-bridge
```

Or run directly with npx:

```bash
npx mcp-bridge --help
```

## Usage

```bash
# Add MCP servers
mcp-bridge add github npx -y @modelcontextprotocol/server-github
mcp-bridge add fs npx -y @modelcontextprotocol/server-filesystem /tmp

# List configured servers
mcp-bridge list

# Remove a server
mcp-bridge remove github
```

## Connect

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "bridge": {
      "command": "npx",
      "args": ["mcp-bridge", "serve"]
    }
  }
}
```

**HTTP daemon** (for apps):
```bash
mcp-bridge daemon -p 3000
```

## Tool Namespacing

Tools are prefixed with the MCP name:

```
github  + create_issue  →  github__create_issue
fs      + read_file     →  fs__read_file
slack   + send_message  →  slack__send_message
```

## Config

Stored at:
- macOS: `~/Library/Application Support/mcp-bridge/config.json`
- Linux: `~/.config/mcp-bridge/config.json`

```json
{
  "settings": {
    "logLevel": "info",
    "daemonPort": 3000
  },
  "servers": [
    {
      "name": "github",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {},
      "enabled": true
    }
  ]
}
```

## Architecture

```
                    ┌─────────────────┐
                    │   MCP Client    │
                    └────────┬────────┘
                             │ stdio/http
                             ▼
┌────────────────────────────────────────────────────┐
│                    mcp-bridge                      │
│  ┌──────────┐    ┌────────────┐    ┌───────────┐  │
│  │  Server  │───▶│   Router   │───▶│  Manager  │  │
│  │stdio/http│    │            │    │           │  │
│  └──────────┘    └────────────┘    └─────┬─────┘  │
│                                          │        │
│                    ┌─────────────────────┼────┐   │
│                    ▼           ▼         ▼    │   │
│                 ┌─────┐    ┌─────┐    ┌─────┐ │   │
│                 │ MCP │    │ MCP │    │ MCP │ │   │
│                 │  1  │    │  2  │    │  3  │ │   │
│                 └─────┘    └─────┘    └─────┘ │   │
│                    stdio connections          │   │
└────────────────────────────────────────────────────┘
```

## License

MIT
