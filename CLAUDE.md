# Claude Code instructions — KLINEKRAFT/GRiiiX

## Mission
Build **Klinekraft GR**, a thoughtful, mobile-first, local-first iPhone web companion for the **Ricoh GR IIIx**. The owner prefers Vercel, GitHub and Safari Home Screen installation; **do not require Xcode** for the primary experience. Style: Dieter Rams / Apple-inspired utility, restrained whitespace, precise typography, deep-blue accent (#002D72), accessible controls and a useful dark mode for nighttime use.

This repository contains a **working-in-progress static PWA**. Respect and improve existing features rather than discarding them or silently replacing them with a mockup.

## Current source and deploy
- `index.html`: self-contained HTML, CSS and JavaScript prototype; six bottom-navigation sections: Home, Recipes, Library, Walks, Studio and Insights.
- `manifest.webmanifest`, `icon.svg`, `sw.js`: Home Screen installation and basic offline cache.
- `README.md`: installation, status and known limitations.
- Deploy as a **static site from repository root** to Vercel. No dependencies or build step are currently required. Future migration to Next.js/Vite is acceptable only with working parity and a clear reason.
- No verified live deployment yet; a previous Vercel attempt encountered **workspace authorization (HTTP 403)**. Do not fabricate a live URL.

## Implemented in the prototype (verify on iPhone)
1. Create/edit/select/delete and JSON import/export **recipe references**; localStorage.
2. Import photographs from iOS Photos/Files into IndexedDB; browse, view, save original, delete. **Not** camera Wi-Fi import and **not** a secure primary backup.
3. GPS walks while the app is open; route preview and GPX export; localStorage. iOS Safari can suspend background GPS.
4. Night shooting scene recommendations, on-screen interval/booth prompts (**not** remote shutter triggers).
5. Basic statistics: photos, file formats, storage, recipe count, walk count; no EXIF analysis yet.
6. A button opens a separate Safari diagnostic URL to the camera, `http://192.168.0.1/v1/ping`. It does **not** establish control from the HTTPS web app.

## Architecture constraint: camera control is unproven
Camera joins an iPhone via its own Wi-Fi. Community projects document a local camera HTTP interface (commonly `192.168.0.1`, with routes such as `/v1/ping` and `/v1/props`), but specific endpoints, payloads and firmware compatibility require **real camera tests**. A Vercel-hosted HTTPS page cannot ordinarily issue HTTP camera requests directly due to mixed-content and CORS/private-network browser security. Vercel serverless functions cannot connect to a camera on the user's local Wi-Fi. No workaround via server-side proxying to an arbitrary private IP, browser security bypasses, or undocumented firmware modifications.

Investigate a viable path with careful real-world tests on **iPhone Safari**. Possible routes include a *user-controlled local HTTPS companion/bridge* on the same network (subject to certificate trust, local connectivity and practical operation), or an explicitly optional native solution for remote-control functionality; keep the PWA useful without that. Clearly distinguish **read-only discovery**, verified endpoints and speculative controls. Do not send camera-changing requests before validating supported values, protocol and user intent.

## Product roadmap

### Foundation — first
- Test six-tab UI on iPhone Safari and iPhone Home Screen; check keyboard, safe areas, orientation, offline behavior.
- Audit prototype for persistence errors, data retention risks, accessibility, XSS, performance and service worker update behavior.
- Refactor into maintainable modules with tests if warranted. Keep features functional during transition.
- Implement safe export/import or backup for local recipes, walks and photo metadata; make it clear originals must be saved separately.
- Use deployment previews for verification before production.

### Recipes
- Categorize/search/favorite presets; sample images, daylight/night sections and camera model fields.
- Preserve RAW/JPEG shooting setup and available in-camera image-control parameters when supported. Avoid promising full recipe application.

### Library and insights
- Robust and lossless photo import, duplicate detection, original export and contact sheets.
- Extract genuine EXIF tags for exposure analytics (ISO, aperture, shutter speed, capture time); ensure DNG compatibility is reported honestly.
- Avoid storing irreplaceable large images solely in browser quota; provide portable exports.

### Photo walks
- Reliable foreground GPS capture, timestamp matching to photo EXIF and route map. Preserve privacy and provide GPX export.
- Explain iOS restrictions on background location; no claims of uninterrupted lock-screen tracking.

### Studio
- Manual exposure assistant, interval prompts and photo booth strip compositor (from imported or captured images).
- If camera control is proven: shutter, touch focus, live view, camera-owned interval/long-exposure sequences and verified settings writes.
- Optional on-device analysis, with explicit opt-in and no surprise cloud uploads.

## Acceptance criteria
- Every visible control works or is clearly disabled and labeled as planned.
- Live camera status is never simulated. Selecting a recipe **does not** claim to update camera settings.
- UI must work on narrow iPhone viewports, be usable in low light, and respond to VoiceOver/dynamic text.
- Photograph files, GPS tracks, and presets are local unless the user explicitly exports/shares them.
- No secrets, tokens, or user photos in Git history.
- Document manual tests and unsupported functionality, including exact camera firmware for any real-camera validation.

## Immediate next action for Claude Code
1. Review the source and run a local static server, e.g. `python3 -m http.server 8000`.
2. Audit functionality and propose incremental improvements backed by simple tests.
3. Connect this repository to a Vercel **preview** deployment using existing access; if team access is blocked, explain the required user authorization, not a fabricated deployment.
4. Begin with the highest-value camera-independent improvements while separately researching GR IIIx / iOS networking feasibility.

The goal: **the best independent Ricoh GR IIIx companion possible, without losing a trustworthy, local-first foundation.**

## Adaptive Capture extension (implemented in main)

- `adaptive.js` + `adaptive.css`: new Adaptive tab, local pixel analysis, moody/balanced/bright creative targets, ISO/shutter recommendations, comparison, camera-bridge adapter, guarded automatic capture state machine.
- `Scriptable-GR-Bridge.js`: optional **no-Xcode** iPhone Scriptable WebView host that loads cached UI from this GitHub repo, tests camera ping/props, takes a deliberate test shot, and attempts to fetch a new JPEG preview using native HTTP requests.
- `ADAPTIVE.md`: operational instructions and limitations.
- The bridge is **experimental and untested on physical camera**. Its `setISO` operation throws, and the UI's `verified` flag defaults to false, so the automatic camera-adjustment button is correctly disabled.
- After real-world camera tests, implement an explicit ISO calibration/read-back with safe restore before allowing automatic writes. Never enable auto-correction through a flag change alone. Keep a max-three-shot bound and always preserve originals.
- New source is standalone incremental addition. Keep existing app tabs working and ensure service worker caches the new assets.
