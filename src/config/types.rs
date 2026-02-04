use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Main configuration for mcp-bridge
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub servers: Vec<McpServerConfig>,
}

/// Global settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// Log level (trace, debug, info, warn, error)
    #[serde(default = "default_log_level")]
    pub log_level: String,
    /// Port for HTTP daemon mode
    #[serde(default = "default_daemon_port")]
    pub daemon_port: u16,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            log_level: default_log_level(),
            daemon_port: default_daemon_port(),
        }
    }
}

fn default_log_level() -> String {
    "info".to_string()
}

fn default_daemon_port() -> u16 {
    3000
}

/// Configuration for a single MCP server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    /// Unique name for this MCP (used for namespacing tools)
    pub name: String,
    /// Command to execute
    pub command: String,
    /// Arguments for the command
    #[serde(default)]
    pub args: Vec<String>,
    /// Environment variables
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Whether this server is enabled
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

impl McpServerConfig {
    pub fn new(name: impl Into<String>, command: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            command: command.into(),
            args: Vec::new(),
            env: HashMap::new(),
            enabled: true,
        }
    }

    pub fn with_args(mut self, args: Vec<String>) -> Self {
        self.args = args;
        self
    }

    pub fn with_env(mut self, env: HashMap<String, String>) -> Self {
        self.env = env;
        self
    }
}

/// Claude Desktop JSON config format (for import)
#[derive(Debug, Clone, Deserialize)]
pub struct ClaudeDesktopConfig {
    #[serde(rename = "mcpServers", default)]
    pub mcp_servers: HashMap<String, ClaudeDesktopServer>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClaudeDesktopServer {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

impl From<(String, ClaudeDesktopServer)> for McpServerConfig {
    fn from((name, server): (String, ClaudeDesktopServer)) -> Self {
        McpServerConfig {
            name,
            command: server.command,
            args: server.args,
            env: server.env,
            enabled: true,
        }
    }
}
