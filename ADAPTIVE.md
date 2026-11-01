# Adaptive Capture — Ricoh GR IIIx iPhone companion

## Status (October 31, 2026)

The user has confirmed that the iPhone Scriptable bridge works, and that photo retrieval/analysis works with the camera. New **camera ISO writing** is implemented from the published Ricoh wireless protocol but is **not yet tested on this physical camera**.

- `adaptive.js`: image analysis, local before/after comparisons, manual **Apply suggested ISO**, **Undo ISO change**, and a bounded **Auto Correct** loop.
- `Scriptable-GR-Bridge.js`: camera read/write bridge using native Scriptable `Request`. Supports `getSettings`, and `setISO` with expected-current-value checks, camera-advertised supported ISO options, a max-ISO limit, form-encoded PUT, and a fresh GET read-back. No arbitrary remote paths or setting keys are accepted from the app.
- The *first* confirmed camera ISO change via Apply suggestion unlocks Auto Correct for that session. A same-value/no-op write does **not** unlock it. Any mismatch or failed write stops automation.
- `GR-Camera-Diagnostic.js`: independent read-only camera test.
- Vercel-hosted Chrome/Safari provides local photo analysis. Actual camera control requires opening the downloaded HTML inside Scriptable, **not** a hosted web page.
- No Xcode required. The camera's firmware is not modified.

## Install the updated app on iPhone

1. Connect the iPhone to regular internet (not the camera Wi-Fi).
2. Open [Scriptable-GR-Bridge.js](https://github.com/KLINEKRAFT/GRiiiX/blob/main/Scriptable-GR-Bridge.js) and **replace the entire code** of your existing Scriptable script. Run it once to refresh the local UI; the startup alert confirms it launched.
3. Enable Wi-Fi on the Ricoh and join its camera Wi-Fi network in iPhone Settings. The phone may say *No Internet Connection*; stay on that network.
4. Close the current Scriptable app window if it is open, return to Scriptable and run the updated script. It loads the already cached app without internet.
5. On the camera, select **M (manual exposure)** and a **fixed ISO** such as 1600. This avoids the camera compensating for ISO changes with a different shutter speed; the first test does not operate with Auto ISO.
6. In **Adaptive**, tap **1 · Connect**, then **Refresh camera ISO** and **3 · Review latest photo** or **4 · Shoot & analyze**.
7. Set your Scene and Look. Under **Apply an adjustment**, check the consent box, then tap **Apply suggested ISO**.
8. Watch **Latest status / Session activity**. A successful change reports the **actual before/after ISO read from the camera**. If the camera reports unchanged values, missing options, or an error, the app does not claim success. Tap **Undo ISO change** to return to the previous value after a successful change.
9. After the first verified ISO write, **Auto Correct** becomes available. Check its separate consent box to authorize up to three shots, with setting changes and read-back between frames. This mode enforces **manual exposure M** and fixed ISO.

## Operation and safety notes

- The first write is *not* a simulation: it changes your physical camera's ISO when allowed by firmware and exposure mode. Test on a noncritical subject.
- Current ISO and permitted values are read live with GET `/v1/params/camera` (falling back to GET `/v1/props`); ISO uses `sv`.
- PUT `/v1/params/camera` sends only `sv=<camera-valid-value>` as `application/x-www-form-urlencoded`; each write is independently verified by reading `sv` again. We reject stale expected values and never attempt a write when the available ISO list is empty.
- If the preview looks too dark, the heuristic raises ISO, constrained by the selected upper limit. If highlights are clipped, it may lower ISO. The nearest ISO value allowed by the camera is selected, not an arbitrary integer.
- These heuristics do **not** accurately detect subject priority, motion blur or defocus. A cinematic dark photograph may be intentional. Review results rather than trusting brightness alone.
- Current camera mode may affect whether ISO adjustments alter actual exposure, even if the setting was applied; Auto Correct therefore requires M.
- Scriptable/iPhone network interruptions may leave the camera at its last confirmed ISO. Use **Refresh camera ISO** to reconcile the display; Undo is available if a previous value was recorded in the same session.
- Each Auto Correct run is capped at three captures; the Stop control takes effect between ongoing requests. Camera originals are never deleted.
- Do not commit camera SSID, Wi-Fi key, complete `/v1/props`, serial number, or personal photos to this public GitHub repository.

## Known limitations and future work

- ISO control on the actual physical GR IIIx and firmware still needs an end-to-end test. A successful preview does **not** prove setting writes work.
- No shutter speed (`tv`), aperture (`av`), exposure compensation (`xv`), or film-effect (`effect`) writes yet. These should be implemented only after live-mode-specific availability and read-back tests.
- The auto-engine evaluates a low-res JPEG preview, not full RAW/scene-aware AI.
- No guaranteed background control or camera reconnect; keep Scriptable open and the iPhone on the camera's Wi-Fi.
- Local photo analysis and imported photo storage still lack complete EXIF understanding.

## Protocol references

- [Reverse-engineered Ricoh wireless specification](https://github.com/CursedHardware/ricoh-wireless-protocol)
- [GR III capture parameter enumerations](https://github.com/CursedHardware/ricoh-wireless-protocol/blob/main/definitions/capture_ricoh_gr_iii.yaml)
- [Scriptable Request API](https://docs.scriptable.app/request/)
- [Community implementation research](https://github.com/Nielk74/ricoh-gr3-android)
