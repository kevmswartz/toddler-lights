# Govee Lights Controller

Minimal LAN + cloud controls for Wi‑Fi Govee lights. The frontend is a small vanilla JS page served inside a Tauri shell so it can send UDP (LAN control on port 4003) and proxy HTTPS requests to the official Govee Cloud API.

## Prerequisites

- Node.js 18+
- Rust toolchain (for Tauri)
- A Govee light that supports LAN control (UDP 4003) and/or a Govee developer API key for cloud control

## Install & Run

```bash
npm install
npm run build           # copies static assets to dist/ and builds tailwind.css
npm run tauri:dev       # run the desktop shell with live reload
npm run tauri:build     # create a release build
```

## Using the App

1. Launch via `npm run tauri:dev`.
2. Enter your light’s IP and optional port (defaults to 4003). Click **Save target**.
3. Use **Discover lights** to multicast on 239.255.255.250:4001 and pick a device automatically.
4. Send **On/Off/Toggle**, **Brightness**, or **Color** from the LAN panel.
5. For cloud control, paste your Govee developer API key, load devices, select one, and send power/brightness/color commands or fetch cloud state.

LAN and cloud calls only work inside the Tauri shell because the browser cannot send UDP or bypass CORS for the Govee API.
