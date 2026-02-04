use crate::aggregator::Router;
use crate::client::McpManager;
use crate::config::Config;
use crate::protocol::JsonRpcRequest;
use anyhow::Result;
use axum::{
    extract::State,
    response::{sse::Event, IntoResponse, Sse},
    routing::{get, post},
    Json, Router as AxumRouter,
};
use futures::stream::{self, Stream};
use std::convert::Infallible;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

struct AppState {
    router: Router,
    manager: Arc<McpManager>,
}

/// Run the MCP bridge as an HTTP daemon
pub async fn run(config: Config, port: u16) -> Result<()> {
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

    let state = Arc::new(AppState { router, manager });

    // Build the HTTP router
    let app = AxumRouter::new()
        .route("/health", get(health))
        .route("/mcp", post(handle_mcp_request))
        .route("/sse", get(handle_sse))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("Starting HTTP daemon on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "mcp-bridge",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

async fn handle_mcp_request(
    State(state): State<Arc<AppState>>,
    Json(request): Json<JsonRpcRequest>,
) -> impl IntoResponse {
    let response = state.router.handle_request(request).await;
    Json(response)
}

async fn handle_sse(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    // For now, just return the connected MCPs as an initial event
    let connected = state.manager.connected_mcps().await;

    let initial_event = Event::default()
        .event("connected")
        .data(serde_json::to_string(&connected).unwrap_or_default());

    let stream = stream::once(async move { Ok(initial_event) });

    Sse::new(stream)
}
