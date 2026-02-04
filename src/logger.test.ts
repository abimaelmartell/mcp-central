import { describe, it, expect } from "vitest";
import { formatLogEntry, type LogEntry } from "./logger.js";

const createEntry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  timestamp: "2024-01-15T10:30:00.000Z",
  mcp: "github",
  tool: "create_issue",
  args: { title: "Test" },
  durationMs: 234,
  success: true,
  ...overrides,
});

describe("logger", () => {
  describe("formatLogEntry", () => {
    it("should format a successful entry", () => {
      const entry = createEntry();
      const output = formatLogEntry(entry);

      expect(output).toContain("github");
      expect(output).toContain("create_issue");
      expect(output).toContain("234ms");
      expect(output).toContain("✓");
    });

    it("should format a failed entry with error", () => {
      const entry = createEntry({
        success: false,
        error: "Not found",
      });
      const output = formatLogEntry(entry);

      expect(output).toContain("✗");
      expect(output).toContain("Not found");
    });

    it("should truncate long args", () => {
      const entry = createEntry({
        args: { text: "a".repeat(100) },
      });
      const output = formatLogEntry(entry);

      expect(output).toContain("...");
    });

    it("should format duration in seconds for long calls", () => {
      const entry = createEntry({ durationMs: 2500 });
      const output = formatLogEntry(entry);

      expect(output).toContain("2.5s");
    });
  });
});
