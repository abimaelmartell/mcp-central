use crate::config::types::{ClaudeDesktopConfig, Config, McpServerConfig};
use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Failed to read config file: {0}")]
    ReadError(#[from] std::io::Error),
    #[error("Failed to parse TOML: {0}")]
    TomlParseError(#[from] toml::de::Error),
    #[error("Failed to serialize TOML: {0}")]
    TomlSerializeError(#[from] toml::ser::Error),
    #[error("Failed to parse JSON: {0}")]
    JsonParseError(#[from] serde_json::Error),
    #[error("Config directory not found")]
    ConfigDirNotFound,
    #[error("Server '{0}' already exists")]
    ServerExists(String),
    #[error("Server '{0}' not found")]
    ServerNotFound(String),
}

/// Get the config directory path
pub fn config_dir() -> Result<PathBuf, ConfigError> {
    let base = dirs::config_dir().ok_or(ConfigError::ConfigDirNotFound)?;
    Ok(base.join("mcp-bridge"))
}

/// Get the config file path
pub fn config_path() -> Result<PathBuf, ConfigError> {
    Ok(config_dir()?.join("config.toml"))
}

/// Load config from the default location
pub fn load_config() -> Result<Config, ConfigError> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(Config::default());
    }
    let content = std::fs::read_to_string(&path)?;
    let config: Config = toml::from_str(&content)?;
    Ok(config)
}

/// Save config to the default location
pub fn save_config(config: &Config) -> Result<(), ConfigError> {
    let dir = config_dir()?;
    std::fs::create_dir_all(&dir)?;
    let path = config_path()?;
    let content = toml::to_string_pretty(config)?;
    std::fs::write(&path, content)?;
    Ok(())
}

/// Import servers from a Claude Desktop JSON config file
pub fn import_claude_config(json_path: &PathBuf) -> Result<Vec<McpServerConfig>, ConfigError> {
    let content = std::fs::read_to_string(json_path)?;
    let claude_config: ClaudeDesktopConfig = serde_json::from_str(&content)?;

    let servers: Vec<McpServerConfig> = claude_config
        .mcp_servers
        .into_iter()
        .map(|(name, server)| McpServerConfig::from((name, server)))
        .collect();

    Ok(servers)
}

/// Add a server to the config
pub fn add_server(config: &mut Config, server: McpServerConfig) -> Result<(), ConfigError> {
    if config.servers.iter().any(|s| s.name == server.name) {
        return Err(ConfigError::ServerExists(server.name));
    }
    config.servers.push(server);
    Ok(())
}

/// Remove a server from the config
pub fn remove_server(config: &mut Config, name: &str) -> Result<McpServerConfig, ConfigError> {
    let idx = config
        .servers
        .iter()
        .position(|s| s.name == name)
        .ok_or_else(|| ConfigError::ServerNotFound(name.to_string()))?;
    Ok(config.servers.remove(idx))
}

/// Get enabled servers
pub fn enabled_servers(config: &Config) -> Vec<&McpServerConfig> {
    config.servers.iter().filter(|s| s.enabled).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_remove_server() {
        let mut config = Config::default();
        let server = McpServerConfig::new("test", "echo");

        add_server(&mut config, server).unwrap();
        assert_eq!(config.servers.len(), 1);

        // Adding duplicate should fail
        let dup = McpServerConfig::new("test", "cat");
        assert!(add_server(&mut config, dup).is_err());

        // Remove
        let removed = remove_server(&mut config, "test").unwrap();
        assert_eq!(removed.name, "test");
        assert!(config.servers.is_empty());
    }

    #[test]
    fn test_parse_claude_config() {
        let json = r#"{
            "mcpServers": {
                "github": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-github"]
                },
                "filesystem": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
                }
            }
        }"#;

        let claude_config: ClaudeDesktopConfig = serde_json::from_str(json).unwrap();
        assert_eq!(claude_config.mcp_servers.len(), 2);
    }
}
