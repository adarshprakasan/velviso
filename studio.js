import { createMesh } from './mesh.js';

const get = (id) => document.getElementById(id);
const paint = get('paint');
const guide = get('guide');
const overlay = get('overlay');
const video = document.querySelector('video');
const context = paint.getContext('2d');
const camera = get('camera');
const align = get('align');
const status = get('status');
const size = paint.width;
const layers = [];
let activeLayer;
let layerNumber = 0;
let stroke;
let mesh;
let tracker;
let media;
let frame;
let face;
let reference;
let oval;
let textureDirty = true;
let lastTime = -1;

function renderPaint() {
  context.clearRect(0, 0, size, size);
  for (const layer of layers) {
    if (layer.visible) context.drawImage(layer.canvas, 0, 0);
  }
  textureDirty = true;
}

function renderLayers() {
  get('layers').replaceChildren(...layers.slice().reverse().map((layer) => {
    const row = document.createElement('div');
    row.className = 'layer';
    const select = document.createElement('button');
    select.textContent = layer.name;
    select.setAttribute('aria-pressed', layer === activeLayer);
    select.onclick = () => {
      activeLayer = layer;
      renderLayers();
    };
    const visibility = document.createElement('button');
    visibility.textContent = layer.visible ? 'Hide' : 'Show';
    visibility.setAttribute('aria-label', visibility.textContent + ' ' + layer.name);
    visibility.onclick = () => {
      layer.visible = !layer.visible;
      renderLayers();
      renderPaint();
    };
    const remove = document.createElement('button');
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', 'Delete ' + layer.name);
    remove.disabled = layers.length === 1;
    remove.onclick = () => {
      const index = layers.indexOf(layer);
      layers.splice(index, 1);
      if (layer === activeLayer) activeLayer = layers[Math.max(0, index - 1)];
      renderLayers();
      renderPaint();
    };
    row.append(select, visibility, remove);
    return row;
  }));
}

function addLayer() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  activeLayer = { name: 'Layer ' + ++layerNumber, canvas, visible: true };
  layers.push(activeLayer);
  renderLayers();
}

function point(event) {
  const rect = paint.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * size / rect.width,
    y: (event.clientY - rect.top) * size / rect.height,
  };
}

function dab({ x, y }) {
  const { target, radius, brush, color, alpha } = stroke;
  target.globalCompositeOperation = brush === 'Eraser' ? 'destination-out' : 'source-over';
  target.globalAlpha = alpha;
  target.fillStyle = color;
  if (brush === 'Airbrush') {
    const gradient = target.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, color + '00');
    target.fillStyle = gradient;
  }
  if (brush === 'Marker') {
    target.fillRect(x - radius, y - radius / 2, radius * 2, radius);
  } else {
    target.beginPath();
    target.arc(x, y, radius, 0, 2 * Math.PI);
    target.fill();
  }
}

paint.addEventListener('pointerdown', (event) => {
  if (stroke || event.button !== 0 || !activeLayer.visible) return;
  paint.setPointerCapture(event.pointerId);
  stroke = {
    id: event.pointerId,
    target: activeLayer.canvas.getContext('2d'),
    radius: Number(get('width').value) / 2,
    brush: get('brush').value,
    color: get('color').value,
    alpha: Number(get('opacity').value) / 100,
    spacing: 0,
    last: point(event),
    remainder: 0,
  };
  stroke.spacing = Math.max(0.5, stroke.radius * (1.05 - Number(get('flow').value) / 100));
  dab(stroke.last);
  renderPaint();
});

paint.addEventListener('pointermove', (event) => {
  if (event.pointerId !== stroke?.id) return;
  const next = point(event);
  const dx = next.x - stroke.last.x;
  const dy = next.y - stroke.last.y;
  const distance = Math.hypot(dx, dy);
  for (let offset = stroke.spacing - stroke.remainder; offset <= distance; offset += stroke.spacing) {
    dab({
      x: stroke.last.x + dx * offset / distance,
      y: stroke.last.y + dy * offset / distance,
    });
  }
  stroke.remainder = (stroke.remainder + distance) % stroke.spacing;
  stroke.last = next;
  renderPaint();
});

for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  paint.addEventListener(eventName, (event) => {
    if (event.pointerId === stroke?.id) stroke = undefined;
  });
}

function calibrate() {
  if (!face) return;
  const points = oval.map(({ start }) => face[start]);
  const xs = points.map(({ x }) => x * video.videoWidth);
  const ys = points.map(({ y }) => y * video.videoHeight);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  const scale = 0.84 / Math.max(width, height);
  reference = face.map(({ x, y }) => ({
    x: 0.5 - (x * video.videoWidth - left - width / 2) * scale,
    y: 0.5 + (y * video.videoHeight - top - height / 2) * scale,
  }));
  const pen = guide.getContext('2d');
  pen.clearRect(0, 0, size, size);
  pen.setLineDash([7, 7]);
  pen.strokeStyle = '#684d60a0';
  pen.lineWidth = 2;
  pen.beginPath();
  for (const { start, end } of oval) {
    pen.moveTo(reference[start].x * size, reference[start].y * size);
    pen.lineTo(reference[end].x * size, reference[end].y * size);
  }
  pen.stroke();
}

function tick(now) {
  try {
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
      }
      face = tracker.detectForVideo(video, now).faceLandmarks[0];
      if (face && !reference) calibrate();
      align.disabled = !face;
      status.textContent = face ? 'Face tracked' : 'Look toward the camera';
    }
    if (textureDirty) {
      mesh.upload(paint);
      textureDirty = false;
    }
    mesh.draw(face, reference);
    frame = requestAnimationFrame(tick);
  } catch (error) {
    stop(error.message);
  }
}

function stop(message = 'Camera off') {
  cancelAnimationFrame(frame);
  media?.getTracks().forEach((track) => track.stop());
  media = undefined;
  video.srcObject = null;
  face = undefined;
  lastTime = -1;
  mesh?.draw();
  align.disabled = true;
  camera.textContent = 'Start camera';
  get('placeholder').hidden = false;
  status.textContent = message;
}

camera.onclick = async () => {
  if (media) {
    stop();
    return;
  }
  camera.disabled = true;
  status.textContent = 'Starting camera…';
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Open this page on HTTPS or localhost to use the camera.');
    }
    media = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = media;
    await video.play();
    if (!tracker) {
      status.textContent = 'Loading face tracking…';
      const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304';
      const { FaceLandmarker, FilesetResolver } = await import(base + '/vision_bundle.mjs');
      mesh = createMesh(overlay);
      mesh.setTriangles(FaceLandmarker.FACE_LANDMARKS_TESSELATION);
      oval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
      tracker = await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(base + '/wasm'), {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
    }
    get('placeholder').hidden = true;
    camera.textContent = 'Stop camera';
    media.getVideoTracks()[0].addEventListener('ended', () => stop('Camera disconnected'));
    frame = requestAnimationFrame(tick);
  } catch (error) {
    stop(error.message || 'Could not start the camera.');
  } finally {
    camera.disabled = false;
  }
};

align.onclick = calibrate;
get('add').onclick = addLayer;
for (const id of ['width', 'flow', 'opacity']) {
  const input = get(id);
  const update = () => {
    document.querySelector('output[for="' + id + '"]').value =
      input.value + (id === 'width' ? ' px' : '%');
  };
  input.addEventListener('input', update);
  update();
}
addLayer();
