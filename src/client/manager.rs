use crate::client::stdio::StdioClient;
use crate::config::{Config, McpServerConfig};
use crate::protocol::{namespace_tool, Tool, ToolCallParams, ToolCallResult};
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Manages connections to multiple MCP servers
pub struct McpManager {
    clients: Arc<RwLock<HashMap<String, StdioClient>>>,
}

impl McpManager {
    pub fn new() -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Connect to all enabled MCP servers in the config
    pub async fn connect_all(&self, config: &Config) -> Result<()> {
        let enabled: Vec<_> = config.servers.iter().filter(|s| s.enabled).collect();

        for server_config in enabled {
            if let Err(e) = self.connect(server_config.clone()).await {
                tracing::error!("Failed to connect to {}: {}", server_config.name, e);
            }
        }

        Ok(())
    }

    /// Connect to a single MCP server
    pub async fn connect(&self, config: McpServerConfig) -> Result<()> {
        let name = config.name.clone();
        tracing::info!("Connecting to MCP server: {}", name);

        let mut client = StdioClient::spawn(config).await?;

        // Initialize the connection
        let init_result = client.initialize().await?;
        tracing::info!(
            "Connected to {} ({})",
            init_result.server_info.name,
            init_result.server_info.version
        );

        // List available tools
        let tools = client.list_tools().await?;
        tracing::info!("{} provides {} tools", name, tools.len());

        for tool in &tools {
            tracing::debug!("  - {}: {:?}", tool.name, tool.description);
        }

        let mut clients = self.clients.write().await;
        clients.insert(name, client);

        Ok(())
    }

    /// Disconnect from an MCP server
    pub async fn disconnect(&self, name: &str) -> Result<()> {
        let mut clients = self.clients.write().await;
        if let Some(mut client) = clients.remove(name) {
            client.shutdown().await?;
        }
        Ok(())
    }

    /// Get all tools from all connected MCPs (namespaced)
    pub async fn list_all_tools(&self) -> Vec<Tool> {
        let clients = self.clients.read().await;
        let mut all_tools = Vec::new();

        for (mcp_name, client) in clients.iter() {
            for tool in &client.tools {
                let namespaced = Tool {
                    name: namespace_tool(mcp_name, &tool.name),
                    description: tool.description.clone().map(|d| {
                        format!("[{}] {}", mcp_name, d)
                    }),
                    input_schema: tool.input_schema.clone(),
                };
                all_tools.push(namespaced);
            }
        }

        all_tools
    }

    /// Call a tool (expects namespaced tool name)
    pub async fn call_tool(&self, namespaced_name: &str, arguments: serde_json::Value) -> Result<ToolCallResult> {
        let (mcp_name, tool_name) = crate::protocol::parse_namespaced_tool(namespaced_name)
            .ok_or_else(|| anyhow!("Invalid tool name format: {}", namespaced_name))?;

        let clients = self.clients.read().await;
        let client = clients
            .get(mcp_name)
            .ok_or_else(|| anyhow!("MCP server '{}' not connected", mcp_name))?;

        let params = ToolCallParams {
            name: tool_name.to_string(),
            arguments: serde_json::from_value(arguments).unwrap_or_default(),
        };

        client.call_tool(params).await
    }

    /// Get list of connected MCP names
    pub async fn connected_mcps(&self) -> Vec<String> {
        let clients = self.clients.read().await;
        clients.keys().cloned().collect()
    }

    /// Shutdown all connections
    pub async fn shutdown_all(&self) -> Result<()> {
        let mut clients = self.clients.write().await;
        for (name, mut client) in clients.drain() {
            tracing::info!("Shutting down {}", name);
            let _ = client.shutdown().await;
        }
        Ok(())
    }
}

impl Default for McpManager {
    fn default() -> Self {
        Self::new()
    }
}
