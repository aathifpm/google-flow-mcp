import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import {
  VideoGenerationParams,
  ImageGenerationParams,
  CheckOperationParams,
} from "../types.js";
import { getFlowConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { ensureOutputDir, saveBase64ToFile, saveBufferToFile } from "../utils/file-helper.js";

let clientInstance: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const config = getFlowConfig();
  if (!config.apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Please set GEMINI_API_KEY in your environment or .env file to use API mode."
    );
  }
  if (!clientInstance) {
    clientInstance = new GoogleGenAI({ apiKey: config.apiKey });
  }
  return clientInstance;
}

/**
 * Maps camera motion preset names to cinematic prompt steering instructions.
 */
function enhancePromptWithCamera(prompt: string, cameraMotion?: string): string {
  if (!cameraMotion || cameraMotion === "none") return prompt;

  const motionMap: Record<string, string> = {
    dolly_in: "smooth slow cinematic dolly-in camera movement towards the subject",
    dolly_out: "cinematic dolly-out movement pulling back to reveal the wider scene",
    pan_left: "smooth camera pan to the left",
    pan_right: "smooth camera pan to the right",
    tilt_up: "dramatic camera tilt upwards",
    tilt_down: "smooth camera tilt downwards",
    crane_up: "cinematic crane jib shot rising upwards",
    orbit_clockwise: "360-degree orbit shot moving smoothly around the subject",
    fpv_drone: "dynamic FPV drone movement swooping smoothly through the environment",
  };

  const cameraDirective = motionMap[cameraMotion] || cameraMotion;
  return `${prompt}. Camera direction: ${cameraDirective}.`;
}

export async function generateVideoWithApi(params: VideoGenerationParams) {
  const ai = getClient();
  const finalPrompt = enhancePromptWithCamera(params.prompt, params.cameraMotion);

  logger.info(`[API Mode] Initiating Veo video generation for prompt: "${finalPrompt}"`);

  // Build model params
  const model = "veo-3.1-generate-preview";
  const requestConfig: any = {
    aspectRatio: params.aspectRatio || "16:9",
  };

  if (params.durationSeconds) {
    requestConfig.durationSeconds = params.durationSeconds;
  }

  // Handle start frame (Image-to-Video)
  let imageInput: any = undefined;
  if (params.startFramePath && fs.existsSync(params.startFramePath)) {
    const fileBytes = fs.readFileSync(params.startFramePath);
    const mime = params.startFramePath.endsWith(".png") ? "image/png" : "image/jpeg";
    imageInput = {
      imageBytes: fileBytes.toString("base64"),
      mimeType: mime,
    };
    logger.info(`[API Mode] Using starting frame from: ${params.startFramePath}`);
  }

  let operation = await ai.models.generateVideos({
    model,
    prompt: finalPrompt,
    image: imageInput,
    config: requestConfig,
  });

  const operationName = operation.name || "unknown-operation";
  logger.info(`[API Mode] Operation created: ${operationName}`);

  // If user requested waiting for completion, poll
  const shouldWait = params.waitForCompletion !== false;
  if (shouldWait) {
    logger.info(`[API Mode] Polling for video completion...`);
    const pollInterval = 8000;
    const maxAttempts = 30; // ~4 minutes max wait
    let attempts = 0;

    while (!operation.done && attempts < maxAttempts) {
      await new Promise((res) => setTimeout(res, pollInterval));
      attempts++;
      operation = await ai.operations.getVideosOperation({ operation });
      logger.info(
        `[API Mode] Polling status (${attempts}/${maxAttempts}): done=${operation.done}`
      );
    }
  }

  const generatedVideo = operation.response?.generatedVideos?.[0];
  let savedFilePath: string | undefined = undefined;

  if (generatedVideo?.video?.videoBytes) {
    const targetPath = ensureOutputDir(params.outputPath, "veo-video.mp4");
    const videoBuffer = Buffer.from(generatedVideo.video.videoBytes, "base64");
    await saveBufferToFile(videoBuffer, targetPath);
    savedFilePath = targetPath;
  }

  return {
    success: true,
    engine: "api",
    model,
    operationId: operationName,
    done: Boolean(operation.done),
    savedFilePath,
    videoUri: generatedVideo?.video?.uri,
    prompt: finalPrompt,
  };
}

export async function checkVideoOperationWithApi(params: CheckOperationParams) {
  const ai = getClient();
  logger.info(`[API Mode] Checking operation status for ID: ${params.operationId}`);

  const dummyOp: any = { name: params.operationId };
  const operation = await ai.operations.getVideosOperation({ operation: dummyOp });

  let savedFilePath: string | undefined = undefined;
  const generatedVideo = operation.response?.generatedVideos?.[0];

  if (generatedVideo?.video?.videoBytes) {
    const targetPath = ensureOutputDir(params.outputPath, "veo-video.mp4");
    const videoBuffer = Buffer.from(generatedVideo.video.videoBytes, "base64");
    await saveBufferToFile(videoBuffer, targetPath);
    savedFilePath = targetPath;
  }

  return {
    success: true,
    engine: "api",
    operationId: params.operationId,
    done: Boolean(operation.done),
    savedFilePath,
    videoUri: generatedVideo?.video?.uri,
    error: operation.error,
  };
}

export async function generateImageWithApi(params: ImageGenerationParams) {
  const ai = getClient();
  const model = "imagen-3.0-generate-002";
  logger.info(`[API Mode] Generating image with ${model} for: "${params.prompt}"`);

  const response = await ai.models.generateImages({
    model,
    prompt: params.prompt,
    config: {
      numberOfImages: params.numberOfImages || 1,
      aspectRatio: params.aspectRatio || "16:9",
      outputMimeType: "image/jpeg",
    },
  });

  const generatedImages = response.generatedImages || [];
  const savedPaths: string[] = [];

  for (let i = 0; i < generatedImages.length; i++) {
    const img = generatedImages[i];
    if (img?.image?.imageBytes) {
      const suffix = generatedImages.length > 1 ? `-${i + 1}.jpg` : ".jpg";
      const targetPath = ensureOutputDir(
        params.outputPath ? (i === 0 ? params.outputPath : `${params.outputPath}-${i + 1}.jpg`) : undefined,
        `imagen${suffix}`
      );
      await saveBase64ToFile(img.image.imageBytes, targetPath);
      savedPaths.push(targetPath);
    }
  }

  return {
    success: true,
    engine: "api",
    model,
    prompt: params.prompt,
    imagesCount: savedPaths.length,
    savedPaths,
  };
}
