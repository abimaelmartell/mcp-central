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

## Logs

View tool usage history:

```bash
mcp-bridge logs           # last 20 entries
mcp-bridge logs -n 50     # last 50 entries
mcp-bridge logs --all     # full history
mcp-bridge logs -f        # live tail (follow)
```

Output:
```
─── 4 log entries ───

Feb 3 23:37:11 ✓ github/create_issue 234ms {"title":"Test"}
Feb 3 23:37:11 ✓ fs/read_file 12ms {"path":"/tmp/test.txt"}
Feb 3 23:37:11 ✗ slack/send_message 1.5s {"channel":"#general"}
         └─ Channel not found
Feb 3 23:37:11 ✓ github/list_repos 892ms
```

Logs auto-rotate at 5000 entries to prevent disk bloat.

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

## Future Improvements

- [ ] **Resources/Prompts** - Aggregate `resources/list` and `prompts/list` from MCPs
- [ ] **Auto-reconnect** - Reconnect to MCPs that fail or disconnect
- [ ] **Tool filtering** - Allow/block specific tools per MCP
- [ ] **Environment variables** - CLI support for `--env KEY=VALUE`
- [ ] **Enable/disable** - Toggle servers without removing them
- [ ] **SSE transport** - Connect to remote MCPs over HTTP/SSE
- [ ] **Mac app** - Native SwiftUI frontend using daemon as backend
- [ ] **Metrics dashboard** - Call counts, error rates, latencies

## License

MIT
