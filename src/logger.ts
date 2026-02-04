import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";

export interface LogEntry {
  timestamp: string;
  mcp: string;
  tool: string;
  args: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  error?: string;
}

// Keep last 5000 entries max (~500KB-1MB depending on args)
const MAX_LOG_ENTRIES = 5000;
// Rotate when we hit 6000 (trim back to 5000)
const ROTATE_THRESHOLD = 6000;

function getLogDir(): string {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "mcp-central");
  }
  return path.join(os.homedir(), ".config", "mcp-central");
}

function getLogPath(): string {
  return path.join(getLogDir(), "usage.log");
}

export function logToolCall(entry: Omit<LogEntry, "timestamp">): void {
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  const logDir = getLogDir();
  fs.mkdirSync(logDir, { recursive: true });

  const logPath = getLogPath();
  fs.appendFileSync(logPath, JSON.stringify(logEntry) + "\n");

  // Check if rotation needed (do this async-ish, don't block)
  setImmediate(() => rotateIfNeeded(logPath));
}

function rotateIfNeeded(logPath: string): void {
  try {
    if (!fs.existsSync(logPath)) return;

    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    if (lines.length > ROTATE_THRESHOLD) {
      // Keep only the last MAX_LOG_ENTRIES
      const trimmed = lines.slice(-MAX_LOG_ENTRIES);
      fs.writeFileSync(logPath, trimmed.join("\n") + "\n");
    }
  } catch {
    // Ignore rotation errors, not critical
  }
}

export function readLogs(limit?: number): LogEntry[] {
  const logPath = getLogPath();

  if (!fs.existsSync(logPath)) {
    return [];
  }

  const content = fs.readFileSync(logPath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  const entries = lines.map((line) => {
    try {
      return JSON.parse(line) as LogEntry;
    } catch {
      return null;
    }
  }).filter((e): e is LogEntry => e !== null);

  if (limit && limit > 0) {
    return entries.slice(-limit);
  }

  return entries;
}

export async function watchLogs(onEntry: (entry: LogEntry) => void): Promise<() => void> {
  const logPath = getLogPath();
  const logDir = getLogDir();

  fs.mkdirSync(logDir, { recursive: true });

  // Create file if it doesn't exist
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, "");
  }

  // Track file position
  let position = fs.statSync(logPath).size;

  const watcher = fs.watch(logPath, (eventType) => {
    if (eventType === "change") {
      const stat = fs.statSync(logPath);
      if (stat.size > position) {
        const stream = fs.createReadStream(logPath, {
          start: position,
          end: stat.size,
        });

        const rl = readline.createInterface({ input: stream });

        rl.on("line", (line) => {
          if (line.trim()) {
            try {
              const entry = JSON.parse(line) as LogEntry;
              onEntry(entry);
            } catch {
              // ignore parse errors
            }
          }
        });

        position = stat.size;
      }
    }
  });

  return () => watcher.close();
}

// Formatting

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function truncateArgs(args: Record<string, unknown>, maxLen = 60): string {
  const str = JSON.stringify(args);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

export function formatLogEntry(entry: LogEntry, opts: { showDate?: boolean } = {}): string {
  const time = opts.showDate
    ? `${formatDate(entry.timestamp)} ${formatTime(entry.timestamp)}`
    : formatTime(entry.timestamp);

  const status = entry.success
    ? `${colors.green}✓${colors.reset}`
    : `${colors.red}✗${colors.reset}`;

  const duration = `${colors.dim}${formatDuration(entry.durationMs)}${colors.reset}`;
  const mcp = `${colors.cyan}${entry.mcp}${colors.reset}`;
  const tool = `${colors.yellow}${entry.tool}${colors.reset}`;
  const args = `${colors.dim}${truncateArgs(entry.args)}${colors.reset}`;

  let line = `${colors.dim}${time}${colors.reset} ${status} ${mcp}${colors.dim}/${colors.reset}${tool} ${duration}`;

  if (Object.keys(entry.args).length > 0) {
    line += ` ${args}`;
  }

  if (!entry.success && entry.error) {
    line += `\n         ${colors.red}└─ ${entry.error}${colors.reset}`;
  }

  return line;
}

export function formatLogHeader(count: number, total: number): string {
  if (count === total) {
    return `${colors.dim}─── ${count} log entries ───${colors.reset}\n`;
  }
  return `${colors.dim}─── showing ${count} of ${total} entries (use --all for full history) ───${colors.reset}\n`;
}

export function formatWatchingHeader(): string {
  return `${colors.dim}─── watching for new entries (ctrl+c to exit) ───${colors.reset}\n`;
}
