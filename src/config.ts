import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { FlowMode } from "./types.js";
import { logger } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");

// Attempt to load .env from current directory, package directory, and parent directories
const envCandidates = [
  path.resolve(packageRoot, ".env"),
  path.resolve(packageRoot, ".env.local"),
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

// Memory-persisted custom output directory (if set via tool or config)
let configuredOutputDir: string | null = process.env.FLOW_OUTPUT_DIR || null;

// Initial mode
let currentMode: FlowMode =
  (process.env.FLOW_MCP_MODE?.toLowerCase() as FlowMode) ||
  (process.env.GEMINI_API_KEY ? "api" : "web");

export function getDefaultOutputDir(): string {
  if (configuredOutputDir) {
    return path.resolve(configuredOutputDir);
  }
  // Instead of using process.cwd() (which may be Kiro's or another client's program folder),
  // default to the package's local flow-outputs directory or user's project folder.
  const defaultDir = path.resolve(packageRoot, "flow-outputs");
  if (!fs.existsSync(defaultDir)) {
    try {
      fs.mkdirSync(defaultDir, { recursive: true });
    } catch {
      // fallback
    }
  }
  return defaultDir;
}

export function setOutputDir(newDir: string): string {
  const resolved = path.resolve(newDir);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  configuredOutputDir = resolved;
  logger.info(`Output directory updated to: ${resolved}`);
  return resolved;
}

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
    outputDir: getDefaultOutputDir(),
  };
}

export function setFlowMode(newMode: FlowMode): FlowMode {
  currentMode = newMode;
  logger.info(`Switched Flow MCP mode to: [${newMode.toUpperCase()}]`);
  return currentMode;
}
