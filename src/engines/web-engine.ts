import { chromium, Browser, BrowserContext, Page, Download } from "playwright-core";
import * as fs from "fs";
import { VideoGenerationParams, ImageGenerationParams } from "../types.js";
import { getFlowConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { ensureOutputDir, saveBase64ToFile, saveBufferToFile } from "../utils/file-helper.js";

let activeBrowser: Browser | null = null;
let activeContext: BrowserContext | null = null;

/**
 * Attempts to connect to an existing Chrome browser with remote debugging enabled,
 * or launches a persistent Chrome session.
 */
async function getBrowserSession(): Promise<{ page: Page; context: BrowserContext }> {
  const config = getFlowConfig();
  const cdpUrl = `http://127.0.0.1:${config.chromeDebugPort}`;

  // 1. Try connecting via CDP to user's real logged-in Chrome
  try {
    logger.info(`[Web Mode] Connecting to Chrome on ${cdpUrl}...`);
    activeBrowser = await chromium.connectOverCDP(cdpUrl, { timeout: 3000 });
    const contexts = activeBrowser.contexts();
    activeContext = contexts[0] || (await activeBrowser.newContext());
    const pages = activeContext.pages();
    const page = pages[0] || (await activeContext.newPage());
    logger.info(`[Web Mode] Successfully attached to existing Chrome session.`);
    return { page, context: activeContext };
  } catch (cdpErr: any) {
    logger.warn(
      `[Web Mode] Could not connect to Chrome on port ${config.chromeDebugPort}. Attempting persistent profile...`
    );
  }

  // 2. Fallback: Launch persistent context with user data dir
  try {
    const launchOptions: any = {
      headless: false,
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
    };

    if (process.platform === "win32") {
      const possibleChromePaths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      ];
      for (const p of possibleChromePaths) {
        if (fs.existsSync(p)) {
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
      `Failed to attach to Chrome for Google Flow automation.\n` +
        `Make sure your Chrome is running with remote debugging enabled:\n` +
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

/**
 * Downloads media from the browser page via blob evaluation, authenticated request, or download event.
 */
async function downloadMediaFromPage(
  page: Page,
  mediaSrc: string,
  targetPath: string
): Promise<string> {
  logger.info(`[Web Mode] Downloading media from src: ${mediaSrc.slice(0, 100)}...`);

  if (mediaSrc.startsWith("blob:")) {
    // Convert blob to base64 within page context
    const base64Data = await page.evaluate(async (blobUrl) => {
      const res = await fetch(blobUrl);
      const blob = await res.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read blob as data URL"));
        reader.readAsDataURL(blob);
      });
    }, mediaSrc);

    return await saveBase64ToFile(base64Data, targetPath);
  }

  if (mediaSrc.startsWith("http://") || mediaSrc.startsWith("https://")) {
    // Use page.request to retain cookies & auth headers
    const response = await page.request.get(mediaSrc);
    if (!response.ok()) {
      throw new Error(`Failed to fetch media from URL (${response.status()} ${response.statusText()})`);
    }
    const buffer = await response.body();
    return await saveBufferToFile(buffer, targetPath);
  }

  if (mediaSrc.startsWith("data:")) {
    return await saveBase64ToFile(mediaSrc, targetPath);
  }

  throw new Error(`Unsupported media URI scheme: ${mediaSrc.slice(0, 30)}`);
}

/**
 * Waits for a newly rendered video element or download button on Google Flow studio, then saves it.
 */
async function waitForMediaAndDownload(
  page: Page,
  isVideo: boolean,
  targetPath: string,
  initialUrls: string[],
  timeoutMs: number = 180000
): Promise<string> {
  const knownUrls = new Set(initialUrls);
  const startTime = Date.now();
  const pollInterval = 3000;

  logger.info(
    `[Web Mode] Waiting for ${isVideo ? "video" : "image"} generation to finish (timeout: ${timeoutMs / 1000}s)...`
  );

  while (Date.now() - startTime < timeoutMs) {
    // 1. Look for download event trigger if a download button exists
    try {
      const downloadBtn = await page.$(
        'button[aria-label*="Download" i], a[download], button:has-text("Download")'
      );
      if (downloadBtn && (await downloadBtn.isVisible())) {
        logger.info(`[Web Mode] Found active Download button. Triggering download...`);
        try {
          const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 8000 }),
            downloadBtn.click(),
          ]);
          await download.saveAs(targetPath);
          logger.info(`[Web Mode] Successfully downloaded via browser event to: ${targetPath}`);
          return targetPath;
        } catch {
          // Fall through to DOM element extraction if click didn't trigger download event
        }
      }
    } catch {
      // Continue polling
    }

    // 2. Scan DOM for newly rendered media
    const candidate = await page.evaluate(
      ({ isVideoQuery, knownUrlList }) => {
        const known = new Set(knownUrlList);

        if (isVideoQuery) {
          const videos = Array.from(document.querySelectorAll("video"));
          for (const v of videos) {
            const src = v.currentSrc || v.src || v.querySelector("source")?.src;
            if (src && !known.has(src)) {
              return { src, type: "video" };
            }
          }
        } else {
          const images = Array.from(document.querySelectorAll("img"));
          for (const img of images) {
            const src = img.currentSrc || img.src;
            if (src && !known.has(src) && (img.naturalWidth > 200 || img.width > 200)) {
              return { src, type: "image" };
            }
          }
        }

        // Also check any newly added video even if url was present but readyState reached completed
        const anyReadyVideo = Array.from(document.querySelectorAll("video")).find(
          (v) => (v.currentSrc || v.src) && v.readyState >= 2 && !known.has(v.currentSrc || v.src)
        );
        if (anyReadyVideo) {
          return { src: anyReadyVideo.currentSrc || anyReadyVideo.src, type: "video" };
        }

        return null;
      },
      { isVideoQuery: isVideo, knownUrlList: Array.from(knownUrls) }
    );

    if (candidate && candidate.src) {
      logger.info(`[Web Mode] Detected new ${candidate.type} element with src: ${candidate.src.slice(0, 80)}`);
      // Wait a brief moment to ensure media buffer is ready
      await page.waitForTimeout(2000);
      try {
        const saved = await downloadMediaFromPage(page, candidate.src, targetPath);
        return saved;
      } catch (err: any) {
        logger.warn(`[Web Mode] Could not download detected element yet (${err.message}). Retrying...`);
      }
    }

    // Check for error banners in Flow UI
    const errorText = await page.evaluate(() => {
      const errEl = document.querySelector('[role="alert"], .error-message, [aria-live="assertive"]');
      return errEl ? errEl.textContent : null;
    });
    if (errorText && errorText.trim().length > 0) {
      throw new Error(`Google Flow reported an error: ${errorText.trim()}`);
    }

    await page.waitForTimeout(pollInterval);
  }

  throw new Error(
    `Timeout after ${timeoutMs / 1000}s waiting for ${
      isVideo ? "video" : "image"
    } generation in Google Flow studio.`
  );
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

  // Snapshot existing media URLs before submitting
  const initialUrls = await page.evaluate(() => {
    const urls: string[] = [];
    document.querySelectorAll("video, img, source").forEach((el) => {
      const src = (el as HTMLVideoElement).currentSrc || el.getAttribute("src") || "";
      if (src) urls.push(src);
    });
    return urls;
  });

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

  // Trigger submission (Generate button or Enter)
  const generateBtn =
    (await page.$('button:has-text("Generate")')) ||
    (await page.$('button:has-text("Create")')) ||
    (await page.$('button[aria-label*="Generate"]'));

  if (generateBtn) {
    await generateBtn.click();
  } else {
    await promptInput.press("Enter");
  }

  logger.info(`[Web Mode] Generation triggered in Google Flow studio.`);

  const shouldWait = params.waitForCompletion !== false;
  let savedFilePath: string | undefined = undefined;

  if (shouldWait) {
    const targetPath = ensureOutputDir(params.outputPath, "flow-video.mp4");
    try {
      savedFilePath = await waitForMediaAndDownload(page, true, targetPath, initialUrls, 200000);
    } catch (waitErr: any) {
      logger.warn(`[Web Mode] Auto-download error: ${waitErr.message}`);
      return {
        success: false,
        engine: "web",
        message: `Generation was submitted, but automatic download failed: ${waitErr.message}`,
        prompt: finalPrompt,
        currentUrl: page.url(),
      };
    }
  }

  return {
    success: true,
    engine: "web",
    message: savedFilePath
      ? "Video generated and downloaded successfully."
      : "Generation submitted to Google Flow web studio.",
    prompt: finalPrompt,
    savedFilePath,
    currentUrl: page.url(),
  };
}

export async function generateImageWithWeb(params: ImageGenerationParams) {
  const config = getFlowConfig();
  const { page } = await getBrowserSession();

  logger.info(`[Web Mode] Navigating to Google Flow for image generation: ${config.flowBaseUrl}`);
  await page.goto(config.flowBaseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const initialUrls = await page.evaluate(() => {
    const urls: string[] = [];
    document.querySelectorAll("img").forEach((el) => {
      const src = el.currentSrc || el.getAttribute("src") || "";
      if (src) urls.push(src);
    });
    return urls;
  });

  const promptInput =
    (await page.$("textarea")) ||
    (await page.$("div[contenteditable='true']")) ||
    (await page.$('input[type="text"]'));

  if (!promptInput) {
    return {
      success: false,
      engine: "web",
      message: "Could not find prompt input field on Google Flow page.",
      currentUrl: page.url(),
    };
  }

  await promptInput.fill(params.prompt);

  const generateBtn =
    (await page.$('button:has-text("Generate")')) ||
    (await page.$('button:has-text("Create")')) ||
    (await page.$('button[aria-label*="Generate"]'));

  if (generateBtn) {
    await generateBtn.click();
  } else {
    await promptInput.press("Enter");
  }

  const targetPath = ensureOutputDir(params.outputPath, "flow-image.jpg");
  let savedFilePath: string | undefined = undefined;

  try {
    savedFilePath = await waitForMediaAndDownload(page, false, targetPath, initialUrls, 90000);
  } catch (err: any) {
    logger.warn(`[Web Mode] Image auto-download error: ${err.message}`);
    return {
      success: false,
      engine: "web",
      message: `Image generation was submitted, but download timed out: ${err.message}`,
      prompt: params.prompt,
      currentUrl: page.url(),
    };
  }

  return {
    success: true,
    engine: "web",
    message: "Image generated and downloaded successfully.",
    prompt: params.prompt,
    savedFilePath,
    currentUrl: page.url(),
  };
}
