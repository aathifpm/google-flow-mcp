# Google Flow MCP Server

A unified [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for **Google Flow**, allowing AI assistants to control generative video and image models directly with a mode toggle.

## Architecture & Modes

This MCP server supports two interchangeable engines via a toggle:

1. **API Mode (Headless Veo & Imagen 3)**
   - Connects to Google's official Gen AI endpoints (`@google/genai`).
   - Powered by **Veo 3.1** (`veo-3.1-generate-preview`) and **Imagen 3** (`imagen-3.0-generate-002`).
   - Direct parameters for camera movement vectors (dolly, pan, tilt, crane, orbit), aspect ratios, starting keyframes, and automatic local file saving.
   - Ideal for headless scripting, automated production, and CI/CD pipelines.

2. **Web Mode (flow.google Studio Automation)**
   - Connects to your active, logged-in Google Chrome session via Chrome DevTools Protocol (CDP).
   - Directly drives the [Google Flow](https://flow.google/) web workspace.
   - Utilizes your Google AI subscription / Flow credits without per-API billing.
   - Ideal for visual studio workflows, creative ingredient reuse, and timeline management.

---

## Tools Exposed

| Tool | Description |
| :--- | :--- |
| `flow_generate_video` | Generates cinematic video using Veo 3.1 or Flow Studio with camera controls (`dolly_in`, `orbit`, `pan`, etc.), aspect ratios, duration, and start frame keyframing. |
| `flow_generate_image` | Generates high-fidelity images using Imagen 3 or Flow Studio. |
| `flow_check_operation` | Checks status of long-running video generation and downloads the rendered MP4. |
| `flow_set_mode` | Switches active default mode at runtime (`"api"` or `"web"`). |
| `flow_get_status` | Returns active mode, API key status, Chrome CDP connection state, and output directory. |

---

## Quick Setup

### 1. Build the Server
```bash
npm install
npm run build
```

### 2. Configure MCP Client

Add the server to your MCP configuration (e.g. `~/.gemini/config/mcp_config.json`, `claude_desktop_config.json`, or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "GoogleFlowMCP": {
      "command": "node",
      "args": [
        "c:/Users/Aathif/Documents/GitHub/northline ops/google-flow-mcp/dist/index.js"
      ],
      "env": {
        "FLOW_MCP_MODE": "api",
        "GEMINI_API_KEY": "YOUR_GEMINI_API_KEY"
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
3. The MCP server will automatically attach to this browser session to create projects and trigger generations!

---

## Camera Movement Controls (Veo)

The `flow_generate_video` tool accepts the `camera_motion` parameter with the following presets:
- `dolly_in` / `dolly_out`: Moves camera forward/backward along the optical axis.
- `pan_left` / `pan_right`: Smooth horizontal rotation.
- `tilt_up` / `tilt_down`: Vertical camera angle shift.
- `crane_up`: Cinematic jib/crane rising elevation.
- `orbit_clockwise`: Smooth 360-degree rotation around the subject.
- `fpv_drone`: Dynamic first-person drone trajectory.
