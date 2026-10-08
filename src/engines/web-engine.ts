import { chromium, Browser, BrowserContext, Page } from "playwright-core";
import { VideoGenerationParams, ImageGenerationParams } from "../types.js";
import { getFlowConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { ensureOutputDir } from "../utils/file-helper.js";

let activeBrowser: Browser | null = null;
let activeContext: BrowserContext | null = null;

/**
 * Attempts to connect to an existing Chrome browser with remote debugging enabled.
 */
async function getBrowserSession(): Promise<{ page: Page; context: BrowserContext }> {
  const config = getFlowConfig();
  const cdpUrl = `http://127.0.0.1:${config.chromeDebugPort}`;

  // 1. Try connecting via CDP to user's real logged-in Chrome
  try {
    logger.info(`[Web Mode] Checking for Chrome at ${cdpUrl}...`);
    activeBrowser = await chromium.connectOverCDP(cdpUrl, { timeout: 3000 });
    const contexts = activeBrowser.contexts();
    activeContext = contexts[0] || (await activeBrowser.newContext());
    const pages = activeContext.pages();
    const page = pages[0] || (await activeContext.newPage());
    logger.info(`[Web Mode] Successfully connected to existing Chrome session.`);
    return { page, context: activeContext };
  } catch (cdpErr: any) {
    logger.warn(
      `[Web Mode] Could not connect to Chrome on port ${config.chromeDebugPort}. Falling back to persistent launch...`
    );
  }

  // 2. Fallback: Launch persistent context with user data dir
  try {
    const launchOptions: any = {
      headless: false, // User needs to see and keep their Google login
      viewport: { width: 1280, height: 800 },
    };

    if (process.platform === "win32") {
      const possibleChromePaths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      ];
      for (const p of possibleChromePaths) {
        if (require("fs").existsSync(p)) {
          launchOptions.executablePath = p;
          break;
        }
      }
    }

    activeContext = await chromium.launchPersistentContext(
      config.chromeUserDataDir,
      launchOptions
    );
    const pages = activeContext.pages();
    const page = pages[0] || (await activeContext.newPage());
    return { page, context: activeContext };
  } catch (launchErr: any) {
    throw new Error(
      `Failed to launch or attach to Chrome for Google Flow automation.\n` +
        `Recommendation: Start your regular Chrome with remote debugging enabled:\n` +
        `Run: chrome.exe --remote-debugging-port=${config.chromeDebugPort}\n` +
        `Details: ${launchErr.message}`
    );
  }
}

export async function isChromeConnected(): Promise<boolean> {
  const config = getFlowConfig();
  try {
    const response = await fetch(`http://127.0.0.1:${config.chromeDebugPort}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function generateVideoWithWeb(params: VideoGenerationParams) {
  const config = getFlowConfig();
  const { page } = await getBrowserSession();

  logger.info(`[Web Mode] Navigating to Google Flow: ${config.flowBaseUrl}`);
  await page.goto(config.flowBaseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Check if sign-in is required
  const pageUrl = page.url();
  const pageContent = await page.content();
  if (pageUrl.includes("accounts.google.com") || pageContent.includes("Sign in")) {
    return {
      success: false,
      engine: "web",
      message:
        "Google Sign-In required. Please sign into your Google account in the opened Chrome browser window, then retry this tool.",
      currentUrl: pageUrl,
    };
  }

  // Look for creation input area in Flow Studio
  logger.info(`[Web Mode] Injecting generation prompt into Flow studio...`);
  const promptInput =
    (await page.$("textarea")) ||
    (await page.$("div[contenteditable='true']")) ||
    (await page.$('input[type="text"]'));

  if (!promptInput) {
    return {
      success: false,
      engine: "web",
      message:
        "Could not find the prompt input field on Google Flow page. Please ensure you are inside a project workspace.",
      currentUrl: page.url(),
    };
  }

  let finalPrompt = params.prompt;
  if (params.cameraMotion && params.cameraMotion !== "none") {
    finalPrompt += ` [Camera: ${params.cameraMotion}]`;
  }

  await promptInput.fill(finalPrompt);

  // Trigger submission (Enter or Generate button)
  const generateBtn =
    (await page.$('button:has-text("Generate")')) ||
    (await page.$('button:has-text("Create")')) ||
    (await page.$('button[aria-label*="Generate"]'));

  if (generateBtn) {
    await generateBtn.click();
  } else {
    await promptInput.press("Enter");
  }

  logger.info(`[Web Mode] Submitted prompt to Google Flow studio.`);

  return {
    success: true,
    engine: "web",
    message: "Prompt submitted to Google Flow web studio.",
    prompt: finalPrompt,
    currentUrl: page.url(),
  };
}

export async function generateImageWithWeb(params: ImageGenerationParams) {
  return generateVideoWithWeb({
    prompt: params.prompt,
    aspectRatio: params.aspectRatio === "1:1" ? "1:1" : "16:9",
  });
}
