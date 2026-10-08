export type FlowMode = "api" | "web";

export interface VideoGenerationParams {
  prompt: string;
  mode?: FlowMode;
  cameraMotion?:
    | "none"
    | "dolly_in"
    | "dolly_out"
    | "pan_left"
    | "pan_right"
    | "tilt_up"
    | "tilt_down"
    | "crane_up"
    | "orbit_clockwise"
    | "fpv_drone";
  aspectRatio?: "16:9" | "9:16" | "1:1";
  durationSeconds?: number;
  resolution?: "720p" | "1080p";
  startFramePath?: string;
  outputPath?: string;
  waitForCompletion?: boolean;
}

export interface ImageGenerationParams {
  prompt: string;
  mode?: FlowMode;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  numberOfImages?: number;
  outputPath?: string;
}

export interface CheckOperationParams {
  operationId: string;
  outputPath?: string;
}

export interface FlowServerStatus {
  activeMode: FlowMode;
  apiKeyConfigured: boolean;
  chromeDebugPort: number;
  chromeConnected: boolean;
  defaultOutputDir: string;
}
