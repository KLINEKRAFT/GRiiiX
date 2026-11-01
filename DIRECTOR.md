# Photography Director — Cinematic v1

## What it does

**Photography Director** is a new, optional mode in the **Shoot** screen. Its first strategy, **Cinematic**, evaluates each camera preview with a deliberately conservative brightness policy:

- **Preserve highlights:** appreciable clipped whites trigger a modest ISO reduction.
- **Keep the darkness:** heavily shadowed, low-key frames are left alone. The app does not brighten silhouettes simply to center a histogram.
- **Avoid a flat, overly bright look:** when the image is high-key and lacks substantial shadows, it can propose a small ISO reduction.
- **Only lift carefully:** a relatively dark, low-clipping frame with moderate shadows may receive a small ISO increase.
- **Limit every adjustment:** suggested changes are capped at ±0.7 stop, ISO at 6400, and camera-supported ISO tokens are used. Device-side logic rejects a quantized ISO jump larger than approximately 0.85 stop.

This is **a JPEG-preview heuristic**, not trained AI, true scene recognition, reliable highlight recovery, or an automatic film simulation. The intent is creative assistance that leaves room for the photographer's judgment.

## Use on iPhone

1. With regular internet access, copy the latest [Scriptable-GR-Bridge.js](./Scriptable-GR-Bridge.js) into your Scriptable app and run it once. The entire UI, including the new `director.js`, will be cached on your iPhone. You do **not** need Xcode.
2. Join the GR IIIx Wi-Fi in iPhone Settings. Return to Scriptable and run the bridge. Open **Shoot → Connect camera**.
3. Choose **M** mode with a **fixed ISO** on the Ricoh. Set aperture and shutter speed on the camera; Cinematic v1 cannot change them.
4. On Shoot, turn **Photography Director → Cinematic → Enable** on. The scene selector remains available for your reference.
5. Capture a photo. Review the advice directly beneath the preview. The app may correctly recommend **no change** for an intentionally dark frame.
6. If a change is recommended, explicitly check **Allow this ISO change on my camera** and tap **Apply Director ISO**. The Scriptable camera bridge checks the camera mode and current ISO, sends a bounded update, reads ISO back and verifies it. If the response cannot be verified, the app reports a failure and will not claim success. Use **Undo** when appropriate.
7. After at least one confirmed camera ISO write in the current session, expand **Advanced controls → Cinematic Director pass** and check its separate authorization box. **Run Director pass** takes at most two frames, makes at most one intermediate ISO adjustment, and verifies that adjustment before any subsequent shot.
8. If a shot times out, choose **Recover last frame**. This only looks for an existing image; it does not send a second shutter request.

## Safety boundaries

- No automatic change to aperture, shutter speed, exposure compensation, or film simulation.
- All Cinematic writes require **M exposure mode**, **fixed numeric ISO**, the camera's supported ISO list, unchanged expected current ISO, and (where reported) unchanged shutter/aperture. Checks exist in **both the UI and the Scriptable camera bridge**.
- User must authorize any manual ISO write. A separate confirmation is required for the two-shot Director pass. If a write or read-back fails, the sequence stops.
- Camera ISO writes are blocked when the selected value exceeds 6400, or the actual supported ISO step would be too large. If your camera is currently above the limit, lower ISO manually first.
- Camera originals remain on the GR IIIx SD card. No photograph is uploaded for cloud image analysis.
- Changing a camera setting can still affect the physical camera if the confirmation response is lost. If uncertain, inspect the camera display and use Refresh camera ISO or Undo before proceeding.
- Current implementation uses exposure information measured from a downscaled **JPEG preview**; some clipped highlights may arise from the camera's JPEG processing rather than RAW clipping. A high-contrast scene is not necessarily a failed shot.
- No promise of fully autonomous shooting under all firmware, memory-card or Wi-Fi conditions.

## Technical architecture

- `director.js` is a dependency-free pure planner and safety preflight that returns labels, reasons, bounded ISO targets and hold decisions. It never sends requests.
- `adaptive.js` renders the Cinematic Director panel and handles user consent, on-device analysis, single-shot adjustments, and the bounded two-frame sequence.
- `Scriptable-GR-Bridge.js` enforces Cinematic ISO policy **on the device side**, rejects unsupported writes and reads camera values back.
- `studio.css` keeps the Director interface aligned with the minimal editorial look. `index.html`, Scriptable's cache list and `sw.js` load the module offline.

Run the dependency-free tests with:

```sh
node --test tests/director.test.js
```

**Hardware status:** The user has successfully tested remote camera photo review and some ISO control. This new Cinematic Director flow has passed mocked read/write and UI checks but has not yet been tested end-to-end against their GR IIIx firmware.
