use clap::{Parser, Subcommand};
use std::path::PathBuf;
use tracing_subscriber::EnvFilter;

mod aggregator;
mod client;
mod config;
mod protocol;
mod server;

use config::{add_server, load_config, remove_server, save_config, McpServerConfig};

#[derive(Parser)]
#[command(name = "mcp-bridge")]
#[command(about = "MCP aggregator - connect multiple MCP servers through a single endpoint")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Add a new MCP server
    Add {
        /// Unique name for this MCP server
        name: String,
        /// Command to execute
        command: String,
        /// Arguments for the command
        #[arg(trailing_var_arg = true)]
        args: Vec<String>,
    },
    /// Remove an MCP server
    Remove {
        /// Name of the MCP server to remove
        name: String,
    },
    /// List all configured MCP servers
    List,
    /// Import MCP servers from a Claude Desktop JSON config
    Import {
        /// Path to the JSON config file
        path: PathBuf,
    },
    /// Start the bridge in stdio mode (for MCP clients)
    Serve,
    /// Start the bridge as an HTTP daemon
    Daemon {
        /// Port to listen on
        #[arg(short, long, default_value = "3000")]
        port: u16,
    },
}

fn init_logging() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .init();
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Add { name, command, args } => {
            cmd_add(&name, &command, args)?;
        }
        Commands::Remove { name } => {
            cmd_remove(&name)?;
        }
        Commands::List => {
            cmd_list()?;
        }
        Commands::Import { path } => {
            cmd_import(&path)?;
        }
        Commands::Serve => {
            init_logging();
            cmd_serve().await?;
        }
        Commands::Daemon { port } => {
            init_logging();
            cmd_daemon(port).await?;
        }
    }

    Ok(())
}

fn cmd_add(name: &str, command: &str, args: Vec<String>) -> anyhow::Result<()> {
    let mut config = load_config()?;
    let server = McpServerConfig::new(name, command).with_args(args);
    add_server(&mut config, server)?;
    save_config(&config)?;
    println!("Added MCP server '{}'", name);
    Ok(())
}

fn cmd_remove(name: &str) -> anyhow::Result<()> {
    let mut config = load_config()?;
    remove_server(&mut config, name)?;
    save_config(&config)?;
    println!("Removed MCP server '{}'", name);
    Ok(())
}

fn cmd_list() -> anyhow::Result<()> {
    let config = load_config()?;

    if config.servers.is_empty() {
        println!("No MCP servers configured.");
        println!("\nAdd one with: mcp-bridge add <name> <command> [args...]");
        return Ok(());
    }

    println!("Configured MCP servers:\n");
    for server in &config.servers {
        let status = if server.enabled { "enabled" } else { "disabled" };
        println!("  {} [{}]", server.name, status);
        println!("    command: {} {}", server.command, server.args.join(" "));
        if !server.env.is_empty() {
            println!("    env: {:?}", server.env);
        }
        println!();
    }

    Ok(())
}

fn cmd_import(path: &PathBuf) -> anyhow::Result<()> {
    let servers = config::import_claude_config(path)?;
    let mut config = load_config()?;

    let mut added = 0;
    let mut skipped = 0;

    for server in servers {
        let name = server.name.clone();
        match add_server(&mut config, server) {
            Ok(()) => {
                println!("Added: {}", name);
                added += 1;
            }
            Err(config::ConfigError::ServerExists(_)) => {
                println!("Skipped (already exists): {}", name);
                skipped += 1;
            }
            Err(e) => return Err(e.into()),
        }
    }

    save_config(&config)?;
    println!("\nImported {} servers ({} skipped)", added, skipped);
    Ok(())
}

async fn cmd_serve() -> anyhow::Result<()> {
    let config = load_config()?;
    tracing::info!("Starting MCP bridge in stdio mode");
    server::stdio::run(config).await
}

async fn cmd_daemon(port: u16) -> anyhow::Result<()> {
    let config = load_config()?;
    tracing::info!("Starting MCP bridge daemon on port {}", port);
    server::http::run(config, port).await
}
