export const presets = {
  ink:      { width: 14, flow: 100, spacing: .08, deposit: 1 },
  soft:     { width: 48, flow: 65, spacing: .1, deposit: .65 },
  airbrush: { width: 90, flow: 42, spacing: .09, deposit: .36 },
  pencil:   { width: 9, flow: 65, spacing: .16, deposit: .75 },
  marker:   { width: 36, flow: 82, spacing: .09, deposit: .85 },
  eraser:   { width: 36, flow: 100, spacing: .09, deposit: 1 },
};

const tipSize = 128;
const center = tipSize / 2;

export function makeBrushTip(brush, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = tipSize;
  const tip = canvas.getContext('2d');
  tip.fillStyle = color;
  if (brush === 'pencil') {
    // A repeatable grain pattern keeps the stroke stable during replay and undo.
    let seed = 47;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 3200; i++) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * (center - 2);
      const dot = 1 + random() * 3;
      tip.globalAlpha = (1 - radius / center) * random();
      tip.fillRect(center + Math.cos(angle) * radius, center + Math.sin(angle) * radius, dot, dot);
    }
  } else if (brush === 'marker') {
    tip.translate(center, center);
    tip.rotate(-Math.PI / 5);
    tip.beginPath();
    tip.roundRect(-56, -22, 112, 44, 7);
    tip.fill();
  } else {
    if (brush === 'soft' || brush === 'airbrush') {
      const gradient = tip.createRadialGradient(center, center, 0, center, center, center);
      gradient.addColorStop(0, color);
      if (brush === 'soft') gradient.addColorStop(.55, color);
      else gradient.addColorStop(.58, color + '38');
      gradient.addColorStop(1, color + '00');
      tip.fillStyle = gradient;
    }
    tip.beginPath();
    tip.arc(center, center, center - 1, 0, 2 * Math.PI);
    tip.fill();
  }
  return canvas;
}

export function stamp(stroke, { x, y, pressure }) {
  const { mask, tip, width, flow, preset } = stroke;
  const diameter = Math.max(1, width * (.25 + .75 * pressure));
  mask.globalAlpha = flow ** 2 * preset.deposit * (.2 + .8 * pressure);
  mask.drawImage(tip, x - diameter / 2, y - diameter / 2, diameter, diameter);
}

export function extendStroke(stroke, next) {
  const dx = next.x - stroke.last.x;
  const dy = next.y - stroke.last.y;
  const distance = Math.hypot(dx, dy);
  const pressureDelta = next.pressure - stroke.last.pressure;
  for (let offset = stroke.spacing - stroke.remainder; offset <= distance; offset += stroke.spacing) {
    const fraction = offset / distance;
    stamp(stroke, {
      x: stroke.last.x + dx * fraction,
      y: stroke.last.y + dy * fraction,
      pressure: stroke.last.pressure + pressureDelta * fraction,
    });
  }
  stroke.remainder = (stroke.remainder + distance) % stroke.spacing;
  stroke.last = next;
}

export function smoothPoint(previous, next, amount) {
  if (!amount) return next;
  const elapsed = Math.max(1, next.time - previous.time);
  const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
  const response = 1 - Math.exp(-elapsed / (8 + amount * 48));
  const follow = Math.max(response, 1 - 36 / Math.max(1, distance), 1 - amount);
  return {
    x: previous.x + (next.x - previous.x) * follow,
    y: previous.y + (next.y - previous.y) * follow,
    pressure: next.pressure,
    time: next.time,
  };
}

export function drawBrushPreview(canvas, brush, color) {
  const mask = canvas.getContext('2d');
  const preset = presets[brush];
  const width = Math.max(8, Math.min(39, preset.width * .54));
  if (brush === 'eraser') {
    mask.fillStyle = color;
    mask.globalAlpha = .65;
    mask.fillRect(13, 15, 110, 23);
    mask.globalAlpha = 1;
    mask.globalCompositeOperation = 'destination-out';
  }
  const stroke = {
    mask, tip: makeBrushTip(brush, color), width,
    flow: preset.flow / 100, preset, spacing: Math.max(.5, width * preset.spacing),
    last: { x: 17, y: 30, pressure: .6 },
    remainder: 0,
  };
  stamp(stroke, stroke.last);
  for (let i = 1; i <= 30; i++) {
    const progress = i / 30;
    extendStroke(stroke, {
      x: 17 + progress * 103,
      y: 26 + Math.cos(progress * Math.PI * 2) * 8,
      pressure: .57 + Math.sin(progress * Math.PI) * .43,
    });
  }
  mask.globalCompositeOperation = 'source-over';
  mask.globalAlpha = 1;
}
