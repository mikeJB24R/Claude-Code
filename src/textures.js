// Prozedurale Texturen (Holzdielen, Fliesen), damit keine Bilddateien nötig sind.
import * as THREE from 'three';

function shade(hex, factor) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l * factor)));
  return '#' + c.getHexString();
}

// Pseudozufall mit festem Seed -> Textur sieht bei jedem Laden gleich aus
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Holzdielen: Kachel bildet 200 × 200 cm ab, Dielenbreite 20 cm. */
function woodCanvas(baseColor) {
  const size = 1024;
  const cm = size / 200;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rand = rng(42);
  const plankW = 20 * cm;
  for (let row = 0; row < 10; row++) {
    const y = row * plankW;
    let x = -rand() * 120 * cm;
    while (x < size) {
      const len = (90 + rand() * 90) * cm;
      ctx.fillStyle = shade(baseColor, 0.88 + rand() * 0.24);
      ctx.fillRect(x, y, len, plankW);
      // Maserung
      for (let g = 0; g < 14; g++) {
        ctx.strokeStyle = shade(baseColor, 0.75 + rand() * 0.2);
        ctx.globalAlpha = 0.12 + rand() * 0.15;
        ctx.lineWidth = 0.6 + rand() * 1.4;
        const gy = y + rand() * plankW;
        ctx.beginPath();
        ctx.moveTo(x, gy);
        for (let gx = x; gx < x + len; gx += 40) {
          ctx.lineTo(gx, gy + Math.sin(gx * 0.01 + g) * 2.5);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Fuge
      ctx.fillStyle = shade(baseColor, 0.55);
      ctx.fillRect(x, y, 1.5, plankW);
      x += len;
    }
    ctx.fillStyle = shade(baseColor, 0.55);
    ctx.fillRect(0, y, size, 1.5);
  }
  return { canvas, tileSize: 200 };
}

/** Fliesen: Kachel bildet 120 × 120 cm ab, Fliesen 60 × 60 cm. */
function tileCanvas(baseColor) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rand = rng(7);
  const t = size / 2;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = shade(baseColor, 0.96 + rand() * 0.08);
      ctx.fillRect(i * t, j * t, t, t);
    }
  }
  ctx.strokeStyle = shade(baseColor, 0.7);
  ctx.lineWidth = 3;
  for (let k = 0; k <= 2; k++) {
    ctx.beginPath(); ctx.moveTo(k * t, 0); ctx.lineTo(k * t, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, k * t); ctx.lineTo(size, k * t); ctx.stroke();
  }
  return { canvas, tileSize: 120 };
}

/**
 * Liefert eine Bodentextur für einen Raum mit length × width cm.
 * floor.texture: "wood" | "tiles" | "plain" | Pfad zu einer Bilddatei (relativ zu /public)
 * floor.textureSize: Kantenlänge einer Bildkachel in cm (nur bei Bilddateien, Standard 100)
 */
export function createFloorTexture(floor, length, width, renderer) {
  const kind = floor.texture ?? 'plain';
  if (kind === 'plain' || kind === 'none') return null;

  let texture;
  let tileSize;
  if (kind === 'wood' || kind === 'tiles') {
    const { canvas, tileSize: ts } = kind === 'wood'
      ? woodCanvas(floor.color ?? '#d9bc8c')
      : tileCanvas(floor.color ?? '#dddddd');
    texture = new THREE.CanvasTexture(canvas);
    tileSize = ts;
  } else {
    texture = new THREE.TextureLoader().load(kind, undefined, undefined, () =>
      console.warn(`Bodentextur "${kind}" konnte nicht geladen werden.`)
    );
    tileSize = floor.textureSize ?? 100;
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(length / tileSize, width / tileSize);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

/** Text als Canvas-Textur, z. B. für Beschriftungen. */
export function createTextTexture(lines, { font = 'bold 44px system-ui, sans-serif', color = '#1d2329', background = 'rgba(255,255,255,0.88)', padding = 18 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  const lineHeight = parseInt(font.match(/(\d+)px/)[1], 10) * 1.2;
  const widthPx = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) + padding * 2);
  const heightPx = Math.ceil(lines.length * lineHeight + padding * 2);
  canvas.width = widthPx;
  canvas.height = heightPx;
  ctx.font = font;
  if (background) {
    ctx.fillStyle = background;
    const r = 14;
    ctx.beginPath();
    ctx.roundRect(0, 0, widthPx, heightPx, r);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, widthPx / 2, padding + lineHeight * (i + 0.5)));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: widthPx / heightPx };
}

/** Sprite mit Text; height in cm. */
export function createTextSprite(lines, height = 18, options = {}) {
  const { texture, aspect } = createTextTexture(Array.isArray(lines) ? lines : [lines], options);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: options.depthTest ?? true, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(height * aspect, height, 1);
  sprite.renderOrder = 10;
  return sprite;
}
