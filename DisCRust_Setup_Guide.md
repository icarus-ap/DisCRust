# DisCRust v0.6.6 — Architecture, RAM Optimization & Direct OTA Guide (`APP.md`)

**Version:** `0.6.6` (`0.6.6-rust` / Installer `v6.6.0`)  
**Binary Name:** `DisCRust.exe`  
**Setup Launcher:** `DisCRust_v0.6.6_Setup.exe` (Native 64-Bit Windows GUI PE32+ Launcher — Zero VBS / Zero VS Build Tools Required)  
**OTA Publisher:** `Publish_OTA_Update.bat` (`ota_publish.ps1` + `ota_manifest.json`)

---

## 1. How to Push Updates Directly to Users (Direct OTA System)

DisCRust v0.6.6 includes a built-in **Over-The-Air (OTA) Auto-Updater** so existing users receive your updates automatically on launch (or when clicking **Check OTA** in `Configurations -> System`) without needing to download a new installer zip.

### Step-by-Step Setup (One-Time Setup for You):
1. Create a public GitHub repository (for example, `https://github.com/<YourUsername>/DisCRust`) and push the contents of this `DisCRust_v0.6.6` folder to the `main` branch.
2. Double-click **`Publish_OTA_Update.bat`** in your folder:
   - Enter your GitHub repository (`<YourUsername>/DisCRust` or full raw URL `https://raw.githubusercontent.com/<YourUsername>/DisCRust/main`).
   - Enter the version number (e.g., `0.6.7`) and release notes, then click **Generate & Push OTA**.
3. **What happens automatically:**
   - `Publish_OTA_Update.bat` updates `ota_manifest.json` and stamps your repository's `ota_manifest.json` URL into `src/injected_engine.js`, `src/main.rs`, and `src/DisLiteNativeHost.cs`, then commits and pushes to GitHub (`git add -A && git commit && git push`).
   - Whenever any user opens DisCRust (after 6.5 seconds, or when they click **Check OTA** in `Configurations -> System`), their client fetches `ota_manifest.json`, downloads the latest `src/injected_engine.js`, `src/main.rs`, `src/DisLiteNativeHost.cs`, `APP.md`, and Vencord bundle into `%LOCALAPPDATA%\DisLiteRust01`, and applies the update immediately!
   - Users can also paste a custom `ota_manifest.json` URL directly inside **Configurations -> System -> OTA Update Channel URL**.

---

## 2. RAM Optimization & Code Audit Fixes (v0.6.6)

### 2.1 Why RAM Spiked to ~550 MB Before & How It Was Fixed
1. **Restored Chromium V8 `MemoryReducer` & Blink Image Cache GC:**
   - Removed `--disable-renderer-backgrounding`, `--disable-backgrounding-occluded-windows`, `--disable-features=AudioServiceOutOfProcess`, and `CanvasOopRasterization` (which disabled V8 idle garbage collection and allowed `#chat` renderer memory to grow to `424 MB`).
   - Added `--renderer-process-limit=2 --js-flags=--max-old-space-size=256` and `SpareRendererForSitePerProcess` disablement while preserving `--disable-background-timer-throttling`, `--disable-features=UseEcoQoSForBackgroundProcess`, `--enable-gpu-rasterization`, and `--enable-zero-copy` so 60 FPS hardware video streaming and `AudioWorklet` audio stay 100% unthrottled.
2. **Fixed Sandboxed WebView2 Renderer Working-Set Compaction (`0x1100` Access Mask):**
   - On Windows 11, calling `OpenProcess` with `PROCESS_VM_READ` (`0x0010`) fails with `ERROR_ACCESS_DENIED` on sandboxed `msedgewebview2.exe --type=renderer` processes (`WebView2: Discord | #chat`).
   - Both `src/main.rs` and `src/DisLiteNativeHost.cs` now open all `msedgewebview2.exe` processes using `PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_QUOTA` (`0x1100`) and run `K32EmptyWorkingSet` + `SetProcessWorkingSetSize` every **7 seconds**, compacting the entire `WebView2 Manager (6)` tree down to ~95–155 MB.
3. **Line-by-Line JS Engine Cleanup (`src/injected_engine.js`):**
   - Replaced the 60 FPS `requestAnimationFrame` PiP-tracking loop with a cached-element `110ms` interval that only runs while the stream pill is minimized.
   - Reduced audio ring buffer allocations by 50% and bypassed duplicate main-thread ring buffer writes when `AudioWorkletNode` is active.
   - Added `compactOffscreenDiscordMedia()` every 9 seconds to pause offscreen `#chat` preview videos and prune the temporary Webpack module cache (`allLoadedModules`) once Discord's stores are harvested.

---

## 3. Summary of All Working v0.6.6 Features
- **High-Bitrate Anti-Stutter Streaming (`6.5–20 Mbps`) + Real-Time `AudioWorklet` Per-App Audio** (`VAD\Process_Loopback` with automatic WASAPI self-healing).
- **Combined, Draggable `DisCRust Stream & Privacy` Hub** (minimized pill automatically follows Discord's Floating Stream Preview PiP and expands cleanly inside the active corner without overflowing the window).
- **Modern Rounded Window Corners** on both the Installer (`Installer v6.6.0`) and Client Window (when not maximized/full-screen).
- **Keyboard Shortcuts & Remapping Menu** (`Alt+Q` Quest Completer Interface, `Alt+F` Floating Quest Window, `Alt+C` Configurations, `Alt+K` Shortcuts Menu, `Alt+R` Restart, `Alt+X` Quit) with toggleable title bar icons and direct access inside Configurations.
