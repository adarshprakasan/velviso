import { drawBrushPreview, extendStroke, makeBrushTip, presets, smoothPoint, stamp } from './brushes.js?v=smooth1';
import { createMesh } from './mesh.js';

const get = (id) => document.getElementById(id);
const paint = get('paint');
const guide = get('guide');
const overlay = get('overlay');
const video = document.querySelector('video');
const context = paint.getContext('2d');
const camera = get('camera');
const capture = get('capture');
const align = get('align');
const status = get('status');
const size = paint.width;
const layers = [];
let activeId;
let layerNumber = 0;
let stroke;
let drawingEnabled = false;
let mesh;
let tracker;
let media;
let frame;
let face;
let reference;
let oval;
let facialFeatures;
const nosePaths = [
  [168, 6, 197, 195, 5, 4, 1, 2],
  [129, 98, 97, 2, 326, 327, 358],
];
let textureDirty = true;
let lastTime = -1;
let capturing = false;

const undo = get('undo');
const redo = get('redo');
const past = [];
const future = [];
const historyLimit = 24;
let drag;

function snapshot() {
  return { layers: layers.map((layer) => ({ ...layer })), activeId };
}

function updateHistoryButtons() {
  undo.disabled = past.length === 0 || Boolean(stroke);
  redo.disabled = future.length === 0 || Boolean(stroke);
}

function remember() {
  past.push(snapshot());
  if (past.length > historyLimit) past.shift();
  future.length = 0;
  updateHistoryButtons();
}

function restore(from, to) {
  if (stroke || drag || !from.length) return;
  to.push(snapshot());
  const saved = from.pop();
  layers.splice(0, layers.length, ...saved.layers);
  activeId = saved.activeId;
  renderLayers();
  renderPaint();
  updateHistoryButtons();
}

function renderPaint() {
  context.clearRect(0, 0, size, size);
  for (const layer of layers) {
    if (!layer.visible) continue;
    context.globalAlpha = layer.opacity;
    context.drawImage(layer.canvas, 0, 0);
  }
  context.globalAlpha = 1;
  textureDirty = true;
}

function makeButton(text, label, action) {
  const button = document.createElement('button');
  button.textContent = text;
  button.setAttribute('aria-label', label);
  button.onclick = () => {
    if (!stroke && !drag) action?.();
  };
  return button;
}

function moveLayer(id, targetId) {
  const from = layers.findIndex((layer) => layer.id === id);
  const to = layers.findIndex((layer) => layer.id === targetId);
  if (from < 0 || to < 0 || from === to || stroke) return;
  remember();
  layers.splice(to, 0, ...layers.splice(from, 1));
  renderLayers();
  renderPaint();
  get('layers').querySelector('[data-layer="' + id + '"] .handle')?.focus({ preventScroll: true });
}

function attachDrag(handle, row, layer) {
  handle.onpointerdown = (event) => {
    if (event.button !== 0 || drag || stroke) return;
    handle.setPointerCapture(event.pointerId);
    drag = { pointerId: event.pointerId, target: row };
    row.classList.add('dragging');
  };
  handle.onpointermove = (event) => {
    if (drag?.pointerId !== event.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-layer]');
    drag.target?.classList.remove('drop-target');
    drag.target = target;
    if (target !== row) target?.classList.add('drop-target');
  };
  const end = (event) => {
    if (drag?.pointerId !== event.pointerId) return;
    const target = drag.target;
    drag = undefined;
    target?.classList.remove('drop-target');
    row.classList.remove('dragging');
    if (event.type === 'pointerup') moveLayer(layer.id, Number(target?.dataset.layer));
  };
  handle.onpointerup = end;
  handle.onpointercancel = end;
  handle.onlostpointercapture = end;
  handle.onkeydown = (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const index = layers.indexOf(layer);
    const neighbor = layers[index + (event.key === 'ArrowUp' ? 1 : -1)];
    if (neighbor) moveLayer(layer.id, neighbor.id);
  };
}

function renderLayers() {
  get('layers').replaceChildren(...layers.slice().reverse().map((layer) => {
    const row = document.createElement('div');
    row.className = 'layer';
    row.dataset.layer = layer.id;
    const handle = makeButton('Drag', 'Reorder ' + layer.name + ' with arrow keys or drag');
    handle.className = 'handle';
    attachDrag(handle, row, layer);
    const select = makeButton(layer.name, 'Select ' + layer.name, () => {
      activeId = layer.id;
      for (const choice of get('layers').querySelectorAll('.layer-select')) {
        choice.setAttribute('aria-pressed', choice === select);
      }
    });
    select.className = 'layer-select';
    select.setAttribute('aria-pressed', layer.id === activeId);
    const visibility = makeButton(layer.visible ? 'Hide' : 'Show',
      (layer.visible ? 'Hide ' : 'Show ') + layer.name, () => {
        remember();
        layer.visible = !layer.visible;
        renderLayers();
        renderPaint();
      });
    const remove = makeButton('×', 'Delete ' + layer.name, () => {
      remember();
      const index = layers.indexOf(layer);
      layers.splice(index, 1);
      if (layer.id === activeId) activeId = layers[Math.max(0, index - 1)].id;
      renderLayers();
      renderPaint();
    });
    remove.disabled = layers.length === 1;
    const opacity = document.createElement('label');
    opacity.className = 'layer-opacity';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0;
    slider.max = 100;
    slider.value = Math.round(layer.opacity * 100);
    slider.setAttribute('aria-label', layer.name + ' opacity');
    const value = document.createElement('output');
    value.value = slider.value + '%';
    let adjusting = false;
    slider.oninput = () => {
      if (stroke || drag) {
        slider.value = Math.round(layer.opacity * 100);
        return;
      }
      if (!adjusting) remember();
      adjusting = true;
      layer.opacity = Number(slider.value) / 100;
      value.value = slider.value + '%';
      renderPaint();
    };
    slider.onchange = () => { adjusting = false; };
    opacity.append('Layer opacity', value, slider);
    row.append(handle, select, visibility, remove, opacity);
    return row;
  }));
}

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

function addLayer() {
  const id = ++layerNumber;
  layers.push({ id, name: 'Layer ' + id, canvas: makeCanvas(), visible: true, opacity: 1 });
  activeId = id;
  renderLayers();
}

function point(event, rect, fallbackPressure = 1) {
  return {
    x: (event.clientX - rect.left) * size / rect.width,
    y: (event.clientY - rect.top) * size / rect.height,
    time: event.timeStamp,
    pressure: event.pointerType === 'pen' ? event.pressure || fallbackPressure : 1,
  };
}

function compositeStroke() {
  const { target, base, mask, opacity, erase } = stroke;
  target.clearRect(0, 0, size, size);
  target.drawImage(base, 0, 0);
  target.globalAlpha = opacity;
  target.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  target.drawImage(mask.canvas, 0, 0);
  target.globalAlpha = 1;
  target.globalCompositeOperation = 'source-over';
  renderPaint();
}

function setDrawingEnabled(enabled) {
  drawingEnabled = enabled;
  paint.setAttribute('aria-disabled', String(!enabled));
  get('canvas-message').hidden = enabled;
  if (!enabled && stroke) {
    const { id } = stroke;
    stroke = undefined;
    if (paint.hasPointerCapture(id)) paint.releasePointerCapture(id);
    updateHistoryButtons();
  }
}

paint.addEventListener('pointerdown', (event) => {
  const layer = layers.find((layer) => layer.id === activeId);
  if (!drawingEnabled || stroke || drag || event.button !== 0 || !layer.visible) return;
  remember();
  const brush = get('brush').querySelector('input:checked').value;
  const preset = presets[brush];
  const width = Number(get('width').value);
  const base = layer.canvas;
  layer.canvas = makeCanvas();
  paint.setPointerCapture(event.pointerId);
  stroke = {
    id: event.pointerId,
    base,
    target: layer.canvas.getContext('2d'),
    mask: makeCanvas().getContext('2d'),
    tip: makeBrushTip(brush, get('color').value),
    preset,
    width,
    flow: Number(get('flow').value) / 100,
    opacity: Number(get('opacity').value) / 100,
    smoothing: Number(get('smoothing').value) / 100,
    erase: brush === 'eraser',
    spacing: Math.max(.45, width * preset.spacing),
    last: point(event, paint.getBoundingClientRect(), .35),
    remainder: 0,
  };
  updateHistoryButtons();
  stamp(stroke, stroke.last);
  compositeStroke();
});

paint.addEventListener('pointermove', (event) => {
  if (!drawingEnabled || event.pointerId !== stroke?.id) return;
  const rect = paint.getBoundingClientRect();
  const samples = event.getCoalescedEvents?.();
  for (const sample of samples?.length ? samples : [event]) {
    const next = point(sample, rect, stroke.last.pressure);
    extendStroke(stroke, smoothPoint(stroke.last, next, stroke.smoothing));
  }
  compositeStroke();
});

paint.addEventListener('pointerup', (event) => {
  if (event.pointerId !== stroke?.id) return;
  extendStroke(stroke, point(event, paint.getBoundingClientRect(), stroke.last.pressure));
  compositeStroke();
  stroke = undefined;
  updateHistoryButtons();
});

for (const eventName of ['pointercancel', 'lostpointercapture']) {
  paint.addEventListener(eventName, (event) => {
    if (event.pointerId !== stroke?.id) return;
    stroke = undefined;
    updateHistoryButtons();
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
  pen.strokeStyle = '#202320a0';
  pen.lineWidth = 2;
  pen.beginPath();
  for (const { start, end } of oval) {
    pen.moveTo(reference[start].x * size, reference[start].y * size);
    pen.lineTo(reference[end].x * size, reference[end].y * size);
  }
  pen.stroke();
  pen.setLineDash([]);
  pen.strokeStyle = '#20232070';
  pen.lineWidth = 1.5;
  pen.beginPath();
  for (const { start, end } of facialFeatures) {
    pen.moveTo(reference[start].x * size, reference[start].y * size);
    pen.lineTo(reference[end].x * size, reference[end].y * size);
  }
  for (const path of nosePaths) {
    const [first, ...rest] = path.map((index) => reference[index]);
    pen.moveTo(first.x * size, first.y * size);
    for (const point of rest) pen.lineTo(point.x * size, point.y * size);
  }
  pen.stroke();
}

function downloadMedia(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function drawComposite(canvas, pen) {
  pen.setTransform(-1, 0, 0, 1, canvas.width, 0);
  pen.drawImage(video, 0, 0, canvas.width, canvas.height);
  pen.drawImage(overlay, 0, 0, canvas.width, canvas.height);
}

function mediaName(extension) {
  return 'velviso-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + extension;
}

async function saveMedia(file) {
  const share = { files: [file] };
  if (navigator.canShare?.(share)) {
    try {
      await navigator.share(share);
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  downloadMedia(file, file.name);
}

capture.onclick = async () => {
  if (!media || !face || !reference || video.readyState < 2) return;
  capture.disabled = true;
  capturing = true;
  try {
    const photo = document.createElement('canvas');
    photo.width = video.videoWidth;
    photo.height = video.videoHeight;
    // Read the WebGL drawing buffer in the same task that renders it.
    renderOverlay();
    drawComposite(photo, photo.getContext('2d'));
    const encoded = photo.toDataURL('image/jpeg', 0.94).split(',')[1];
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    await saveMedia(new File([bytes], mediaName('jpg'), { type: 'image/jpeg' }));
  } catch {
    get('photo-status').textContent = 'Could not capture the photo. Try again.';
    return;
  } finally {
    capturing = false;
    capture.disabled = !face;
  }
  get('photo-status').textContent = '';
};

function renderOverlay() {
  if (textureDirty) {
    mesh.upload(paint);
    textureDirty = false;
  }
  mesh.draw(face, reference);
}

const record = get('record');
const microphone = get('microphone');
const saveVideo = get('save-video');
const recordStatus = get('record-status');
const canRecord = typeof MediaRecorder !== 'undefined' &&
  typeof HTMLCanvasElement.prototype.captureStream === 'function';
let recording;
let requestingMicrophone = false;
let savedVideo;
const recordingLimit = 60_000;

function updateRecordButton() {
  record.disabled = recording
    ? recording.recorder.state !== 'recording'
    : !canRecord || !face || requestingMicrophone;
  microphone.disabled = !canRecord || Boolean(recording) || requestingMicrophone;
}

function stopRecording() {
  if (recording?.recorder.state !== 'recording') return;
  clearTimeout(recording.timeout);
  recording.recorder.stop();
  recordStatus.textContent = 'Preparing video…';
  updateRecordButton();
}

function startRecording(audioTracks) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const pen = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  try {
    for (const track of audioTracks) stream.addTrack(track);
    const webm = audioTracks.length ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8';
    const mimeType = ['video/mp4', webm, 'video/webm']
      .find((type) => MediaRecorder.isTypeSupported?.(type));
    const recorder = new MediaRecorder(stream, {
      ...(mimeType && { mimeType }),
      videoBitsPerSecond: 2_500_000,
    });
    const chunks = [];
    const session = { recorder, canvas, pen };
    let failed = false;
    recorder.addEventListener('dataavailable', ({ data }) => {
      if (data.size) chunks.push(data);
    });
    recorder.addEventListener('error', () => {
      failed = true;
      recordStatus.textContent = 'Video recording failed.';
    });
    recorder.addEventListener('stop', () => {
      clearTimeout(session.timeout);
      stream.getTracks().forEach((track) => track.stop());
      recording = undefined;
      record.textContent = 'Record';
      updateRecordButton();
      if (failed || !chunks.length) {
        recordStatus.textContent = failed ? 'Video recording failed.' : 'No video was captured. Try a longer recording.';
        return;
      }
      const type = (chunks[0].type || recorder.mimeType || 'video/webm').split(';')[0];
      const extension = type === 'video/mp4' ? 'mp4' : 'webm';
      savedVideo = new File(chunks, mediaName(extension), { type });
      saveVideo.hidden = false;
      recordStatus.textContent = 'Video ready to save.';
    });
    recorder.start();
    recording = session;
    session.timeout = setTimeout(stopRecording, recordingLimit);
    record.textContent = 'Stop recording';
    updateRecordButton();
    recordStatus.textContent = audioTracks.length
      ? 'Recording with microphone · up to 60 seconds'
      : 'Recording · up to 60 seconds';
    renderOverlay();
    drawComposite(canvas, pen);
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

record.onclick = async () => {
  if (recording) {
    stopRecording();
    return;
  }
  if (!canRecord || !media || !face || requestingMicrophone || video.readyState < 2) return;

  const cameraStream = media;
  let audioTracks = [];
  try {
    if (microphone.checked) {
      requestingMicrophone = true;
      updateRecordButton();
      recordStatus.textContent = 'Waiting for microphone permission…';
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioTracks = audio.getTracks();
      if (media !== cameraStream) {
        audioTracks.forEach((track) => track.stop());
        recordStatus.textContent = '';
        return;
      }
      if (!audio.getAudioTracks().length) throw new Error('No microphone track.');
    }
    startRecording(audioTracks);
  } catch (error) {
    audioTracks.forEach((track) => track.stop());
    recordStatus.textContent = error.name === 'NotAllowedError'
      ? 'Microphone access was denied. Allow it in browser settings or turn the microphone off.'
      : 'Could not start recording. Check your microphone or try recording without it.';
  } finally {
    requestingMicrophone = false;
    updateRecordButton();
  }
};

updateRecordButton();

saveVideo.onclick = async () => {
  if (!savedVideo) return;
  saveVideo.disabled = true;
  try {
    await saveMedia(savedVideo);
  } catch {
    recordStatus.textContent = 'Could not save the video. Try again.';
  } finally {
    saveVideo.disabled = false;
  }
};

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
      capture.disabled = !face || capturing;
      updateRecordButton();
      status.textContent = face ? 'Face tracked' : 'Look toward the camera';
    }
    renderOverlay();
    if (recording?.recorder.state === 'recording') drawComposite(recording.canvas, recording.pen);
    frame = requestAnimationFrame(tick);
  } catch (error) {
    stop(error.message);
  }
}

function stop(message = 'Camera off') {
  setDrawingEnabled(false);
  stopRecording();
  cancelAnimationFrame(frame);
  media?.getTracks().forEach((track) => track.stop());
  media = undefined;
  video.srcObject = null;
  face = undefined;
  lastTime = -1;
  mesh?.draw();
  align.disabled = true;
  capture.disabled = true;
  updateRecordButton();
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
      facialFeatures = [
        ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
        ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
        ...FaceLandmarker.FACE_LANDMARKS_LIPS,
      ];
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
    if (!canRecord) recordStatus.textContent = 'Video recording is unavailable in this browser.';
    const track = media.getVideoTracks()[0];
    if (track.readyState !== 'live') throw new Error('Camera disconnected');
    track.addEventListener('ended', () => stop('Camera disconnected'));
    setDrawingEnabled(true);
    frame = requestAnimationFrame(tick);
  } catch (error) {
    stop(error.message || 'Could not start the camera.');
  } finally {
    camera.disabled = false;
  }
};

align.onclick = calibrate;
get('add').onclick = () => {
  if (stroke || drag) return;
  remember();
  addLayer();
};
undo.onclick = () => restore(past, future);
redo.onclick = () => restore(future, past);
for (const id of ['width', 'flow', 'opacity', 'smoothing']) {
  const input = get(id);
  const update = () => {
    document.querySelector('output[for="' + id + '"]').value =
      input.value + (id === 'width' ? ' px' : '%');
  };
  input.addEventListener('input', update);
  update();
}
get('brush').addEventListener('change', (event) => {
  const preset = presets[event.target.value];
  for (const id of ['width', 'flow']) {
    const control = get(id);
    control.value = preset[id];
    control.dispatchEvent(new Event('input'));
  }
});
for (const choice of get('brush').querySelectorAll('input')) {
  drawBrushPreview(choice.nextElementSibling, choice.value, '#efece0');
}
addLayer();
