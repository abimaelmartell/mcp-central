use crate::client::McpManager;
use crate::protocol::{
    error_codes, InitializeResult, JsonRpcId, JsonRpcRequest, JsonRpcResponse,
    ServerCapabilities, ServerInfo, ToolsCapability, ToolsListResult,
};
use std::sync::Arc;

/// Routes MCP requests to the appropriate backend
pub struct Router {
    manager: Arc<McpManager>,
}

impl Router {
    pub fn new(manager: Arc<McpManager>) -> Self {
        Self { manager }
    }

    /// Handle an incoming JSON-RPC request
    pub async fn handle_request(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        let id = request.id.clone();

        match request.method.as_str() {
            "initialize" => self.handle_initialize(id).await,
            "notifications/initialized" => {
                // Just acknowledge, no response needed for notifications
                JsonRpcResponse::success(id, serde_json::json!({}))
            }
            "tools/list" => self.handle_tools_list(id).await,
            "tools/call" => self.handle_tools_call(id, request.params).await,
            "ping" => JsonRpcResponse::success(id, serde_json::json!({})),
            _ => JsonRpcResponse::error(
                id,
                error_codes::METHOD_NOT_FOUND,
                format!("Method not found: {}", request.method),
            ),
        }
    }

    async fn handle_initialize(&self, id: Option<JsonRpcId>) -> JsonRpcResponse {
        let result = InitializeResult {
            protocol_version: "2024-11-05".to_string(),
            capabilities: ServerCapabilities {
                tools: Some(ToolsCapability { list_changed: false }),
                resources: None,
                prompts: None,
            },
            server_info: ServerInfo {
                name: "mcp-bridge".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
        };

        match serde_json::to_value(&result) {
            Ok(value) => JsonRpcResponse::success(id, value),
            Err(e) => JsonRpcResponse::error(id, error_codes::INTERNAL_ERROR, e.to_string()),
        }
    }

    async fn handle_tools_list(&self, id: Option<JsonRpcId>) -> JsonRpcResponse {
        let tools = self.manager.list_all_tools().await;
        let result = ToolsListResult { tools };

        match serde_json::to_value(&result) {
            Ok(value) => JsonRpcResponse::success(id, value),
            Err(e) => JsonRpcResponse::error(id, error_codes::INTERNAL_ERROR, e.to_string()),
        }
    }

    async fn handle_tools_call(
        &self,
        id: Option<JsonRpcId>,
        params: Option<serde_json::Value>,
    ) -> JsonRpcResponse {
        let params = match params {
            Some(p) => p,
            None => {
                return JsonRpcResponse::error(
                    id,
                    error_codes::INVALID_PARAMS,
                    "Missing params for tools/call",
                )
            }
        };

        let name = match params.get("name").and_then(|n| n.as_str()) {
            Some(n) => n.to_string(),
            None => {
                return JsonRpcResponse::error(
                    id,
                    error_codes::INVALID_PARAMS,
                    "Missing 'name' in tools/call params",
                )
            }
        };

        let arguments = params
            .get("arguments")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}));

        match self.manager.call_tool(&name, arguments).await {
            Ok(result) => match serde_json::to_value(&result) {
                Ok(value) => JsonRpcResponse::success(id, value),
                Err(e) => JsonRpcResponse::error(id, error_codes::INTERNAL_ERROR, e.to_string()),
            },
            Err(e) => JsonRpcResponse::error(id, error_codes::INTERNAL_ERROR, e.to_string()),
        }
    }
}
