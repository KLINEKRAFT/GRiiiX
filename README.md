# Klinekraft GR
An independent, local-first iPhone companion for the Ricoh GR IIIx.

## Studio Edition

The app opens to a dedicated **Shoot** screen with a large photo preview, one shutter button, exposure analysis and a clear **Apply to camera** ISO adjustment. Other sections: **Looks**, **Library**, and **More** (photo walks, studio utilities and insights). A low-glare dark theme is available under More.

**User-tested:** The Scriptable iPhone interface can connect to the Ricoh Wi-Fi, access a saved camera photo, and analyze it. The user reports intermittent capture timeouts. The current release adds an experimental recovery workflow that has passed simulated tests but still needs a physical-camera check.

**Camera writes:** ISO adjustment uses the camera's supported values and verifies the setting with a fresh read-back. Manual **Undo** and a max-three-frame Auto Correct workflow are available under their respective guards and consent prompts. Shutter speed, aperture, full film simulation and continuous live view control are not yet included.

### Install / update from iPhone

1. Connect to regular internet.
2. Copy [Scriptable-GR-Bridge.js](./Scriptable-GR-Bridge.js) into a script in the [Scriptable iPhone app](https://scriptable.app/), replacing any older bridge. Run it once to download the complete latest interface and styles.
3. Enable the GR IIIx camera's Wi-Fi and join its network from iPhone Settings.
4. Run the Scriptable script. Open **Shoot → Connect camera**.
5. Tap the shutter to **Capture & analyze**. If the response times out, choose **Recover last frame**; recovery never triggers another shutter action.
6. Under the latest analysis, select a shooting intent, check the explicit ISO consent, and **Apply to camera**. Verify the actual ISO on the camera. **Undo** restores the previous value.
7. Use **Advanced controls** for the SD card diagnostic, interval-related analysis, maximum ISO, activity log and guarded Auto Correct.

The camera's Wi-Fi need not provide internet access. The bridge caches the UI locally; if GitHub is temporarily unavailable, it retains the previous complete app instead of partially updating files.

**Privacy:** Pixel analysis stays on the iPhone. Original photos remain on the Ricoh SD card. The separate Library stores imported photos in the browser's local IndexedDB, which is not a permanent backup. Photo walks use local iPhone GPS but background recording can be suspended by iOS.

**Browser limits:** The hosted Vercel PWA is useful for offline photo imports, recipes and guidance, but secure iPhone browsers generally cannot directly send commands to the camera's local HTTP API. Remote shooting and ISO control require Scriptable. No Xcode is required for this workflow. A confirmed live Vercel deployment has not been established.

See [ADAPTIVE.md](./ADAPTIVE.md) for diagnostics, safe camera capture recovery, the firmware testing plan and known limitations.

## Photography Director: Cinematic

The Shoot screen now includes an optional **Photography Director** with an initial **Cinematic** strategy. It treats deep shadows as intentional, protects clipped highlights, and suggests restrained exposure changes. With your explicit consent, it can set ISO on the physical GR IIIx via Scriptable, subject to independent camera-side M-mode, fixed-ISO, exposure-state and ISO-step guards. A separately authorized **Director pass** can capture at most two frames with at most one verified intermediate ISO change.

Cinematic is a preview-based heuristic, not true AI scene recognition; it does **not** change shutter speed, aperture, film simulations, or RAW development. Read [DIRECTOR.md](./DIRECTOR.md) for exact setup, safety limits, and [repeatable tests](./tests/director.test.js). The new Director mode has not been tested on the user's camera yet.
