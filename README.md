# Velviso

A browser-based face painting prototype. Draw with a mouse, pen, or touch and see the paint follow a single face in the mirrored live preview.

**[Open the live demo](https://adarshprakasan.github.io/velviso/)** — hosted on GitHub Pages.

## Run locally

Start a static server in this directory with `node serve.mjs`, then open [http://localhost:4173](http://localhost:4173). For a phone, serve these same files from an HTTPS host. Camera access requires a secure browser context. Internet access is required to load the pinned MediaPipe runtime and model.

1. Select **Start camera**, allow camera access, and look straight ahead to capture the initial canvas alignment.
2. Draw on the square canvas. The dashed face guide shows which parts of the drawing will appear on your face.
3. Choose a brush, color, width, flow, and opacity. Add layers to paint separately, toggle their visibility, or delete them.
4. Use **Realign face** while looking straight ahead if the initial guide was captured at an angle.

Camera frames and paint are processed in the browser. Paint is kept in memory for the current page session. Tracking works best with a clearly visible, front-facing face. Large head turns and occlusions can distort the mapped paint.

Uses [MediaPipe Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js).

## Prerequisites and setup

Use a modern browser with camera access, JavaScript modules, and Canvas support. For local development, install Node.js; there are no npm dependencies to install.

```sh
git clone https://github.com/adarshprakasan/velviso.git
cd velviso
node serve.mjs
```

If port 4173 is occupied, use `node serve.mjs 4174` and open the corresponding localhost address. The bundled server listens on localhost; it is not a LAN server for a phone. Use the HTTPS demo link on mobile.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | Studio interface and browser entry point |
| `studio.js` | Painting application and tracking integration |
| `brushes.js` | Brush rendering |
| `mesh.js` | Face-mesh support |
| `studio.css` | Layout and visual styling |
| `grain.png` | Texture asset |
| `serve.mjs` | Dependency-free local static server |

## Hosting

GitHub Pages publishes the repository root from `main` at [adarshprakasan.github.io/velviso](https://adarshprakasan.github.io/velviso/). Deploy the HTML, CSS, JavaScript modules, and texture together. HTTPS is required for camera use outside localhost. Model/runtime downloads still require internet access.

## Troubleshooting and verification

- Camera unavailable: verify browser permission, HTTPS/localhost, and that another application is not holding the camera.
- Tracking fails: check lighting, keep one face clearly visible, and inspect the browser console for model download errors.
- Paint alignment drifts: face the camera and select **Realign face**; large rotations and occlusion remain prototype limitations.
- Paint disappears after refresh: drawings are session-only; persistent project storage is not implemented.

There is no automated test suite in this snapshot. After changes, manually check camera start, drawing, layer visibility/removal, brush controls, realignment, and mouse/touch behavior. Do not claim device compatibility from a desktop-only check.
