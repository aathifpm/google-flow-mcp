/**
 * Safe logger for MCP servers communicating over stdio.
 * All logs are written exclusively to stderr so that JSON-RPC on stdout is not corrupted.
 */
export const logger = {
  info: (...args: unknown[]) => {
    console.error("[Flow-MCP INFO]", ...args);
  },
  warn: (...args: unknown[]) => {
    console.error("[Flow-MCP WARN]", ...args);
  },
  error: (...args: unknown[]) => {
    console.error("[Flow-MCP ERROR]", ...args);
  },
  debug: (...args: unknown[]) => {
    if (process.env.DEBUG || process.env.FLOW_DEBUG) {
      console.error("[Flow-MCP DEBUG]", ...args);
    }
  },
};
