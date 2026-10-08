# Google Flow MCP Server

A unified [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for **Google Flow**, allowing AI assistants to control generative video and image models directly with a mode toggle.

## Architecture & Modes

This MCP server supports two interchangeable engines via a toggle:

1. **API Mode (Headless Veo & Imagen 3)**
   - Connects to Google's official Gen AI endpoints (`@google/genai`).
   - Powered by **Veo 3.1** (`veo-3.1-generate-preview`) and **Imagen 3** (`imagen-3.0-generate-002`).
   - Direct parameters for camera movement vectors (dolly, pan, tilt, crane, orbit), aspect ratios, starting keyframes, and automatic local file saving.
   - Ideal for headless scripting, automated production, and CI/CD pipelines.

2. **Web Mode (flow.google Studio Automation with Auto-Download)**
   - Connects to your active, logged-in Google Chrome session via Chrome DevTools Protocol (CDP).
   - Directly drives the [Google Flow](https://flow.google/) web workspace.
   - Utilizes your Google AI subscription / Flow credits without per-API billing.
   - **Auto-downloads completed videos and images** directly to disk using DOM detection, blob extraction, and download stream listeners.

---

## Tools Exposed

| Tool | Parameters | Description |
| :--- | :--- | :--- |
| `flow_generate_video` | `prompt`, `mode?`, `camera_motion?`, `aspect_ratio?`, `duration_seconds?`, `resolution?`, `start_frame_path?`, `output_path?`, `wait_for_completion?` | Generates video via Veo 3.1 or Flow Studio. In Web mode, automatically detects completed generation in flow.google and downloads the resulting MP4. |
| `flow_generate_image` | `prompt`, `mode?`, `aspect_ratio?`, `number_of_images?`, `output_path?` | Generates high-fidelity images via Imagen 3 or Flow Studio and downloads them to disk. |
| `flow_check_operation` | `operation_id`, `output_path?` | Checks status of long-running video generation and downloads the rendered MP4. |
| `flow_set_output_dir` | `output_dir` | Sets the default directory where all media files will be saved. |
| `flow_set_mode` | `mode: "api" \| "web"` | Switches active default mode at runtime (`"api"` or `"web"`). |
| `flow_get_status` | *(none)* | Returns active mode, API key status, Chrome CDP connection state, and current output directory. |

---

## Quick Setup

### 1. Build the Server
```bash
npm install
npm run build
```

### 2. Configure MCP Client

Add the server to your MCP configuration (e.g. `~/.gemini/config/mcp_config.json`, `claude_desktop_config.json`, or Kiro):

```json
{
  "mcpServers": {
    "GoogleFlowMCP": {
      "command": "node",
      "args": [
        "c:/Users/Aathif/Documents/GitHub/northline ops/google-flow-mcp/dist/index.js"
      ],
      "env": {
        "FLOW_MCP_MODE": "web",
        "FLOW_OUTPUT_DIR": "c:/Users/Aathif/Documents/GitHub/northline ops/public/media"
      }
    }
  }
}
```

### 3. Using Web Mode (flow.google Automation)

To use your logged-in Google Flow subscription:

1. Close existing Chrome instances and start Chrome with remote debugging:
   ```powershell
   chrome.exe --remote-debugging-port=9222
   ```
2. Open `https://flow.google/` and ensure you are logged into your Google account.
3. The MCP server will automatically attach to this browser session to create projects, generate clips, and download files locally!
