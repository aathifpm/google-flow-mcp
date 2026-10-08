#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getFlowConfig, setFlowMode, setOutputDir } from "./config.js";
import {
  generateVideoWithApi,
  checkVideoOperationWithApi,
  generateImageWithApi,
} from "./engines/api-engine.js";
import {
  generateVideoWithWeb,
  generateImageWithWeb,
  isChromeConnected,
} from "./engines/web-engine.js";
import { FlowMode } from "./types.js";
import { logger } from "./utils/logger.js";

const server = new Server(
  {
    name: "google-flow-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "flow_generate_video",
        description:
          "Generate cinematic videos using Google Flow / Veo 3.1. Supports camera motion directives (dolly, pan, tilt, crane, orbit), aspect ratios, starting keyframes, and automatic local file saving. In Web mode, automatically detects completed generation in flow.google and downloads the resulting MP4.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Detailed description of the video scene, lighting, action, and style.",
            },
            mode: {
              type: "string",
              enum: ["api", "web"],
              description: "Optional override: force 'api' (Veo API) or 'web' (flow.google studio). Defaults to active server mode.",
            },
            camera_motion: {
              type: "string",
              enum: [
                "none",
                "dolly_in",
                "dolly_out",
                "pan_left",
                "pan_right",
                "tilt_up",
                "tilt_down",
                "crane_up",
                "orbit_clockwise",
                "fpv_drone",
              ],
              description: "Cinematic camera movement preset.",
            },
            aspect_ratio: {
              type: "string",
              enum: ["16:9", "9:16", "1:1"],
              default: "16:9",
              description: "Video aspect ratio.",
            },
            duration_seconds: {
              type: "number",
              description: "Desired clip duration in seconds (e.g. 5).",
            },
            resolution: {
              type: "string",
              enum: ["720p", "1080p"],
              description: "Resolution quality.",
            },
            start_frame_path: {
              type: "string",
              description: "Path to a local image to use as the starting frame (Image-to-Video).",
            },
            output_path: {
              type: "string",
              description: "Target file path to save the generated MP4 (e.g., './my-clip.mp4').",
            },
            wait_for_completion: {
              type: "boolean",
              default: true,
              description: "Whether to wait and poll until video rendering completes and file is saved.",
            },
          },
          required: ["prompt"],
        },
      },
      {
        name: "flow_generate_image",
        description:
          "Generate high-fidelity images using Imagen 3 or Google Flow. Automatically downloads and saves images to disk in both API and Web modes.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Description of the image to generate.",
            },
            mode: {
              type: "string",
              enum: ["api", "web"],
              description: "Optional mode override ('api' or 'web').",
            },
            aspect_ratio: {
              type: "string",
              enum: ["1:1", "16:9", "9:16", "4:3", "3:4"],
              default: "16:9",
              description: "Image aspect ratio.",
            },
            number_of_images: {
              type: "number",
              default: 1,
              description: "Number of image variations (1-4).",
            },
            output_path: {
              type: "string",
              description: "Local path where the image should be saved.",
            },
          },
          required: ["prompt"],
        },
      },
      {
        name: "flow_check_operation",
        description:
          "Check the status of an ongoing video generation operation and download the result if ready.",
        inputSchema: {
          type: "object",
          properties: {
            operation_id: {
              type: "string",
              description: "The operation ID returned by flow_generate_video.",
            },
            output_path: {
              type: "string",
              description: "Where to save the video file if generation has finished.",
            },
          },
          required: ["operation_id"],
        },
      },
      {
        name: "flow_set_mode",
        description:
          "Toggle the active engine between 'api' (Google Gen AI API / Veo & Imagen) and 'web' (flow.google studio automation).",
        inputSchema: {
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["api", "web"],
              description: "The engine mode to switch to.",
            },
          },
          required: ["mode"],
        },
      },
      {
        name: "flow_set_output_dir",
        description:
          "Set the default output directory where generated videos and images will be saved.",
        inputSchema: {
          type: "object",
          properties: {
            output_dir: {
              type: "string",
              description: "Folder path where generated media files should be saved by default.",
            },
          },
          required: ["output_dir"],
        },
      },
      {
        name: "flow_get_status",
        description:
          "Check current Google Flow MCP status, active mode, API key availability, default output folder, and Chrome connection status.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const config = getFlowConfig();

  try {
    switch (name) {
      case "flow_set_mode": {
        const mode = (args?.mode as FlowMode) || "api";
        const updated = setFlowMode(mode);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  activeMode: updated,
                  message: `Google Flow MCP mode is now set to [${updated.toUpperCase()}].`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "flow_set_output_dir": {
        const dir = String(args?.output_dir || "");
        const resolved = setOutputDir(dir);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  outputDirectory: resolved,
                  message: `Default output directory updated to: ${resolved}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "flow_get_status": {
        const chromeRunning = await isChromeConnected();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  activeMode: config.mode,
                  apiKeyConfigured: Boolean(config.apiKey),
                  chromeDebugPort: config.chromeDebugPort,
                  chromeConnected: chromeRunning,
                  flowBaseUrl: config.flowBaseUrl,
                  outputDirectory: config.outputDir,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "flow_generate_video": {
        const effectiveMode = (args?.mode as FlowMode) || config.mode;
        const videoParams = {
          prompt: String(args?.prompt || ""),
          mode: effectiveMode,
          cameraMotion: args?.camera_motion as any,
          aspectRatio: args?.aspect_ratio as any,
          durationSeconds: args?.duration_seconds as any,
          resolution: args?.resolution as any,
          startFramePath: args?.start_frame_path ? String(args.start_frame_path) : undefined,
          outputPath: args?.output_path ? String(args.output_path) : undefined,
          waitForCompletion: args?.wait_for_completion !== false,
        };

        let result: any;
        if (effectiveMode === "web") {
          result = await generateVideoWithWeb(videoParams);
        } else {
          result = await generateVideoWithApi(videoParams);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "flow_generate_image": {
        const effectiveMode = (args?.mode as FlowMode) || config.mode;
        const imgParams = {
          prompt: String(args?.prompt || ""),
          mode: effectiveMode,
          aspectRatio: args?.aspect_ratio as any,
          numberOfImages: Number(args?.number_of_images || 1),
          outputPath: args?.output_path ? String(args.output_path) : undefined,
        };

        let result: any;
        if (effectiveMode === "web") {
          result = await generateImageWithWeb(imgParams);
        } else {
          result = await generateImageWithApi(imgParams);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "flow_check_operation": {
        const opId = String(args?.operation_id || "");
        const outPath = args?.output_path ? String(args.output_path) : undefined;
        const result = await checkVideoOperationWithApi({
          operationId: opId,
          outputPath: outPath,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    logger.error(`Error executing ${name}:`, error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: true,
              tool: name,
              message: error.message || String(error),
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Run server using Stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Google Flow MCP Server started and ready on stdio transport.");
}

main().catch((err) => {
  logger.error("Fatal error starting Google Flow MCP server:", err);
  process.exit(1);
});
