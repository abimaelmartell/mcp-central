use crate::config::McpServerConfig;
use crate::protocol::{
    ClientCapabilities, ClientInfo, InitializeParams, InitializeResult, JsonRpcId, JsonRpcRequest,
    JsonRpcResponse, Tool, ToolCallParams, ToolCallResult, ToolsListResult,
};
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex};

/// A client connection to a single MCP server via stdio
pub struct StdioClient {
    pub name: String,
    pub config: McpServerConfig,
    child: Child,
    writer: Arc<Mutex<tokio::process::ChildStdin>>,
    pending: Arc<Mutex<HashMap<i64, oneshot::Sender<JsonRpcResponse>>>>,
    next_id: AtomicI64,
    pub server_info: Option<InitializeResult>,
    pub tools: Vec<Tool>,
}

impl StdioClient {
    /// Spawn a new MCP server process and establish connection
    pub async fn spawn(config: McpServerConfig) -> Result<Self> {
        let mut cmd = Command::new(&config.command);
        cmd.args(&config.args)
            .envs(&config.env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        let mut child = cmd.spawn()?;

        let stdin = child.stdin.take().ok_or_else(|| anyhow!("Failed to get stdin"))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow!("Failed to get stdout"))?;

        let pending: Arc<Mutex<HashMap<i64, oneshot::Sender<JsonRpcResponse>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let pending_clone = pending.clone();

        // Spawn reader task
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();

            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break, // EOF
                    Ok(_) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        match serde_json::from_str::<JsonRpcResponse>(trimmed) {
                            Ok(response) => {
                                if let Some(JsonRpcId::Number(id)) = &response.id {
                                    let mut pending = pending_clone.lock().await;
                                    if let Some(sender) = pending.remove(id) {
                                        let _ = sender.send(response);
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::warn!("Failed to parse response: {} - line: {}", e, trimmed);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("Error reading from MCP server: {}", e);
                        break;
                    }
                }
            }
        });

        let name = config.name.clone();

        Ok(Self {
            name,
            config,
            child,
            writer: Arc::new(Mutex::new(stdin)),
            pending,
            next_id: AtomicI64::new(1),
            server_info: None,
            tools: Vec::new(),
        })
    }

    /// Send a request and wait for response
    async fn request(&self, method: &str, params: Option<serde_json::Value>) -> Result<JsonRpcResponse> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let request = JsonRpcRequest::new(method, params).with_id(JsonRpcId::Number(id));

        let (tx, rx) = oneshot::channel();

        {
            let mut pending = self.pending.lock().await;
            pending.insert(id, tx);
        }

        let json = serde_json::to_string(&request)?;
        tracing::debug!("[{}] -> {}", self.name, json);

        {
            let mut writer = self.writer.lock().await;
            writer.write_all(json.as_bytes()).await?;
            writer.write_all(b"\n").await?;
            writer.flush().await?;
        }

        let response = tokio::time::timeout(std::time::Duration::from_secs(30), rx)
            .await
            .map_err(|_| anyhow!("Request timeout"))?
            .map_err(|_| anyhow!("Response channel closed"))?;

        tracing::debug!("[{}] <- {:?}", self.name, response);

        Ok(response)
    }

    /// Send a notification (no response expected)
    async fn notify(&self, method: &str, params: Option<serde_json::Value>) -> Result<()> {
        let request = JsonRpcRequest::notification(method, params);
        let json = serde_json::to_string(&request)?;
        tracing::debug!("[{}] -> {} (notification)", self.name, json);

        let mut writer = self.writer.lock().await;
        writer.write_all(json.as_bytes()).await?;
        writer.write_all(b"\n").await?;
        writer.flush().await?;

        Ok(())
    }

    /// Initialize the MCP connection
    pub async fn initialize(&mut self) -> Result<InitializeResult> {
        let params = InitializeParams {
            protocol_version: "2024-11-05".to_string(),
            capabilities: ClientCapabilities::default(),
            client_info: ClientInfo {
                name: "mcp-bridge".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
        };

        let response = self.request("initialize", Some(serde_json::to_value(&params)?)).await?;

        if let Some(error) = response.error {
            return Err(anyhow!("Initialize failed: {}", error.message));
        }

        let result: InitializeResult = serde_json::from_value(
            response.result.ok_or_else(|| anyhow!("No result in initialize response"))?,
        )?;

        self.server_info = Some(result.clone());

        // Send initialized notification
        self.notify("notifications/initialized", None).await?;

        Ok(result)
    }

    /// List available tools
    pub async fn list_tools(&mut self) -> Result<Vec<Tool>> {
        let response = self.request("tools/list", None).await?;

        if let Some(error) = response.error {
            return Err(anyhow!("tools/list failed: {}", error.message));
        }

        let result: ToolsListResult = serde_json::from_value(
            response.result.ok_or_else(|| anyhow!("No result in tools/list response"))?,
        )?;

        self.tools = result.tools.clone();
        Ok(result.tools)
    }

    /// Call a tool
    pub async fn call_tool(&self, params: ToolCallParams) -> Result<ToolCallResult> {
        let response = self
            .request("tools/call", Some(serde_json::to_value(&params)?))
            .await?;

        if let Some(error) = response.error {
            return Err(anyhow!("tools/call failed: {}", error.message));
        }

        let result: ToolCallResult = serde_json::from_value(
            response.result.ok_or_else(|| anyhow!("No result in tools/call response"))?,
        )?;

        Ok(result)
    }

    /// Check if the process is still running
    pub fn is_running(&mut self) -> bool {
        self.child.try_wait().map(|s| s.is_none()).unwrap_or(false)
    }

    /// Shutdown the client
    pub async fn shutdown(&mut self) -> Result<()> {
        // Try graceful shutdown
        let _ = self.notify("notifications/cancelled", None).await;

        // Kill the process
        let _ = self.child.kill().await;
        Ok(())
    }
}

impl Drop for StdioClient {
    fn drop(&mut self) {
        // Best-effort kill
        let _ = self.child.start_kill();
    }
}
