# Klinekraft GR — Studio Edition

The Ricoh GR IIIx iPhone companion runs without Xcode using **Scriptable** and the camera's local Wi-Fi. The app has four principal sections: **Shoot, Looks, Library, More**. Additional GPS, timers, and statistics are found under More.

## What's new

- A photograph-first **Shoot** workspace with a large preview, one clear capture action, creative subject/rendering selections and a restrained exposure recommendation.
- **Apply to camera** adjusts ISO when supported by the GR IIIx and reads the actual camera value back. **Undo** restores the previous value. No success is claimed without verification.
- **Advanced controls** contains read-only camera diagnostics, manual ISO limit, automated capture consent, logs, and frame comparison.
- A warm light theme and optional low-glare dark theme (More → Appearance).
- Film looks and local photo library use quiet editorial layouts rather than a dense card dashboard.
- **Safer camera timeouts:** the bridge records a pending shutter request before sending the shutter command. If an HTTP call times out, it does **not** resend the shutter. The next action is **Recover last frame**. Recovery only performs GET requests and does not take another photo. Pending state is saved in Scriptable's local folder across restarts.
- Camera previews try a medium `?size=view` image, then fall back to smaller `?size=thumb` if necessary.
- App updates are staged before writing to Scriptable storage; an interrupted GitHub download leaves the previous complete version intact.

## How to install the update on iPhone

1. Connect the iPhone to regular internet. In your original Scriptable script, replace all code with the latest [Scriptable-GR-Bridge.js](./Scriptable-GR-Bridge.js). Run it once and tap OK on the startup alert. It downloads the app interface and styles.
2. On the Ricoh, turn on Wi-Fi and use a fixed ISO in M mode for exposure-control testing. Join the Ricoh Wi-Fi in iPhone Settings. The **No Internet Connection** warning is normal.
3. Return to Scriptable and run the script; it uses the local cached interface when Github isn't reachable over the camera network.
4. Open **Shoot**. Tap **Connect camera**. Tap the shutter circle to take a photograph and analyze its JPEG preview.
5. If the app reports a pending shot, tap **Recover last frame**. This **does not** fire the shutter again. Use **Advanced controls → Discard pending marker** only when you're sure the previous shot no longer needs recovering.
6. Select the subject and desired rendering, review the suggested ISO, check the consent box and tap **Apply to camera**. The app reads the camera back to verify it. Undo is available for a previous setting change.
7. Under **Advanced controls**, **Auto Correct** becomes available after a verified ISO adjustment. It requires manual exposure mode (M), fixed ISO, and separate consent. It captures at most three frames and stops if read-back or retrieval fails.

## Limitations and safety

- The user has confirmed successful Scriptable app launch, camera photo review/analysis, and intermittent camera control. The newly implemented timeout recovery and redesigned UI still require physical-camera validation.
- Chrome/Safari on a Vercel-hosted HTTPS site cannot reliably send commands to the camera's plain HTTP API; the Scriptable iPhone bridge remains necessary for shooting and ISO changes.
- The scene analysis uses locally calculated JPEG brightness statistics, not scene-aware AI. It can misjudge silhouettes and intentionally dark photographs. "Edge detail" is not reliable motion or focus detection.
- An ISO change can be offset by automatic shutter/aperture adjustments in non-manual modes. Use M and fixed ISO for controlled testing.
- Unstable camera Wi-Fi may delay saving or downloading a frame. Pending recovery prevents accidental double shutter presses. If a preview remains pending, the original may still exist on the camera's SD card.
- Camera originals are never deleted. Browser imported images/recipes can be lost if iOS clears web data. Keep original photographs backed up.
- No cloud upload of image analysis. GPS walks can be interrupted when the app is in the background.
- The Scriptable bridge has a limited allow-list of camera commands and does not modify firmware.
- Avoid publishing raw camera network credentials, serial numbers, or personal photos to this public repository.

## Technical details

Relevant routes: GET `/v1/ping`, GET `/v1/props`, GET `/v1/photos`, GET `/v1/photos/{folder}/{filename}?size=view|thumb`, POST `/v1/camera/shoot`, and PUT `/v1/params/camera` with form-encoded ISO `sv`. ISO write requests validate camera-reported supported values, verify the current value before writing, and read back the final value. No arbitrary API endpoints are exposed to the UI.

The code is organized in `index.html` (existing app and data), `adaptive.js` (Shoot, Looks, Library and More UI, analysis), `adaptive.css` (legacy compatibility), `studio.css` (editorial visual design), `Scriptable-GR-Bridge.js` (camera/network host) and `sw.js` (offline web shell).

## Next development priorities

1. Test slow SD cards, camera save latency, camera disconnects, and recovery behavior on real hardware.
2. Extract EXIF metadata from the camera's photo info endpoint to improve shooting recommendations, especially in bright daylight.
3. After independent mode-specific validation, add shutter/aperture controls with reversible writes.
4. Improve optional live view and focus controls using the same safe camera transport.
