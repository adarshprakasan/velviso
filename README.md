# Velviso

A browser-based face painting prototype. Draw with a mouse, pen, or touch and see the paint follow a single face in the mirrored live preview.

## Run locally

Start a static server in this directory with `node serve.mjs`, then open [http://localhost:4173](http://localhost:4173). For a phone, serve these same files from an HTTPS host. Camera access requires a secure browser context. Internet access is required to load the pinned MediaPipe runtime and model.

1. Select **Start camera**, allow camera access, and look straight ahead to capture the initial canvas alignment.
2. Draw on the square canvas. The dashed face guide shows which parts of the drawing will appear on your face.
3. Choose a brush, color, width, flow, and opacity. Add layers to paint separately, toggle their visibility, or delete them.
4. Use **Realign face** while looking straight ahead if the initial guide was captured at an angle.

Camera frames and paint are processed in the browser. Paint is kept in memory for the current page session. Tracking works best with a clearly visible, front-facing face. Large head turns and occlusions can distort the mapped paint.

Uses [MediaPipe Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js).
