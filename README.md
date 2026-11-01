# GRiiiX

# Klinekraft GR — Web / PWA

This is a **static, local-first Progressive Web App** compatible with Vercel's static deployment. No Xcode, Node runtime, dependencies, or server/database required.

## Deployment

1. Publish the four files in this directory to a new static Vercel project, with `index.html` at the deployment root. The most convenient repeatable route is a GitHub repository connected to Vercel.
2. On your iPhone, open the HTTPS deployment in Safari and choose **Share > Add to Home Screen**.
3. Open it once while online to cache the PWA shell. Then you can use the recipes, stored photos, and shooting guide offline.

## Implemented

- Create, select, edit, delete, export, and import film/shooting recipe references (localStorage).
- Local photo import, photo browsing, original-file downloads, and deletion (IndexedDB). This is not a reliable primary backup; keep originals separately.
- GPS walk tracking while the page remains active, saved walk previews, GPX export. iOS may suspend location updates in the background.
- Night-shooting suggestions, a guided interval countdown (does **not** trigger the shutter).
- Basic stats for local file counts, formats, storage, recipe counts and walk counts.
- PWA installation metadata and offline app shell.
- Separate Safari test link to camera `/v1/ping`.

## Not yet implemented

- GR IIIx remote control, live view, camera-controlled intervals, reading/writing camera properties or film settings: needs a compatible **local bridge** or native networking. HTTPS sites ordinarily cannot fetch `http://192.168.0.1` due to mixed-content/CORS and iOS browser limitations. **A Vercel server-side proxy cannot access a camera inside your local Wi-Fi.**
- Automated photo strips, RAW/DNG display/processing, true EXIF-based insights, cloud sync or camera photo transfer.

## Privacy

All locally imported images, GPS tracks, and recipes remain in your own browser storage; there are no outgoing analytics or server-side uploads in this prototype. Uninstalling, clearing site data, or iOS storage cleanup may erase them.

## Adaptive Capture (new)

The **Adaptive** tab adds private on-device review of JPEG/HEIC test shots: median brightness, approximate clipped highlights and dark pixel percentages, ISO recommendations bounded by a user-defined limit, and before/after comparisons. The optional [Scriptable bridge](./Scriptable-GR-Bridge.js) can run the UI offline on iPhone and attempt Wi-Fi read-only camera requests and a deliberate test shutter, without Xcode or Vercel. **Automatic settings adjustment is intentionally locked pending real-camera ISO write/read-back tests.**

Start with [ADAPTIVE.md](./ADAPTIVE.md) for install steps, limitations and the hardware test plan. Chrome/Safari on Vercel can use the photo analyzer but cannot directly control the local HTTP camera.
