import { describe, it, expect } from "vitest";
import { namespaceTools, parseNamespacedTool, NAMESPACE_SEPARATOR } from "./types.js";

describe("namespacing", () => {
  it("should namespace a tool name", () => {
    expect(namespaceTools("github", "create_issue")).toBe("github__create_issue");
    expect(namespaceTools("fs", "read_file")).toBe("fs__read_file");
  });

  it("should parse a namespaced tool name", () => {
    const result = parseNamespacedTool("github__create_issue");
    expect(result).toEqual({ mcp: "github", tool: "create_issue" });
  });

  it("should return null for non-namespaced tool", () => {
    expect(parseNamespacedTool("create_issue")).toBeNull();
  });

  it("should handle multiple separators in tool name", () => {
    const result = parseNamespacedTool("github__create__issue");
    expect(result).toEqual({ mcp: "github", tool: "create__issue" });
  });

  it("should use correct separator", () => {
    expect(NAMESPACE_SEPARATOR).toBe("__");
  });
});
