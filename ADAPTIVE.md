# Adaptive Capture — implementation and hardware test guide

## Current status (2026-10-31)

**Implemented on GitHub** in `adaptive.js` and `adaptive.css`, attached to the existing PWA's **Adaptive** tab.

- **Works in iPhone Chrome/Safari without a camera:** import JPEG/HEIC previews, calculate brightness histogram percentiles, approximate clipped whites/deep shadows, edge-detail heuristic, recommend bounded exposure/ISO adjustment, compare previous vs. latest shots.
- **Does not upload any photo:** canvas processing happens locally in the browser and analysis shots are kept in the current page memory. Camera originals remain on its SD card.
- **Experimental optional native bridge:** `Scriptable-GR-Bridge.js` uses Scriptable's native `Request` to issue local HTTP camera requests. It downloads the web UI from this public GitHub repository into Scriptable's local documents folder for offline use; no Vercel deployment or Xcode required for this prototype path.
- **Hardware test pending:** script, image retrieval, and API format have not been validated on the user's physical GR IIIx or iOS version.
- **Automatic ISO adjustments intentionally disabled:** The auto-capture analysis state machine exists, but the visible Auto Correct button cannot be enabled until setting writes and read-back are safely verified on actual firmware. No claim of live remote functionality is made.

## iPhone setup — no Xcode

1. Install **Scriptable** from the iOS App Store.
2. While on an internet-connected network, open [Scriptable-GR-Bridge.js](https://github.com/KLINEKRAFT/GRiiiX/blob/main/Scriptable-GR-Bridge.js), copy the entire file into a **new script** in Scriptable, and run it once. Scriptable downloads this app's interface from GitHub and opens it.
3. In the GR IIIx menu, enable Wi-Fi and note the camera's network name and password.
4. Join the camera's Wi-Fi from iPhone Settings. Ignore the **No Internet Connection** message. Return to Scriptable. If the script was closed, run it again; the interface is stored locally and can open without internet.
5. Open the **Adaptive** tab, tap **Connect camera**. This makes `GET /v1/ping` and `GET /v1/props` requests. If connected, **Test capture** attempts a `POST /v1/camera/shoot`, lists new camera JPEGs, and downloads a medium preview for analysis.
6. The camera needs to be in a supported still-image capture mode and save JPEG or RAW+JPEG. **Test capture can actually actuate the shutter**. Do not use the test if photographing a sensitive or inaccessible scene.
7. If the camera shoots but the preview can't be found, the photo-list JSON format may differ by firmware. Record non-sensitive diagnostics and adjust the parser. The app reports failure, not success.
8. If remote requests fail, use the browser address `http://192.168.0.1/v1/ping` independently to verify the camera network. iOS app local network permissions may also need approval.

### Why Chrome is not a substitute for the bridge

Klinekraft GR on Vercel uses HTTPS. The camera uses plain HTTP on `192.168.0.1`. WebKit mixed-content and cross-origin restrictions prevent reliable direct camera requests from hosted Chrome/Safari on iPhone. Scriptable's native Request runs outside the web page and avoids using browser fetch for camera traffic. Scriptable is an additional installed iPhone app, but **no Xcode, Mac or paid developer account** is required.

Scriptable's WebView JavaScript bridge is experimental: the application is displayed via `loadFile()`, then JavaScript requests are exchanged with the outer native script using a small queue. Keep the Scriptable window open for remote shooting. This has not yet been exercised on the physical device; if the bridge transport behaves differently on the user's Scriptable version, adapt the bridge before enabling writes.

## Design and capture limits

- The exposure recommendation uses a histogram-based median target adjusted for *moody*, *balanced*, or *bright*. It prioritizes highlight preservation. It is **not** a subject-aware AI model and may misjudge deliberate silhouettes.
- Edge energy is a very rough proxy for local contrast, not confirmed focus or motion blur.
- Current ISO is manually entered, not synced from EXIF or camera props.
- Suggested ISO is capped between 100 and the selected upper bound; minimum shutter suggestions differ for moving/stationary scenes.
- The auto loop is bounded to at most three frames and aborts on missing previews, failed setting read-back, loss of connectivity or a stop request between operations. **Do not unlock ISO writes merely by setting `verified=true` in code**.
- After physical tests, add a `calibrateISO` sequence that reads existing values, gets explicit user consent, changes to a supported value, reads back the exact value, restores prior setting, and detects/handles restore errors. Only then could `verified` become true.
- Multi-shot processing retains only eight preview object URLs in memory. Retained originals always live on the Ricoh SD card; the user's PWA Library still handles standalone device-side imports.

## Reference materials

- https://github.com/CursedHardware/ricoh-wireless-protocol
- https://github.com/Nielk74/ricoh-gr3-android
- https://notes.secretsauce.net/notes/2022/06/16_ricoh-gr-iiix-80211-reverse-engineering.html
- https://docs.scriptable.app/webview/
- https://docs.scriptable.app/request/

## Next implementation milestones

1. Run Scriptable bridge against a real GR IIIx and capture actual read-only `/v1/props` and `/v1/photos` response schemas (redact SSID and passwords before committing fixtures).
2. Confirm camera capture and new-JPEG detection; adjust folder/file path parsing for the user's firmware.
3. Parse actual image EXIF (not estimated ISO) before analysis; add camera-aware exposure defaults.
4. Validate reversible camera settings writes and exact read-back before allowing auto-correction.
5. Add separate **Smart Assist** (always manual), **Auto Correct** (verified), and **Smart Bracket** (verified) modes with a photo quality gallery and user feedback.
6. Run mobile Safari/Chrome/WebView accessibility, offline and radio-switching tests.

