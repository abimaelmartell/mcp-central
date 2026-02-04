use crate::aggregator::Router;
use crate::client::McpManager;
use crate::config::Config;
use crate::protocol::JsonRpcRequest;
use anyhow::Result;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

/// Run the MCP bridge in stdio mode
pub async fn run(config: Config) -> Result<()> {
    // Create the manager and connect to all MCPs
    let manager = Arc::new(McpManager::new());
    manager.connect_all(&config).await?;

    let connected = manager.connected_mcps().await;
    if connected.is_empty() {
        tracing::warn!("No MCP servers connected. Add servers with 'mcp-bridge add'");
    } else {
        tracing::info!("Connected to {} MCP servers: {:?}", connected.len(), connected);
    }

    // Create the router
    let router = Router::new(manager.clone());

    // Read from stdin, write to stdout
    let stdin = tokio::io::stdin();
    let mut stdout = tokio::io::stdout();
    let mut reader = BufReader::new(stdin);
    let mut line = String::new();

    tracing::info!("MCP bridge ready, waiting for requests on stdin");

    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => {
                // EOF
                tracing::info!("stdin closed, shutting down");
                break;
            }
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                tracing::debug!("Received: {}", trimmed);

                match serde_json::from_str::<JsonRpcRequest>(trimmed) {
                    Ok(request) => {
                        // Check if this is a notification (no id)
                        let is_notification = request.id.is_none();

                        let response = router.handle_request(request).await;

                        // Don't send response for notifications
                        if !is_notification {
                            let response_json = serde_json::to_string(&response)?;
                            tracing::debug!("Sending: {}", response_json);
                            stdout.write_all(response_json.as_bytes()).await?;
                            stdout.write_all(b"\n").await?;
                            stdout.flush().await?;
                        }
                    }
                    Err(e) => {
                        tracing::error!("Failed to parse request: {} - line: {}", e, trimmed);
                        // Send parse error
                        let error_response = crate::protocol::JsonRpcResponse::error(
                            None,
                            crate::protocol::error_codes::PARSE_ERROR,
                            format!("Parse error: {}", e),
                        );
                        let response_json = serde_json::to_string(&error_response)?;
                        stdout.write_all(response_json.as_bytes()).await?;
                        stdout.write_all(b"\n").await?;
                        stdout.flush().await?;
                    }
                }
            }
            Err(e) => {
                tracing::error!("Error reading from stdin: {}", e);
                break;
            }
        }
    }

    // Cleanup
    manager.shutdown_all().await?;

    Ok(())
}
