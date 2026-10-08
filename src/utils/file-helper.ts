import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger.js";

/**
 * Ensures the target directory exists and returns an absolute file path.
 */
export function ensureOutputDir(customPath?: string, defaultFilename: string = "output.bin"): string {
  const defaultDir = path.resolve(process.cwd(), "flow-outputs");
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }

  if (!customPath) {
    const timestamp = Date.now();
    return path.join(defaultDir, `${timestamp}-${defaultFilename}`);
  }

  const resolved = path.resolve(customPath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return resolved;
}

/**
 * Writes base64 data to a file on disk.
 */
export async function saveBase64ToFile(base64Data: string, targetPath: string): Promise<string> {
  const cleanData = base64Data.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(cleanData, "base64");
  fs.writeFileSync(targetPath, buffer);
  logger.info(`Saved artifact to: ${targetPath} (${buffer.length} bytes)`);
  return targetPath;
}

/**
 * Writes a binary buffer to disk.
 */
export async function saveBufferToFile(buffer: Buffer, targetPath: string): Promise<string> {
  fs.writeFileSync(targetPath, buffer);
  logger.info(`Saved artifact to: ${targetPath} (${buffer.length} bytes)`);
  return targetPath;
}
