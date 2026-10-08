import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { FlowMode } from "./types.js";
import { logger } from "./utils/logger.js";

// Attempt to load .env from current directory and parent directories
const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), ".env.local"),
];

for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

// Initial state
let currentMode: FlowMode =
  (process.env.FLOW_MCP_MODE?.toLowerCase() as FlowMode) ||
  (process.env.GEMINI_API_KEY ? "api" : "web");

export function getFlowConfig() {
  const defaultChromeDataDir =
    process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data")
      : process.platform === "darwin"
      ? path.join(process.env.HOME || "", "Library", "Application Support", "Google", "Chrome")
      : path.join(process.env.HOME || "", ".config", "google-chrome");

  return {
    mode: currentMode,
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
    flowBaseUrl: process.env.FLOW_BASE_URL || "https://flow.google/",
    chromeDebugPort: parseInt(process.env.CHROME_DEBUG_PORT || "9222", 10),
    chromeUserDataDir: process.env.CHROME_USER_DATA_DIR || defaultChromeDataDir,
    outputDir: path.resolve(process.cwd(), "flow-outputs"),
  };
}

export function setFlowMode(newMode: FlowMode) {
  currentMode = newMode;
  logger.info(`Switched Flow MCP mode to: [${newMode.toUpperCase()}]`);
  return currentMode;
}
