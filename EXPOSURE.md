# Exposure Studio — GR IIIx shutter and aperture controls

## What is implemented

**Exposure Studio** is under **Shoot → Advanced controls**. It adds actual physical camera controls for:

- **Faster shutter** — one camera-supported `tv` step toward less light
- **Slower shutter** — one supported `tv` step toward more light, only when still safe for your selected subject
- **Wider aperture** — one supported `av` step toward more light and shallower depth of field
- **Narrower aperture** — one supported `av` step toward less light and greater depth of field
- **Undo last exposure step** — reversible, only when the live camera still matches the previous confirmed value

An ISO safety control remains available separately, including Cinematic Director's controlled adjustments. **Shutter and aperture are not yet changed automatically by Director**; the first release requires a deliberate tap for each change.

## iPhone setup

1. While connected to regular internet (not the camera's Wi-Fi), replace the existing Scriptable script with [the latest bridge](./Scriptable-GR-Bridge.js) and run it once. It caches `exposure.js`, the updated interface and styles.
2. On the camera, select **M exposure mode** with **fixed ISO**. Choose a supported normal still-photo shutter speed and aperture.
3. Join the GR IIIx Wi-Fi, return to Scriptable and open **Shoot → Connect camera**.
4. Expand **Advanced controls → Exposure Studio**. Confirm that it shows the real shutter speed and aperture from the camera.
5. Check **Authorize one shutter or aperture adjustment on my camera**. Choose one of the enabled buttons. The app makes **only one supported change**, refreshes camera values and requires a second independent read-back.
6. If the camera confirms the requested value, the app shows the result and enables **Undo last exposure step**. If a write times out or the read-back differs, the app reports uncertainty and does not retry automatically. Inspect the camera before another write.
7. Reauthorize each additional adjustment using the checkbox.

## Camera safety limits

The device-side Scriptable bridge enforces the same rules as the UI.

- **M mode only**, with a numeric fixed ISO. Auto ISO, Av, Tv and P modes block exposure writes.
- A camera-reported **`tvList` or `avList` is required**. Missing lists or unknown current values disable the relevant control.
- **One supported step per tap**, maximum **0.6 stop** per change. All writes are single-key, form-encoded PUTs to `/v1/params/camera`.
- Supported aperture range on the GR IIIx is **f/2.8–f/16**.
- Shutter is restricted to regular reciprocal-speed tokens and subject-specific minimums: running at least 1/250 s, walking people at least 1/125 s, portraits at least 1/60 s, and stationary subjects at least 1/30 s. This is a conservative handheld policy, not a guaranteed blur-prevention method.
- Maximum fast shutter follows published GR IIIx limits: up to **1/2500 s** below f/5.6, or **1/4000 s** at f/5.6 and narrower. Camera-advertised tokens are still mandatory.
- Before writing, the bridge re-reads ISO, shutter, aperture and exposure mode and compares them with the caller's approved snapshot. After the write it checks the target value and ensures the other exposure settings remain unchanged.
- A timed-out or unconfirmed write is **never automatically repeated**. Previous values may have changed despite the network error; verify on the camera.
- The UI does not expose arbitrary camera parameter keys or a generic HTTP command endpoint.

## Ricoh token formats

The camera exposes shutter via `tv`, e.g. `1.125` means **1/125 sec**, not the decimal number 1.125. Aperture `av` uses values such as `2.8`, `4.0` and `5.6`. The camera provides lists of supported values, and the app selects the next available token without guessing the exact step size. Both fields are documented in the community-reversed protocol:

- https://github.com/CursedHardware/ricoh-wireless-protocol
- https://raw.githubusercontent.com/CursedHardware/ricoh-wireless-protocol/main/definitions/capture_ricoh_gr_iii.yaml
- https://us.ricoh-imaging.com/product/griiix/

## Tests and hardware status

Pure exposure recommendations and camera-response failure scenarios have passed simulated tests. See [tests/exposure.test.js](./tests/exposure.test.js) and [tests/director.test.js](./tests/director.test.js), executable with Node's built-in test runner:

```sh
node --test tests/exposure.test.js tests/director.test.js
```

**Shutter and aperture writes are not yet confirmed on this specific physical GR IIIx or its firmware.** Test with a harmless scene and visually confirm both the camera display and the on-screen read-back. The rest of the app's existing photo retrieval and ISO functions are preserved.

## Photography Director and coordinated recommendations

Director can now select one supported next change across ISO, shutter, or aperture, using a scene-aware ranking. Every change is approved individually and rechecked against live camera state. The app requires a new camera capture before applying another Director change. Automatic shutter/aperture operations are still locked pending on-camera testing. See [DIRECTOR.md](./DIRECTOR.md) for usage and the [coordination tests](./tests/coordination.test.js).
